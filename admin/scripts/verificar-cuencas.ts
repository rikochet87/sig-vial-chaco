/**
 * Verifica la capa de cuencas hídricas.
 *
 * Lo que se afirma acá es que **el archivo generado es el que dice ser**: trece
 * cuencas, del tamaño que declara el origen, que cubren la provincia sin
 * pisarse. Si la reproyección estuviera mal —otra faja, los ejes cruzados, el
 * falso este equivocado— las áreas no cerrarían o las sedes de los consorcios
 * caerían afuera.
 *
 * **Lo que NO puede afirmar es el datum.** El shapefile no trae .prj, y entre
 * POSGAR y Campo Inchauspe hay unos 200 m: ninguna de estas comprobaciones es
 * tan fina. Está dicho en `scripts/build_cuencas.mjs`.
 *
 *   npx tsx scripts/verificar-cuencas.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cuencaEn, dentroDe, parsearCuencas, puntoInterior } from '../src/lib/cuencas'
import { areaKm2 } from '../src/lib/thiessenAreal'

let fallos = 0
const fmt = (v: unknown) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : JSON.stringify(v)

function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(60)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}
const info = (s: string) => console.log(`       ${s}`)
const titulo = (s: string) => console.log(`\n— ${s} —`)

const GEO = join(__dirname, '..', 'public', 'geo')
const cuencas = parsearCuencas(JSON.parse(readFileSync(join(GEO, 'geo_cuencas.json'), 'utf8')))

// ── El archivo ──────────────────────────────────────────────────────────────
titulo('Las trece cuencas')

ok('son trece', cuencas.length, 13)
ok('con códigos del 1 al 13, sin repetir', cuencas.map(c => c.cod).join(','), '1,2,3,4,5,6,7,8,9,10,11,12,13')
ok('todas tienen nombre', cuencas.every(c => c.nombre.length > 0))
ok('doce son de una sola parte', cuencas.filter(c => c.partes.length === 1).length, 12)
ok('el valle del Paraná tiene doce', cuencas.find(c => c.cod === 12)?.partes.length, 12)
ok('todos los anillos están cerrados', cuencas.every(c => c.partes.every(p =>
  p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1])))

// ── Las áreas ───────────────────────────────────────────────────────────────
titulo('El área de cada cuenca es la que declara el origen')

/*
 * Es la prueba fuerte de la reproyección. El origen trae las hectáreas de cada
 * cuenca; acá se mide el polígono ya reproyectado y tienen que coincidir. Con
 * la faja equivocada, o los ejes cruzados, no coinciden ni de cerca.
 *
 * La tolerancia es del 1 %: `areaKm2` aplana con una latitud de referencia y
 * la proyección de origen tampoco conserva áreas, así que dos o tres décimas
 * de diferencia son esperables y no dicen nada.
 */
let peor = 0, declaradoHa = 0, medidoHa = 0
for (const c of cuencas) {
  const ha = c.partes.reduce((s, p) => s + areaKm2(p), 0) * 100
  const dif = Math.abs(ha / c.ha - 1)
  if (dif > peor) peor = dif
  declaradoHa += c.ha
  medidoHa += ha
  ok(`${String(c.cod).padStart(2)} ${c.nombre}`, dif < 0.01)
  info(`declara ${c.ha.toLocaleString('es-AR')} ha · mide ${Math.round(ha).toLocaleString('es-AR')} ha · ${(dif * 100).toFixed(2)} %`)
}
info(`la que más se aparta: ${(peor * 100).toFixed(2)} %`)

titulo('Entre todas cubren la provincia')

/*
 * La superficie del Chaco es de 99.633 km² y las cuencas declaran 99.580. No
 * se afirma la coincidencia —el borde de las cuencas no es el límite
 * provincial— sino que no falte ni sobre una cuenca entera.
 */
const totalKm2 = declaradoHa / 100
ok('suman entre 99.000 y 101.000 km²', totalKm2 > 99_000 && totalKm2 < 101_000)
info(`${Math.round(totalKm2).toLocaleString('es-AR')} km² declarados · ${Math.round(medidoHa / 100).toLocaleString('es-AR')} km² medidos`)

const dentroDelChaco = cuencas.every(c =>
  c.caja[0] > -28.2 && c.caja[2] < -24.0 && c.caja[1] > -63.6 && c.caja[3] < -58.2)
ok('ninguna se sale de la caja de la provincia', dentroDelChaco)

// ── La cobertura, contra datos que ya están en el sistema ───────────────────
titulo('Las sedes de los consorcios caen cada una en una sola cuenca')

/*
 * Las 103 sedes son puntos repartidos por toda la provincia y no tienen nada
 * que ver con este archivo: si las cuencas estuvieran corridas, giradas o en
 * otra faja, un montón caerían afuera. Y si dos cuencas se pisaran, alguna
 * sede caería en las dos.
 */
const bundle = JSON.parse(readFileSync(join(GEO, 'geo_bundle.json'), 'utf8')) as {
  sedes: { numero: number; lat: number; lng: number }[]
}
let afuera = 0, enDos = 0
const porCuenca = new Map<number, number>()
for (const s of bundle.sedes) {
  const cuantas = cuencas.filter(c => c.partes.some(p => dentroDe(p, s.lat, s.lng))).length
  if (cuantas === 0) afuera++
  if (cuantas > 1) enDos++
  const c = cuencaEn(cuencas, s.lat, s.lng)
  if (c) porCuenca.set(c.cod, (porCuenca.get(c.cod) ?? 0) + 1)
}
ok('hay 103 sedes para probar', bundle.sedes.length, 103)
ok('ninguna cae fuera de todas las cuencas', afuera, 0)
ok('ninguna cae en dos cuencas a la vez', enDos, 0)
info([...porCuenca].sort((a, b) => a[0] - b[0]).map(([cod, n]) => `${cod}: ${n}`).join(' · '))

/*
 * No se prueba contra el contorno provincial, y se intentó: el borde de las
 * cuencas y el límite del bundle son dos trazados distintos que se apartan
 * unos cientos de metros, así que más de la mitad del contorno cae del lado de
 * afuera con la capa bien puesta. Una prueba que da 43 % cuando todo está bien
 * no distingue nada.
 */

// ── El rótulo ───────────────────────────────────────────────────────────────
titulo('El rótulo de cada cuenca cae adentro de su cuenca')

ok('los trece caen en la cuenca que nombran',
  cuencas.every(c => cuencaEn(cuencas, c.rotulo[0], c.rotulo[1])?.cod === c.cod))

/*
 * El motivo de no usar el centroide: en una forma de C el centro de gravedad
 * cae en el hueco, fuera de la figura.
 */
const formaDeC: [number, number][] = [
  [0, 0], [0, 10], [2, 10], [2, 2], [8, 2], [8, 10], [10, 10], [10, 0], [0, 0],
]
const [latR, lngR] = puntoInterior(formaDeC)
ok('en una forma de C el rótulo cae adentro', dentroDe(formaDeC, latR, lngR))
ok('donde caería el centroide, en cambio, es afuera', dentroDe(formaDeC, 5, 6), false)

titulo('La consulta por punto')

ok('Resistencia está en alguna cuenca', cuencaEn(cuencas, -27.4514, -58.9867) !== null)
info(`Resistencia: ${cuencaEn(cuencas, -27.4514, -58.9867)?.nombre}`)
info(`Castelli: ${cuencaEn(cuencas, -25.9468, -60.6195)?.nombre}`)
info(`Sáenz Peña: ${cuencaEn(cuencas, -26.7852, -60.4388)?.nombre}`)
ok('Buenos Aires no está en ninguna', cuencaEn(cuencas, -34.6, -58.4), null)
ok('una lista vacía no rompe', cuencaEn([], -27, -60), null)

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
