/**
 * Verifica el motor de la red editable (`lib/redVial.ts`).
 *
 * No sale a la red ni toca la base: lee los dos archivos de `public/geo` y
 * afirma cómo se aplican los cambios encima, cómo se reconoce un tramo cuando
 * el archivo se regenera, y cuántos km le mueve cada cambio a cada consorcio.
 *
 *   npx tsx scripts/verificar-red-vial.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  aplicarCambios, ajusteNeto, capaDe, contribucion, designacion, huella, leerTramo,
  longitudKm, normalizarJerarquia, propiedadesDe, restarAjustes, ubicarBase,
  validarGeometria, validarTramo, cambiosGeoJSON,
  type Cambio, type Red, type Tramo, type Linea,
} from '../src/lib/redVial'

let fallos = 0
const fmt = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))
function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : fmt(valor) === fmt(esperado)
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(66)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}
const titulo = (s: string) => console.log(`\n— ${s} —`)

const GEO = join(__dirname, '..', 'public', 'geo')
const cc = JSON.parse(readFileSync(join(GEO, 'geo_cc.json'), 'utf8')) as Red
const rp = JSON.parse(readFileSync(join(GEO, 'geo_rp.json'), 'utf8')) as Red
const contar = (r: Red) => Object.values(r).reduce((s, c) => s + (c?.features.length ?? 0), 0)

// ── Geometría ───────────────────────────────────────────────────────────────
titulo('Geometría')

// Un grado de latitud son 111,2 km
const unGrado: Linea = { type: 'MultiLineString', coordinates: [[[-60, -27], [-60, -26]]] }
ok('un grado de latitud mide 111,2 km', Math.round(longitudKm(unGrado) * 10) / 10, 111.2)
ok('LineString y MultiLineString miden igual',
  longitudKm({ type: 'LineString', coordinates: [[-60, -27], [-60, -26]] }) === longitudKm(unGrado))

const red = { ...cc } as Red
let kmTrazados = 0
for (const [capa, col] of Object.entries(red)) {
  if (capa.endsWith('_DVP')) continue
  for (const f of col!.features) if (Number(f.properties?.CC)) kmTrazados += longitudKm(f.geometry)
}
// CLAUDE.md: «El largo geométrico de las trazas del GeoJSON da 28.756 km».
// `redLluvia` mide en plano local y éste por haversine: se afirma que coinciden
// dentro del 0,5 %, no al kilómetro.
ok('la red de consorcios trazada da los ~28.756 km documentados', Math.abs(kmTrazados / 28756 - 1) < 0.005)

const f0 = cc.ZII!.features[47]
ok('la huella es estable', huella(f0.geometry) === huella(JSON.parse(JSON.stringify(f0.geometry))))
const movido = JSON.parse(JSON.stringify(f0.geometry))
movido.coordinates[0][0][0] += 0.00001
ok('mover un vértice un metro cambia la huella', huella(f0.geometry) !== huella(movido))
const todas = new Set<string>()
let total = 0
for (const col of Object.values(cc)) for (const f of col!.features) { todas.add(huella(f.geometry)); total++ }
// Hay tramos duplicados en el archivo (misma traza, dos filas): la huella no
// puede separarlos, pero la posición sí. Se afirma que son pocos.
ok('las huellas repetidas son menos del 1 % del archivo', (total - todas.size) / total < 0.01)

// ── Lectura del archivo ─────────────────────────────────────────────────────
titulo('Lectura del archivo')

ok('PRIMRARIA es primaria', normalizarJerarquia('PRIMRARIA'), 'PRIMARIA')
ok('TIERCIARIA es terciaria', normalizarJerarquia('TIERCIARIA'), 'TERCIARIA')
ok('SECUNDRAR es secundaria', normalizarJerarquia('SECUNDRAR'), 'SECUNDARIA')
ok('TIERRA no es una jerarquía', normalizarJerarquia('TIERRA'), null)

const t047 = leerTramo('cc', 'ZII', { CC: '007', T: '047', Nm: null, J: 'TERCIARIA', M: 'TIERRA', Mn: 'CC', Nc: 'Z2C007047' })
ok('Z2C007047 es el tramo 047 del CC 7, zona II', [t047.consorcio, t047.tramo, t047.zona, t047.gestion], [7, '047', 'ZII', 'consorcio'])
ok('se nombra «Tramo 047»', designacion(t047), 'Tramo 047')
const rp49 = leerTramo('cc', 'ZI', { CC: '005', T: null, Nm: '049', J: 'SECUNDARIA', M: 'TIERRA', Mn: 'CC', Nc: 'Z1C005RP049' })
ok('Z1C005RP049 es la RP 49 en el CC 5', [designacion(rp49), rp49.consorcio], ['RP 49', 5])
const dvp = leerTramo('cc', 'ZIV_DVP', { CC: 'DVP', Mn: 'DVP', J: 'PRIMARIA', Nc: '00 Tramos Mantenidos por DVP' })
ok('una capa _DVP es de gestión DVP y sin consorcio', [dvp.gestion, dvp.consorcio, dvp.zona], ['dvp', null, 'ZIV'])
const rpCc = leerTramo('rp', 'rpTierra', { Zona: '2', CC: '074', Nombre: '058', Mantenim: 'CC', Jerarq: 'PRIMARIA', Mat_Calzad: 'TIERRA' })
ok('una RP mantenida por un consorcio cuenta para ese consorcio', [rpCc.gestion, rpCc.consorcio, rpCc.ruta, rpCc.zona], ['consorcio', 74, '058', 'ZII'])
const rpDvp = leerTramo('rp', 'rpPavimentada', { Zona: '5', Nombre: '001', Mantenim: 'DVP', Jerarq: 'PRIMARIA', Mat_Calzad: 'PAVIMENTO' })
ok('una RP de la DVP no es de ningún consorcio', [rpDvp.gestion, rpDvp.consorcio], ['dvp', null])

// ── Ida y vuelta: lo que se escribe se vuelve a leer igual ──────────────────
titulo('Ida y vuelta')

const muestras: Tramo[] = [
  { red: 'cc', gestion: 'consorcio', consorcio: 7, zona: 'ZII', jerarquia: 'TERCIARIA', material: 'TIERRA', tramo: '47', ruta: null, enObra: false },
  { red: 'cc', gestion: 'consorcio', consorcio: 5, zona: 'ZI', jerarquia: 'SECUNDARIA', material: 'CONSOLIDADO', tramo: null, ruta: '49', enObra: false },
  { red: 'cc', gestion: 'dvp', consorcio: null, zona: 'ZIII', jerarquia: 'PRIMARIA', material: 'TIERRA', tramo: '3', ruta: null, enObra: false },
  { red: 'rp', gestion: 'consorcio', consorcio: 74, zona: 'ZII', jerarquia: 'PRIMARIA', material: 'TIERRA', tramo: null, ruta: '58', enObra: false },
  { red: 'rp', gestion: 'dvp', consorcio: null, zona: 'ZV', jerarquia: 'SECUNDARIA', material: 'PAVIMENTO', tramo: null, ruta: '1', enObra: true },
]
for (const m of muestras) {
  const capa = capaDe(m)
  const leido = leerTramo(m.red, capa, propiedadesDe(m))
  const norm = (t: Tramo) => ({ ...t, tramo: t.tramo ? Number(t.tramo) : null, ruta: t.ruta ? Number(t.ruta) : null })
  ok(`${designacion(m)} (${m.gestion}) vuelve igual desde ${capa}`, norm(leido), norm(m))
}
ok('el tramo nuevo lleva el Nc con el formato de QGIS', propiedadesDe(muestras[0]).Nc, 'Z2C007047')
ok('la RP en un consorcio también', propiedadesDe(muestras[1]).Nc, 'Z1C005RP049')
ok('una RP en obra va a rpEnObra aunque sea pavimento', capaDe(muestras[4]), 'rpEnObra')
ok('un camino de gestión DVP va a la capa _DVP de su zona', capaDe(muestras[2]), 'ZIII_DVP')

// ── Km de los consorcios ────────────────────────────────────────────────────
titulo('Km de los consorcios')

const t7 = muestras[0]
ok('un tramo terciario de 10 km le suma 10 a la red y 10 a la terciaria',
  contribucion(t7, 10), [{ numero: 7, total: 10, primaria: 0, secundaria: 0, terciaria: 10 }])
ok('uno de gestión DVP no le suma a nadie', contribucion(muestras[2], 10), [])
ok('el alta suma lo nuevo', ajusteNeto(null, { tramo: t7, km: 4.5 }),
  [{ numero: 7, total: 4.5, primaria: 0, secundaria: 0, terciaria: 4.5 }])
ok('la baja resta lo original', ajusteNeto({ tramo: t7, km: 4.5 }, null),
  [{ numero: 7, total: -4.5, primaria: 0, secundaria: 0, terciaria: -4.5 }])
ok('alargar un tramo suma sólo la diferencia', ajusteNeto({ tramo: t7, km: 4 }, { tramo: t7, km: 5.25 }),
  [{ numero: 7, total: 1.25, primaria: 0, secundaria: 0, terciaria: 1.25 }])
ok('cambiarle la jerarquía mueve km entre redes sin tocar el total',
  ajusteNeto({ tramo: t7, km: 4 }, { tramo: { ...t7, jerarquia: 'SECUNDARIA' }, km: 4 }),
  [{ numero: 7, total: 0, primaria: 0, secundaria: 4, terciaria: -4 }])
ok('pasarlo al CC 9 resta en el 7 y suma en el 9',
  ajusteNeto({ tramo: t7, km: 4 }, { tramo: { ...t7, consorcio: 9 }, km: 4 }),
  [{ numero: 7, total: -4, primaria: 0, secundaria: 0, terciaria: -4 }, { numero: 9, total: 4, primaria: 0, secundaria: 0, terciaria: 4 }])
ok('pasarlo a gestión DVP se lo resta al consorcio',
  ajusteNeto({ tramo: t7, km: 4 }, { tramo: { ...t7, gestion: 'dvp', consorcio: null }, km: 4 }),
  [{ numero: 7, total: -4, primaria: 0, secundaria: 0, terciaria: -4 }])
ok('editar sin cambiar nada no mueve nada', ajusteNeto({ tramo: t7, km: 4 }, { tramo: t7, km: 4 }), [])
ok('los ajustes van con dos decimales, como la ficha',
  ajusteNeto(null, { tramo: t7, km: 2.595 })[0].total, 2.6)
// Encadenar: editar (−2,595 en el 7), quitar y deshacer tiene que volver exacto
{
  let km7 = 200
  const aplicar = (a: { numero: number; total: number }[], s: number) => {
    for (const x of a) if (x.numero === 7) km7 = Math.round((km7 + s * x.total) * 100) / 100
  }
  const ed = ajusteNeto({ tramo: t7, km: 2.595 }, { tramo: { ...t7, consorcio: 12 }, km: 2.595 })
  aplicar(ed, 1)
  const bj = ajusteNeto({ tramo: t7, km: 2.595 }, null)
  aplicar(ed, -1); aplicar(bj, 1)       // la edición pasa a baja
  aplicar(bj, -1)                      // y se descarta
  ok('editar, quitar y deshacer vuelve exacto al número de partida', km7, 200)
}
ok('deshacer es restar el ajuste: a − a es vacío',
  restarAjustes(ajusteNeto(null, { tramo: t7, km: 3 }), ajusteNeto(null, { tramo: t7, km: 3 })), [])

// ── Aplicar los cambios ─────────────────────────────────────────────────────
titulo('Aplicar los cambios')

const sinCambios = aplicarCambios('cc', cc, [])
ok('sin cambios, mismos tramos', contar(sinCambios.red), contar(cc))
ok('sin cambios, las capas son las mismas colecciones', sinCambios.red.ZII === cc.ZII)
ok('cada tramo tiene origen', sinCambios.origen.size, contar(cc))

const geomNueva: Linea = { type: 'MultiLineString', coordinates: [[[-60.5, -26.5], [-60.45, -26.5]]] }
const base = (c: Partial<Cambio>): Cambio => ({
  id: 'x', red: 'cc', operacion: 'alta', capa: 'ZII', base_capa: null, base_indice: null, base_huella: null,
  original: null, propiedades: propiedadesDe(t7), geometria: geomNueva, gestion: 'consorcio',
  consorcio_numero: 7, zona: 'ZII', km: 5, ajuste: [], ...c,
})
const alta = base({ id: 'alta' })
const baja = base({
  id: 'baja', operacion: 'baja', base_capa: 'ZII', base_indice: 47, base_huella: huella(f0.geometry),
  propiedades: f0.properties!, geometria: f0.geometry as Linea,
})
const f1 = cc.ZIII!.features[10]
const edicion = base({
  id: 'edicion', operacion: 'edicion', capa: 'ZIII_DVP', base_capa: 'ZIII', base_indice: 10,
  base_huella: huella(f1.geometry), gestion: 'dvp', consorcio_numero: null, zona: 'ZIII',
  propiedades: propiedadesDe({ ...muestras[2] }), geometria: geomNueva,
})
const ap = aplicarCambios('cc', cc, [alta, baja, edicion, base({ id: 'otro', red: 'rp' })])
ok('alta + baja + edición dejan la misma cantidad de tramos', contar(ap.red), contar(cc))
ok('el alta aparece en su capa', ap.red.ZII!.features.length, cc.ZII!.features.length)  // +1 alta −1 baja
ok('la baja ya no está', !ap.red.ZII!.features.includes(f0))
ok('la edición salió de su capa', ap.red.ZIII!.features.length, cc.ZIII!.features.length - 1)
ok('y entró en la capa nueva, que antes no existía', ap.red.ZIII_DVP?.features.length, 1)
ok('el archivo original no se tocó', cc.ZII!.features[47] === f0 && cc.ZIII!.features.length === 3295)
ok('las capas sin cambios siguen siendo las mismas', ap.red.ZV === cc.ZV)
ok('un cambio de la otra red se ignora', ap.huerfanos.length, 0)
const nuevo = ap.red.ZII!.features.find(f => ap.origen.get(f)?.tipo === 'cambio')
ok('el tramo agregado sabe de qué cambio sale',
  nuevo && ap.origen.get(nuevo)?.tipo === 'cambio' && (ap.origen.get(nuevo) as { cambio: Cambio }).cambio.id, 'alta')

// El archivo se regenera desde QGIS y los tramos cambian de lugar
const regenerado: Red = { ...cc, ZII: { ...cc.ZII!, features: [cc.ZII!.features[100], ...cc.ZII!.features.filter((_, i) => i !== 100)] } }
ok('si el tramo se movió de lugar se lo encuentra por la huella', ubicarBase(regenerado, baja), 48)
const sinElTramo: Red = { ...cc, ZII: { ...cc.ZII!, features: cc.ZII!.features.filter((_, i) => i !== 47) } }
const h = aplicarCambios('cc', sinElTramo, [baja])
ok('si ya no está, el cambio queda huérfano y no se aplica', [h.huerfanos.length, contar(h.red)], [1, contar(sinElTramo)])

const apRp = aplicarCambios('rp', rp, [])
ok('las rutas provinciales también', contar(apRp.red), contar(rp))

// ── Validación ──────────────────────────────────────────────────────────────
titulo('Validación')

ok('una línea de dos puntos en el Chaco pasa', validarGeometria({ type: 'LineString', coordinates: [[-60.5, -26.5], [-60.4, -26.5]] }).ok)
ok('un punto suelto no', validarGeometria({ type: 'LineString', coordinates: [[-60.5, -26.5]] }).ok, false)
ok('un polígono no', validarGeometria({ type: 'Polygon', coordinates: [] }).ok, false)
ok('latitud y longitud cruzadas caen fuera del Chaco', validarGeometria({ type: 'LineString', coordinates: [[-26.5, -60.5], [-26.4, -60.5]] }).ok, false)
ok('dos puntos iguales no tienen largo', validarGeometria({ type: 'LineString', coordinates: [[-60.5, -26.5], [-60.5, -26.5]] }).ok, false)
ok('un texto en una coordenada no', validarGeometria({ type: 'LineString', coordinates: [['a', 1], [2, 3]] }).ok, false)

const vt = (x: Record<string, unknown>, red: 'cc' | 'rp' = 'cc') => validarTramo(x, red)
ok('un tramo completo pasa', vt({ gestion: 'consorcio', consorcio: '7', jerarquia: 'TERCIARIA', material: 'TIERRA', tramo: '047' }).ok)
ok('el número de tramo pierde los ceros', (vt({ gestion: 'consorcio', consorcio: 7, jerarquia: 'TERCIARIA', tramo: '047' }) as { datos: Tramo }).datos.tramo, '47')
ok('sin consorcio no pasa', vt({ gestion: 'consorcio', jerarquia: 'TERCIARIA' }).ok, false)
ok('de consorcio y sin jerarquía no pasa: no se sabría en qué red contarlo', vt({ gestion: 'consorcio', consorcio: 7 }).ok, false)
ok('de gestión DVP y sin jerarquía sí', vt({ gestion: 'dvp' }).ok)
ok('una calzada inventada no', vt({ gestion: 'dvp', material: 'ADOQUÍN' }).ok, false)
ok('un campo que no está en la lista se descarta',
  'numero' in ((vt({ gestion: 'dvp', numero: 99, CC: 'X' }) as { datos: object }).datos), false)
ok('una ruta sin número no pasa', vt({ gestion: 'dvp', jerarquia: 'PRIMARIA' }, 'rp').ok, false)
ok('una ruta terciaria no pasa', vt({ gestion: 'dvp', jerarquia: 'TERCIARIA', ruta: '5' }, 'rp').ok, false)
ok('el número de tramo sólo números', vt({ gestion: 'dvp', tramo: '12a' }).ok, false)

// ── Exportación ─────────────────────────────────────────────────────────────
titulo('Exportación')

const gj = cambiosGeoJSON([alta, baja])
ok('un tramo por cambio', gj.features.length, 2)
ok('con los atributos del archivo y qué se le hizo',
  [(gj.features[1].properties as Record<string, unknown>).Nc, gj.features[1].properties.sv_operacion], [f0.properties!.Nc, 'baja'])

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien')
process.exit(fallos ? 1 : 0)
