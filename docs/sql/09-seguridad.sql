-- ============================================================================
-- 09 · Seguridad y consistencia — hallazgos de la auditoría del 22/09/2026
-- ============================================================================
--
-- Sale de revisar el esquema real contra el código. Tres cosas que arregla, en
-- orden de gravedad:
--
--   1. `is_admin()` es SECURITY DEFINER sin `search_path` fijo. Es el vector
--      clásico de escalada en Postgres: la función corre con los permisos de
--      quien la creó, y sin search_path fijo se puede secuestrar qué objetos
--      resuelve. Lo marca el propio linter de Supabase.
--
--   2. **Los técnicos no podían ver las obras que se les publican.** Las
--      políticas de `obras` daban acceso sólo por `created_by = auth.uid()`, y
--      el creador es el usuario de oficina, no el técnico. Todo el circuito de
--      publicar al celular estaba cortado por RLS.
--
--   3. **Reenviar un relevamiento editado fallaba.** `relevamientos` tenía
--      política de INSERT y de SELECT, pero no de UPDATE, y la app sincroniza
--      con `upsert(..., { onConflict: 'id' })`. La primera subida entraba;
--      cualquier reenvío del mismo id tomaba el camino UPDATE y RLS lo
--      rechazaba. Peor: un relevamiento que se escribió pero cuya respuesta se
--      perdió quedaba marcado 'error' y el auto-sync lo reintentaba para
--      siempre, siempre fallando.
--
-- Se puede volver a correr sin romper nada.
-- ============================================================================

-- ── 1. El search_path de is_admin() ─────────────────────────────────────────
-- No hace falta redefinir la función: alcanza con fijarle el search_path.
alter function public.is_admin() set search_path = public, pg_temp;


-- ── 2. Que el técnico vea las obras publicadas ──────────────────────────────
--
-- Hace falta una función intermedia y no una subconsulta directa. Si la
-- política de `obras` consultara `obra_destinatarios`, y la de
-- `obra_destinatarios` consulta `obras` —que es lo que hace hoy—, Postgres
-- entra en recursión infinita al evaluarlas. Una función SECURITY DEFINER no
-- aplica RLS adentro, así que corta el ciclo.
create or replace function public.es_destinatario(p_obra uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.obra_destinatarios d
    where d.obra_id = p_obra and d.user_id = auth.uid()
  );
$$;

comment on function public.es_destinatario(uuid) is
  'Si la obra le fue publicada al usuario actual. SECURITY DEFINER a propósito: '
  'rompe la recursión entre las políticas de obras y obra_destinatarios.';

revoke all on function public.es_destinatario(uuid) from public;
grant execute on function public.es_destinatario(uuid) to authenticated;

-- Sólo lectura: el técnico ve la obra, no la toca. No se agregan políticas de
-- update ni de delete a propósito.
drop policy if exists "obras: destinatario select" on public.obras;
create policy "obras: destinatario select" on public.obras
  for select to authenticated
  using (visible_para = 'todos' or public.es_destinatario(id));

-- Y que pueda leer la fila que dice que la obra es para él. La política que
-- había exigía ser el dueño de la obra, así que el destinatario tampoco veía
-- su propia asignación.
drop policy if exists "obra_destinatarios: propio select" on public.obra_destinatarios;
create policy "obra_destinatarios: propio select" on public.obra_destinatarios
  for select to authenticated
  using (user_id = auth.uid());


-- ── 3. Que el técnico pueda reenviar un relevamiento suyo ───────────────────
drop policy if exists "Técnicos actualizan sus relevamientos" on public.relevamientos;
create policy "Técnicos actualizan sus relevamientos" on public.relevamientos
  for update to authenticated
  using (auth.uid() = tecnico_id)
  with check (auth.uid() = tecnico_id);


-- ── 4. Borrar un usuario no debe fallar por lo que archivó ──────────────────
-- Estaban en NO ACTION: con eso no se puede borrar de Auth a nadie que alguna
-- vez haya archivado una obra o cargado una medición.
alter table public.obras
  drop constraint if exists obras_archivado_por_fkey,
  add  constraint obras_archivado_por_fkey
       foreign key (archivado_por) references auth.users (id) on delete set null;

alter table public.proyectos_ripio
  drop constraint if exists proyectos_ripio_archivado_por_fkey,
  add  constraint proyectos_ripio_archivado_por_fkey
       foreign key (archivado_por) references auth.users (id) on delete set null;

alter table public.ripios
  drop constraint if exists ripios_archivado_por_fkey,
  add  constraint ripios_archivado_por_fkey
       foreign key (archivado_por) references auth.users (id) on delete set null;

alter table public.precios_base
  drop constraint if exists precios_base_created_by_fkey,
  add  constraint precios_base_created_by_fkey
       foreign key (created_by) references auth.users (id) on delete set null;

alter table public.mediciones_lluvia
  drop constraint if exists mediciones_lluvia_cargado_por_fkey,
  add  constraint mediciones_lluvia_cargado_por_fkey
       foreign key (cargado_por) references auth.users (id) on delete set null;

-- `proyectos_ripio.precios_base_id` queda en NO ACTION a propósito: borrar una
-- plantilla de precios de la que cuelga un proyecto tiene que fallar.


-- ── 5. Dominios cerrados y rangos ───────────────────────────────────────────
-- Las tablas de lluvia no tenían ni un CHECK: `mm` aceptaba negativos y
-- `procedencia` cualquier texto. Todos admiten null, así que no rompen las
-- filas que ya están.

alter table public.precipitaciones drop constraint if exists precipitaciones_mm_rango;
alter table public.precipitaciones add  constraint precipitaciones_mm_rango
  check (mm >= 0 and mm <= 1000);

alter table public.precipitaciones drop constraint if exists precipitaciones_mm_fusion_rango;
alter table public.precipitaciones add  constraint precipitaciones_mm_fusion_rango
  check (mm_fusion is null or (mm_fusion >= 0 and mm_fusion <= 1000));

alter table public.precipitaciones drop constraint if exists precipitaciones_procedencia_valida;
alter table public.precipitaciones add  constraint precipitaciones_procedencia_valida
  check (procedencia is null or procedencia in ('medido', 'interpolado', 'estimado'));

alter table public.precipitaciones drop constraint if exists precipitaciones_fraccion_valida;
alter table public.precipitaciones add  constraint precipitaciones_fraccion_valida
  check (fraccion_estimada is null or (fraccion_estimada >= 0 and fraccion_estimada <= 1));

alter table public.mediciones_lluvia drop constraint if exists mediciones_lluvia_mm_rango;
alter table public.mediciones_lluvia add  constraint mediciones_lluvia_mm_rango
  check (mm >= 0 and mm <= 600);

alter table public.mediciones_lluvia drop constraint if exists mediciones_lluvia_mm_modelo_rango;
alter table public.mediciones_lluvia add  constraint mediciones_lluvia_mm_modelo_rango
  check (mm_modelo is null or (mm_modelo >= 0 and mm_modelo <= 1000));

alter table public.estaciones_lluvia drop constraint if exists estaciones_lluvia_en_chaco;
alter table public.estaciones_lluvia add  constraint estaciones_lluvia_en_chaco
  check (lat between -29 and -23 and lng between -64 and -57);


-- ── 6. Aclaración de una columna mal nombrada ───────────────────────────────
-- `estaciones_usadas` guarda cuántas estaciones informaron ese día en toda la
-- provincia, no cuántas se usaron para ese consorcio. Se documenta en vez de
-- renombrar porque ya está creada y el nombre viaja en el código.
comment on column public.precipitaciones.estaciones_usadas is
  'Cuántos pluviómetros de la APA informaron ESE DÍA en toda la provincia. '
  'No es cuántos se usaron para este consorcio: el nombre engaña.';


-- ── 7. Las tablas de lluvia quedan sin políticas, a propósito ───────────────
-- `precipitaciones`, `mediciones_lluvia` y `estaciones_lluvia` tienen RLS
-- activado y cero políticas. No es un olvido: se escriben y se leen sólo desde
-- las rutas del panel, que usan la clave de servicio y saltean RLS. Con RLS y
-- sin políticas, la clave anónima no puede tocarlas — que es exactamente lo
-- que se quiere. Si algún día el navegador necesita leerlas directo, hay que
-- agregar una política de select, no desactivar RLS.
comment on table public.precipitaciones is
  'Milímetros por día y por consorcio. mm = modelo, mm_fusion = pluviómetros '
  'interpolados (el número que se muestra). Sin políticas RLS a propósito: '
  'sólo se accede con la clave de servicio desde el panel.';
