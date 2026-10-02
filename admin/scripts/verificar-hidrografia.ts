/**
 * Verifica la capa de cursos de agua y canales, y los cruces con la red vial.
 *
 * Tres partes. La primera afirma que **el archivo generado es el que dice
 * ser**: lo que trae el origen, con la Ñ repuesta, sin perder traza al
 * simplificar. La segunda prueba la geometría de los cruces con casos donde la
 * respuesta se sabe sin calcular. La tercera corre sobre la red real.
 *
 * **No hay un inventario de obras de arte contra el cual comparar los cruces**,
 * que es justamente lo que falta en la provincia. Lo que se afirma es que cada
 * cruce está donde dice —sobre su camino y sobre su curso— y que la grilla no
 * se come ninguno.
 *
 *   npx tsx scripts/verificar-hidrografia.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsearCuencas } from '../src/lib/cuencas'
import {
  ANGULO_MINIMO, CATEGORIAS, SEPARACION_KM, TOLERANCIA_OBRA_KM,
  categoriaDe, crucesConRed, crucesDe, csvCruces, distKm, hidroPorCuenca, interseccion,
  obrasSobreCruces, parsearHidrografia, rotuloCurso, type CursoAgua,
} from '../src/lib/hidrografia'
import { distanciaAlSegmentoKm } from '../src/lib/redFondo'
import { extraerTramos, type TramoRed } from '../src/lib/redLluvia'

let fallos = 0
const fmt = (v: unknown) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : JSON.stringify(v)

function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(64)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}
const cerca = (que: string, valor: number, esperado: number, tol: number) => {
  const bien = Math.abs(valor - esperado) <= tol
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(64)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)} ± ${tol})`))
}
const info = (s: string) => console.log(`       ${s}`)
const titulo = (s: string) => console.log(`\n— ${s} —`)

const GEO = join(__dirname, '..', 'public', 'geo')
const ORIGEN = join(__dirname, '..', '..', 'docs', 'geo', 'hidrografia')
const crudo = readFileSync(join(GEO, 'geo_hidro.json'), 'utf8')
const todo = parsearHidrografia(JSON.parse(crudo))
const cursos = todo.filter(c => c.clase === 'curso')
const canales = todo.filter(c => c.clase === 'canal')
const km = (cs: CursoAgua[]) => cs.reduce((s, c) => s + c.km, 0)

// ── El archivo ──────────────────────────────────────────────────────────────
titulo('Los cursos del IGN')

ok('son los 1.137 del origen', cursos.length, 1137)
ok('la Ñ que se perdió al exportar está repuesta', !crudo.includes('�'))
ok('hay 23 cañadas y un cañadón', cursos.filter(c => c.tipo === 'Cañada').length === 23
  && cursos.filter(c => c.tipo === 'Cañadón').length === 1)
ok('los tipos son los siete de la carta',
  [...new Set(cursos.map(c => c.tipo))].sort().join(','),
  'Arroyo,Canal de riego,Cañada,Cañadón,Riacho,Río,Zanjón')
ok('todos dicen si son permanentes', cursos.every(c => typeof c.permanente === 'boolean'))
ok('ningún nombre quedó en mayúsculas', cursos.every(c => c.nombre === null || c.nombre !== c.nombre.toUpperCase()))
ok('«SIN NOMBRE» es un nombre nulo, no un nombre', cursos.every(c => !/sin nombre/i.test(c.nombre ?? '')))
ok('el nombre va detrás del tipo: Río de Oro', cursos.some(c => rotuloCurso(c) === 'Río de Oro'))
ok('y con su tilde: Arroyo Guaycurú', cursos.some(c => rotuloCurso(c) === 'Arroyo Guaycurú'))
ok('un curso sin nombre se rotula con su tipo', cursos.some(c => rotuloCurso(c) === 'Arroyo sin nombre'))

/*
 * La traza se simplificó a 10 m. Eso saca vértices, y al sacar vértices la
 * línea se acorta: tiene que ser muy poco, o se está perdiendo forma.
 */
const kml = readFileSync(join(ORIGEN, 'rios_ign.kml'), 'utf8')
let kmOrigen = 0, vertOrigen = 0
for (const m of kml.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g)) {
  const l = m[1].trim().split(/\s+/).map(t => { const [x, y] = t.split(',').map(Number); return [y, x] as [number, number] })
  vertOrigen += l.length
  for (let i = 1; i < l.length; i++) kmOrigen += distKm(l[i - 1], l[i])
}
const vert = cursos.reduce((s, c) => s + c.lineas.reduce((t, l) => t + l.length, 0), 0)
info(`${km(cursos).toFixed(0)} km en ${vert} vértices; el origen tiene ${kmOrigen.toFixed(0)} km en ${vertOrigen}`)
ok('simplificar la traza le saca menos del 0,5 % del largo', (kmOrigen - km(cursos)) / kmOrigen < 0.005)
ok('y nunca la alarga', km(cursos) <= kmOrigen)
ok('todo cae en el Chaco o en su borde', todo.every(c => c.lineas.every(l => l.every(
  ([lat, lng]) => lat > -28.4 && lat < -24.0 && lng > -63.5 && lng < -58.3))))

titulo('Los canales')

ok('son 110', canales.length, 110)
ok('de seis sistemas',
  [...new Set(canales.map(c => c.sistema))].sort().join(' · '),
  'Bajos de Chorotis · Línea Paraná · Módulo I · Módulo II · Módulo III · Río Muerto')
const troncal = canales.filter(c => c.sistema === 'Línea Paraná')
ok('el troncal de la Línea Paraná son nueve tramos', troncal.length, 9)
cerca('y mide unos 410 km', km(troncal), 410, 3)
ok('todos principales', troncal.every(c => c.tipo === 'Principal'))
ok('no quedó ningún resto de largo cero', canales.every(c => c.km > 0.05))
ok('un canal no dice si es permanente: el origen no lo trae', canales.every(c => c.permanente === null))
ok('están todos en el sudoeste', canales.every(c => c.lineas.every(l => l.every(
  ([lat, lng]) => lat < -27.0 && lng < -59.2))))
ok('el rótulo dice que es un canal y de qué sistema',
  canales.some(c => rotuloCurso(c) === 'Canal Viglia · Bajos de Chorotis')
  && canales.some(c => rotuloCurso(c) === 'Canal 6 · Módulo I'))
ok('el río Muerto canalizado es del troncal', canales.some(c => rotuloCurso(c) === 'Canal Río Muerto · Línea Paraná'))

/*
 * El datum. El troncal viene en Campo Inchauspe y los secundarios en POSGAR:
 * son 220 m de diferencia, y los secundarios desaguan en el troncal. Si el
 * corrimiento estuviera mal aplicado —o sin aplicar— las puntas de los
 * secundarios quedarían a 220 m del canal al que llegan.
 */
const lejos = (p: [number, number], cs: CursoAgua[]) => {
  let d = Infinity
  for (const c of cs) for (const l of c.lineas) for (let i = 1; i < l.length; i++) {
    d = Math.min(d, distanciaAlSegmentoKm({ lat: p[0], lng: p[1] }, l[i - 1][0], l[i - 1][1], l[i][0], l[i][1]))
  }
  return d
}
const puntas = canales.filter(c => c.sistema !== 'Línea Paraná')
  .flatMap(c => c.lineas.flatMap(l => [l[0], l[l.length - 1]]))
const aTroncal = puntas.map(p => lejos(p, troncal)).filter(d => d < 0.4).sort((a, b) => a - b)
info(`${aTroncal.length} puntas de canal a menos de 400 m del troncal; la mediana, a ${(aTroncal[aTroncal.length >> 1] * 1000).toFixed(0)} m`)
ok('los secundarios llegan al troncal: los dos datums cierran', aTroncal.length >= 15
  && aTroncal[aTroncal.length >> 1] < 0.06)

// ── La geometría de un cruce ────────────────────────────────────────────────
titulo('Dónde se cortan dos segmentos')

const x90 = interseccion([-27, -60.01], [-27, -59.99], [-27.01, -60], [-26.99, -60])!
cerca('en cruz, se cortan en el medio: latitud', x90.lat, -27, 1e-9)
cerca('longitud', x90.lng, -60, 1e-9)
cerca('y a 90 grados', x90.angulo, 90, 0.01)

// A 27° de latitud un grado de longitud mide menos: la diagonal se arma en km
const f27 = Math.cos(27 * Math.PI / 180)
const x45 = interseccion([-27, -60.01], [-27, -59.99], [-27.005, -60 - 0.005 / f27], [-26.995, -60 + 0.005 / f27])!
cerca('una diagonal medida en el terreno corta a 45', x45.angulo, 45, 0.1)
ok('dos paralelos no se cortan', interseccion([-27, -60.01], [-27, -59.99], [-27.001, -60.01], [-27.001, -59.99]), null)
ok('dos que no llegan a tocarse, tampoco', interseccion([-27, -60.01], [-27, -60.005], [-27.01, -60], [-26.99, -60]), null)
ok('terminar justo sobre el curso cuenta', interseccion([-27, -60.01], [-27, -60], [-27.01, -60], [-26.99, -60]) !== null)

titulo('Qué es un cruce y qué no')

const tramoDe = (puntos: [number, number][]): TramoRed =>
  ({ cc: 1, ruta: '', jurisdiccion: '', material: 'TIERRA', km: 1, puntos, muestras: [] })
const cursoDe = (lineas: [number, number][][], clase: 'curso' | 'canal' = 'curso'): CursoAgua =>
  ({ clase, tipo: clase === 'curso' ? 'Arroyo' : 'Secundario', nombre: null,
    permanente: clase === 'curso' ? true : null, sistema: null, lineas, km: 1 })

const camino = tramoDe([[-27, -60.1], [-27, -60.05], [-27, -60], [-27, -59.95], [-27, -59.9]])
ok('un camino que corta un arroyo: un cruce',
  crucesConRed([camino], [cursoDe([[[-27.05, -60.02], [-26.95, -60.02]]])]).length, 1)

/*
 * Un canal al costado del camino, dibujado aparte: las dos líneas se pisan una
 * y otra vez por el ruido del trazado. No es un cruce.
 */
const alCostado: [number, number][] = Array.from({ length: 41 }, (_, i) =>
  [-27 + (i % 2 ? 0.0003 : -0.0003), -60.1 + i * 0.005])
ok('un canal que corre al costado no cruza nada', crucesConRed([camino], [cursoDe([alCostado], 'canal')]).length, 0)
info(`las dos líneas se pisan 40 veces, a menos de ${ANGULO_MINIMO}°`)

/* Un arroyo con meandros corta tres veces la misma recta en 200 m: un puente. */
const meandro: [number, number][] = [[-27.01, -60.020], [-26.99, -60.0195], [-27.01, -60.019], [-26.99, -60.0185]]
ok('tres cortes en 150 m son un solo cruce', crucesConRed([camino], [cursoDe([meandro])]).length, 1)
ok(`y dos a más de ${SEPARACION_KM * 1000} m son dos`,
  crucesConRed([camino], [cursoDe([[[-27.05, -60.08], [-26.95, -60.08]], [[-27.05, -59.93], [-26.95, -59.93]]])]).length, 2)
ok('dos cursos distintos en el mismo lugar son dos cruces',
  crucesConRed([camino], [cursoDe([[[-27.05, -60.02], [-26.95, -60.02]]]),
    cursoDe([[[-27.05, -60.0201], [-26.95, -60.0201]]], 'canal')]).length, 2)
/* La traza simplificada tiene segmentos de kilómetros: tienen que estar en todas sus celdas. */
ok('un curso de 60 km de un solo segmento se encuentra en el medio',
  crucesConRed([camino], [cursoDe([[[-27.3, -60.02], [-26.7, -60.02]]])]).length, 1)

// ── La red real ─────────────────────────────────────────────────────────────
titulo('Los cruces de la red de consorcios')

const tramos = extraerTramos(JSON.parse(readFileSync(join(GEO, 'geo_cc.json'), 'utf8')))
const t0 = performance.now()
const cruces = crucesDe(tramos, todo)
const ms = performance.now() - t0
const porCat = CATEGORIAS.map(k => cruces.filter(x => categoriaDe(todo[x.curso]) === k).length)
info(`${tramos.length} tramos × ${todo.length} cursos y canales: ${cruces.length} cruces en ${ms.toFixed(0)} ms`)
info(`sobre cursos permanentes ${porCat[0]} · no permanentes ${porCat[1]} · canales ${porCat[2]}`)

ok('hay cruces de las tres clases', porCat.every(n => n > 0))
ok('pedirlos de nuevo devuelve el mismo cálculo, no otro', crucesDe(tramos, todo) === cruces)
ok('ninguno a menos del ángulo mínimo', cruces.every(x => x.angulo >= ANGULO_MINIMO && x.angulo <= 90))

/* Cada cruce tiene que estar sobre su camino y sobre su curso. */
const sobre = (p: { lat: number; lng: number }, l: [number, number][]) => {
  let d = Infinity
  for (let i = 1; i < l.length; i++) d = Math.min(d, distanciaAlSegmentoKm(p, l[i - 1][0], l[i - 1][1], l[i][0], l[i][1]))
  return d
}
let peorCamino = 0, peorCurso = 0
for (const x of cruces) {
  peorCamino = Math.max(peorCamino, sobre(x, tramos[x.tramo].puntos))
  peorCurso = Math.max(peorCurso, Math.min(...todo[x.curso].lineas.map(l => sobre(x, l))))
}
ok('todos están sobre su camino, a menos de 2 m', peorCamino < 0.002)
ok('y sobre su curso', peorCurso < 0.002)

/*
 * La grilla contra fuerza bruta, sobre uno de cada veinte tramos: los mismos
 * cruces. Si un segmento largo quedara fuera de alguna de sus celdas, acá falta.
 */
const muestra = tramos.filter((_, i) => i % 20 === 0)
const conGrilla = crucesConRed(muestra, todo).length
let bruta = 0
for (const t of muestra) {
  const vistos = new Map<number, [number, number][]>()
  for (let i = 1; i < t.puntos.length; i++) {
    todo.forEach((c, ci) => {
      for (const l of c.lineas) for (let j = 1; j < l.length; j++) {
        const x = interseccion(t.puntos[i - 1], t.puntos[i], l[j - 1], l[j])
        if (!x || x.angulo < ANGULO_MINIMO) continue
        const previos = vistos.get(ci) ?? []
        if (previos.some(p => distKm(p, [x.lat, x.lng]) < SEPARACION_KM)) continue
        previos.push([x.lat, x.lng]); vistos.set(ci, previos); bruta++
      }
    })
  }
}
ok(`grilla y fuerza bruta dan lo mismo en ${muestra.length} tramos`, conGrilla, bruta)

// ── Por cuenca ──────────────────────────────────────────────────────────────
titulo('Repartido por cuenca')

const cuencas = parsearCuencas(JSON.parse(readFileSync(join(GEO, 'geo_cuencas.json'), 'utf8')))
const filas = hidroPorCuenca(cuencas, todo, cruces, null)
for (const f of filas) {
  info(`${String(f.cod || '').padStart(2)} ${f.nombre.padEnd(36)} ${f.km.map(v => v.toFixed(0).padStart(5)).join(' ')} km`
    + ` · ${f.densidad === null ? '  —  ' : f.densidad.toFixed(3)} km/km² · cruces ${f.cruces.join(' / ')}`)
}
ok('trece cuencas y la fila de lo que cae afuera', filas.length, 14)
cerca('los km repartidos suman el total', filas.reduce((s, f) => s + f.km.reduce((a, b) => a + b, 0), 0), km(todo), 1)
ok('los cruces repartidos suman el total', filas.reduce((s, f) => s + f.lista.length, 0), cruces.length)
ok('y por clase también', CATEGORIAS.every((_, i) => filas.reduce((s, f) => s + f.cruces[i], 0) === porCat[i]))

const afuera = filas[filas.length - 1]
ok('fuera de las cuencas quedan los ríos limítrofes: cientos de km', afuera.cod === 0 && afuera.km[0] > 500)
ok('que no tienen densidad, porque no tienen superficie', afuera.densidad, null)
/*
 * El troncal de la Línea Paraná sale de la provincia por el sur: una parte de
 * los canales cae fuera de las cuencas, y no es un error del reparto.
 */
ok('los canales están en tres cuencas del sudoeste, y el troncal sigue fuera de la provincia',
  filas.filter(f => f.km[2] > 1).map(f => f.cod).join(','), '9,10,11,0')
ok('la densidad de drenaje es del orden de la carta: menos de 1 km/km²',
  filas.slice(0, 13).every(f => f.densidad !== null && f.densidad >= 0 && f.densidad < 1))
ok('sin obras relevadas, ningún cruce tiene obra', filas.every(f => f.conObra === 0 && f.lista.every(x => !x.conObra)))

/* Una obra parada sobre un cruce, otra a 300 m, otra a 2 km. */
const c0 = cruces[0]
const gradosKm = 1 / 111.32
const obras = [
  { lat: c0.lat, lng: c0.lng },
  { lat: cruces[1].lat + 0.3 * gradosKm, lng: cruces[1].lng },
  { lat: -24.5, lng: -62.9 },
]
const conObras = hidroPorCuenca(cuencas, todo, cruces, obras)
ok(`una obra a menos de ${TOLERANCIA_OBRA_KM * 1000} m marca su cruce`,
  conObras.flatMap(f => f.lista).some(x => x.lat === c0.lat && x.lng === c0.lng && x.conObra))
ok('la cuenta de cada cuenca es la de su lista',
  conObras.every(f => f.conObra === f.lista.filter(x => x.conObra).length))
ok('dos de las tres obras están sobre un cruce', obrasSobreCruces(cruces, obras), 2)

const csv = csvCruces(conObras, todo, tramos).split('\r\n')
ok('el CSV trae una línea por cruce, más el encabezado', csv.length, cruces.length + 4)
ok('con coma decimal en las coordenadas', /;-\d+,\d{5};-\d+,\d{5};/.test(csv[4]))

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
