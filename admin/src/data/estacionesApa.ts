/**
 * Estaciones pluviométricas de la APA, tal como las publica su propio mapa.
 *
 * Este archivo **se genera** desde `https://mapas.apachaco.gob.ar/public/localidades`
 * y no se edita a mano. Son las 111 localidades con las que la APA informa sus
 * partes, con las coordenadas que usa el organismo: ya no hay que geocodificar
 * nada ni adivinar dónde está un paraje.
 *
 * Antes esta lista tenía 57 estaciones ubicadas con el geocodificador de
 * Open-Meteo. El control cruzado dio una mediana de 0,11 km de diferencia
 * contra las oficiales —el peor caso, Puerto Bermejo, 3,9 km, porque son dos
 * pueblos distintos (Nuevo y Viejo)—, así que las mediciones cargadas con la
 * lista anterior siguen siendo comparables. Lo que cambia es la cobertura:
 * entran 54 localidades que antes no estaban, entre ellas Las Palmas,
 * Miraflores y Villa El Palmar, que el geocodificador no resolvía.
 *
 * Dos advertencias sobre los datos de origen, que se dejan como vienen:
 *
 * - **La Vicuña** y **Paraje Kolbacks** comparten exactamente la misma
 *   coordenada (-25,9614 / -60,1983). Es un valor de relleno en el origen, no
 *   dos pluviómetros en el mismo poste. Sus lecturas se comparan contra la
 *   misma celda del modelo, así que no aportan dos puntos independientes.
 * - **Sáenz Peña** (id 2) y **Presidencia Roque Sáenz Peña** (id 189) son la
 *   misma ciudad cargada dos veces, a 1 km una de otra.
 *
 * Para regenerar, ver `docs/geo/localidades-apa.json`.
 */

export interface EstacionApa {
  /** Identificador de la APA; es el que devuelve `/public/precipitaciones` */
  id: number
  /** Como lo informa la APA */
  nombre: string
  lat: number
  lng: number
  depto: string
}

export const ESTACIONES_APA: EstacionApa[] = [
  { id: 106, nombre: 'Avia Terai',                    lat: -26.68663, lng: -60.72802, depto: 'Independencia' },
  { id: 107, nombre: 'Barranqueras',                  lat: -27.48514, lng: -58.93074, depto: 'San Fernando' },
  { id: 108, nombre: 'Barrio de los Pescadores',      lat: -27.46018, lng: -58.86681, depto: '1° de Mayo' },
  { id: 109, nombre: 'Basail',                        lat: -27.88763, lng: -59.28148, depto: 'San Fernando' },
  { id: 110, nombre: 'Campo Largo',                   lat: -26.80031, lng: -60.83906, depto: 'Independencia' },
  { id: 111, nombre: 'Capitán Solari',                lat: -26.80242, lng: -59.55709, depto: 'Sargento Cabral' },
  { id: 112, nombre: 'Charadai',                      lat: -27.65468, lng: -59.86223, depto: 'Tapenagá' },
  { id:   3, nombre: 'Charata',                       lat: -27.21794, lng: -61.18736, depto: 'Chacabuco' },
  { id: 114, nombre: 'Chorotis',                      lat: -27.91465, lng: -61.40143, depto: 'Fray Justo Santa María de Oro' },
  { id: 115, nombre: 'Ciervo Petiso',                 lat: -26.58011, lng: -59.63011, depto: 'Libertador General San Martín' },
  { id: 116, nombre: 'Colonia Aborigen',              lat: -26.95688, lng: -60.20277, depto: '25 de Mayo' },
  { id: 117, nombre: 'Colonia Baranda',               lat: -27.56024, lng: -59.30861, depto: 'San Fernando' },
  { id: 118, nombre: 'Colonia Benítez',               lat: -27.32949, lng: -58.95015, depto: '1° de Mayo' },
  { id: 119, nombre: 'Colonia Elisa',                 lat: -26.93164, lng: -59.51878, depto: 'Sargento Cabral' },
  { id: 120, nombre: 'Colonia José Mármol',           lat: -26.99486, lng: -60.67870, depto: 'Independencia' },
  { id: 121, nombre: 'Colonia La Matanza',            lat: -26.61089, lng: -60.24423, depto: 'Maipú' },
  { id: 122, nombre: 'Colonia Pegouriel',             lat: -27.61679, lng: -60.81180, depto: 'Mayor Luis J. Fontana' },
  { id: 123, nombre: 'Colonia Popular',               lat: -27.27524, lng: -59.15146, depto: 'Libertad' },
  { id: 124, nombre: 'Colonias Unidas',               lat: -26.70010, lng: -59.62774, depto: 'Sargento Cabral' },
  { id: 125, nombre: 'Comandancia Frías',             lat: -24.56480, lng: -62.23794, depto: 'General Güemes' },
  { id: 126, nombre: 'Concepción del Bermejo',        lat: -26.60034, lng: -60.94623, depto: 'Almirante Brown' },
  { id: 127, nombre: 'Coronel Du Graty',              lat: -27.68220, lng: -60.90439, depto: 'Mayor Luis J. Fontana' },
  { id: 128, nombre: 'Corzuela',                      lat: -26.95133, lng: -60.97040, depto: 'General Belgrano' },
  { id: 129, nombre: 'Cote Lai',                      lat: -27.52739, lng: -59.57426, depto: 'Tapenagá' },
  { id: 130, nombre: 'El Espinillo',                  lat: -25.40904, lng: -60.44866, depto: 'General Güemes' },
  { id: 131, nombre: 'El Naranjito',                  lat: -27.70237, lng: -59.01511, depto: 'San Fernando' },
  { id: 132, nombre: 'El Paraisal',                   lat: -26.50006, lng: -60.06753, depto: 'Quitilipi' },
  { id: 133, nombre: 'El Pastoril',                   lat: -27.62528, lng: -60.74951, depto: 'Mayor Luis J. Fontana' },
  { id: 134, nombre: 'El Sauzal',                     lat: -24.57725, lng: -61.53209, depto: 'General Güemes' },
  { id: 135, nombre: 'El Sauzalito',                  lat: -24.42853, lng: -61.68406, depto: 'General Güemes' },
  { id: 136, nombre: 'Enrique Urien',                 lat: -27.55633, lng: -60.52610, depto: 'Mayor Luis J. Fontana' },
  { id: 137, nombre: 'Estación General Obligado',     lat: -27.41090, lng: -59.41856, depto: 'Libertad' },
  { id: 138, nombre: 'Fontana',                       lat: -27.41628, lng: -59.03411, depto: 'San Fernando' },
  { id: 139, nombre: 'Fortín Belgrano',               lat: -24.12282, lng: -62.33760, depto: 'General Güemes' },
  { id: 140, nombre: 'Fortín Las Chuñas',             lat: -26.88411, lng: -60.90872, depto: 'Independencia' },
  { id: 141, nombre: 'Fortín Lavalle',                lat: -25.70450, lng: -60.20148, depto: 'General Güemes' },
  { id: 142, nombre: 'Fuerte Esperanza',              lat: -25.16189, lng: -61.84197, depto: 'General Güemes' },
  { id: 143, nombre: 'Gancedo',                       lat: -27.49084, lng: -61.67649, depto: '12 de Octubre' },
  { id: 144, nombre: 'General Capdevila',             lat: -27.42256, lng: -61.47612, depto: '12 de Octubre' },
  { id: 145, nombre: 'General José de San Martín',    lat: -26.53638, lng: -59.34133, depto: 'Libertador General San Martín' },
  { id: 146, nombre: 'General Pinedo',                lat: -27.32539, lng: -61.28100, depto: '12 de Octubre' },
  { id: 147, nombre: 'General Vedia',                 lat: -26.93743, lng: -58.66116, depto: 'Bermejo' },
  { id: 148, nombre: 'Haumonia',                      lat: -27.50648, lng: -60.17864, depto: 'Tapenagá' },
  { id: 149, nombre: 'Hermoso Campo',                 lat: -27.61004, lng: -61.34410, depto: '2 de Abril' },
  { id: 150, nombre: 'Horquilla',                     lat: -27.54067, lng: -59.95573, depto: 'Tapenagá' },
  { id: 151, nombre: 'Ingeniero Barbet',              lat: -27.00247, lng: -59.48376, depto: 'Sargento Cabral' },
  { id: 152, nombre: 'Isla del Cerrito',              lat: -27.29279, lng: -58.61784, depto: 'Bermejo' },
  { id: 153, nombre: 'Itín',                          lat: -27.48602, lng: -61.32346, depto: '2 de Abril' },
  { id: 154, nombre: 'Juan José Castelli',            lat: -25.94658, lng: -60.62006, depto: 'General Güemes' },
  { id: 155, nombre: 'Kilómetro 855',                 lat: -26.43533, lng: -60.41079, depto: 'Maipú' },
  { id: 156, nombre: 'Kilómetro 884',                 lat: -26.18567, lng: -60.49679, depto: 'Maipú' },
  { id: 157, nombre: 'La Clotilde',                   lat: -27.17741, lng: -60.63256, depto: 'O\'Higgins' },
  { id: 158, nombre: 'La Curva',                      lat: -26.34102, lng: -60.33409, depto: 'Maipú' },
  { id: 159, nombre: 'La Eduvigis',                   lat: -26.83643, lng: -59.06232, depto: 'Libertador General San Martín' },
  { id: 160, nombre: 'La Escondida',                  lat: -27.10534, lng: -59.44642, depto: 'General Donovan' },
  { id: 163, nombre: 'La Leonesa',                    lat: -27.03966, lng: -58.70759, depto: 'Bermejo' },
  { id: 165, nombre: 'La Sabana',                     lat: -27.87235, lng: -59.93760, depto: 'Tapenagá' },
  { id: 171, nombre: 'La Tigra',                      lat: -27.10954, lng: -60.58734, depto: 'O\'Higgins' },
  { id: 172, nombre: 'La Verde',                      lat: -27.13047, lng: -59.37630, depto: 'General Donovan' },
  { id: 215, nombre: 'La Vicuña',                     lat: -25.96140, lng: -60.19830, depto: 'Tapenaga' },
  { id: 161, nombre: 'Laguna Blanca',                 lat: -27.25640, lng: -59.23343, depto: 'Libertad' },
  { id: 162, nombre: 'Laguna Limpia',                 lat: -26.49583, lng: -59.68034, depto: 'Libertador General San Martín' },
  { id: 164, nombre: 'Lapachito',                     lat: -27.15937, lng: -59.38546, depto: 'General Donovan' },
  { id: 166, nombre: 'Las Breñas',                    lat: -27.08643, lng: -61.08583, depto: '9 de Julio' },
  { id: 167, nombre: 'Las Garcitas',                  lat: -26.61813, lng: -59.79914, depto: 'Sargento Cabral' },
  { id: 168, nombre: 'Las Hacheras',                  lat: -25.38689, lng: -60.98982, depto: 'General Güemes' },
  { id: 169, nombre: 'Las Palmas',                    lat: -27.04888, lng: -58.68264, depto: 'Bermejo' },
  { id: 170, nombre: 'Las Piedritas',                 lat: -26.82413, lng: -61.56665, depto: '9 de Julio' },
  { id: 173, nombre: 'Los Frentones',                 lat: -26.40702, lng: -61.41290, depto: 'Almirante Brown' },
  { id: 174, nombre: 'Lote 1',                        lat: -27.31363, lng: -58.99214, depto: '1° de Mayo' },
  { id: 175, nombre: 'Machagai',                      lat: -26.92616, lng: -60.04842, depto: '25 de Mayo' },
  { id: 176, nombre: 'Makallé',                       lat: -27.20572, lng: -59.28709, depto: 'General Donovan' },
  { id: 177, nombre: 'Margarita Belén',               lat: -27.25910, lng: -58.97049, depto: '1° de Mayo' },
  { id: 178, nombre: 'Mesón de Fierro',               lat: -27.43050, lng: -61.01665, depto: '12 de Octubre' },
  { id: 179, nombre: 'Miraflores',                    lat: -25.65166, lng: -60.92471, depto: 'General Güemes' },
  { id: 180, nombre: 'Napalpí',                       lat: -26.90254, lng: -60.12980, depto: '25 de Mayo' },
  { id: 181, nombre: 'Napenay',                       lat: -26.72957, lng: -60.61678, depto: 'Independencia' },
  { id: 182, nombre: 'Nueva Pompeya',                 lat: -24.93307, lng: -61.48315, depto: 'General Güemes' },
  { id: 183, nombre: 'Pampa Almirón',                 lat: -26.70113, lng: -59.12405, depto: 'Libertador General San Martín' },
  { id: 186, nombre: 'Pampa Landriel',                lat: -27.39475, lng: -61.10255, depto: '12 de Octubre' },
  { id: 184, nombre: 'Pampa del Indio',               lat: -26.04850, lng: -59.94463, depto: 'Libertador General San Martín' },
  { id: 185, nombre: 'Pampa del Infierno',            lat: -26.50360, lng: -61.17660, depto: 'Almirante Brown' },
  { id: 214, nombre: 'Paraje Kolbacks',               lat: -25.96140, lng: -60.19830, depto: 'General Güemes' },
  { id: 188, nombre: 'Presidencia Roca',              lat: -26.14383, lng: -59.59507, depto: 'Libertador General San Martín' },
  { id: 189, nombre: 'Presidencia Roque Sáenz Peña',  lat: -26.79097, lng: -60.44131, depto: 'Comandante Fernández' },
  { id: 187, nombre: 'Presidencia de la Plaza',       lat: -27.00355, lng: -59.84551, depto: 'Presidencia de la Plaza' },
  { id: 190, nombre: 'Puerto Bermejo Nuevo',          lat: -26.90781, lng: -58.54180, depto: 'Bermejo' },
  { id: 191, nombre: 'Puerto Bermejo Viejo',          lat: -26.92745, lng: -58.50914, depto: 'Bermejo' },
  { id: 192, nombre: 'Puerto Eva Perón',              lat: -26.66148, lng: -58.63558, depto: 'Bermejo' },
  { id: 193, nombre: 'Puerto Lavalle',                lat: -25.65874, lng: -60.13203, depto: 'General Güemes' },
  { id: 194, nombre: 'Puerto Tirol',                  lat: -27.37387, lng: -59.08727, depto: 'Libertad' },
  { id: 195, nombre: 'Puerto Vilelas',                lat: -27.51083, lng: -58.94178, depto: 'San Fernando' },
  { id: 196, nombre: 'Quitilipi',                     lat: -26.87081, lng: -60.21526, depto: 'Quitilipi' },
  { id:   1, nombre: 'Resistencia',                   lat: -27.45111, lng: -58.98645, depto: 'San Fernando' },
  { id: 198, nombre: 'Río Muerto',                    lat: -26.30743, lng: -61.65481, depto: 'Almirante Brown' },
  { id: 199, nombre: 'Samuhú',                        lat: -27.52090, lng: -60.39192, depto: 'San Lorenzo' },
  { id: 200, nombre: 'San Bernardo',                  lat: -27.28673, lng: -60.71290, depto: 'O\'Higgins' },
  { id: 201, nombre: 'Santa Sylvina',                 lat: -27.83160, lng: -61.13600, depto: 'Fray Justo Santa María de Oro' },
  { id: 202, nombre: 'Selvas del Río de Oro',         lat: -26.80293, lng: -58.95652, depto: 'Libertador General San Martín' },
  { id:   2, nombre: 'Sáenz Peña',                    lat: -26.78500, lng: -60.43900, depto: 'Comandante Fernández' },
  { id: 203, nombre: 'Taco Pozo',                     lat: -25.61500, lng: -63.26485, depto: 'Almirante Brown' },
  { id: 204, nombre: 'Tartagal',                      lat: -24.22202, lng: -62.14855, depto: 'General Güemes' },
  { id: 205, nombre: 'Tres Isletas',                  lat: -26.34027, lng: -60.43133, depto: 'Maipú' },
  { id: 206, nombre: 'Tres Pozos',                    lat: -24.30896, lng: -61.90318, depto: 'General Güemes' },
  { id: 207, nombre: 'Venados Grandes',               lat: -27.81534, lng: -61.38588, depto: 'Fray Justo Santa María de Oro' },
  { id: 208, nombre: 'Villa Angela',                  lat: -27.57686, lng: -60.71114, depto: 'Mayor Luis J. Fontana' },
  { id: 209, nombre: 'Villa Berthet',                 lat: -27.29398, lng: -60.41117, depto: 'San Lorenzo' },
  { id: 210, nombre: 'Villa El Palmar',               lat: -26.45451, lng: -60.16442, depto: 'Quitilipi' },
  { id: 211, nombre: 'Villa Río Bermejito',           lat: -25.63755, lng: -60.26549, depto: 'General Güemes' },
  { id: 212, nombre: 'Wichi',                         lat: -24.69018, lng: -61.42599, depto: 'General Güemes' },
  { id: 213, nombre: 'Zaparinqui',                    lat: -26.06576, lng: -60.56195, depto: 'General Güemes' },
]

/**
 * Las que efectivamente informan.
 *
 * De las 111 localidades que la APA lista, sólo **71** aparecieron alguna vez en
 * un parte durante el año relevado (01/09/2025 – 19/09/2026, 162 fechas, 3.334
 * mediciones). Las otras 40 están en el catálogo pero no tienen pluviómetro que
 * reporte.
 *
 * La distinción es necesaria, no cosmética. La APA **nunca publica un cero**:
 * una estación que no figura en el parte midió cero, y así se la usa al
 * interpolar. Pero eso sólo vale para las que reportan. Si se completara con
 * cero también a las 40 que nunca informan, se estarían inventando 40
 * mediciones de lluvia nula por fecha y la estimación saldría sistemáticamente
 * baja.
 *
 * Que el silencio sea un cero está fundado: la tasa de reporte sube del 11 % al
 * 86 % según cuánta lluvia vio el modelo en esa celda. Si fuera falta de dato,
 * esa tasa sería plana.
 *
 * Para actualizar la lista hay que volver a recorrer el histórico de
 * `/public/precipitaciones/fechas`.
 */
export const IDS_ACTIVAS: ReadonlySet<number> = new Set([
  1, 3, 106, 107, 109, 110, 111, 112, 114, 115, 118, 119, 124, 125, 126, 127,
  128, 129, 130, 135, 136, 142, 143, 145, 146, 147, 148, 149, 150, 152, 154,
  157, 159, 160, 162, 165, 166, 167, 169, 171, 172, 173, 175, 176, 177, 179,
  181, 182, 183, 184, 185, 187, 188, 189, 190, 194, 195, 196, 199, 200, 201,
  202, 203, 205, 208, 209, 210, 211, 212, 214, 215,
])

export const ESTACIONES_ACTIVAS: EstacionApa[] =
  ESTACIONES_APA.filter(e => IDS_ACTIVAS.has(e.id))

/** Nombre sin acentos, sin puntuación y en minúsculas, para poder comparar */
export function normalizarNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Alias con los que la prensa nombra a una estación.
 *
 * El parte de la APA que sale en los diarios no usa el nombre completo:
 * "Sáenz Peña" por "Presidencia Roque Sáenz Peña", "Castelli" por "Juan José
 * Castelli". Sin esto esas mediciones se perderían, que son justo las de las
 * localidades más grandes. Con la importación automática esto pesa menos, pero
 * el lector de partes en prosa sigue estando para cuando la API no responde.
 */
export const ALIAS_ESTACIONES: Record<string, string> = {
  'saenz pena': 'Presidencia Roque Sáenz Peña',
  'roque saenz pena': 'Presidencia Roque Sáenz Peña',
  'pcia roque saenz pena': 'Presidencia Roque Sáenz Peña',
  'presidencia saenz pena': 'Presidencia Roque Sáenz Peña',
  'castelli': 'Juan José Castelli',
  'j j castelli': 'Juan José Castelli',
  'pcia de la plaza': 'Presidencia de la Plaza',
  'presidencia la plaza': 'Presidencia de la Plaza',
  'la plaza': 'Presidencia de la Plaza',
  'pcia roca': 'Presidencia Roca',
  'gral san martin': 'General José de San Martín',
  'general san martin': 'General José de San Martín',
  'san martin': 'General José de San Martín',
  'gral vedia': 'General Vedia',
  'gral pinedo': 'General Pinedo',
  'gral capdevila': 'General Capdevila',
  'du graty': 'Coronel Du Graty',
  'cnel du graty': 'Coronel Du Graty',
  'rio bermejito': 'Villa Río Bermejito',
  'villa bermejito': 'Villa Río Bermejito',
  'el cerrito': 'Isla del Cerrito',
  'vilelas': 'Puerto Vilelas',
  'bermejo': 'Puerto Bermejo Nuevo',
  'puerto bermejo': 'Puerto Bermejo Nuevo',
  'eva peron': 'Puerto Eva Perón',
  'villa rural el palmar': 'Villa El Palmar',
  'el palmar': 'Villa El Palmar',
  'villa angela': 'Villa Angela',
  'obligado': 'Estación General Obligado',
  'tirol': 'Puerto Tirol',
}

const PORNOMBRE = new Map<string, EstacionApa>(
  ESTACIONES_APA.map(e => [normalizarNombre(e.nombre), e]),
)

const PORID = new Map<number, EstacionApa>(ESTACIONES_APA.map(e => [e.id, e]))

/** Busca una estación por el id que devuelve la API de la APA */
export function estacionPorId(id: number): EstacionApa | null {
  return PORID.get(id) ?? null
}

/**
 * Busca una estación por como la nombró el parte; null si no se reconoce.
 *
 * El alias gana sobre el nombre literal, y no es un detalle: la APA tiene
 * cargada "Sáenz Peña" (id 2) y "Presidencia Roque Sáenz Peña" (id 189) como si
 * fueran dos lugares, pero informa siempre en la segunda. Sin la precedencia,
 * un parte que dice "Sáenz Peña" iría a parar a la estación que nunca reporta y
 * su medición quedaría huérfana.
 */
export function buscarEstacion(nombre: string): EstacionApa | null {
  const n = normalizarNombre(nombre)
  const alias = ALIAS_ESTACIONES[n]
  if (alias) {
    const porAlias = PORNOMBRE.get(normalizarNombre(alias))
    if (porAlias) return porAlias
  }
  return PORNOMBRE.get(n) ?? null
}
