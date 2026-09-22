-- ============================================================================
-- 00 · Diagnóstico del esquema — SÓLO LECTURA, no modifica nada
-- ============================================================================
--
-- El esquema de este proyecto se fue aplicando a mano en el editor de Supabase y
-- sólo una parte quedó en `docs/sql/`. Esto imprime el estado real en un solo
-- informe de texto: correlo entero, seleccioná el resultado y copialo.
--
-- Lo que hay que mirar con más atención es el bloque de POLÍTICAS sobre
-- `profiles`, `relevamientos`, `obras` y `obra_destinatarios`: son las tablas
-- que la app móvil consulta con la clave anónima, así que esas políticas son la
-- frontera de seguridad real del sistema.
-- ============================================================================

with
tablas as (
  select c.oid, c.relname as t, c.relrowsecurity as rls, c.reltuples::bigint as filas,
         pg_total_relation_size(c.oid) as bytes
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
r as (

  select 10 as orden, '══ TABLAS ' || repeat('═', 60) as renglon
  union all
  select 11, format('%-24s rls:%-5s politicas:%-3s filas:%-9s %s',
           t.t, t.rls,
           (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=t.t),
           t.filas, pg_size_pretty(t.bytes))
  from tablas t

  union all select 20, '' union all select 21, '══ PERMISOS DE LAS CLAVES PUBLICAS ' || repeat('═', 36)
  union all
  -- RLS sólo protege si además hay GRANT. Sin grant, la tabla es invisible para
  -- la clave anónima aunque no tenga políticas.
  select 22, format('%-24s anon:%-22s authenticated:%s', tablas.t,
           coalesce((select string_agg(distinct lower(g.privilege_type), ',' order by lower(g.privilege_type))
                     from information_schema.role_table_grants g
                     where g.table_schema='public' and g.table_name=tablas.t and g.grantee='anon'), '—'),
           coalesce((select string_agg(distinct lower(g.privilege_type), ',' order by lower(g.privilege_type))
                     from information_schema.role_table_grants g
                     where g.table_schema='public' and g.table_name=tablas.t and g.grantee='authenticated'), '—'))
  from tablas

  union all select 30, '' union all select 31, '══ POLITICAS ' || repeat('═', 57)
  union all
  select 32, format('%-22s %-28s %-7s %s | check: %s',
           tablename, policyname, cmd,
           coalesce(left(replace(qual, E'\n', ' '), 130), '—'),
           coalesce(left(replace(with_check, E'\n', ' '), 90), '—'))
  from pg_policies where schemaname = 'public'

  union all select 40, '' union all select 41, '══ RLS ACTIVADO Y SIN NINGUNA POLITICA ' || repeat('═', 32)
  union all
  select 42, format('  %s', t.t) from tablas t
  where t.rls and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=t.t)

  union all select 50, '' union all select 51, '══ CLAVES FORANEAS ' || repeat('═', 51)
  union all
  select 52, format('%-22s %-22s -> %-22s al_borrar:%s',
           cl.relname, att.attname, clf.relname,
           case con.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
                when 'c' then 'CASCADE' when 'n' then 'SET NULL' else 'SET DEFAULT' end)
  from pg_constraint con
  join pg_class cl on cl.oid = con.conrelid
  join pg_class clf on clf.oid = con.confrelid
  join pg_namespace n on n.oid = cl.relnamespace
  join unnest(con.conkey) with ordinality as k(attnum, ord) on true
  join pg_attribute att on att.attrelid = cl.oid and att.attnum = k.attnum
  where con.contype = 'f' and n.nspname = 'public'

  union all select 60, '' union all select 61, '══ RESTRICCIONES CHECK ' || repeat('═', 47)
  union all
  select 62, format('%-22s %s', cl.relname, pg_get_constraintdef(con.oid))
  from pg_constraint con
  join pg_class cl on cl.oid = con.conrelid
  join pg_namespace n on n.oid = cl.relnamespace
  where con.contype = 'c' and n.nspname = 'public'

  union all select 70, '' union all select 71, '══ COLUMNAS POR TABLA ' || repeat('═', 48)
  union all
  select 72, format('%-22s %s', table_name,
           string_agg(column_name || ':' ||
             case when data_type = 'numeric' and numeric_precision is not null
                  then 'num(' || numeric_precision || ',' || coalesce(numeric_scale,0) || ')'
                  when data_type = 'timestamp with time zone' then 'tstz'
                  when data_type = 'character varying' then 'varchar'
                  when data_type = 'double precision' then 'float8'
                  else data_type end ||
             case when is_nullable = 'NO' then '!' else '' end, '  ' order by ordinal_position))
  from information_schema.columns where table_schema = 'public' group by table_name

  union all select 80, '' union all select 81, '══ INDICES NUNCA USADOS ' || repeat('═', 46)
  union all
  select 82, format('%-22s %-44s %s', relname, indexrelname,
           pg_size_pretty(pg_relation_size(indexrelid)))
  from pg_stat_user_indexes where schemaname = 'public' and idx_scan = 0

  union all select 90, '' union all select 91, '══ COLUMNAS SIEMPRE VACIAS (candidatas a borrar) ' || repeat('═', 22)
  union all
  select 92, format('%-22s %s', tablename, attname)
  from pg_stats where schemaname = 'public' and null_frac = 1

  union all select 100, '' union all select 101, '══ FUNCIONES SECURITY DEFINER ' || repeat('═', 40)
  union all
  select 102, format('%-30s search_path:%s', p.proname,
           coalesce(array_to_string(p.proconfig, ','), 'SIN FIJAR ← revisar'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef

  union all select 110, '' union all select 111, '══ TRIGGERS ' || repeat('═', 58)
  union all
  select 112, format('%-22s %-28s %s', cl.relname, tg.tgname, pg_get_triggerdef(tg.oid))
  from pg_trigger tg
  join pg_class cl on cl.oid = tg.tgrelid
  join pg_namespace n on n.oid = cl.relnamespace
  where not tg.tgisinternal and n.nspname = 'public'
)
select renglon from r order by orden, renglon;
