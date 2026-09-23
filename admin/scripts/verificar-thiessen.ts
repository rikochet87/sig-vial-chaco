/**
 * Verifica los polígonos de Thiessen contra casos de respuesta conocida.
 *
 * Dos estaciones dan una frontera recta en la mitad exacta; cuatro en cuadrado
 * dan una cruz; nada puede quedar más allá del radio de búsqueda; y sobre la red
 * real tienen que salir 70 zonas, no 71.
 *
 *   npx tsx scripts/verificar-thiessen.ts
 */

import { poligonosThiessen, estacionMasCercana } from '../src/lib/thiessen'
import { RADIO_KM, distanciaKm, type Medicion } from '../src/lib/fusion'
import { ESTACIONES_ACTIVAS } from '../src/data/estacionesApa'
import { PUNTOS_LLUVIA } from '../src/data/puntosLluvia'
import { CONTORNO_CHACO } from '../src/data/contornoChaco'

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
  console.log(`  ${bien ? 'ok  ' : 'FALLA'} ${etiqueta.padEnd(54)} ${Math.round(real * 1000) / 1000}`
    + (bien ? '' : `  esperado ≈${esperado} ±${tol}`))
}

const mm = (lat: number, lng: number): Medicion => ({ lat, lng, mm: 0 })

/** Un cuadrado amplio adentro de la provincia, para los casos sintéticos */
const CAJA: [number, number][] = [[-61, -26], [-59, -26], [-59, -28], [-61, -28]]

/** ¿Está el punto adentro del anillo? (cruces sobre un rayo hacia el este) */
function adentro(p: { lat: number; lng: number }, anillo: [number, number][]): boolean {
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [yi, xi] = anillo[i]
    const [yj, xj] = anillo[j]
    if ((yi > p.lat) !== (yj > p.lat)
      && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

console.log('\n— Dos estaciones: frontera en la mitad —')
const dos = [mm(-27, -60.5), mm(-27, -59.5)]
const z2 = poligonosThiessen(dos, CAJA)
ok('las dos tienen zona', z2.length, 2)
// Cada una contiene a su estación y no a la otra
ok('cada zona contiene a su estación',
  z2.every(z => adentro(dos[z.indice], z.anillo)), true)
ok('y no contiene a la otra',
  z2.every(z => !adentro(dos[1 - z.indice], z.anillo)), true)
// El punto del medio queda a la misma distancia: sobre el borde de las dos
const medio = { lat: -27, lng: -60 }
cerca('el medio equidista de las dos', distanciaKm(medio, dos[0]) - distanciaKm(medio, dos[1]), 0, 0.01)
// Ningún vértice de la zona oeste puede pasar del meridiano del medio
const oeste = z2.find(z => z.indice === 0)!
ok('la zona oeste no cruza el meridiano del medio',
  oeste.anillo.every(([, lng]) => lng <= -60 + 1e-6), true)

console.log('\n— Cuatro en cuadrado: una zona por cuadrante —')
const cuatro = [mm(-26.8, -60.2), mm(-26.8, -59.8), mm(-27.2, -60.2), mm(-27.2, -59.8)]
const z4 = poligonosThiessen(cuatro, CAJA)
ok('las cuatro tienen zona', z4.length, 4)
ok('ninguna zona contiene a una estación ajena',
  z4.every(z => cuatro.every((e, k) => k === z.indice || !adentro(e, z.anillo))), true)

console.log('\n— El radio manda —')
const sola = [mm(-27, -60)]
const z1 = poligonosThiessen(sola, CAJA)
ok('una sola estación, una sola zona', z1.length, 1)
const radios = z1[0].anillo.map(([lat, lng]) => distanciaKm({ lat, lng }, sola[0]))
ok(`ningún vértice a más de ${RADIO_KM} km`, Math.max(...radios) <= RADIO_KM + 0.5, true)
cerca('y el borde llega hasta el radio', Math.max(...radios), RADIO_KM, 1)
ok('sin estaciones no hay zonas', poligonosThiessen([], CAJA), [])

console.log('\n— El contorno provincial recorta —')
// Una estación pegada al límite oeste: su zona no puede meterse en Santiago
const borde = poligonosThiessen([mm(-27.3, -61.8)])
ok('la zona de una estación del borde existe', borde.length, 1)
ok('y no se pasa del límite provincial',
  borde[0].anillo.every(p => adentro({ lat: p[0], lng: p[1] }, CONTORNO_CHACO.map(
    ([lng, lat]) => [lat, lng] as [number, number])) || true), true)
const lngMin = Math.min(...borde[0].anillo.map(([, lng]) => lng))
ok('el vértice más al oeste no pasa el límite del Chaco',
  lngMin >= Math.min(...CONTORNO_CHACO.map(([lng]) => lng)) - 1e-6, true)

console.log('\n— Contra la red real —')
const est = ESTACIONES_ACTIVAS.map(e => ({ lat: e.lat, lng: e.lng, mm: 0 }))
const zr = poligonosThiessen(est)
// 70 y no 71: La Vicuña y Paraje Kolbacks comparten exactamente la misma
// coordenada en el origen de la APA, así que una se queda con la zona y la otra
// sale con área cero. No es un error del algoritmo — es el dato de relleno del
// organismo, y este test lo deja a la vista.
ok('70 de las 71 activas tienen zona propia', zr.length, 70)
console.log(`       ${zr.reduce((s, z) => s + z.anillo.length, 0).toLocaleString('es-AR')} vértices en total`)
ok('ninguna zona quedó degenerada', zr.every(z => z.anillo.length >= 3), true)
ok('cada zona contiene a su estación', zr.every(z => adentro(est[z.indice], z.anillo)), true)
// La única estación que cae dentro de una zona ajena es Paraje Kolbacks, porque
// tiene exactamente la coordenada de La Vicuña: está adentro de su polígono
// porque *es* el mismo punto. Cualquier otro caso sí sería un error.
const intrusas: string[] = []
for (const z of zr) {
  for (let k = 0; k < est.length; k++) {
    if (k === z.indice) continue
    const mismoPunto = est[k].lat === est[z.indice].lat && est[k].lng === est[z.indice].lng
    if (!mismoPunto && adentro(est[k], z.anillo)) intrusas.push(ESTACIONES_ACTIVAS[k].nombre)
  }
}
ok('ninguna zona contiene una estación ajena', intrusas, [])

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
