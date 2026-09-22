-- ═══════════════════════════════════════════════════════════════════════════
-- Mediciones reales de lluvia (pluviómetro)
--
-- Lo que hay hoy en `precipitaciones` es modelado: Open-Meteo sobre la red vial
-- de cada consorcio. Contrastado contra el parte de la APA del 18/09/2026 en 43
-- localidades, ese modelo acierta muy bien si llovió o no (40 de 43) pero falla
-- en cuánto: correlación 0,36, sobrestima 37 % en promedio y de las diez
-- localidades más llovidas sólo acierta cuatro.
--
-- Esta tabla guarda el dato medido para tres cosas, en este orden:
--   1. medir el error del modelo con más de un evento
--   2. corregirlo, si el sesgo resulta estable
--   3. reemplazarlo donde hay pluviómetro
--
-- Se guarda por ESTACIÓN y no por consorcio a propósito: la estación es donde
-- se midió de verdad. Cómo se lleva eso a un consorcio es una decisión de
-- cálculo que puede cambiar, y no queremos haberla horneado en el dato crudo.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.estaciones_lluvia (
  nombre     text primary key,
  lat        double precision not null,
  lng        double precision not null,
  -- 'apa' hoy. Queda abierto para sumar SMN, INTA o el pluviómetro de un consorcio.
  red        text not null default 'apa',
  activa     boolean not null default true,
  creado_en  timestamptz not null default now()
);

comment on table public.estaciones_lluvia is
  'Pluviómetros con su ubicación. El nombre es la clave porque es como los '
  'identifica el parte de la APA, que es de donde se cargan las mediciones.';

create table if not exists public.mediciones_lluvia (
  estacion   text not null references public.estaciones_lluvia(nombre) on delete cascade,
  fecha      date not null,
  mm         numeric(6,2) not null,
  -- La APA acumula de 7 a 7 y lo reporta como el día anterior. Se guarda tal
  -- como lo publica el parte; la comparación con el modelo tiene en cuenta el
  -- desfase (ver lib/calibracion.ts).
  red        text not null default 'apa',
  fuente_url text,
  cargado_por uuid references auth.users (id),
  cargado_en timestamptz not null default now(),
  primary key (estacion, fecha)
);

comment on table public.mediciones_lluvia is
  'Milímetros medidos por pluviómetro y día. Verdad de campo contra la cual se '
  'mide y se corrige el modelo.';

create index if not exists mediciones_lluvia_fecha_idx
  on public.mediciones_lluvia (fecha desc);

-- ── Estaciones de la red de la APA ─────────────────────────────────────────
-- Coordenadas del geocodificador de Open-Meteo, verificadas contra el
-- departamento devuelto: todas caen en Chaco. Es la ubicación del pueblo, no
-- la del pluviómetro exacto — dentro de una celda de 9 km da igual.
--
-- Faltan Las Palmas, Villa Rural El Palmar y Miraflores: el geocodificador no
-- las resuelve y no se les inventan coordenadas. Se agregan a mano cuando
-- alguien que conozca el lugar las aporte.

insert into public.estaciones_lluvia (nombre, lat, lng) values
  ('Avia Terai',                   -26.68665, -60.72803),
  ('Barranqueras',                 -27.48132, -58.93925),
  ('Basail',                       -27.88539, -59.28245),
  ('Campo Largo',                  -26.80031, -60.83903),
  ('Capitán Solari',               -26.80247, -59.55724),
  ('Charata',                      -27.21787, -61.18738),
  ('Ciervo Petiso',                -26.58016, -59.63006),
  ('Colonia Benítez',              -27.33026, -58.94579),
  ('Colonia Elisa',                -26.93166, -59.51882),
  ('Colonia Popular',              -27.27450, -59.15164),
  ('Colonias Unidas',              -26.69831, -59.63029),
  ('Coronel Du Graty',             -27.68216, -60.90443),
  ('Corzuela',                     -26.95135, -60.97036),
  ('Cote Lai',                     -27.53022, -59.57346),
  ('El Espinillo',                 -25.40928, -60.44680),
  ('Enrique Urien',                -27.55629, -60.52616),
  ('Fuerte Esperanza',             -25.15982, -61.83964),
  ('Gancedo',                      -27.48875, -61.67541),
  ('General Pinedo',               -27.32534, -61.28101),
  ('General San Martín',           -26.53643, -59.34138),
  ('General Vedia',                -26.93243, -58.65919),
  ('Isla del Cerrito',             -27.29330, -58.61940),
  ('Juan José Castelli',           -25.94660, -60.62008),
  ('La Clotilde',                  -27.17775, -60.63038),
  ('La Escondida',                 -27.10554, -59.44603),
  ('La Eduvigis',                  -26.83607, -59.06211),
  ('La Leonesa',                   -27.03751, -58.70498),
  ('La Verde',                     -27.12894, -59.37546),
  ('Laguna Limpia',                -26.49545, -59.68118),
  ('Las Breñas',                   -27.08819, -61.08217),
  ('Las Garcitas',                 -26.61802, -59.80135),
  ('Machagai',                     -26.92617, -60.04852),
  ('Makallé',                      -27.20573, -59.28709),
  ('Margarita Belén',              -27.25902, -58.97157),
  ('Napenay',                      -26.72992, -60.61737),
  ('Nueva Pompeya',                -24.92786, -61.48573),
  ('Pampa Almirón',                -26.70039, -59.12331),
  ('Pampa del Indio',              -26.04982, -59.93728),
  ('Pampa del Infierno',           -26.50353, -61.17654),
  ('Presidencia de la Plaza',      -27.00213, -59.84476),
  ('Presidencia Roca',             -26.14199, -59.59595),
  ('Presidencia Roque Sáenz Peña', -26.79095, -60.44132),
  ('Puerto Bermejo',               -26.92739, -58.50917),
  ('Puerto Eva Perón',             -26.66351, -58.63245),
  ('Puerto Tirol',                 -27.37382, -59.08927),
  ('Puerto Vilelas',               -27.51083, -58.94179),
  ('Quitilipi',                    -26.87080, -60.21537),
  ('Resistencia',                  -27.46363, -58.98665),
  ('Samuhú',                       -27.51908, -60.39409),
  ('San Bernardo',                 -27.28672, -60.71293),
  ('Santa Sylvina',                -27.83154, -61.13601),
  ('Selvas del Río de Oro',        -26.80320, -58.95928),
  ('Taco Pozo',                    -25.61557, -63.26708),
  ('Tres Isletas',                 -26.34067, -60.43207),
  ('Villa Ángela',                 -27.57679, -60.71114),
  ('Villa Berthet',                -27.28567, -60.41579),
  ('Villa Río Bermejito',          -25.63722, -60.26556)
on conflict (nombre) do nothing;
