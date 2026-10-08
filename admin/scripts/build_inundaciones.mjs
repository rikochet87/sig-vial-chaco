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
const aoiR = resumen._recuadro.aoi

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
 * Las defensas contra el río, de un KML con una sola línea. Va con el río a la
 * izquierda del sentido de dibujo (de norte a sur, el Paraná al este):
 * `ladoDeDefensa()` depende de eso y el test lo afirma con el agua
 * permanente. Cinco decimales: es una obra de 30 m de ancho, no una mancha.
 */
const desdeKml = archivo => {
  const kml = readFileSync(join(ORIGEN, archivo), 'utf8')
  return [...kml.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g)].map(m =>
    m[1].trim().split(/\s+/).map(t => t.split(',').slice(0, 2).map(v => Math.round(Number(v) * 1e5) / 1e5)))
}
const largoKm = lineas => lineas.reduce((s, l) => s + l.slice(1).reduce((a, p, i) => {
  const q = l[i], k = Math.cos(p[1] * Math.PI / 180)
  return a + Math.hypot((p[0] - q[0]) * 111.32 * k, (p[1] - q[1]) * 110.57)
}, 0), 0)
const DEFENSAS = [
  // El coronamiento es el único dato de cota que hay: 53,50 m MOP en Puerto
  // Vilelas, y se toma para toda la traza por indicación del usuario. No es
  // un relevamiento del coronamiento a lo largo: un terraplén tiene puntos
  // bajos, y ésos son los que importan.
  { id: 'defensa-amgr', nombre: 'Defensa del Área Metropolitana', fuente: 'Defensa AMGR.kmz, aportado al proyecto el 08/10/2026',
    coronamientoMop: 53.5, coronamientoNota: 'Cota MOP medida en Puerto Vilelas, tomada para toda la traza',
    lineas: desdeKml('defensa-amgr.kml') },
].map(d => ({ ...d, km: Math.round(largoKm(d.lineas) * 10) / 10 }))

/**
 * Tramos de ruta que van elevados y el agua no corta: el puente General
 * Belgrano y su acceso, la RN 16 desde donde cruza la defensa hasta el final
 * del archivo, del lado de Corrientes. Lo pidió el usuario el 08/10/2026: el
 * acceso va en terraplén alto y el puente, sobre pilas. Sin esto, cada mancha
 * de las islas lo pintaba cortado.
 *
 * La caja sale del cruce de la RN 16 con la traza de la defensa, no está
 * escrita a mano. Se aplica sólo a la ruta nombrada: otro camino que pase por
 * la misma caja se sigue midiendo.
 */
const cruceSeg = (a, b, c, d) => {
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0])
  if (!den) return null
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den
  const u = -((a[0] - b[0]) * (a[1] - c[1]) - (a[1] - b[1]) * (a[0] - c[0])) / den
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] : null
}
const rnTodas = JSON.parse(readFileSync(join(AQUI, '..', 'public', 'geo', 'geo_rn.json'), 'utf8'))
const lineasRn16 = rnTodas.features.filter(f => String(f.properties.Numero) === '16').flatMap(f =>
  f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates])
const cruces16 = []
for (const l of lineasRn16) for (let i = 0; i + 1 < l.length; i++) for (const d of DEFENSAS[0].lineas) for (let j = 0; j + 1 < d.length; j++) {
  const q = cruceSeg(l[i], l[i + 1], d[j], d[j + 1])
  if (q) cruces16.push(q)
}
if (!cruces16.length) throw new Error('La RN 16 no cruza la defensa: no se puede ubicar el acceso al puente')
// Las dos calzadas cruzan a pocos metros; desde la más al oeste hacia el río
const oeste16 = Math.min(...cruces16.map(q => q[0])) - 0.0005
const delRio16 = lineasRn16.flat().filter(p => p[0] >= oeste16 && p[1] <= aoiR.norte && p[1] >= aoiR.sur)
const ELEVADAS = [{
  id: 'puente-belgrano', nombre: 'Puente General Belgrano y su acceso', via: 'RN 16',
  nota: 'Del cruce con la defensa hacia Corrientes: terraplén alto y puente. El agua no lo corta.',
  caja: {
    oeste: Math.round(oeste16 * 1e5) / 1e5, este: aoiR.este,
    sur: Math.round((Math.min(...delRio16.map(p => p[1])) - 0.002) * 1e5) / 1e5,
    norte: Math.round((Math.max(...delRio16.map(p => p[1])) + 0.002) * 1e5) / 1e5,
  },
}]

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

/**
 * El área defendida: la defensa, la RN 11 y la Av. Soberanía Nacional, que no
 * es una defensa sino el corte que se toma (el anillo no cierra). Lo arma
 * `scripts/inundaciones/recinto-amgr.mjs`.
 */
const recintoGeo = leer('recinto-amgr.geojson')
const RECINTO = {
  id: 'recinto-amgr', nombre: recintoGeo.properties.nombre, defensa: 'defensa-amgr',
  areaKm2: recintoGeo.properties.areaKm2, corteKm: recintoGeo.properties.corteKm,
  corteNombre: 'Av. Soberanía Nacional',
  anillo: recintoGeo.geometry.coordinates[0], corte: recintoGeo.corte,
}

/**
 * El valle de inundación del Paraná: la cuenca 12 de `geo_cuencas.json`, sólo
 * las partes que tocan el recuadro. Es por donde se extiende el río cuando
 * sale de su cauce, y su borde norte llega a la punta sur de la defensa.
 */
const aoi = resumen._recuadro.aoi
const cuencas = JSON.parse(readFileSync(join(AQUI, '..', 'public', 'geo', 'geo_cuencas.json'), 'utf8'))
const cuencaValle = cuencas.features.find(f => f.properties.cod === 12)
if (!cuencaValle) throw new Error('no está la cuenca 12 en geo_cuencas.json')
const VALLE = {
  id: 'valle-parana', nombre: cuencaValle.properties.nombre, fuente: 'Cuencas hídricas de la provincia (cuenca 12)',
  poligonos: cuencaValle.geometry.coordinates.filter(pol => pol[0].some(([x, y]) => x >= aoi.oeste - 0.02 && x <= aoi.este + 0.02 && y >= aoi.sur - 0.02 && y <= aoi.norte + 0.02))
    .map(pol => pol.map(an => an.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]))),
}

/**
 * Grillas de ~30 m rellenas por líneas de barrido con la regla par-impar: la
 * misma idea que `IndicePoligonos` en `lib/inundaciones.ts`, acá para medir y
 * no para consultar. Una sobre la caja del recinto y otra sobre el recuadro.
 */
const PASO = 0.0003
function grilla(caja) {
  const ancho = Math.ceil((caja.x1 - caja.x0) / PASO), alto = Math.ceil((caja.y1 - caja.y0) / PASO)
  const celdaKm2 = (PASO * 111.32 * Math.cos(((caja.y0 + caja.y1) / 2) * Math.PI / 180)) * (PASO * 110.57)
  const rasterizar = anillos => {
    const m = new Uint8Array(ancho * alto)
    const cruces = Array.from({ length: alto }, () => [])
    for (const an of anillos) for (let i = 0, j = an.length - 1; i < an.length; j = i++) {
      const [xa, ya] = an[j], [xb, yb] = an[i]
      if (ya === yb) continue
      const f0 = Math.max(0, Math.ceil((Math.min(ya, yb) - caja.y0) / PASO - 0.5))
      const f1 = Math.min(alto - 1, Math.ceil((Math.max(ya, yb) - caja.y0) / PASO - 0.5) - 1)
      for (let f = f0; f <= f1; f++) {
        const yc = caja.y0 + (f + 0.5) * PASO
        cruces[f].push(xa + (xb - xa) * (yc - ya) / (yb - ya))
      }
    }
    for (let f = 0; f < alto; f++) {
      const xs = cruces[f].sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - caja.x0) / PASO - 0.5))
        const c1 = Math.min(ancho - 1, Math.ceil((xs[k + 1] - caja.x0) / PASO - 0.5) - 1)
        if (c1 >= c0) m.fill(1, f * ancho + c0, f * ancho + c1 + 1)
      }
    }
    return m
  }
  const centro = i => [caja.x0 + ((i % ancho) + 0.5) * PASO, caja.y0 + (Math.floor(i / ancho) + 0.5) * PASO]
  return { rasterizar, centro, celdaKm2 }
}
const anillosDe = mp => mp.flatMap(pol => pol)
const fuenteDe = id => CAPAS.find(c => c.id === id).fuente.geometry.coordinates
const r2 = v => Math.round(v * 100) / 100
const urb = resumen._recuadro.urbano
const enUrbano = ([x, y]) => x >= urb.oeste && x <= urb.este && y >= urb.sur && y <= urb.norte

const gR = grilla(RECINTO.anillo.reduce((c, [x, y]) => ({ x0: Math.min(c.x0, x), x1: Math.max(c.x1, x), y0: Math.min(c.y0, y), y1: Math.max(c.y1, y) }),
  { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }))
const mRecinto = gR.rasterizar([RECINTO.anillo])
const mPermanenteR = gR.rasterizar(anillosDe(fuenteDe('permanente')))
const mConstruidoR = gR.rasterizar(anillosDe(fuenteDe('urbano-hoy')))
/**
 * Cuánto del agua del río de una capa cae dentro del área defendida, medido
 * igual que las cifras del índice: fuera del agua permanente. La pantalla lo
 * resta, porque con la defensa en pie ese agua no entra.
 */
function enRecinto(mp) {
  const m = gR.rasterizar(anillosDe(mp))
  let n = 0, u = 0, c = 0
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || !mRecinto[i] || mPermanenteR[i]) continue
    n++
    if (enUrbano(gR.centro(i))) { u++; if (mConstruidoR[i]) c++ }
  }
  return { km2: r2(n * gR.celdaKm2), urbanoKm2: r2(u * gR.celdaKm2), construidoKm2: r2(c * gR.celdaKm2) }
}

/**
 * Dónde cae el agua del río de una capa, sobre el recuadro y fuera del agua
 * permanente: dentro del área defendida, en el valle de inundación, en el resto
 * de la margen chaqueña, o del otro lado del límite provincial (islas y
 * Corrientes). Las cuatro suman el total de la capa en el recuadro, que no es
 * exactamente el `km2` del índice: aquél se midió sobre las grillas originales.
 */
const gA = grilla({ x0: aoi.oeste, x1: aoi.este, y0: aoi.sur, y1: aoi.norte })
const mValleA = gA.rasterizar(anillosDe(VALLE.poligonos))
const mRecintoA = gA.rasterizar([RECINTO.anillo])
const mPermanenteA = gA.rasterizar(anillosDe(fuenteDe('permanente')))
// La margen chaqueña: el límite provincial del IGN, sin simplificar. Corre por
// el cauce del Paraná; lo que queda del otro lado son islas y Corrientes.
const bundle = JSON.parse(readFileSync(join(AQUI, '..', 'public', 'geo', 'geo_bundle.json'), 'utf8'))
const mChacoA = gA.rasterizar(anillosDe(bundle.limite_provincial.features[0].geometry.coordinates))
let valleKm2 = 0
for (let i = 0; i < mValleA.length; i++) if (mValleA[i] && !mPermanenteA[i] && !mRecintoA[i]) valleKm2++
VALLE.enRecuadroKm2 = r2(valleKm2 * gA.celdaKm2)
function porZona(mp) {
  const m = gA.rasterizar(anillosDe(mp))
  let v = 0, d = 0, o = 0, f = 0
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || mPermanenteA[i]) continue
    if (mRecintoA[i]) d++
    else if (mValleA[i]) v++
    else if (mChacoA[i]) o++
    else f++
  }
  const k = n => r2(n * gA.celdaKm2)
  return { recintoKm2: k(d), valleKm2: k(v), chacoKm2: k(o), fueraKm2: k(f) }
}

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
  const delRio = c.grupo === 'rio' || c.grupo === 'observada'
  indice.push({ ...resto, ...(resumen[c.id] ?? {}), ...(ciega ? { vistoPct: ciega.properties.validoPct } : {}),
    ...(delRio ? { enRecinto: enRecinto(fuente.geometry.coordinates), porZona: porZona(fuente.geometry.coordinates) } : {}), poligonos: coords.length, bytes: cuerpo.length })
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
  defensas: DEFENSAS,
  recintos: [RECINTO],
  valle: VALLE,
  elevadas: ELEVADAS,
  informes: INFORMES,
}, null, 1))
console.log('capas', indice.length, '· total', (total / 1048576).toFixed(1), 'MB')
