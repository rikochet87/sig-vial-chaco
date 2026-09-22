-- ============================================================================
-- 07 · Estaciones oficiales de la APA y comparación en la coordenada exacta
-- ============================================================================
--
-- El mapa hidrometeorológico de la APA (mapas.apachaco.gob.ar) publica sus
-- mediciones en JSON, por fecha y sin clave. Eso cambia dos cosas:
--
--   1. La lista de estaciones deja de ser geocodificada y pasa a ser la del
--      organismo: 111 localidades con las coordenadas que usa la APA. Entran 54
--      que antes no estaban, incluidas Las Palmas, Miraflores y Villa El Palmar,
--      que el geocodificador no resolvía. El control cruzado contra las 57
--      anteriores dio una mediana de 0,11 km de diferencia, así que lo ya
--      cargado sigue siendo comparable.
--
--   2. La medición se puede comparar contra el modelo **en la coordenada de la
--      estación**, en vez de contra el promedio del consorcio más cercano. Para
--      eso se guarda el valor modelado junto a la medición, en mm_modelo: se
--      calcula una sola vez, en la importación, y queda congelado con el par.
--
-- Se puede volver a correr sin romper nada.
-- ============================================================================

-- Por si el script 06 no se corrió: las tablas base ------------------------
create table if not exists public.estaciones_lluvia (
  nombre      text primary key,
  lat         double precision not null,
  lng         double precision not null,
  red         text not null default 'apa',
  activa      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create table if not exists public.mediciones_lluvia (
  estacion    text not null references public.estaciones_lluvia(nombre) on delete cascade,
  fecha       date not null,
  mm          numeric(6,2) not null,
  red         text not null default 'apa',
  fuente_url  text,
  cargado_por uuid references auth.users (id),
  cargado_en  timestamptz not null default now(),
  primary key (estacion, fecha)
);

create index if not exists mediciones_lluvia_fecha_idx
  on public.mediciones_lluvia (fecha desc);

-- Identidad y ubicación que publica la APA --------------------------------
alter table public.estaciones_lluvia add column if not exists id_apa integer;
alter table public.estaciones_lluvia add column if not exists depto  text;

create unique index if not exists estaciones_lluvia_id_apa_idx
  on public.estaciones_lluvia (id_apa) where id_apa is not null;

-- El par medición ↔ modelo, ya resuelto en la coordenada de la estación ----
alter table public.mediciones_lluvia add column if not exists mm_modelo    numeric(6,2);
alter table public.mediciones_lluvia add column if not exists periodo      text;
alter table public.mediciones_lluvia add column if not exists importado_en timestamptz;

comment on column public.mediciones_lluvia.mm_modelo is
  'Milímetros que estimó el modelo ese día en la coordenada exacta de la estación. '
  'Se congela en la importación: si después cambia el modelo, el par no se mueve.';
comment on column public.mediciones_lluvia.periodo is
  'Ventana de acumulación que declaró la APA, p. ej. 17-07 (de 17:00 a 07:00).';

-- Las 111 estaciones oficiales --------------------------------------------
insert into public.estaciones_lluvia (id_apa, nombre, lat, lng, depto, red, activa)
select v.id, v.nombre, v.lat, v.lng, v.depto, 'apa', true
from (values
  ( 106, 'Avia Terai',                      -26.68663, -60.72802, 'Independencia'),
  ( 107, 'Barranqueras',                    -27.48514, -58.93074, 'San Fernando'),
  ( 108, 'Barrio de los Pescadores',        -27.46018, -58.86681, '1° de Mayo'),
  ( 109, 'Basail',                          -27.88763, -59.28148, 'San Fernando'),
  ( 110, 'Campo Largo',                     -26.80031, -60.83906, 'Independencia'),
  ( 111, 'Capitán Solari',                  -26.80242, -59.55709, 'Sargento Cabral'),
  ( 112, 'Charadai',                        -27.65468, -59.86223, 'Tapenagá'),
  (   3, 'Charata',                         -27.21794, -61.18736, 'Chacabuco'),
  ( 114, 'Chorotis',                        -27.91465, -61.40143, 'Fray Justo Santa María de Oro'),
  ( 115, 'Ciervo Petiso',                   -26.58011, -59.63011, 'Libertador General San Martín'),
  ( 116, 'Colonia Aborigen',                -26.95688, -60.20277, '25 de Mayo'),
  ( 117, 'Colonia Baranda',                 -27.56024, -59.30861, 'San Fernando'),
  ( 118, 'Colonia Benítez',                 -27.32949, -58.95015, '1° de Mayo'),
  ( 119, 'Colonia Elisa',                   -26.93164, -59.51878, 'Sargento Cabral'),
  ( 120, 'Colonia José Mármol',             -26.99486, -60.67870, 'Independencia'),
  ( 121, 'Colonia La Matanza',              -26.61089, -60.24423, 'Maipú'),
  ( 122, 'Colonia Pegouriel',               -27.61679, -60.81180, 'Mayor Luis J. Fontana'),
  ( 123, 'Colonia Popular',                 -27.27524, -59.15146, 'Libertad'),
  ( 124, 'Colonias Unidas',                 -26.70010, -59.62774, 'Sargento Cabral'),
  ( 125, 'Comandancia Frías',               -24.56480, -62.23794, 'General Güemes'),
  ( 126, 'Concepción del Bermejo',          -26.60034, -60.94623, 'Almirante Brown'),
  ( 127, 'Coronel Du Graty',                -27.68220, -60.90439, 'Mayor Luis J. Fontana'),
  ( 128, 'Corzuela',                        -26.95133, -60.97040, 'General Belgrano'),
  ( 129, 'Cote Lai',                        -27.52739, -59.57426, 'Tapenagá'),
  ( 130, 'El Espinillo',                    -25.40904, -60.44866, 'General Güemes'),
  ( 131, 'El Naranjito',                    -27.70237, -59.01511, 'San Fernando'),
  ( 132, 'El Paraisal',                     -26.50006, -60.06753, 'Quitilipi'),
  ( 133, 'El Pastoril',                     -27.62528, -60.74951, 'Mayor Luis J. Fontana'),
  ( 134, 'El Sauzal',                       -24.57725, -61.53209, 'General Güemes'),
  ( 135, 'El Sauzalito',                    -24.42853, -61.68406, 'General Güemes'),
  ( 136, 'Enrique Urien',                   -27.55633, -60.52610, 'Mayor Luis J. Fontana'),
  ( 137, 'Estación General Obligado',       -27.41090, -59.41856, 'Libertad'),
  ( 138, 'Fontana',                         -27.41628, -59.03411, 'San Fernando'),
  ( 139, 'Fortín Belgrano',                 -24.12282, -62.33760, 'General Güemes'),
  ( 140, 'Fortín Las Chuñas',               -26.88411, -60.90872, 'Independencia'),
  ( 141, 'Fortín Lavalle',                  -25.70450, -60.20148, 'General Güemes'),
  ( 142, 'Fuerte Esperanza',                -25.16189, -61.84197, 'General Güemes'),
  ( 143, 'Gancedo',                         -27.49084, -61.67649, '12 de Octubre'),
  ( 144, 'General Capdevila',               -27.42256, -61.47612, '12 de Octubre'),
  ( 145, 'General José de San Martín',      -26.53638, -59.34133, 'Libertador General San Martín'),
  ( 146, 'General Pinedo',                  -27.32539, -61.28100, '12 de Octubre'),
  ( 147, 'General Vedia',                   -26.93743, -58.66116, 'Bermejo'),
  ( 148, 'Haumonia',                        -27.50648, -60.17864, 'Tapenagá'),
  ( 149, 'Hermoso Campo',                   -27.61004, -61.34410, '2 de Abril'),
  ( 150, 'Horquilla',                       -27.54067, -59.95573, 'Tapenagá'),
  ( 151, 'Ingeniero Barbet',                -27.00247, -59.48376, 'Sargento Cabral'),
  ( 152, 'Isla del Cerrito',                -27.29279, -58.61784, 'Bermejo'),
  ( 153, 'Itín',                            -27.48602, -61.32346, '2 de Abril'),
  ( 154, 'Juan José Castelli',              -25.94658, -60.62006, 'General Güemes'),
  ( 155, 'Kilómetro 855',                   -26.43533, -60.41079, 'Maipú'),
  ( 156, 'Kilómetro 884',                   -26.18567, -60.49679, 'Maipú'),
  ( 157, 'La Clotilde',                     -27.17741, -60.63256, 'O''Higgins'),
  ( 158, 'La Curva',                        -26.34102, -60.33409, 'Maipú'),
  ( 159, 'La Eduvigis',                     -26.83643, -59.06232, 'Libertador General San Martín'),
  ( 160, 'La Escondida',                    -27.10534, -59.44642, 'General Donovan'),
  ( 163, 'La Leonesa',                      -27.03966, -58.70759, 'Bermejo'),
  ( 165, 'La Sabana',                       -27.87235, -59.93760, 'Tapenagá'),
  ( 171, 'La Tigra',                        -27.10954, -60.58734, 'O''Higgins'),
  ( 172, 'La Verde',                        -27.13047, -59.37630, 'General Donovan'),
  ( 215, 'La Vicuña',                       -25.96140, -60.19830, 'Tapenaga'),
  ( 161, 'Laguna Blanca',                   -27.25640, -59.23343, 'Libertad'),
  ( 162, 'Laguna Limpia',                   -26.49583, -59.68034, 'Libertador General San Martín'),
  ( 164, 'Lapachito',                       -27.15937, -59.38546, 'General Donovan'),
  ( 166, 'Las Breñas',                      -27.08643, -61.08583, '9 de Julio'),
  ( 167, 'Las Garcitas',                    -26.61813, -59.79914, 'Sargento Cabral'),
  ( 168, 'Las Hacheras',                    -25.38689, -60.98982, 'General Güemes'),
  ( 169, 'Las Palmas',                      -27.04888, -58.68264, 'Bermejo'),
  ( 170, 'Las Piedritas',                   -26.82413, -61.56665, '9 de Julio'),
  ( 173, 'Los Frentones',                   -26.40702, -61.41290, 'Almirante Brown'),
  ( 174, 'Lote 1',                          -27.31363, -58.99214, '1° de Mayo'),
  ( 175, 'Machagai',                        -26.92616, -60.04842, '25 de Mayo'),
  ( 176, 'Makallé',                         -27.20572, -59.28709, 'General Donovan'),
  ( 177, 'Margarita Belén',                 -27.25910, -58.97049, '1° de Mayo'),
  ( 178, 'Mesón de Fierro',                 -27.43050, -61.01665, '12 de Octubre'),
  ( 179, 'Miraflores',                      -25.65166, -60.92471, 'General Güemes'),
  ( 180, 'Napalpí',                         -26.90254, -60.12980, '25 de Mayo'),
  ( 181, 'Napenay',                         -26.72957, -60.61678, 'Independencia'),
  ( 182, 'Nueva Pompeya',                   -24.93307, -61.48315, 'General Güemes'),
  ( 183, 'Pampa Almirón',                   -26.70113, -59.12405, 'Libertador General San Martín'),
  ( 186, 'Pampa Landriel',                  -27.39475, -61.10255, '12 de Octubre'),
  ( 184, 'Pampa del Indio',                 -26.04850, -59.94463, 'Libertador General San Martín'),
  ( 185, 'Pampa del Infierno',              -26.50360, -61.17660, 'Almirante Brown'),
  ( 214, 'Paraje Kolbacks',                 -25.96140, -60.19830, 'General Güemes'),
  ( 188, 'Presidencia Roca',                -26.14383, -59.59507, 'Libertador General San Martín'),
  ( 189, 'Presidencia Roque Sáenz Peña',    -26.79097, -60.44131, 'Comandante Fernández'),
  ( 187, 'Presidencia de la Plaza',         -27.00355, -59.84551, 'Presidencia de la Plaza'),
  ( 190, 'Puerto Bermejo Nuevo',            -26.90781, -58.54180, 'Bermejo'),
  ( 191, 'Puerto Bermejo Viejo',            -26.92745, -58.50914, 'Bermejo'),
  ( 192, 'Puerto Eva Perón',                -26.66148, -58.63558, 'Bermejo'),
  ( 193, 'Puerto Lavalle',                  -25.65874, -60.13203, 'General Güemes'),
  ( 194, 'Puerto Tirol',                    -27.37387, -59.08727, 'Libertad'),
  ( 195, 'Puerto Vilelas',                  -27.51083, -58.94178, 'San Fernando'),
  ( 196, 'Quitilipi',                       -26.87081, -60.21526, 'Quitilipi'),
  (   1, 'Resistencia',                     -27.45111, -58.98645, 'San Fernando'),
  ( 198, 'Río Muerto',                      -26.30743, -61.65481, 'Almirante Brown'),
  ( 199, 'Samuhú',                          -27.52090, -60.39192, 'San Lorenzo'),
  ( 200, 'San Bernardo',                    -27.28673, -60.71290, 'O''Higgins'),
  ( 201, 'Santa Sylvina',                   -27.83160, -61.13600, 'Fray Justo Santa María de Oro'),
  ( 202, 'Selvas del Río de Oro',           -26.80293, -58.95652, 'Libertador General San Martín'),
  (   2, 'Sáenz Peña',                      -26.78500, -60.43900, 'Comandante Fernández'),
  ( 203, 'Taco Pozo',                       -25.61500, -63.26485, 'Almirante Brown'),
  ( 204, 'Tartagal',                        -24.22202, -62.14855, 'General Güemes'),
  ( 205, 'Tres Isletas',                    -26.34027, -60.43133, 'Maipú'),
  ( 206, 'Tres Pozos',                      -24.30896, -61.90318, 'General Güemes'),
  ( 207, 'Venados Grandes',                 -27.81534, -61.38588, 'Fray Justo Santa María de Oro'),
  ( 208, 'Villa Angela',                    -27.57686, -60.71114, 'Mayor Luis J. Fontana'),
  ( 209, 'Villa Berthet',                   -27.29398, -60.41117, 'San Lorenzo'),
  ( 210, 'Villa El Palmar',                 -26.45451, -60.16442, 'Quitilipi'),
  ( 211, 'Villa Río Bermejito',             -25.63755, -60.26549, 'General Güemes'),
  ( 212, 'Wichi',                           -24.69018, -61.42599, 'General Güemes'),
  ( 213, 'Zaparinqui',                      -26.06576, -60.56195, 'General Güemes')
) as v(id, nombre, lat, lng, depto)
on conflict (nombre) do update
  set id_apa = excluded.id_apa,
      lat    = excluded.lat,
      lng    = excluded.lng,
      depto  = excluded.depto,
      activa = true;

-- Las que quedaron de la lista geocodificada y la APA no nombra así se
-- desactivan, pero NO se borran: puede haber mediciones colgando de ellas.
update public.estaciones_lluvia
   set activa = false
 where id_apa is null;
