-- ============================================================================
-- 08 · El número que se muestra pasa a salir de los pluviómetros
-- ============================================================================
--
-- Hasta ahora `precipitaciones.mm` era la salida del modelo de Open-Meteo. Se
-- agrega `mm_fusion`, que es la interpolación IDW de los pluviómetros de la APA
-- sobre los puntos de muestreo de la red vial de cada consorcio.
--
-- Validado dejando cada estación afuera, sobre 162 eventos y 11.502
-- combinaciones estación-fecha:
--
--     modelo crudo         MAE 6,82   RMSE 15,17   r 0,47
--     IDW² radio 60 km     MAE 3,98   RMSE 10,47   r 0,77
--
-- **`mm` se conserva.** No se pisa por tres razones: es el control contra el
-- que se mide la fusión, es el respaldo donde no hay pluviómetro, y hay
-- expedientes que ya citaron ese número.
--
-- `procedencia` dice de dónde salió cada fila, y eso va a pantalla:
--   medido       hay un pluviómetro sobre la red del consorcio
--   interpolado  promedio de los cercanos — error típico ~4 mm
--   estimado     sin pluviómetro a menos de 60 km, es el modelo — error ~7 mm
--
-- Se puede volver a correr sin romper nada.
-- ============================================================================

alter table public.precipitaciones add column if not exists mm_fusion          numeric(6,2);
alter table public.precipitaciones add column if not exists procedencia        text;
alter table public.precipitaciones add column if not exists dist_pluviometro_km numeric(6,1);
alter table public.precipitaciones add column if not exists fraccion_estimada  numeric(4,2);
alter table public.precipitaciones add column if not exists estaciones_usadas  integer;

comment on column public.precipitaciones.mm is
  'Salida cruda del modelo de reanálisis. Se conserva como control y respaldo.';
comment on column public.precipitaciones.mm_fusion is
  'Milímetros interpolados de los pluviómetros de la APA (IDW potencia 2, radio 60 km) '
  'sobre los puntos de muestreo de la red vial. Es el número que se muestra.';
comment on column public.precipitaciones.procedencia is
  'medido | interpolado | estimado — de dónde salió mm_fusion.';
comment on column public.precipitaciones.fraccion_estimada is
  'Qué fracción de la red del consorcio quedó sin pluviómetro dentro del radio.';

-- Para poder listar rápido lo que todavía no tiene fusión calculada
create index if not exists precipitaciones_sin_fusion_idx
  on public.precipitaciones (fecha desc) where mm_fusion is null;
