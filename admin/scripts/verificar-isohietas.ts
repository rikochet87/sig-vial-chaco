/**
 * Verifica el motor de isohietas contra campos de respuesta conocida: un cono,
 * una rampa lineal y dos picos. Si marching squares está mal, estos tres lo
 * delatan enseguida — un cono tiene que dar curvas cerradas y concéntricas, una
 * rampa curvas abiertas y paralelas, y dos picos dos curvas separadas que se
 * fusionan en una sola cuando el nivel baja.
 *
 *   npx tsx scripts/verificar-isohietas.ts
 */

import { calcularGrilla, curvasDeNivel, nivelesSugeridos, type Grilla } from '../src/lib/isohietas'
import { RADIO_KM, distanciaKm, type Medicion } from '../src/lib/fusion'

let fallos = 0
const ok = (etiqueta: string, real: unknown, esperado: unknown) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado)
  if (!bien) fallos++
  console.log(`  ${bien ? 'ok  ' : 'FALLA'} ${etiqueta.padEnd(52)} ${JSON.stringify(real)}`
    + (bien ? '' : `  esperado ${JSON.stringify(esperado)}`))
}
const cerca = (etiqueta: string, real: number, esperado: number, tol: number) => {
  const bien = Math.abs(real - esperado) <= tol
  if (!bien) fallos++
  console.log(`  ${bien ? 'ok  ' : 'FALLA'} ${etiqueta.padEnd(52)} ${Math.round(real * 100) / 100}`
    + (bien ? '' : `  esperado ≈${esperado}`))
}

/** Arma una grilla sintética sin pasar por el IDW, para probar el contorneo */
function grillaDe(nx: number, ny: number, f: (i: number, j: number) => number): Grilla {
  const valores = new Float32Array(nx * ny)
  let max = 0
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = f(i, j)
    valores[j * nx + i] = v
    if (!Number.isNaN(v) && v > max) max = v
  }
  return { nx, ny, lat0: 0, lng0: 0, dLat: 1, dLng: 1, valores, max }
}
const cerrada = (c: [number, number][]) =>
  Math.abs(c[0][0] - c[c.length - 1][0]) < 1e-6 && Math.abs(c[0][1] - c[c.length - 1][1]) < 1e-6

console.log('\n— Niveles sugeridos —')
ok('una llovizna usa paso chico', nivelesSugeridos(12), [2, 4, 6, 8, 10])
ok('un temporal usa paso grande', nivelesSugeridos(300), [50, 100, 150, 200, 250])
ok('sin lluvia no hay curvas', nivelesSugeridos(0), [])
ok('un máximo negativo tampoco', nivelesSugeridos(-5), [])
ok('todos los niveles quedan bajo el máximo',
  nivelesSugeridos(97).every(n => n < 97), true)

console.log('\n— Rampa lineal: curvas abiertas y paralelas —')
const rampa = grillaDe(20, 20, i => i)
ok('un nivel, una sola curva', curvasDeNivel(rampa, 9.5).length, 1)
const cr = curvasDeNivel(rampa, 9.5)[0]
ok('es abierta', cerrada(cr), false)
ok('es vertical: toda a la misma longitud',
  cr.every(p => Math.abs(p[1] - 9.5) < 1e-6), true)
ok('la atraviesa entera de lado a lado', cr.length, 20)
ok('un nivel fuera del rango no da curva', curvasDeNivel(rampa, 99).length, 0)

console.log('\n— Cono: curvas cerradas y concéntricas —')
// Pico en el centro, decae con la distancia
const C = 15
const cono = grillaDe(31, 31, (i, j) => Math.max(0, 100 - 5 * Math.hypot(i - C, j - C)))
const alto = curvasDeNivel(cono, 75)
const bajo = curvasDeNivel(cono, 25)
ok('nivel alto: una curva', alto.length, 1)
ok('nivel bajo: una curva', bajo.length, 1)
ok('la de nivel alto es cerrada', cerrada(alto[0]), true)
ok('la de nivel bajo también', cerrada(bajo[0]), true)

const radio = (c: [number, number][]) =>
  c.reduce((s, p) => s + Math.hypot(p[1] - C, p[0] - C), 0) / c.length
cerca('radio de la curva de 75 mm', radio(alto[0]), 5, 0.3)
cerca('radio de la curva de 25 mm', radio(bajo[0]), 15, 0.3)
ok('la de menos mm envuelve a la de más', radio(bajo[0]) > radio(alto[0]), true)

console.log('\n— Dos picos: se separan arriba y se funden abajo —')
// Dos conos que se solapan: a 80 mm cada uno tiene su curva, a 50 mm el campo
// entre ellos no baja de 60 y las dos curvas se funden en una sola. Es el caso
// que ejercita el encadenado de segmentos.
const dos = grillaDe(61, 31, (i, j) => Math.max(
  Math.max(0, 100 - 4 * Math.hypot(i - 20, j - 15)),
  Math.max(0, 100 - 4 * Math.hypot(i - 40, j - 15)),
))
ok('en 80 mm hay dos curvas', curvasDeNivel(dos, 80).length, 2)
ok('las dos son cerradas', curvasDeNivel(dos, 80).every(cerrada), true)
ok('en 50 mm se funden en una', curvasDeNivel(dos, 50).length, 1)
ok('la fundida también es cerrada', curvasDeNivel(dos, 50).every(cerrada), true)
ok('y es más larga que cualquiera de las dos de arriba',
  curvasDeNivel(dos, 50)[0].length > Math.max(...curvasDeNivel(dos, 80).map(c => c.length)), true)

console.log('\n— El hueco sin pluviómetros —')
// Mitad del campo en NaN: ninguna curva puede cruzar el hueco
const conHueco = grillaDe(20, 20, (i) => (i > 12 ? NaN : i))
const ch = curvasDeNivel(conHueco, 9.5)
ok('la curva del lado con datos sigue estando', ch.length, 1)
ok('ninguna curva tiene NaN', ch.flat().every(p => !Number.isNaN(p[0]) && !Number.isNaN(p[1])), true)
ok('un nivel que cae dentro del hueco no dibuja nada', curvasDeNivel(conHueco, 15).length, 0)

console.log('\n— Grilla desde estaciones reales —')
const est: Medicion[] = [
  { lat: -27.0, lng: -60.0, mm: 80 },
  { lat: -27.4, lng: -59.6, mm: 10 },
  { lat: -26.6, lng: -60.4, mm: 5 },
]
const g = calcularGrilla(est, 5)!
ok('la grilla existe', g != null, true)
cerca('el máximo se acerca al pico medido', g.max, 80, 1)
ok('hay nodos sin cobertura en las esquinas',
  [...g.valores].some(v => Number.isNaN(v)), true)
ok('ningún valor supera al máximo medido',
  [...g.valores].every(v => Number.isNaN(v) || v <= 80.001), true)
ok('ninguno queda por debajo del mínimo medido',
  [...g.valores].every(v => Number.isNaN(v) || v >= 4.999), true)

// El nodo más cercano a una estación tiene que parecerse a su medición
const iCerca = Math.round((-60.0 - g.lng0) / g.dLng)
const jCerca = Math.round((-27.0 - g.lat0) / g.dLat)
cerca('sobre la estación de 80 mm el campo vale casi eso',
  g.valores[jCerca * g.nx + iCerca], 80, 6)

// Nada dibujado más allá del radio
let masLejos = 0
for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
  if (Number.isNaN(g.valores[j * g.nx + i])) continue
  const p = { lat: g.lat0 + j * g.dLat, lng: g.lng0 + i * g.dLng }
  const d = Math.min(...est.map(e => distanciaKm(p, e)))
  if (d > masLejos) masLejos = d
}
// El nodo con valor más lejano tiene que quedar dentro del radio, y a menos de
// un paso de grilla de él: si estuviera mucho más adentro, la máscara estaría
// recortando de más y el mapa mostraría menos de lo que se puede afirmar.
ok(`ningún nodo con valor a más de ${RADIO_KM} km`, masLejos <= RADIO_KM, true)
ok('y el borde llega hasta cerca del radio', masLejos > RADIO_KM - 5, true)
ok('sin estaciones no hay grilla', calcularGrilla([], 5), null)

console.log('\n— Tamaño —')
const chaco: Medicion[] = [
  { lat: -24.1, lng: -63.3, mm: 1 }, { lat: -28.2, lng: -58.4, mm: 1 },
]
const gc = calcularGrilla(chaco, 5)!
console.log(`       grilla de ${gc.nx} × ${gc.ny} = ${(gc.nx * gc.ny).toLocaleString('es-AR')} nodos`)
ok('la grilla de la provincia entera es manejable', gc.nx * gc.ny < 40000, true)

console.log(fallos ? `\n✗ ${fallos} falla(s).\n` : '\n✓ Todo bien.\n')
process.exit(fallos ? 1 : 0)
