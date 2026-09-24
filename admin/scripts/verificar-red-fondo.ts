/**
 * Verifica la capa de red vial de fondo de las calculadoras.
 *
 * Lo que tiene que dar: la distancia a un segmento es la perpendicular cuando el
 * pie cae adentro y la del extremo cuando cae afuera; el índice espacial
 * devuelve lo mismo que revisar todos los segmentos uno por uno; y parado sobre
 * un camino conocido contesta ese camino.
 *
 *   cd admin && npx tsx scripts/verificar-red-fondo.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  RedFondo, distanciaAlSegmentoKm, CELDA_GRADOS,
} from '../src/lib/redFondo'

let fallos = 0
const ok = (etiqueta: string, real: unknown, esperado: unknown) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado)
  if (!bien) fallos++
  console.log(`  ${bien ? 'ok  ' : 'FALLA'} ${etiqueta.padEnd(56)} ${JSON.stringify(real)}`
    + (bien ? '' : `  esperado ${JSON.stringify(esperado)}`))
}
const cerca = (etiqueta: string, real: number, esperado: number, tol: number) => {
  const bien = Math.abs(real - esperado) <= tol
  if (!bien) fallos++
  console.log(`  ${bien ? 'ok  ' : 'FALLA'} ${etiqueta.padEnd(56)} ${Math.round(real * 1000) / 1000}`
    + (bien ? '' : `  esperado ≈${esperado} ±${tol}`))
}

console.log('\n— Distancia punto-segmento —')
// Un segmento de un grado de longitud sobre el paralelo −27
const A = { lat: -27, lng: -60 }
const B = { lat: -27, lng: -59 }
const d = (lat: number, lng: number) =>
  distanciaAlSegmentoKm({ lat, lng }, A.lat, A.lng, B.lat, B.lng)

cerca('sobre el segmento da cero', d(-27, -59.5), 0, 1e-6)
cerca('en un extremo da cero', d(-27, -60), 0, 1e-6)
// Un centésimo de grado de latitud son 1,1132 km, y el pie cae adentro
cerca('perpendicular con el pie adentro', d(-26.99, -59.5), 1.1132, 0.01)
// Pasado el extremo manda la distancia al extremo, no a la recta
cerca('pasado el extremo manda el extremo', d(-27, -60.1), 9.91, 0.1)
ok('y eso es mayor que la perpendicular a la recta', d(-27, -60.1) > 0, true)
cerca('segmento degenerado se comporta como punto',
  distanciaAlSegmentoKm({ lat: -27, lng: -60.1 }, -27, -60, -27, -60), 9.91, 0.1)
// Simétrico arriba y abajo
cerca('es simétrico', d(-26.99, -59.5) - d(-27.01, -59.5), 0, 0.01)

console.log('\n— El índice contra la fuerza bruta —')
const t0 = Date.now()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const red = new RedFondo(JSON.parse(
  readFileSync(join(__dirname, '../public/geo/geo_cc.json'), 'utf-8'),
) as Record<string, any>)
console.log(`       ${red.tramos.length.toLocaleString('es-AR')} tramos indexados en ${Date.now() - t0} ms`)
ok('hay tramos', red.tramos.length > 9000, true)
ok('los tramos sin consorcio quedan con cc null y no en NaN',
  red.tramos.every(t => t.info.cc === null || Number.isFinite(t.info.cc)), true)
ok('ninguna zona menciona el organismo',
  red.tramos.every(t => !/DVP/i.test(t.info.zona)), true)
ok('ninguna zona repite la Z ("Zona ZIII")',
  red.tramos.every(t => !/Zona Z/i.test(t.info.zona)), true)

console.log('\n— Designación: el 94 % de la red no va sobre una ruta —')
// El fallo que motivó esto: se leía sólo `Nm`, que traen 624 tramos, y los
// 9.148 que llevan el número en `T` salían todos como "sin designación".
const sinDesignar = red.tramos.filter(t => t.info.designacion === 'sin designación')
console.log(`       ${sinDesignar.length} tramos sin designación de ${red.tramos.length.toLocaleString('es-AR')}`)
ok('casi ningún tramo queda sin designación', sinDesignar.length < 30, true)

const porTipo = { rp: 0, tramo: 0, otro: 0 }
for (const t of red.tramos) {
  if (/^RP N° /.test(t.info.designacion)) porTipo.rp++
  else if (/^Tramo N° /.test(t.info.designacion)) porTipo.tramo++
  else porTipo.otro++
}
console.log(`       RP: ${porTipo.rp}  ·  Tramo: ${porTipo.tramo.toLocaleString('es-AR')}  ·  otros: ${porTipo.otro}`)
ok('hay rutas provinciales', porTipo.rp > 600, true)
ok('y muchísimos más tramos de consorcio', porTipo.tramo > 9000, true)
// 50 sin código: 24 que el bundle no trae, más los 26 que se descartan porque
// el código nombraba al organismo.
ok('los tramos sin código son los pocos conocidos',
  red.tramos.filter(t => !t.info.codigo).length, 50)
ok('los que perdieron el código quedan como red primaria',
  red.tramos.filter(t => !t.info.codigo && t.info.zona === 'Red primaria')
    .every(t => t.info.designacion === 'Red primaria'), true)
ok('ninguna designación filtra el organismo',
  red.tramos.every(t => !/DVP/i.test(t.info.designacion) && !/DVP/i.test(t.info.codigo)), true)

console.log('\n— Los campos cargados a mano vienen con erratas —')
// J trae PRIMRARIA, TIERCIARIA, SECUNDARI, SECUNDRAR, y 26 filas con un
// material o una letra suelta en el campo de jurisdicción.
const juris = new Set(red.tramos.map(t => t.info.jurisdiccion))
ok('la jurisdicción queda en tres valores más el vacío',
  [...juris].sort(), ['', 'PRIMARIA', 'SECUNDARIA', 'TERCIARIA'])
const mat = new Set(red.tramos.map(t => t.info.material))
ok('el material no deja entrar una jurisdicción',
  [...mat].every(m => !/PROVINCIAL|TERCIARIA/.test(m)), true)
console.log(`       materiales: ${[...mat].filter(Boolean).sort().join(', ')}`)

/** La respuesta correcta, revisando todos los segmentos de todos los tramos */
function fuerzaBruta(p: { lat: number; lng: number }, tolKm: number) {
  let mejor: { ruta: string; cc: number | null; km: number } | null = null
  for (const t of red.tramos) {
    for (let i = 0; i + 1 < t.puntos.length; i++) {
      const dd = distanciaAlSegmentoKm(
        p, t.puntos[i][0], t.puntos[i][1], t.puntos[i + 1][0], t.puntos[i + 1][1],
      )
      if (dd < tolKm && (mejor === null || dd < mejor.km)) {
        mejor = { ruta: t.info.designacion, cc: t.info.cc, km: dd }
      }
    }
  }
  return mejor
}

// Una tanda de puntos repartidos por la provincia, algunos sobre caminos y
// otros en el medio del campo. La tolerancia es la de un zoom medio.
const TOL = 1.5
const puntos = [
  { lat: -27.4511, lng: -58.9865 },  // Resistencia
  { lat: -26.7852, lng: -60.4386 },  // Sáenz Peña
  { lat: -27.1345, lng: -59.7065 },  // sobre un tramo del CC 005
  { lat: -25.3000, lng: -61.5000 },  // noroeste, red rala
  { lat: -26.0000, lng: -59.0000 },  // noreste
  { lat: -24.5000, lng: -61.9000 },  // El Impenetrable
  { lat: -27.8000, lng: -59.3000 },  // sur
  { lat: -26.5000, lng: -60.0000 },
  { lat: -27.0000, lng: -61.0000 },
  { lat: -25.8000, lng: -60.2000 },
]

let iguales = 0
let msIndice = 0
for (const p of puntos) {
  const t1 = Date.now()
  const conIndice = red.tramoEn(p, TOL)
  msIndice += Date.now() - t1
  const bruta = fuerzaBruta(p, TOL)

  const a = conIndice ? `${conIndice.designacion}|${conIndice.cc}` : 'nada'
  const b = bruta ? `${bruta.ruta}|${bruta.cc}` : 'nada'
  if (a === b) iguales++
  else console.log(`       difiere en ${p.lat},${p.lng}: índice ${a} / bruta ${b}`)
}
ok('el índice coincide con la fuerza bruta en los 10 puntos', iguales, puntos.length)
console.log(`       ${msIndice} ms las 10 consultas con índice`)
ok('una consulta tarda menos de 5 ms', msIndice / puntos.length < 5, true)

console.log('\n— Parado sobre un camino conocido —')
// El primer vértice del primer tramo: el hit-test tiene que devolverlo
const primero = red.tramos[0]
const enc = red.tramoEn({ lat: primero.puntos[0][0], lng: primero.puntos[0][1] }, TOL)
ok('devuelve algo', enc !== null, true)
cerca('y a distancia cero', enc!.km, 0, 0.01)
ok('con los datos del tramo', enc?.cc, primero.info.cc)

console.log('\n— Nada cerca, nada se inventa —')
// Bien afuera de la provincia, en el Atlántico
ok('lejos de todo devuelve null', red.tramoEn({ lat: -38, lng: -55 }, TOL), null)
// Con tolerancia cero tampoco puede inventar
ok('con tolerancia cero devuelve null',
  red.tramoEn({ lat: -26.5, lng: -60 }, 0), null)

console.log('\n— La celda del índice es coherente con la tolerancia —')
// La celda tiene que ser más grande que la tolerancia típica, o mirar las ocho
// vecinas no alcanzaría para encontrar todo lo que está dentro del radio.
const celdaKm = CELDA_GRADOS * 111.32 * Math.cos((26.5 * Math.PI) / 180)
cerca('la celda mide unos 5 km', celdaKm, 5, 0.6)
ok('y es más grande que la tolerancia de trabajo', celdaKm > TOL, true)

console.log(fallos ? `\n✗ ${fallos} falla(s).\n` : '\n✓ Todo bien.\n')
process.exit(fallos ? 1 : 0)
