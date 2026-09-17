-- ═══════════════════════════════════════════════════════════════════════════
-- Obras: borrado lógico
--
-- Hasta ahora eliminar una obra desde la lista era un DELETE real y el
-- `confirm()` del navegador era toda la red que había. Una obra es
-- documentación presentada: un clic de más no puede borrarla para siempre.
--
-- Mismo patrón que `02-ripio-borrado-logico.sql`, que ya protege los proyectos
-- y tramos de la calculadora. Esto empareja el otro lado.
--
-- El borrado definitivo sigue existiendo, pero sólo para admin y sólo sobre una
-- obra ya archivada: dos pasos deliberados antes de perder algo.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.obras
  add column if not exists archivado_en  timestamptz,
  add column if not exists archivado_por uuid references auth.users (id);

comment on column public.obras.archivado_en is
  'Fecha de archivado. Null = obra activa. La lista filtra por null; las '
  'archivadas se ven en su propia vista y se pueden restaurar.';

-- La lista pide siempre las activas; el índice parcial es el que sirve
create index if not exists obras_activas_idx
  on public.obras (created_at desc)
  where archivado_en is null;

-- La vista de archivadas es la excepción, pero ordena igual por fecha
create index if not exists obras_archivadas_idx
  on public.obras (archivado_en desc)
  where archivado_en is not null;
