-- ═══════════════════════════════════════════════════════════════════════════
-- Ripio: borrado lógico de proyectos y tramos
--
-- Borrar desde la calculadora dejaba el cálculo perdido para siempre. La obra
-- guardada sobrevivía (vive en `obras`, otra tabla), pero al editarla no había
-- proyecto que abrir.
--
-- Con `archivado_en` el registro deja de aparecer en la calculadora pero queda
-- en la base: la obra sigue completa en Obras → Lista y el cálculo es
-- recuperable.
--
-- Ejecutar en el SQL Editor de Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.proyectos_ripio
  add column if not exists archivado_en  timestamptz,
  add column if not exists archivado_por uuid references auth.users (id);

alter table public.ripios
  add column if not exists archivado_en  timestamptz,
  add column if not exists archivado_por uuid references auth.users (id);

-- Índices parciales: las consultas normales piden sólo los no archivados
create index if not exists proyectos_ripio_activos_idx
  on public.proyectos_ripio (user_id)
  where archivado_en is null;

create index if not exists ripios_activos_idx
  on public.ripios (proyecto_id)
  where archivado_en is null;
