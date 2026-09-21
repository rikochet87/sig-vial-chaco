-- ═══════════════════════════════════════════════════════════════════════════
-- Precipitaciones diarias por consorcio
--
-- Después de una tormenta lo que define si un camino es transitable es cuántos
-- milímetros cayeron y dónde. Esto guarda ese dato día por día para cada uno de
-- los 103 consorcios, de modo que sirva para las tres cosas a la vez:
--
--   · operativo  — qué zonas recibieron más agua, para decidir a dónde ir
--   · documental — cuánto llovió en las fechas de una obra, para el legajo
--   · histórico  — qué tramos se degradan más con la lluvia, con el tiempo
--
-- Por qué una tabla y no consultar la API en cada carga: el histórico se acumula
-- una sola vez y después las consultas son locales. Además el dato queda aunque
-- el servicio externo cambie o desaparezca, que para algo que se va a citar en
-- un expediente no es un detalle menor.
--
-- La clave es (consorcio, fecha): la ingesta se puede volver a correr sobre un
-- rango ya cargado y actualiza en vez de duplicar.
--
-- No lleva FK contra `consorcios`: el número viene del bundle geográfico, que es
-- la fuente de las coordenadas, y no queremos que un desajuste entre ambos corte
-- la ingesta de toda la provincia.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.precipitaciones (
  consorcio_numero integer     not null,
  fecha            date        not null,
  mm               numeric(6,2) not null default 0,
  -- 'open-meteo' hoy. Queda explícito para poder sumar mediciones reales
  -- (pluviómetro del consorcio, APA) sin confundirlas con el modelo.
  fuente           text        not null default 'open-meteo',
  actualizado_en   timestamptz not null default now(),
  primary key (consorcio_numero, fecha)
);

comment on table public.precipitaciones is
  'Milímetros caídos por día y por consorcio. Origen modelado (Open-Meteo) '
  'salvo que `fuente` diga otra cosa.';

-- La consulta típica es "qué pasó entre estas dos fechas en toda la provincia"
create index if not exists precipitaciones_fecha_idx
  on public.precipitaciones (fecha desc);

-- La otra es "la serie de este consorcio", para el histórico y el legajo
create index if not exists precipitaciones_consorcio_fecha_idx
  on public.precipitaciones (consorcio_numero, fecha desc);
