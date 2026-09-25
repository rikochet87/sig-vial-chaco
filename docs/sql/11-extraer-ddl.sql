-- ============================================================================
-- 11 · Extraer el DDL real de las siete tablas sin script de creación
--      SÓLO LECTURA — no modifica nada
-- ============================================================================
--
-- `profiles`, `obras`, `relevamientos`, `proyectos_ripio`, `ripios`,
-- `obra_destinatarios` y `consorcios` se armaron a mano en el editor de
-- Supabase. En el repo sólo quedaron los `alter table` posteriores, así que hoy
-- **la base no se puede reconstruir ni se puede levantar un entorno de prueba**.
--
-- Este script no adivina el esquema leyendo el código de la app: lo lee del
-- catálogo de Postgres, que es la única fuente que no puede estar desactualizada.
--
-- CÓMO USARLO
--
--   1. Abrí el editor SQL de Supabase.
--   2. Corré **una consulta por vez** (están numeradas y separadas). Cada una
--      devuelve una grilla; copiá la columna de texto entera.
--   3. Pegá todo en `docs/sql/12-tablas-base.sql` y commitealo.
--
-- Van separadas y no en un solo informe a propósito: si una falla por una
-- diferencia de versión de Postgres, las otras seis siguen sirviendo.
--
-- Lo que sale es DDL de referencia, no una migración: hay que revisarlo antes de
-- correrlo contra una base vacía, sobre todo el orden de las claves foráneas.
-- ============================================================================


-- ── 1 · Columnas, tipos, nulabilidad y defaults ─────────────────────────────
-- Arma el cuerpo del `create table` de cada tabla.

select
  c.relname as tabla,
  format(
    '  %I %s%s%s',
    a.attname,
    format_type(a.atttypid, a.atttypmod),
    case when a.attnotnull then ' not null' else '' end,
    case when d.adbin is not null
         then ' default ' || pg_get_expr(d.adbin, d.adrelid)
         else '' end
  ) as linea,
  a.attnum as orden
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid
left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
where n.nspname = 'public'
  and c.relkind = 'r'
  and a.attnum > 0
  and not a.attisdropped
  and c.relname in ('profiles','obras','relevamientos','proyectos_ripio',
                    'ripios','obra_destinatarios','consorcios')
order by c.relname, a.attnum;


-- ── 2 · Restricciones: PK, FK, unique y check ───────────────────────────────
-- `pg_get_constraintdef` devuelve la definición ya lista para pegar dentro del
-- `create table` o como `alter table ... add constraint`.

select
  c.relname as tabla,
  format(
    'alter table public.%I add constraint %I %s;',
    c.relname, con.conname, pg_get_constraintdef(con.oid)
  ) as sentencia,
  case con.contype
    when 'p' then 'clave primaria'
    when 'f' then 'clave foranea'
    when 'u' then 'unica'
    when 'c' then 'check'
    else con.contype::text
  end as tipo
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles','obras','relevamientos','proyectos_ripio',
                    'ripios','obra_destinatarios','consorcios')
order by c.relname, con.contype, con.conname;


-- ── 3 · Índices ─────────────────────────────────────────────────────────────
-- Los de PK y unique ya salen en la consulta 2; acá aparecen todos, así que hay
-- que sacar los repetidos al armar el archivo final.

select tablename as tabla, indexdef || ';' as sentencia
from pg_indexes
where schemaname = 'public'
  and tablename in ('profiles','obras','relevamientos','proyectos_ripio',
                    'ripios','obra_destinatarios','consorcios')
order by tablename, indexname;


-- ── 4 · RLS y políticas ─────────────────────────────────────────────────────
-- En `relevamientos`, `obras`, `obra_destinatarios`, `profiles` y `consorcios`
-- estas políticas son la frontera de seguridad real: la app móvil pega contra
-- Supabase con la clave anónima. Una base reconstruida sin ellas queda abierta.

select
  c.relname as tabla,
  format('alter table public.%I enable row level security;', c.relname) as sentencia
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relrowsecurity
  and c.relname in ('profiles','obras','relevamientos','proyectos_ripio',
                    'ripios','obra_destinatarios','consorcios')
order by c.relname;

select
  tablename as tabla,
  format(
    'create policy %I on public.%I as %s for %s to %s%s%s;',
    policyname, tablename,
    lower(permissive), cmd, array_to_string(roles, ', '),
    case when qual      is not null then E'\n  using (' || qual || ')' else '' end,
    case when with_check is not null then E'\n  with check (' || with_check || ')' else '' end
  ) as sentencia
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles','obras','relevamientos','proyectos_ripio',
                    'ripios','obra_destinatarios','consorcios')
order by tablename, policyname;


-- ── 5 · Funciones que usan esas políticas ───────────────────────────────────
-- `es_destinatario()` e `is_admin()` son SECURITY DEFINER y cortan la recursión
-- entre las políticas de `obras` y `obra_destinatarios`. Sin ellas las políticas
-- de la consulta 4 no se pueden crear.
--
-- Revisá en el resultado que cada una traiga `set search_path`: una función
-- SECURITY DEFINER sin eso es un vector de escalada de privilegios.

select
  p.proname as funcion,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) || ';' as sentencia
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
order by p.proname;


-- ── 6 · Triggers ────────────────────────────────────────────────────────────

select
  c.relname as tabla,
  pg_get_triggerdef(t.oid) || ';' as sentencia
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and c.relname in ('profiles','obras','relevamientos','proyectos_ripio',
                    'ripios','obra_destinatarios','consorcios')
order by c.relname, t.tgname;


-- ── 7 · Grants ──────────────────────────────────────────────────────────────
-- Supabase le da `grant` completo a `anon` y `authenticated` por defecto. Esto
-- lo deja explícito: si alguna tabla quedó con RLS apagada, el grant es todo lo
-- que hay entre el teléfono de un técnico y los datos de los demás.

select
  table_name as tabla,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as permisos
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated','service_role')
  and table_name in ('profiles','obras','relevamientos','proyectos_ripio',
                     'ripios','obra_destinatarios','consorcios')
group by table_name, grantee
order by table_name, grantee;
