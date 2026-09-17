-- ─────────────────────────────────────────────────────────────────────────────
-- Vincular la obra con el proyecto de ripio del que salió.
--
-- Hasta ahora "Guardar obra" copiaba los números a `obras` y ahí se cortaba el
-- hilo: no había forma de saber que dos obras venían del mismo proyecto, así
-- que volver a guardar siempre duplicaba. Con esta columna el panel puede
-- encontrar lo que ya guardó ese proyecto y ofrecer sobrescribir.
--
-- `on delete set null`: si alguien borra el proyecto de la calculadora, la obra
-- sobrevive. Es documentación presentada, no puede desaparecer porque se limpió
-- el árbol de cómputo — sólo pierde el vínculo.
--
-- Idempotente: se puede volver a correr sin romper nada.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.obras
  add column if not exists proyecto_ripio_id uuid
    references public.proyectos_ripio(id) on delete set null;

comment on column public.obras.proyecto_ripio_id is
  'Proyecto de ripio de origen. Permite detectar si ya se guardó una obra de '
  'ese proyecto y ofrecer sobrescribirla en vez de duplicar. Null en obras de '
  'otras calculadoras o guardadas antes de esta columna.';

-- Se consulta siempre "¿qué obras tiene este proyecto?", nunca al revés
create index if not exists idx_obras_proyecto_ripio
  on public.obras (proyecto_ripio_id)
  where proyecto_ripio_id is not null;
