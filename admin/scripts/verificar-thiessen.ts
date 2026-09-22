/**
 * Verifica los polígonos de Thiessen contra casos de respuesta conocida.
 *
 * Dos estaciones dan una frontera recta en la mitad exacta; cuatro en cuadrado
 * dan una cruz; y nada puede tener dueño más allá del radio de búsqueda.
 *
 *   npx tsx scripts/verificar-thiessen.ts
 */

import { rasterThiessen, bordesThiessen, estacionMasCercana } from '../src/lib/thiessen'
import { RADIO_KM, distanciaKm, type Medicion } from '../src/lib/fusion'
import { ESTACIONES_ACTIVAS } from '../src/data/estacionesApa'
import { PUNTOS_LLUVIA } from '../src/data/puntosLluvia'

let fallos = 0
const ok = (etiqueta: string, real: unknown, esperado: unknown) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado)
  if (!bien) fallos++
  console.log(`  ${bien ? 'ok  ' : 'FALLA'} ${etiqueta.padEnd(54)} ${JSON.stringify(real)}`
    + (bien ? '' : `  esperado ${JSON.stringify(esperado)}`))
}
const cerca = (etiqueta: string, real: number, esperado: number, tol: number) => {
  const bien = Math.abs(real - esperado) <= tol
  if (!bien) fallos++
  console.log(`  ${bien ? 'ok  ' : 'FALLA'} ${etiqueta.padEnd(54)} ${Math.round(real * 100) / 100}`
    + (bien ? '' : `  esperado ≈${esperado}`))
}

const mm = (lat: number, lng: number): Medicion => ({ lat, lng, mm: 0 })

console.log('\n— Dos estaciones: frontera en la mitad —')
// Separadas en longitud; la frontera tiene que caer en el meridiano del medio
const dos = [mm(-27, -60.5), mm(-27, -59.5)]
const r2 = rasterThiessen(dos, 3)!
ok('las dos tienen zona', r2.conZona, 2)

// Recorro la fila del centro y busco dónde cambia el dueño
const jMedio = Math.round((-27 - r2.lat0) / r2.dLat)
let corte = -1
for (let i = 0; i + 1 < r2.nx; i++) {
  const a = r2.duenio[jMedio * r2.nx + i], b = r2.duenio[jMedio * r2.nx + i + 1]
  if (a >= 0 && b >= 0 && a !== b) { corte = i; break }
}
ok('hay un cambio de dueño en la fila del centro', corte >= 0, true)
cerca('la frontera cae en el medio', r2.lng0 + corte * r2.dLng, -60, 0.05)

console.log('\n— Cuatro en cuadrado: cruz en el centro —')
const cuatro = [mm(-26.8, -60.2), mm(-26.8, -59.8), mm(-27.2, -60.2), mm(-27.2, -59.8)]
const r4 = rasterThiessen(cuatro, 3)!
ok('las cuatro tienen zona', r4.conZona, 4)
const iC = Math.round((-60 - r4.lng0) / r4.dLng)
const jC = Math.round((-27 - r4.lat0) / r4.dLat)
const alrededor = new Set<number>()
for (const [di, dj] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
  alrededor.add(r4.duenio[(jC + dj) * r4.nx + (iC + di)])
}
ok('los cuatro cuadrantes del centro tienen dueños distintos', alrededor.size, 4)

console.log('\n— El radio manda —')
const sola = [mm(-27, -60)]
const r1 = rasterThiessen(sola, 3)!
let masLejos = 0
let huerfanos = 0
for (let j = 0; j < r1.ny; j++) for (let i = 0; i < r1.nx; i++) {
  const d = distanciaKm({ lat: r1.lat0 + j * r1.dLat, lng: r1.lng0 + i * r1.dLng }, sola[0])
  if (r1.duenio[j * r1.nx + i] >= 0) { if (d > masLejos) masLejos = d } else huerfanos++
}
ok(`ningún nodo con dueño a más de ${RADIO_KM} km`, masLejos <= RADIO_KM, true)
ok('y el borde llega hasta cerca del radio', masLejos > RADIO_KM - 3, true)
ok('las esquinas quedan sin dueño', huerfanos > 0, true)
ok('sin estaciones no hay raster', rasterThiessen([], 3), null)

console.log('\n— Bordes —')
const b2 = bordesThiessen(r2)
const cuantos = b2.reduce((s, v) => s + v, 0)
ok('hay bordes', cuantos > 0, true)
ok('pero son una minoría de los nodos', cuantos < b2.length * 0.25, true)
// Un nodo pegado a la estación no puede ser borde
const iEst = Math.round((-60.5 - r2.lng0) / r2.dLng)
ok('el nodo sobre una estación no es borde', b2[jMedio * r2.nx + iEst], 0)

console.log('\n— Contra la red real —')
const est = ESTACIONES_ACTIVAS.map(e => ({ lat: e.lat, lng: e.lng, mm: 0 }))
const rr = rasterThiessen(est, 5)!
console.log(`       grilla ${rr.nx} × ${rr.ny} = ${(rr.nx * rr.ny).toLocaleString('es-AR')} nodos`)
// 70 y no 71: La Vicuña y Paraje Kolbacks comparten exactamente la misma
// coordenada en el origen de la APA, así que una gana siempre el desempate y la
// otra se queda sin polígono. No es un error del algoritmo — es el dato de
// relleno del organismo, y este test lo deja a la vista.
ok('70 de las 71 activas tienen zona propia', rr.conZona, 70)

// Cada punto de muestreo debería encontrar estación, salvo los tres consorcios
// con hueco conocido. Es el mismo control que hace verificar-fusion, pero visto
// desde la capa que se dibuja.
const conNombre = ESTACIONES_ACTIVAS.map(e => ({ lat: e.lat, lng: e.lng, nombre: e.nombre }))
const sinEstacion = new Set<number>()
for (const p of PUNTOS_LLUVIA) {
  if (estacionMasCercana(p, conNombre) === null) sinEstacion.add(p.cc)
}
ok('los consorcios sin estación en radio son los tres conocidos',
  [...sinEstacion].sort((a, b) => a - b), [80, 81, 84])

const cerquita = estacionMasCercana({ lat: -27.4511, lng: -58.9865 }, conNombre)
ok('sobre Resistencia devuelve Resistencia', cerquita?.nombre, 'Resistencia')
cerca('y a distancia cero', cerquita!.km, 0, 0.2)

console.log(fallos ? `\n✗ ${fallos} falla(s).\n` : '\n✓ Todo bien.\n')
process.exit(fallos ? 1 : 0)
