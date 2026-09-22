-- ============================================================================
-- 00 · Diagnóstico — sólo lectura, no modifica nada
-- ============================================================================
--
-- El esquema de este proyecto se fue aplicando a mano en el editor de Supabase,
-- y sólo una parte quedó en `docs/sql/`. Este script imprime el estado real para
-- poder compararlo con lo que el repo dice.
--
-- Correlo entero en el SQL Editor y mirá cada bloque. Es seguro: son `select`.
-- ============================================================================

-- ── 1. Tablas, tamaño y si tienen RLS ───────────────────────────────────────
-- Lo que importa: `rls` en false sobre una tabla que la app móvil consulta con
-- la clave anónima significa que cualquiera con esa clave lee la tabla entera.
select
  c.relname                                   as tabla,
  c.relrowsecurity                            as rls_activado,
  c.relforcerowsecurity                       as rls_forzado,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as politicas,
  pg_size_pretty(pg_total_relation_size(c.oid)) as tamano,
  c.reltuples::bigint                         as filas_aprox
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- ── 2. Las políticas, una por una ───────────────────────────────────────────
-- Leer con atención las de `profiles`, `relevamientos`, `obras` y
-- `obra_destinatarios`: son las cinco tablas que la app móvil toca directo, así
-- que estas políticas son la frontera de seguridad real del sistema.
select tablename as tabla, policyname as politica, cmd as operacion,
       roles, qual as condicion_lectura, with_check as condicion_escritura
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- ── 3. Tablas con RLS activado y CERO políticas ─────────────────────────────
-- No es un agujero: es lo contrario, niegan todo con clave anónima. Pero hay
-- que saber cuáles son, porque el día que algo del navegador quiera leerlas va
-- a fallar sin explicación.
select c.relname as tabla_bloqueada_para_clave_anonima
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policies p
                  where p.schemaname = 'public' and p.tablename = c.relname)
order by 1;

-- ── 4. Claves foráneas y qué pasa al borrar ─────────────────────────────────
-- Buscar las que digan `NO ACTION` contra `auth.users`: con eso, borrar un
-- usuario de Supabase falla si dejó algo cargado o archivado.
select
  con.conname                     as restriccion,
  cl.relname                      as tabla,
  att.attname                     as columna,
  clf.relname                     as referencia,
  case con.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
       when 'c' then 'CASCADE' when 'n' then 'SET NULL'
       when 'd' then 'SET DEFAULT' end as al_borrar
from pg_constraint con
join pg_class cl      on cl.oid = con.conrelid
join pg_class clf     on clf.oid = con.confrelid
join pg_namespace n   on n.oid = cl.relnamespace
join unnest(con.conkey) with ordinality as k(attnum, ord) on true
join pg_attribute att on att.attrelid = cl.oid and att.attnum = k.attnum
where con.contype = 'f' and n.nspname = 'public'
order by cl.relname, con.conname;

-- ── 5. Restricciones CHECK que existen ──────────────────────────────────────
-- Si esto sale casi vacío, la base está aceptando cualquier cosa en las
-- columnas de dominio cerrado (rol, estado, procedencia, fuente, red) y en los
-- rangos numéricos (milímetros negativos, por ejemplo).
select cl.relname as tabla, con.conname as restriccion,
       pg_get_constraintdef(con.oid) as definicion
from pg_constraint con
join pg_class cl    on cl.oid = con.conrelid
join pg_namespace n on n.oid = cl.relnamespace
where con.contype = 'c' and n.nspname = 'public'
  and con.conname not like '%_not_null'
order by cl.relname;

-- ── 6. Índices ──────────────────────────────────────────────────────────────
select tablename as tabla, indexname as indice, indexdef as definicion
from pg_indexes where schemaname = 'public'
order by tablename, indexname;

-- ── 7. Índices que nunca se usaron ──────────────────────────────────────────
-- Un índice con 0 lecturas ocupa lugar y encarece cada escritura. Ojo: el
-- contador se reinicia al reiniciar la instancia, así que mirá también hace
-- cuánto está andando.
select relname as tabla, indexrelname as indice, idx_scan as lecturas,
       pg_size_pretty(pg_relation_size(indexrelid)) as tamano
from pg_stat_user_indexes
where schemaname = 'public' and idx_scan = 0
order by pg_relation_size(indexrelid) desc;

-- ── 8. Columnas de cada tabla, con tipo y default ───────────────────────────
select table_name as tabla, ordinal_position as pos, column_name as columna,
       data_type as tipo, character_maximum_length as largo,
       numeric_precision as precision, numeric_scale as escala,
       is_nullable as acepta_null, column_default as valor_por_defecto
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- ── 9. Columnas que están siempre vacías ────────────────────────────────────
-- Candidatas a borrar. Requiere que la tabla tenga estadísticas: si una
-- columna da null_frac = 1, nunca se escribió.
select schemaname as esquema, tablename as tabla, attname as columna,
       null_frac as fraccion_nula, n_distinct as valores_distintos
from pg_stats
where schemaname = 'public' and null_frac = 1
order by tablename, attname;

-- ── 10. Funciones SECURITY DEFINER ──────────────────────────────────────────
-- Corren con los permisos de quien las creó. Si hay alguna sin `set search_path`
-- fijo, es un vector de escalada de privilegios.
select p.proname as funcion, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer, p.proconfig as configuracion
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;
