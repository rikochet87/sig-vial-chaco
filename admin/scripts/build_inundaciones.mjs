/**
 * Arma las capas de la pestaña «Gran Resistencia» de Hidrología a partir de la
 * investigación de inundaciones (docs/geo/inundaciones/).
 *
 *   node scripts/build_inundaciones.mjs
 *
 * Deja en public/geo/inundaciones/ un `indice.json` chico —qué capas hay, de
 * qué fecha, con qué altura del río y cuánto miden— y un archivo por capa con
 * sus polígonos. Va partido porque todas juntas pesan 6 MB y la pantalla
 * muestra dos o tres a la vez: cada una se pide recién cuando se la prende.
 *
 * Node puro y sin dependencias, como los otros `build_`. Los GeoJSON de origen
 * sí salen de scripts con dependencias (scripts/inundaciones/); este paso sólo
 * los reparte y les pega los números de `capas-resumen.json`, que se midieron
 * sobre las grillas originales y no sobre los polígonos.
 *
 * Las coordenadas se redondean a cuatro decimales (11 m): las manchas salen de
 * grillas de 30 a 90 m, así que el quinto decimal es ruido que pesa.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ORIGEN = join(AQUI, '..', '..', 'docs', 'geo', 'inundaciones')
const DESTINO = join(AQUI, '..', 'public', 'geo', 'inundaciones')
mkdirSync(DESTINO, { recursive: true })

const leer = f => JSON.parse(readFileSync(join(ORIGEN, f), 'utf8'))
const zonas = leer('zonas-serie.geojson').features
const todasLandsat = leer('manchas-landsat.geojson').features
const landsat = todasLandsat.filter(f => f.properties.capa !== 'sin imagen')
/** Lo que cada escena NO ve dentro del recuadro: fuera de la imagen o bajo nubes */
const ciegas = new Map(todasLandsat.filter(f => f.properties.capa === 'sin imagen').map(f => [f.properties.fecha, f]))
const canal16 = leer('canal-16.geojson')
const s2 = leer('manchas-sentinel2.geojson').features
const resumen = leer('capas-resumen.json')

const buscar = (lista, cond, que) => {
  const f = lista.find(x => Object.entries(cond).every(([k, v]) => x.properties[k] === v))
  if (!f) throw new Error(`no está la capa ${que}`)
  return f
}

const LANDSAT_MSS = 'Landsat MSS, 60 m'
const LANDSAT = 'Landsat, 30 m'
const SENTINEL = 'Sentinel-2, 10 m'
const ABIERTA = 'agua abierta'
const INFRARROJO = 'infrarrojo cercano: agua, suelo saturado y sombras'

/**
 * Las capas, en el orden en que se listan.
 *
 * `grupo`:
 *  - `rio`: se moja con el río hasta `alturaM`, de la serie de 337 escenas.
 *  - `observada`: la mancha de un día, con el río en `alturaM`.
 *  - `lluvia`: la mancha de un día con el río bajo.
 *  - `base`: agua permanente y lo construido.
 */
const CAPAS = [
  { id: 'permanente', grupo: 'base', titulo: 'Agua permanente', fuente: buscar(s2, { capa: 'agua permanente' }, 'permanente'),
    fecha: '2021-08-19', alturaM: 0.38, sensor: SENTINEL, criterio: ABIERTA,
    nota: 'Lo que tenía agua en la bajante extraordinaria de 2021.' },
  { id: 'urbano-hoy', grupo: 'base', titulo: 'Construido, 2020–2025', fuente: buscar(zonas, { capa: 'mancha urbana', epoca: '2020-2025' }, 'urbano hoy'),
    sensor: LANDSAT, criterio: 'poca vegetación en el 80 % o más de 89 escenas',
    nota: 'Clasificación propia: un barrio muy arbolado no entra. Es un piso.' },
  { id: 'urbano-1984', grupo: 'base', titulo: 'Construido, 1984–1989', fuente: buscar(zonas, { capa: 'mancha urbana', epoca: '1984-1989' }, 'urbano 1984'),
    sensor: LANDSAT, criterio: 'poca vegetación en el 80 % o más de 42 escenas', nota: null },

  ...[['rio-4', 'menos de 4 m', 4], ['rio-5', '4 a 5 m', 5], ['rio-6', '5 a 6 m', 6], ['rio-7', '6 a 7 m', 7]].map(([id, hasta, alturaM]) => {
    const fuente = buscar(zonas, { capa: 'se moja con el río en', hasta }, id)
    return { id, grupo: 'rio', titulo: `Se moja con el río hasta ${alturaM} m`, fuente, alturaM, sensor: LANDSAT, criterio: ABIERTA,
      escenas: fuente.properties.escenas,
      nota: 'Agua en la mitad o más de las escenas con el río a esa altura o menos, sin contar las de bajante.' }
  }),

  { id: 'obs-2018-01-27', grupo: 'observada', titulo: '27/01/2018', fuente: buscar(s2, { fecha: '2018-01-27' }, '2018'),
    fecha: '2018-01-27', alturaM: 6.53, sensor: SENTINEL, criterio: ABIERTA, nota: 'Un día después del pico.' },
  { id: 'obs-2023-11-12', grupo: 'observada', titulo: '12/11/2023', fuente: buscar(s2, { fecha: '2023-11-12' }, '2023'),
    fecha: '2023-11-12', alturaM: 6.94, sensor: SENTINEL, criterio: ABIERTA,
    nota: 'Dos días después del pico de 7,05 m. Sin nubes: es la mejor imagen moderna de una crecida.' },
  { id: 'obs-2016-01-14', grupo: 'observada', titulo: '14/01/2016', fuente: buscar(landsat, { fecha: '2016-01-14' }, '2016'),
    fecha: '2016-01-14', alturaM: 7.23, sensor: LANDSAT, criterio: INFRARROJO, nota: 'Cinco días después del pico de 7,31 m.' },
  { id: 'obs-1983-02-28', grupo: 'observada', titulo: '28/02/1983', fuente: buscar(landsat, { fecha: '1983-02-28' }, '1983-02'),
    fecha: '1983-02-28', alturaM: 7.8, sensor: LANDSAT_MSS, criterio: INFRARROJO, epoca: 1983, nota: null },
  { id: 'obs-1983-03-07', grupo: 'observada', titulo: '07/03/1983', fuente: buscar(landsat, { fecha: '1983-03-07' }, '1983-03'),
    fecha: '1983-03-07', alturaM: 8.02, sensor: LANDSAT_MSS, criterio: INFRARROJO, epoca: 1983,
    nota: 'Otra órbita del satélite: sin nubes, ve la ciudad entera y el sur hasta el Canal 16, pero no el valle del Paraná al este. Es la imagen más cercana por debajo a la altura del pico de 1998.' },
  { id: 'obs-1983-07-22', grupo: 'observada', titulo: '22/07/1983', fuente: buscar(landsat, { fecha: '1983-07-22' }, '1983-07'),
    fecha: '1983-07-22', alturaM: 8.26, sensor: LANDSAT_MSS, criterio: INFRARROJO, epoca: 1983,
    nota: 'La imagen más limpia de la crecida de 1983.' },
  { id: 'obs-1983-06-20', grupo: 'observada', titulo: '20/06/1983', fuente: buscar(landsat, { fecha: '1983-06-20' }, '1983-06'),
    fecha: '1983-06-20', alturaM: 8.53, sensor: LANDSAT_MSS, criterio: INFRARROJO, epoca: 1983,
    nota: 'Dos días antes del máximo del registro (8,59 m). Las manchas sueltas al oeste de la ciudad no se pudieron confirmar.' },

  { id: 'obs-1982-08-14', grupo: 'defensa', titulo: '14/08/1982 · dique roto', fuente: buscar(landsat, { fecha: '1982-08-14' }, '1982'),
    fecha: '1982-08-14', alturaM: 5.15, sensor: LANDSAT_MSS, criterio: INFRARROJO, epoca: 1982,
    nota: 'Tres semanas después de la rotura del dique regulador del río Negro. El valle del Negro está inundado dentro de la ciudad con el Paraná un metro por debajo del alerta.' },
  { id: 'obs-1998-05-20', grupo: 'combinada', titulo: '20/05/1998 · río alto y lluvia', fuente: buscar(landsat, { fecha: '1998-05-20' }, '1998'),
    fecha: '1998-05-20', alturaM: 7.07, sensor: LANDSAT, criterio: INFRARROJO,
    nota: 'Dieciséis días después del pico de 8,17 m y un mes después del abril más lluvioso de la serie modelada. Un cuarto del recuadro está tapado por nubes: la mancha es un piso.' },

  { id: 'lluvia-2019-01-17', grupo: 'lluvia', titulo: '17/01/2019 · agua abierta', fuente: buscar(s2, { fecha: '2019-01-17' }, '2019-01-17'),
    fecha: '2019-01-17', alturaM: 4.08, sensor: SENTINEL, criterio: ABIERTA,
    nota: 'Cinco días después de lo peor de enero de 2019 (588 mm en 17 días). Lo que quedaba como espejo de agua.' },
  { id: 'lluvia-2019-01-22', grupo: 'lluvia', titulo: '22/01/2019 · suelo saturado', fuente: buscar(landsat, { fecha: '2019-01-22' }, '2019-01-22'),
    fecha: '2019-01-22', alturaM: 4.43, sensor: LANDSAT, criterio: INFRARROJO,
    nota: 'Incluye el suelo saturado, no sólo el agua. Hay nubes sobre la ciudad: adentro del casco no dice nada.' },
]

const red = c => c.map(p => p.map(an => an.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4])))

/**
 * Líneas que no son agua: se dibujan para ubicarse. Van en el índice porque
 * son pocas y cortas.
 */
const REFERENCIAS = [
  { id: 'canal-16', nombre: 'Canal 16', fuente: 'OpenStreetMap',
    lineas: canal16.geometry.coordinates.map(l => l.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5])) },
]

/**
 * Lo que se sabe que pasó y ninguna imagen muestra.
 *
 * **No es agua vista y no se dibuja como agua**: va como texto, al lado de lo
 * que muestran las imágenes más cercanas. Se muestra cuando la altura pedida
 * llega a `alturaM`. No lleva quién lo informó.
 */
const INFORMES = [
  { id: 'canal-16-1998', alturaM: 8.17, fecha: '1998-05-04', referencia: 'canal-16',
    texto: 'Con el pico de 1998 el agua entró al Canal 16, el último canal al sur del Gran Resistencia.',
    contraste: 'No hay imagen de ese pico. En las de 1998 que hay —el 09/04, con el río en 7,22 m y subiendo, y el 20/05, dieciséis días después y en 7,07 m— no se ve agua abierta sobre el canal. En 1983, con 7,80 m casi no hay agua junto a su tramo final; una semana después, con 8,02 m, la hay a menos de 300 m en más de la mitad de ese tramo, del lado del Paraná. Las imágenes no muestran el canal desbordado a lo largo: a 60 m por píxel un canal no se ve.' },
]

const indice = []
let total = 0
for (const c of CAPAS) {
  const { fuente, ...resto } = c
  const coords = red(fuente.geometry.coordinates)
  // Una mancha de un día que no ve todo el recuadro lleva lo que le falta:
  // fuera de la imagen no hay agua dibujada, y no es porque estuviera seco
  const ciega = c.fecha && fuente.properties.escena ? ciegas.get(c.fecha) : undefined
  const cuerpo = JSON.stringify({ id: c.id, coordinates: coords, ...(ciega ? { sinImagen: red(ciega.geometry.coordinates) } : {}) })
  writeFileSync(join(DESTINO, `${c.id}.json`), cuerpo)
  total += cuerpo.length
  indice.push({ ...resto, ...(resumen[c.id] ?? {}), ...(ciega ? { vistoPct: ciega.properties.validoPct } : {}), poligonos: coords.length, bytes: cuerpo.length })
  console.log(c.id.padEnd(20), String(coords.length).padStart(4), 'polígonos', (cuerpo.length / 1024).toFixed(0).padStart(6), 'KB')
}

writeFileSync(join(DESTINO, 'indice.json'), JSON.stringify({
  generado: new Date().toISOString().slice(0, 10),
  recuadro: resumen._recuadro.aoi,
  urbano: resumen._recuadro.urbano,
  urbanoKm2: resumen._recuadro.urbanoKm2,
  construidoHoyKm2: resumen._recuadro.construidoHoyKm2,
  capas: indice,
  referencias: REFERENCIAS,
  informes: INFORMES,
}, null, 1))
console.log('capas', indice.length, '· total', (total / 1048576).toFixed(1), 'MB')
