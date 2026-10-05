/**
 * Verifica lo de los ríos internos: el catálogo de estaciones contra las
 * cuencas, y el armado de la serie y su resumen.
 *
 * No sale a la red. Lo que puede romperse del lado del INA —que una estación
 * deje de publicar, que cambie un id— no es algo que deba frenar un commit; la
 * pantalla lo muestra como estación sin respuesta o atrasada.
 *
 * Lo que sí se afirma es lo que este sistema declara por su cuenta: que cada
 * escala está en la cuenca con cuya lluvia se la compara. Las coordenadas son
 * las que publica el INA y los polígonos son los de `geo_cuencas.json`, dos
 * datos que no se conocen entre sí.
 *
 *   npx tsx scripts/verificar-rios-internos.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cuencaEn, parsearCuencas } from '../src/lib/cuencas'
import {
  ESTACIONES_INTERNAS, serieDeAlturas, resumirAlturas, nombreDe, crecidasSinParte,
  DIAS_CAMBIO, DIAS_PARTE, SUBIDA_M,
} from '../src/lib/riosInternos'

let fallos = 0
const fmt = (v: unknown) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : JSON.stringify(v)

function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(62)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}
const info = (s: string) => console.log(`       ${s}`)
const titulo = (s: string) => console.log(`\n— ${s} —`)

// ── El catálogo ─────────────────────────────────────────────────────────────
titulo('Las estaciones')

const cuencas = parsearCuencas(JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'geo', 'geo_cuencas.json'), 'utf8')))
const nombreCuenca = (cod: number) => cuencas.find(c => c.cod === cod)?.nombre ?? '—'

ok('son siete', ESTACIONES_INTERNAS.length, 7)
ok('sin estaciones repetidas', new Set(ESTACIONES_INTERNAS.map(e => e.id)).size, ESTACIONES_INTERNAS.length)
ok('ni series repetidas', new Set(ESTACIONES_INTERNAS.map(e => e.serie)).size, ESTACIONES_INTERNAS.length)
ok('todas apuntan a una cuenca que existe', ESTACIONES_INTERNAS.every(e => cuencas.some(c => c.cod === e.cuenca)))

for (const e of ESTACIONES_INTERNAS) {
  const c = cuencaEn(cuencas, e.lat, e.lng)
  info(`${nombreDe(e).padEnd(38)} ${e.lat.toFixed(3)}, ${e.lng.toFixed(3)}  →  `
    + `${c ? `${c.cod} ${c.nombre}` : 'fuera de las cuencas'}${e.aLaSalida ? '  (declarada a la salida)' : ''}`)
}

const adentro = ESTACIONES_INTERNAS.filter(e => !e.aLaSalida)
ok('las que no son de salida caen en la cuenca que declaran',
  adentro.every(e => cuencaEn(cuencas, e.lat, e.lng)?.cod === e.cuenca))

/*
 * Las de salida están sobre el límite sur o ya en Santa Fe, y por eso no caen
 * en ningún polígono. Si alguna cayera adentro, la marca estaría de más.
 */
const salida = ESTACIONES_INTERNAS.filter(e => e.aLaSalida)
ok('las de salida están de verdad fuera de los polígonos',
  salida.every(e => cuencaEn(cuencas, e.lat, e.lng) === null))
ok('y son del canal Línea Paraná, en su cuenca',
  salida.every(e => e.curso === 'Canal Línea Paraná' && nombreCuenca(e.cuenca) === 'Línea Paraná'))

/*
 * Como no caen en ningún polígono, la cuenca no se les puede asignar por
 * posición — y la de Los Amores, subiendo derecho al norte, entra a La Rica -
 * Sábalo y no a Línea Paraná. Se asignan **por el canal que miden**, y eso se
 * comprueba contra la traza de los canales, que viene de otro origen (los
 * shapefiles de `docs/geo/hidrografia/canales/`): cada una tiene que estar a
 * menos de un kilómetro de un canal principal del sistema Línea Paraná.
 */
interface FeatureHidro {
  properties: { clase: string; tipo?: string; nombre?: string; sistema?: string }
  geometry: { type: string; coordinates: number[][] | number[][][] }
}
const hidro: { features: FeatureHidro[] } = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'geo', 'geo_hidro.json'), 'utf8'))
const troncales = hidro.features.filter(f => f.properties.clase === 'canal'
  && f.properties.sistema === 'Línea Paraná' && f.properties.tipo === 'Principal')
ok('la traza de los canales tiene los principales de Línea Paraná', troncales.length > 0)

function kmAlCanal(lat: number, lng: number): { km: number; nombre: string } {
  const porGrado = 111.2 * Math.cos(lat * Math.PI / 180)
  let mejor = { km: Infinity, nombre: '' }
  for (const f of troncales) {
    const lineas = (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][]
    for (const l of lineas) for (const [x, y] of l) {
      const km = Math.hypot((x - lng) * porGrado, (y - lat) * 111.2)
      if (km < mejor.km) mejor = { km, nombre: f.properties.nombre ?? '' }
    }
  }
  return mejor
}
for (const e of salida) {
  const c = kmAlCanal(e.lat, e.lng)
  let km = 0, alNorte = null
  for (; km <= 40 && !alNorte; km += 1) alNorte = cuencaEn(cuencas, e.lat + km / 111.2, e.lng)
  info(`${nombreDe(e)}: a ${c.km.toFixed(2)} km del canal «${c.nombre}»; `
    + `al norte se entra a «${alNorte?.nombre ?? '—'}» a ~${km - 1} km`)
  ok(`${e.lugar}: está sobre un canal principal de Línea Paraná`, c.km < 1)
}

// El Negro va de aguas arriba hacia abajo: hacia el sudeste
const negro = ESTACIONES_INTERNAS.filter(e => e.curso === 'Río Negro')
ok('las tres del Negro van en el orden en que corre el río',
  negro.length === 3 && negro.every((e, i) => i === 0 || (e.lng > negro[i - 1].lng && e.lat < negro[i - 1].lat)))

// ── La serie ────────────────────────────────────────────────────────────────
titulo('De lecturas sueltas a un día por posición')

const lecturas = [
  { fecha: '2026-09-01T03:00:00.000Z', m: 1.0 },
  { fecha: '2026-09-02T03:00:00.000Z', m: 1.2 },
  // el 3 no hay lectura
  { fecha: '2026-09-04T03:00:00.000Z', m: 3.1 },
  { fecha: '2026-09-08T03:00:00.000Z', m: 2.6 },
  { fecha: '2026-09-09T03:00:00.000Z', m: 2.4 },
]
const serie = serieDeAlturas(lecturas, '2026-08-30', '2026-09-10')

ok('un día por posición, con las dos puntas', serie.length, 12)
ok('empieza en la fecha pedida', serie[0].fecha, '2026-08-30')
ok('y termina en la pedida', serie[serie.length - 1].fecha, '2026-09-10')
ok('la lectura de las 03:00 UTC es del mismo día', serie.find(d => d.fecha === '2026-09-02')?.m, 1.2)
ok('un hueco queda en null, no se interpola', serie.find(d => d.fecha === '2026-09-03')?.m, null)
ok('antes de la primera lectura tampoco hay dato', serie[0].m, null)
ok('sin lecturas, todos los días van vacíos',
  serieDeAlturas([], '2026-09-01', '2026-09-03').every(d => d.m === null))

titulo('El resumen')

const r = resumirAlturas(serie, '2026-09-10')!
ok('la última lectura es la del 9', r.ultima.fecha === '2026-09-09' && r.ultima.m === 2.4)
ok('con un día de atraso', r.atraso, 1)
ok(`el cambio es contra ${DIAS_CAMBIO} días antes de la última lectura`, r.cambio, 1.2)
ok('la máxima, con su fecha', r.maxima.fecha === '2026-09-04' && r.maxima.m === 3.1)
ok('la mínima, con la suya', r.minima.fecha === '2026-09-01' && r.minima.m === 1.0)
ok('cinco días con lectura de doce', r.conDato === 5 && r.dias === 12)

/* Si el día de hace una semana no tiene lectura, no se toma la más cercana. */
const sinPrevia = resumirAlturas(serieDeAlturas(lecturas.slice(2), '2026-08-30', '2026-09-10'), '2026-09-10')!
ok('sin lectura siete días antes, no hay cambio', sinPrevia.cambio, null)

ok('una estación sin lecturas no tiene resumen', resumirAlturas(serieDeAlturas([], '2026-09-01', '2026-09-10'), '2026-09-10'), null)

/* Una altura negativa es agua bajo el cero de la escala: es un dato. */
const bajo = resumirAlturas(serieDeAlturas([
  { fecha: '2026-09-01T03:00:00.000Z', m: -0.27 },
  { fecha: '2026-09-02T03:00:00.000Z', m: 0 },
], '2026-09-01', '2026-09-02'), '2026-09-02')!
ok('una altura negativa se conserva', bajo.minima.m, -0.27)
ok('y un cero es una lectura, no un hueco', bajo.ultima.m === 0 && bajo.conDato === 2)

/* Con la máxima repetida se informa la más reciente. */
const meseta = resumirAlturas(serieDeAlturas([
  { fecha: '2026-09-01T03:00:00.000Z', m: 2 },
  { fecha: '2026-09-02T03:00:00.000Z', m: 2 },
  { fecha: '2026-09-03T03:00:00.000Z', m: 1 },
], '2026-09-01', '2026-09-03'), '2026-09-03')!
ok('con la máxima repetida, la más reciente', meseta.maxima.fecha, '2026-09-02')

// ── Crecidas sin parte ──────────────────────────────────────────────────────
titulo('Crecidas que ningún parte explica')

/*
 * Escalas de mentira sobre tres cursos. `sube(dia, m)` arma una serie quieta en
 * un metro que ese día empieza a subir `m` metros en dos días y se queda.
 */
const D0 = '2026-03-01', D1 = '2026-03-31'
const dia = (n: number) => new Date(Date.parse(D0) + n * 86_400_000).toISOString().slice(0, 10)
const sube = (cuando: number, m: number) => serieDeAlturas(
  Array.from({ length: 31 }, (_, t) => ({
    fecha: `${dia(t)}T03:00:00.000Z`,
    m: 1 + (t < cuando ? 0 : t === cuando ? m / 2 : m),
  })), D0, D1)
const escNegro = ESTACIONES_INTERNAS.find(e => e.lugar === 'Laguna Blanca')!
const escNegro2 = ESTACIONES_INTERNAS.find(e => e.lugar === 'San Fernando')!
const escTapenaga = ESTACIONES_INTERNAS.find(e => e.curso === 'Arroyo Tapenagá')!

const dosCursos = [{ e: escNegro, serie: sube(10, 3) }, { e: escTapenaga, serie: sube(10, 1.2) }]
const c1 = crecidasSinParte(dosCursos, [])
ok('dos cursos suben a la vez y no hay ningún parte: una crecida', c1.length, 1)
ok('que empieza el día en que empiezan a subir', c1[0]?.desde, dia(10))
ok('con las dos escalas, la que más subió primero',
  c1[0]?.escalas.map(x => x.id).join(','), `${escNegro.id},${escTapenaga.id}`)
ok('y cuánto subió cada una', c1[0]?.escalas[0].subida === 3 && c1[0]?.escalas[1].subida === 1.2)

ok('con un parte ese día, no se marca', crecidasSinParte(dosCursos, [dia(10), dia(11), dia(12)]).length, 0)
ok(`con un parte ${DIAS_PARTE} días antes, tampoco`, crecidasSinParte(dosCursos, [dia(10 - DIAS_PARTE)]).length, 0)
ok('con el parte un día más atrás, sí', crecidasSinParte(dosCursos, [dia(10 - DIAS_PARTE - 1)]).length, 1)
ok('un parte posterior a la crecida no la explica', crecidasSinParte(dosCursos, [dia(20)]).length, 1)

ok('dos escalas del mismo río no alcanzan',
  crecidasSinParte([{ e: escNegro, serie: sube(10, 3) }, { e: escNegro2, serie: sube(10, 2) }], []).length, 0)
ok('una sola escala tampoco: puede ser una compuerta',
  crecidasSinParte([{ e: escNegro, serie: sube(10, 3) }], []).length, 0)
ok(`una subida de menos de ${SUBIDA_M} m no cuenta`,
  crecidasSinParte([{ e: escNegro, serie: sube(10, 0.4) }, { e: escTapenaga, serie: sube(10, 0.4) }], []).length, 0)
ok('si suben con una semana de diferencia, no es la misma crecida',
  crecidasSinParte([{ e: escNegro, serie: sube(5, 3) }, { e: escTapenaga, serie: sube(15, 2) }], []).length, 0)
ok('sin series no hay nada que marcar', crecidasSinParte([], []).length, 0)

/* Un hueco en la lectura no inventa una subida ni la tapa. */
const conHueco = sube(10, 3).map((d, t) => (t === 9 ? { ...d, m: null } : d))
ok('con un hueco el día anterior, la subida se mide contra los otros dos',
  crecidasSinParte([{ e: escNegro, serie: conHueco }, { e: escTapenaga, serie: sube(10, 1.2) }], []).length, 1)

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
