/**
 * Verifica el motor de fusión: la distancia, el IDW contra un cálculo hecho a
 * mano, el respaldo al modelo fuera de radio y la agregación por consorcio.
 *
 * No sale a la red. La comparación contra la APA que justifica los parámetros
 * está en el comentario de `lib/fusion.ts`; acá se verifica que el código haga
 * lo que ese comentario dice.
 *
 *   npx tsx scripts/verificar-fusion.ts
 */

import {
  distanciaKm, estimarPunto, estimarPorConsorcio, POTENCIA, RADIO_KM,
  type Medicion, type PuntoRed,
} from '../src/lib/fusion'
import { PUNTOS_LLUVIA } from '../src/data/puntosLluvia'
import { ESTACIONES_APA } from '../src/data/estacionesApa'

let fallos = 0
const ok = (etiqueta: string, real: unknown, esperado: unknown) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado)
  if (!bien) fallos++
  console.log(`  ${bien ? 'ok  ' : 'FALLA'} ${etiqueta.padEnd(50)} ${JSON.stringify(real)}`
    + (bien ? '' : `  esperado ${JSON.stringify(esperado)}`))
}
const cerca = (etiqueta: string, real: number, esperado: number, tol = 0.05) => {
  const bien = Math.abs(real - esperado) <= tol
  if (!bien) fallos++
  console.log(`  ${bien ? 'ok  ' : 'FALLA'} ${etiqueta.padEnd(50)} ${real}`
    + (bien ? '' : `  esperado ≈${esperado}`))
}

/** Punto de referencia y estaciones a N km al norte, para poder razonar a mano */
const O = { lat: -27, lng: -60 }
const alNorte = (km: number, mm: number): Medicion => ({
  lat: O.lat + km / 111.32, lng: O.lng, mm,
})

console.log('\n— Distancia —')
cerca('8 km al norte', distanciaKm(O, alNorte(8, 0)), 8, 0.01)
cerca('simétrica', distanciaKm(alNorte(30, 0), O), 30, 0.01)
cerca('mismo punto', distanciaKm(O, { lat: -27, lng: -60 }), 0, 0.0001)
// un grado de longitud en Chaco mide ~99 km, no 111
cerca('la longitud se achica con la latitud',
  distanciaKm(O, { lat: -27, lng: -61 }), 111.32 * Math.cos((27 * Math.PI) / 180), 0.5)

console.log('\n— IDW en un punto —')
// Tres pluviómetros: 8 km/40 mm, 20 km/12 mm, 45 km/3 mm.
// pesos 1/64, 1/400, 1/2025 → (0,625 + 0,03 + 0,0014815) / 0,01861883 = 35,26
const TRES = [alNorte(8, 40), alNorte(20, 12), alNorte(45, 3)]
cerca('coincide con el cálculo a mano', estimarPunto(O, TRES, 99).mm, 35.26, 0.1)
ok('y no usa el modelo', estimarPunto(O, TRES, 99).procedencia, 'interpolado')
ok('cuenta las tres estaciones', estimarPunto(O, TRES, 99).estaciones, 3)
cerca('informa la más cercana', estimarPunto(O, TRES, 99).distanciaKm!, 8, 0.05)

ok('el promedio simple sería otra cosa',
  Math.round(((40 + 12 + 3) / 3) * 100) / 100, 18.33)

console.log('\n— Casos de borde —')
ok('encima de la estación devuelve su valor',
  estimarPunto(O, [alNorte(0.3, 37), alNorte(20, 1)], 99).mm, 37)
ok('y lo marca como medido',
  estimarPunto(O, [alNorte(0.3, 37), alNorte(20, 1)], 99).procedencia, 'medido')
ok('fuera de radio cae al modelo',
  estimarPunto(O, [alNorte(RADIO_KM + 10, 50)], 12.5).mm, 12.5)
ok('y lo marca como estimado',
  estimarPunto(O, [alNorte(RADIO_KM + 10, 50)], 12.5).procedencia, 'estimado')
ok('sin estaciones ni modelo da cero', estimarPunto(O, [], null).mm, 0)
ok('sin estaciones informa que no hubo ninguna', estimarPunto(O, [], null).distanciaKm, null)
ok('justo adentro del radio interpola',
  estimarPunto(O, [alNorte(RADIO_KM - 1, 50)], 12.5).procedencia, 'interpolado')

// Todos en cero: el resultado tiene que ser cero, no el modelo
ok('si los pluviómetros dicen cero, es cero',
  estimarPunto(O, [alNorte(10, 0), alNorte(25, 0)], 40).mm, 0)

// Nunca extrapola fuera del rango de los datos: es una propiedad del IDW
const r = estimarPunto(O, TRES, 0).mm
ok('el resultado queda entre el mínimo y el máximo medidos', r >= 3 && r <= 40, true)

console.log('\n— Agregación por consorcio —')
const RED: PuntoRed[] = [
  { cc: 7, lat: O.lat, lng: O.lng, peso: 0.75, mmModelo: 5 },
  { cc: 7, lat: O.lat + 100 / 111.32, lng: O.lng, peso: 0.25, mmModelo: 5 },
]
// El primero interpola sobre una estación a 8 km con 40 mm; el segundo queda
// a 92 km de ella, fuera de radio, y cae al modelo (5 mm).
const agg = estimarPorConsorcio(RED, [alNorte(8, 40)])[0]
cerca('pondera por fracción de camino', agg.mm, 40 * 0.75 + 5 * 0.25, 0.3)
ok('la procedencia es la peor de sus puntos', agg.procedencia, 'estimado')
ok('informa qué fracción quedó sin pluviómetro', agg.fraccionEstimada, 0.25)

const todoCerca = estimarPorConsorcio(
  [{ cc: 9, lat: O.lat, lng: O.lng, peso: 1, mmModelo: 5 }], [alNorte(8, 40)])[0]
ok('con todo cubierto la procedencia es interpolado', todoCerca.procedencia, 'interpolado')
ok('fracción estimada cero', todoCerca.fraccionEstimada, 0)

console.log('\n— Contra la red real —')
const estaciones: Medicion[] = ESTACIONES_APA.map(e => ({ lat: e.lat, lng: e.lng, mm: 10 }))
const porCC = estimarPorConsorcio(
  PUNTOS_LLUVIA.map(p => ({ ...p, mmModelo: 10 })), estaciones)
ok('cubre los 103 consorcios', porCC.length, 103)
ok('con lluvia uniforme, todos dan lo mismo',
  porCC.every(c => Math.abs(c.mm - 10) < 0.01), true)

// Tres consorcios tienen parte de su red a más de 60 km de toda estación. No es
// un error: es el hueco real de cobertura de la red de la APA en el noroeste, y
// ahí el número sale del modelo. Si esta lista cambia, algo se movió —la lista
// de estaciones o el trazado— y hay que mirarlo.
const conHueco = estimarPorConsorcio(PUNTOS_LLUVIA.map(p => ({ ...p, mmModelo: 99 })), estaciones)
ok('los consorcios que caen al modelo son los tres conocidos',
  conHueco.filter(c => c.procedencia === 'estimado').map(c => c.consorcio), [80, 81, 84])
ok('el CC 84 es el más descubierto',
  conHueco.find(c => c.consorcio === 84)!.fraccionEstimada, 0.82)
ok('en los otros dos el hueco es chico',
  conHueco.filter(c => [80, 81].includes(c.consorcio)).every(c => c.fraccionEstimada < 0.2), true)

const dist = porCC.map(c => c.distanciaKm!).sort((a, b) => a - b)
const mediana = dist[Math.floor(dist.length / 2)]
console.log(`       mediana al pluviómetro más cercano: ${mediana} km`)
console.log(`       percentil 90:                       ${dist[Math.floor(dist.length * 0.9)]} km`)
console.log(`       el consorcio peor cubierto:         ${dist[dist.length - 1]} km`)
// La validación midió el error interpolando entre estaciones separadas 17,7 km
// de mediana. Si la red vial estuviera sistemáticamente más lejos que eso, los
// números medidos no aplicarían acá.
ok('la red vial no está más lejos que la geometría con la que se validó',
  mediana < 17.7, true)

console.log('\n— Parámetros —')
ok('potencia 2', POTENCIA, 2)
ok('radio 60 km', RADIO_KM, 60)

console.log(fallos ? `\n✗ ${fallos} falla(s).\n` : '\n✓ Todo bien.\n')
process.exit(fallos ? 1 : 0)
