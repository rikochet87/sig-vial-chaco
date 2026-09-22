/**
 * Estaciones pluviométricas de la APA con sus coordenadas.
 *
 * La red provincial son unos 70 pluviómetros en comisarías más 15 en
 * establecimientos rurales. La APA publica el parte después de cada lluvia,
 * pero no en un formato consultable: va en PDF y en la prensa. Esta lista es
 * para poder cargar esos partes y usarlos como verdad de campo — primero para
 * medir cuánto se equivoca el modelo, después para corregirlo, y al final para
 * reemplazarlo donde haya medición.
 *
 * Las coordenadas salen del geocodificador de Open-Meteo y están verificadas
 * contra el departamento que devuelve: todas caen en Chaco. Es la ubicación del
 * pueblo, no la del pluviómetro exacto, pero dentro de una celda de 9 km eso no
 * cambia con qué valor del modelo se compara.
 *
 * Faltan tres que el geocodificador no resuelve —Las Palmas, Villa Rural El
 * Palmar y Miraflores— y no les invento coordenadas. Se pueden agregar desde la
 * pantalla de mediciones cuando alguien que conozca el lugar las cargue.
 */

export interface EstacionApa {
  /** Como aparece en el parte de la APA */
  nombre: string
  lat: number
  lng: number
}

export const ESTACIONES_APA: EstacionApa[] = [
  { nombre: 'Avia Terai', lat: -26.68665, lng: -60.72803 },
  { nombre: 'Barranqueras', lat: -27.48132, lng: -58.93925 },
  { nombre: 'Basail', lat: -27.88539, lng: -59.28245 },
  { nombre: 'Campo Largo', lat: -26.80031, lng: -60.83903 },
  { nombre: 'Capitán Solari', lat: -26.80247, lng: -59.55724 },
  { nombre: 'Charata', lat: -27.21787, lng: -61.18738 },
  { nombre: 'Ciervo Petiso', lat: -26.58016, lng: -59.63006 },
  { nombre: 'Colonia Benítez', lat: -27.33026, lng: -58.94579 },
  { nombre: 'Colonia Elisa', lat: -26.93166, lng: -59.51882 },
  { nombre: 'Colonia Popular', lat: -27.27450, lng: -59.15164 },
  { nombre: 'Colonias Unidas', lat: -26.69831, lng: -59.63029 },
  { nombre: 'Coronel Du Graty', lat: -27.68216, lng: -60.90443 },
  { nombre: 'Corzuela', lat: -26.95135, lng: -60.97036 },
  { nombre: 'Cote Lai', lat: -27.53022, lng: -59.57346 },
  { nombre: 'El Espinillo', lat: -25.40928, lng: -60.44680 },
  { nombre: 'Enrique Urien', lat: -27.55629, lng: -60.52616 },
  { nombre: 'Fuerte Esperanza', lat: -25.15982, lng: -61.83964 },
  { nombre: 'Gancedo', lat: -27.48875, lng: -61.67541 },
  { nombre: 'General Pinedo', lat: -27.32534, lng: -61.28101 },
  { nombre: 'General San Martín', lat: -26.53643, lng: -59.34138 },
  { nombre: 'General Vedia', lat: -26.93243, lng: -58.65919 },
  { nombre: 'Isla del Cerrito', lat: -27.29330, lng: -58.61940 },
  { nombre: 'Juan José Castelli', lat: -25.94660, lng: -60.62008 },
  { nombre: 'La Clotilde', lat: -27.17775, lng: -60.63038 },
  { nombre: 'La Escondida', lat: -27.10554, lng: -59.44603 },
  { nombre: 'La Eduvigis', lat: -26.83607, lng: -59.06211 },
  { nombre: 'La Leonesa', lat: -27.03751, lng: -58.70498 },
  { nombre: 'La Verde', lat: -27.12894, lng: -59.37546 },
  { nombre: 'Laguna Limpia', lat: -26.49545, lng: -59.68118 },
  { nombre: 'Las Breñas', lat: -27.08819, lng: -61.08217 },
  { nombre: 'Las Garcitas', lat: -26.61802, lng: -59.80135 },
  { nombre: 'Machagai', lat: -26.92617, lng: -60.04852 },
  { nombre: 'Makallé', lat: -27.20573, lng: -59.28709 },
  { nombre: 'Margarita Belén', lat: -27.25902, lng: -58.97157 },
  { nombre: 'Napenay', lat: -26.72992, lng: -60.61737 },
  { nombre: 'Nueva Pompeya', lat: -24.92786, lng: -61.48573 },
  { nombre: 'Pampa Almirón', lat: -26.70039, lng: -59.12331 },
  { nombre: 'Pampa del Indio', lat: -26.04982, lng: -59.93728 },
  { nombre: 'Pampa del Infierno', lat: -26.50353, lng: -61.17654 },
  { nombre: 'Presidencia de la Plaza', lat: -27.00213, lng: -59.84476 },
  { nombre: 'Presidencia Roca', lat: -26.14199, lng: -59.59595 },
  { nombre: 'Presidencia Roque Sáenz Peña', lat: -26.79095, lng: -60.44132 },
  { nombre: 'Puerto Bermejo', lat: -26.92739, lng: -58.50917 },
  { nombre: 'Puerto Eva Perón', lat: -26.66351, lng: -58.63245 },
  { nombre: 'Puerto Tirol', lat: -27.37382, lng: -59.08927 },
  { nombre: 'Puerto Vilelas', lat: -27.51083, lng: -58.94179 },
  { nombre: 'Quitilipi', lat: -26.87080, lng: -60.21537 },
  { nombre: 'Resistencia', lat: -27.46363, lng: -58.98665 },
  { nombre: 'Samuhú', lat: -27.51908, lng: -60.39409 },
  { nombre: 'San Bernardo', lat: -27.28672, lng: -60.71293 },
  { nombre: 'Santa Sylvina', lat: -27.83154, lng: -61.13601 },
  { nombre: 'Selvas del Río de Oro', lat: -26.80320, lng: -58.95928 },
  { nombre: 'Taco Pozo', lat: -25.61557, lng: -63.26708 },
  { nombre: 'Tres Isletas', lat: -26.34067, lng: -60.43207 },
  { nombre: 'Villa Ángela', lat: -27.57679, lng: -60.71114 },
  { nombre: 'Villa Berthet', lat: -27.28567, lng: -60.41579 },
  { nombre: 'Villa Río Bermejito', lat: -25.63722, lng: -60.26556 },
]

/** Sin tildes, minúsculas y sin dobles espacios — para emparejar nombres del parte */
export function normalizarNombre(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Alias con los que la prensa nombra a una estación.
 *
 * El parte no siempre usa el nombre completo: "Sáenz Peña" por "Presidencia
 * Roque Sáenz Peña", "Castelli" por "Juan José Castelli". Sin esto esas
 * mediciones se perderían, que son justo las de las localidades más grandes.
 */
export const ALIAS_ESTACIONES: Record<string, string> = {
  'saenz pena': 'Presidencia Roque Sáenz Peña',
  'roque saenz pena': 'Presidencia Roque Sáenz Peña',
  'pcia roque saenz pena': 'Presidencia Roque Sáenz Peña',
  'castelli': 'Juan José Castelli',
  'j j castelli': 'Juan José Castelli',
  'pcia de la plaza': 'Presidencia de la Plaza',
  'presidencia la plaza': 'Presidencia de la Plaza',
  'pcia roca': 'Presidencia Roca',
  'gral san martin': 'General San Martín',
  'general jose de san martin': 'General San Martín',
  'gral vedia': 'General Vedia',
  'gral pinedo': 'General Pinedo',
  'du graty': 'Coronel Du Graty',
  'cnel du graty': 'Coronel Du Graty',
  'rio bermejito': 'Villa Río Bermejito',
  'villa bermejito': 'Villa Río Bermejito',
  'el cerrito': 'Isla del Cerrito',
  'vilelas': 'Puerto Vilelas',
  'bermejo': 'Puerto Bermejo',
  'eva peron': 'Puerto Eva Perón',
  'la tigra': 'La Clotilde',        // comparten pluviómetro en algunos partes
}

const PORNOMBRE = new Map<string, EstacionApa>(
  ESTACIONES_APA.map(e => [normalizarNombre(e.nombre), e]),
)

/** Busca una estación por como la nombró el parte; null si no se reconoce */
export function buscarEstacion(nombre: string): EstacionApa | null {
  const n = normalizarNombre(nombre)
  const directa = PORNOMBRE.get(n)
  if (directa) return directa
  const alias = ALIAS_ESTACIONES[n]
  if (alias) return PORNOMBRE.get(normalizarNombre(alias)) ?? null
  return null
}
