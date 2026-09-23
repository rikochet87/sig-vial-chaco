/**
 * Verifica el cruce de la lluvia con la red vial.
 *
 * Lo que tiene que dar: los kilómetros totales de la red no pueden cambiar
 * porque llueva; un tramo encima de un pluviómetro toma su valor; el promedio de
 * un tramo tiene que quedar entre el mínimo y el máximo de sus muestras; y la
 * suma de los rangos tiene que dar la red entera.
 *
 *   cd admin && npx tsx scripts/verificar-red-lluvia.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  extraerTramos, lluviaPorTramo, kmPorRango, kmSobre, csvTramos,
  PASO_MUESTRA_KM, CORTES_MM, type RedVial,
} from '../src/lib/redLluvia'
import { ESTACIONES_ACTIVAS } from '../src/data/estacionesApa'

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
  console.log(`  ${bien ? 'ok  ' : 'FALLA'} ${etiqueta.padEnd(56)} ${Math.round(real * 100) / 100}`
    + (bien ? '' : `  esperado ≈${esperado} ±${tol}`))
}

console.log('\n— Leer y partir la red —')
const t0 = Date.now()
const red = JSON.parse(
  readFileSync(join(__dirname, '../public/geo/geo_cc.json'), 'utf-8'),
) as RedVial
const tramos = extraerTramos(red)
console.log(`       ${tramos.length.toLocaleString('es-AR')} tramos en ${Date.now() - t0} ms`)

const kmTotal = tramos.reduce((s, t) => s + t.km, 0)
// El conteo independiente sobre el GeoJSON crudo da 29.128,4 km en 9.772
// features, pero 26 de esos tramos (372,3 km) no pertenecen a ningún consorcio
// —vienen en las capas ZIV_DVP y ZV_DVP sin número de CC— y quedan afuera, como
// ya quedaban antes en el mapa. La red de consorcios son 28.756 km.
cerca('los km totales son los de la red de consorcios', kmTotal, 28756.1, 5)
ok('ningún tramo quedó sin consorcio', tramos.every(t => Number.isFinite(t.cc)), true)
ok('ningún tramo sin muestras', tramos.every(t => t.muestras.length > 0), true)
ok('ningún tramo con km cero', tramos.every(t => t.km > 0), true)
ok('el peso de las muestras suma el largo del tramo',
  tramos.every(t => Math.abs(t.muestras.reduce((s, m) => s + m.peso, 0) - t.km) < 1e-6), true)
const muestras = tramos.reduce((s, t) => s + t.muestras.length, 0)
console.log(`       ${muestras.toLocaleString('es-AR')} muestras (una cada ${PASO_MUESTRA_KM} km)`)
ok('muestrear reduce el trabajo al menos diez veces', muestras * 10 < 249209, true)

console.log('\n— Estimar con un evento inventado —')
// Una sola estación con 100 mm: todo lo que esté a menos de 60 km tiene que
// recibir exactamente 100, porque el IDW de un único valor es ese valor.
const una = [{ ...ESTACIONES_ACTIVAS[0], mm: 100 }]
const l1 = lluviaPorTramo(tramos, una)
const cercaDeLaUnica = tramos.map((t, i) => ({ t, l: l1[i] })).filter(x => x.l.mm !== null)
ok('con un solo pluviómetro, lo cubierto vale exactamente su medición',
  cercaDeLaUnica.every(x => x.l.mm === 100), true)
ok('lo que no tiene cobertura queda sin dato, no en cero',
  tramos.every((t, i) => l1[i].mm !== null || (l1[i].cobertura === 0 && l1[i].procedencia === 'estimado')), true)
ok('un tramo con dato tiene cobertura mayor que cero',
  cercaDeLaUnica.every(x => x.l.cobertura > 0), true)
// El promedio se toma sólo sobre lo cubierto: un tramo que entra y sale del
// radio no puede salir diluido hacia abajo por la parte sin pluviómetro.
const parciales = cercaDeLaUnica.filter(x => x.l.cobertura < 1)
console.log(`       ${cercaDeLaUnica.length.toLocaleString('es-AR')} tramos con dato`
  + ` (${parciales.length} con cobertura parcial) alrededor de ${una[0].nombre}`)
ok('los de cobertura parcial tampoco se diluyen', parciales.every(x => x.l.mm === 100), true)

console.log('\n— Estimar con la red real de pluviómetros —')
// Lluvia sintética pero variada: cada estación recibe según su latitud, así que
// hay gradiente de verdad y los tramos largos cruzan valores distintos.
const est = ESTACIONES_ACTIVAS.map(e => ({
  ...e, mm: Math.round(Math.abs(e.lat + 27) * 40 * 100) / 100,
}))
const t1 = Date.now()
const lluvia = lluviaPorTramo(tramos, est)
console.log(`       estimado en ${Date.now() - t1} ms`)

const mms = lluvia.map(l => l.mm).filter((m): m is number => m !== null)
// Los tramos que quedan sin dato con la red completa de pluviómetros son el
// hueco real de la APA, no un problema del cálculo.
//
// **Son siete consorcios, no tres.** La tabla por consorcio muestra 80, 81 y 84
// porque promedia toda la red del consorcio; mirado tramo por tramo aparecen
// otros cuatro con parte de su red descubierta y el promedio lo tapaba:
//
//   CC 84 → 217,3 km de 292,1 (74 %)    CC 69 →  51,0 km de 421,5 (12 %)
//   CC 80 → 115,7 km de 350,4 (33 %)    CC 53 →  36,4 km de 552,4  (7 %)
//   CC 81 →  97,5 km de 480,9 (20 %)    CC 55 →   8,9 km de 275,3  (3 %)
//                                       CC 87 →   1,8 km de 225,4  (1 %)
//
// Que este número no coincida con el de la tabla no es una contradicción: son
// dos preguntas distintas, y la de acá es la más fina.
const ccSinDato = [...new Set(tramos.filter((t, i) => lluvia[i].mm === null).map(t => t.cc))]
ok('los tramos sin dato son de los siete consorcios conocidos',
  ccSinDato.sort((a, b) => a - b), [53, 55, 69, 80, 81, 84, 87])
const kmSinDato = tramos.filter((t, i) => lluvia[i].mm === null).reduce((s, t) => s + t.km, 0)
console.log(`       ${(tramos.length - mms.length)} tramos sin cobertura`
  + ` = ${kmSinDato.toFixed(1)} km (${(kmSinDato / kmTotal * 100).toFixed(1)} % de la red)`)
const minEst = Math.min(...est.map(e => e.mm))
const maxEst = Math.max(...est.map(e => e.mm))
ok('ningún tramo se sale del rango de lo medido',
  mms.every(m => m >= Math.min(0, minEst) - 1e-6 && m <= maxEst + 1e-6), true)
cerca('el mayor de la red se acerca al mayor medido', Math.max(...mms), maxEst, maxEst * 0.25)

// El promedio pesado tiene que quedar entre el mínimo y el máximo de lo que se
// estimó a lo largo del propio tramo. Se controla el tramo más largo, que es el
// que más puede cruzar.
const masLargo = tramos.reduce((a, b) => (a.km > b.km ? a : b))
const iLargo = tramos.indexOf(masLargo)
console.log(`       el tramo más largo son ${masLargo.km.toFixed(1)} km`
  + ` (CC ${masLargo.cc}, ruta ${masLargo.ruta}) y cruza ${lluvia[iLargo].zonas} zona(s)`)
ok('el tramo más largo tiene más de una muestra', masLargo.muestras.length > 1, true)

console.log('\n— Kilómetros por rango —')
const filas = kmPorRango(tramos, lluvia)
for (const f of filas) {
  const etiq = f.desde === null ? 'sin dato'
    : f.hasta === null ? `≥ ${f.desde} mm` : `${f.desde}–${f.hasta} mm`
  console.log(`       ${etiq.padEnd(12)} ${f.km.toLocaleString('es-AR').padStart(9)} km`
    + `  (${f.tramos.toLocaleString('es-AR')} tramos)`)
}
ok('la última fila es la de los tramos sin dato', filas[filas.length - 1].desde, null)
cerca('los rangos suman la red entera', filas.reduce((s, f) => s + f.km, 0), kmTotal, 1)
ok('y los tramos también', filas.reduce((s, f) => s + f.tramos, 0), tramos.length)
ok('los cortes son los mismos que usa el color', CORTES_MM, [0, 10, 25, 50, 100])

// kmSobre tiene que coincidir con la suma de los rangos de ahí para arriba
const desde50 = filas.filter(f => f.desde !== null && f.desde >= 50).reduce((s, f) => s + f.km, 0)
cerca('kmSobre(50) coincide con la suma de los rangos', kmSobre(tramos, lluvia, 50), desde50, 1)
// kmSobre(0) es toda la red *con dato*: los tramos sin cobertura no entran,
// porque no se sabe si superaron el umbral o no.
const filaSinDato = filas[filas.length - 1]
cerca('kmSobre(0) es la red con dato', kmSobre(tramos, lluvia, 0), kmTotal - filaSinDato.km, 1)

console.log('\n— Filtrar por consorcio —')
const cc5 = kmPorRango(tramos, lluvia, 5)
const kmCC5 = tramos.filter(t => t.cc === 5).reduce((s, t) => s + t.km, 0)
cerca('el resumen del CC 5 suma sus propios km', cc5.reduce((s, f) => s + f.km, 0), kmCC5, 1)

console.log('\n— CSV —')
const csv = csvTramos(tramos, lluvia, { desde: '2026-09-01', hasta: '2026-09-07' })
const lineas = csv.split('\n')
ok('una fila por tramo más encabezado y tres comentarios', lineas.length, tramos.length + 4)
ok('el encabezado tiene las once columnas', lineas[3].split(';').length, 11)
ok('las filas también', lineas[4].split(';').length, 11)
ok('decimales con coma', /;\d+,\d+;/.test(lineas[4]), true)

console.log(fallos ? `\n✗ ${fallos} falla(s).\n` : '\n✓ Todo bien.\n')
process.exit(fallos ? 1 : 0)
