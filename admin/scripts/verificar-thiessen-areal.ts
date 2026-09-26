/**
 * Verifica la media areal por polígonos de Thiessen.
 *
 * Tres bloques: áreas contra figuras de valor conocido, la fórmula contra casos
 * donde el resultado se puede calcular a mano, y el contraste contra IDW sobre
 * la red y los pluviómetros reales.
 *
 *   npx tsx scripts/verificar-thiessen-areal.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  areaKm2, arealPorSuperficie, arealPorLongitud, tramosDe,
  type MedicionConNombre,
} from '../src/lib/thiessenAreal'
import { extraerTramos, lluviaPorTramo, type RedVial } from '../src/lib/redLluvia'
import { CONTORNO_CHACO } from '../src/data/contornoChaco'

let fallos = 0
const fmt = (v: unknown) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : JSON.stringify(v)

function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : JSON.stringify(valor) === JSON.stringify(esperado)
  if (!bien) fallos++
  const marca = bien ? '  ok  ' : '  ✗   '
  const cola = bien ? fmt(valor) : `${fmt(valor)}   (esperaba ${fmt(esperado)})`
  console.log(`${marca} ${que.padEnd(56)} ${cola}`)
}
const cerca = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol
const info = (s: string) => console.log(`       ${s}`)
const titulo = (s: string) => console.log(`\n— ${s} —`)

// ── Área ────────────────────────────────────────────────────────────────────
titulo('Área de figuras conocidas')

// Un grado de latitud son 111,32 km por construcción del plano
const cuadrado: [number, number][] = [[-27, -60], [-27, -59], [-26, -59], [-26, -60]]
const ladoLat = 111.32
const ladoLng = 111.32 * Math.cos((-26.5 * Math.PI) / 180)
ok('un cuadrado de 1°×1° da lado×lado', cerca(areaKm2(cuadrado), ladoLat * ladoLng, 1))
info(`${areaKm2(cuadrado).toFixed(0)} km² contra ${(ladoLat * ladoLng).toFixed(0)} esperados`)

// Con la MISMA latitud de referencia el triángulo es exactamente la mitad.
// Con la de cada figura no lo es, y eso no es un detalle: si cada zona se
// midiera en su propio plano, los pesos de una misma región no serían
// comparables entre sí.
const triangulo: [number, number][] = [[-27, -60], [-27, -59], [-26, -60]]
ok('el triángulo es la mitad del cuadrado, con la misma referencia',
  cerca(areaKm2(triangulo, -26.5), areaKm2(cuadrado, -26.5) / 2, 0.001))
ok('y con referencias distintas no lo es — por eso la referencia es obligatoria',
  !cerca(areaKm2(triangulo), areaKm2(cuadrado) / 2, 1))
ok('el sentido del anillo no cambia el área',
  cerca(areaKm2(cuadrado), areaKm2([...cuadrado].reverse() as [number, number][]), 0.001))
ok('menos de tres vértices no tiene área', areaKm2([[-27, -60], [-26, -59]]), 0)

const chacoLatLng = CONTORNO_CHACO.map(([lng, lat]) => [lat, lng] as [number, number])
const supChaco = areaKm2(chacoLatLng)
info(`el contorno del Chaco da ${supChaco.toFixed(0)} km²`)
// La superficie oficial de la provincia son 99.633 km²; el contorno está
// simplificado a 286 vértices, así que se acepta un 5 %.
ok('y se parece a la superficie de la provincia', cerca(supChaco, 99633, 99633 * 0.05))

// ── La fórmula ──────────────────────────────────────────────────────────────
titulo('La media ponderada, en casos de respuesta conocida')

const caja: [number, number][] = [[-60.5, -27.5], [-59.5, -27.5], [-59.5, -26.5], [-60.5, -26.5]]
const est = (lat: number, lng: number, mm: number, nombre: string): MedicionConNombre =>
  ({ lat, lng, mm, nombre })

const una = arealPorSuperficie([est(-27, -60, 42, 'Única')], caja)
ok('con una sola estación, la media es su medición', una.mm, 42)
ok('y aporta el 100 %', una.aportes[0].fraccion, 1)

// Dos estaciones simétricas: el bisector parte la caja al medio, mitad y mitad
const dos = arealPorSuperficie(
  [est(-27, -60.25, 10, 'Oeste'), est(-27, -59.75, 30, 'Este')], caja)
ok('dos estaciones simétricas parten la región al medio', cerca(dos.aportes[0].fraccion, 0.5, 0.01))
ok('y la media es el promedio simple', cerca(dos.mm!, 20, 0.5))
info(`${dos.mm} mm — pesos ${dos.aportes.map(a => a.fraccion.toFixed(3)).join(' / ')}`)

// Asimétricas: la que tiene más área tiene que tirar el promedio hacia su valor
const asim = arealPorSuperficie(
  [est(-27, -60.4, 0, 'Chica'), est(-27, -59.6, 100, 'Grande')], caja)
ok('la media queda entre las dos mediciones', asim.mm! > 0 && asim.mm! < 100)
ok('los pesos suman 1', cerca(asim.aportes.reduce((s, a) => s + a.fraccion, 0), 1, 0.001))

// Todas midiendo lo mismo: la media es ese valor, pesen lo que pesen
const iguales = arealPorSuperficie(
  [est(-27.2, -60.3, 17, 'A'), est(-26.8, -59.7, 17, 'B'), est(-27.4, -59.6, 17, 'C')], caja)
ok('si todas midieron lo mismo, la media es ese valor', cerca(iguales.mm!, 17, 0.001))

ok('sin estaciones no hay media', arealPorSuperficie([], caja).mm, null)
ok('y la cobertura es cero', arealPorSuperficie([], caja).cobertura, 0)

// Cobertura: una estación sola no puede cubrir una región enorme, porque el
// radio de búsqueda la recorta a un disco de 60 km
const lejos = arealPorSuperficie([est(-27, -60, 5, 'Sola')], chacoLatLng.map(
  ([lat, lng]) => [lng, lat] as [number, number]))
ok('una estación no cubre toda la provincia', lejos.cobertura < 0.2)
info(`cubre el ${(lejos.cobertura * 100).toFixed(1)} % — ${lejos.pesoTotal} km² de ${supChaco.toFixed(0)}`)
// El recorte del radio se hace con 64 rectas **tangentes**, así que el polígono
// queda circunscripto al círculo, no inscripto: pasa 60 km por 0,05 % en las
// esquinas y el área se va 0,08 % arriba del disco. Está medido y es lo que ya
// afirma verificar-thiessen.ts cuando reporta 60,183 km como vértice más lejano.
const disco = Math.PI * 60 * 60
const circunscripto = 64 * 60 * 60 * Math.tan(Math.PI / 64)
ok('lo cubierto es el polígono circunscripto al radio, no el disco exacto',
  cerca(lejos.pesoTotal, circunscripto, 2))
ok('y eso es menos de un 0,1 % por encima del disco', (circunscripto / disco - 1) < 0.001)
info(`${lejos.pesoTotal} km² contra ${disco.toFixed(0)} del disco exacto`)

// ── Contra la red real ──────────────────────────────────────────────────────
titulo('Contra la red vial y los pluviómetros reales')

const red = JSON.parse(
  readFileSync(join(process.cwd(), 'public/geo/geo_cc.json'), 'utf8')) as RedVial
const tramos = extraerTramos(red)
info(`${tramos.length.toLocaleString('es-AR')} tramos`)

// Un evento inventado pero con la geometría real de la red de la APA
const apa = JSON.parse(
  readFileSync(join(process.cwd(), '../docs/geo/localidades-apa.json'), 'utf8')) as
  { nombre: string; lat: number; lon: number }[]

const estaciones: MedicionConNombre[] = apa
  .map((e, i) => ({
    lat: Number(e.lat),
    lng: Number(e.lon),          // el archivo de la APA usa `lon`, no `lng`
    mm: 10 + (i * 37) % 60,      // valores reproducibles, no aleatorios
    nombre: String(e.nombre),
  }))
  .filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lng))

info(`${estaciones.length} estaciones con coordenada`)
ok('hay estaciones para probar', estaciones.length > 50)

const t0 = Date.now()
const porLongitud = arealPorLongitud(estaciones, tramos)
const msLong = Date.now() - t0
info(`media por longitud: ${porLongitud.mm} mm en ${msLong} ms`)

const porSuperficie = arealPorSuperficie(estaciones, CONTORNO_CHACO)
info(`media por superficie: ${porSuperficie.mm} mm`)

const minMed = Math.min(...estaciones.map(e => e.mm))
const maxMed = Math.max(...estaciones.map(e => e.mm))
ok('la media por longitud cae entre lo medido',
  porLongitud.mm! >= minMed && porLongitud.mm! <= maxMed)
ok('la media por superficie también',
  porSuperficie.mm! >= minMed && porSuperficie.mm! <= maxMed)

ok('los pesos por longitud suman 1',
  cerca(porLongitud.aportes.reduce((s, a) => s + a.fraccion, 0), 1, 0.001))
ok('los pesos por superficie también',
  cerca(porSuperficie.aportes.reduce((s, a) => s + a.fraccion, 0), 1, 0.001))

ok('la unidad del peso por longitud son km', porLongitud.unidad, 'km')
ok('la del peso por superficie son km²', porSuperficie.unidad, 'km²')

// La cobertura por longitud tiene que coincidir con el 1,8 % sin cobertura que
// ya reporta redLluvia: es el mismo radio sobre las mismas muestras.
const lluvia = lluviaPorTramo(tramos, estaciones)
let kmConDato = 0, kmTotal = 0
for (let i = 0; i < tramos.length; i++) {
  kmTotal += tramos[i].km
  if (lluvia[i].mm !== null) kmConDato += tramos[i].km * lluvia[i].cobertura
}
ok('la cobertura por longitud coincide con la que informa redLluvia',
  cerca(porLongitud.cobertura, kmConDato / kmTotal, 0.01))
info(`${(porLongitud.cobertura * 100).toFixed(1)} % contra ${(kmConDato / kmTotal * 100).toFixed(1)} %`)

// Los dos pesos tienen que dar parecido a escala provincial y no idéntico: si
// dieran igual, uno de los dos sobra.
const dif = Math.abs(porLongitud.mm! - porSuperficie.mm!)
ok('los dos pesos dan parecido a escala provincial', dif < 8)
ok('pero no idéntico — pesan universos distintos', dif > 0)
info(`difieren en ${dif.toFixed(2)} mm`)

// ── Por consorcio ───────────────────────────────────────────────────────────
titulo('Por consorcio')

const ccs = [...new Set(tramos.map(t => t.cc))].filter(n => Number.isFinite(n)).sort((a, b) => a - b)
info(`${ccs.length} consorcios con traza`)

const cc5 = arealPorLongitud(estaciones, tramosDe(tramos, 5))
ok('el CC 5 tiene media propia', cc5.mm !== null)
ok('y su peso total son sus kilómetros',
  cerca(cc5.pesoTotal, tramosDe(tramos, 5).reduce((s, t) => s + t.km, 0) * cc5.cobertura, 1))
info(`CC 5: ${cc5.mm} mm sobre ${cc5.pesoTotal} km, ${cc5.aportes.length} estación(es)`)

// Cobertura por consorcio.
//
// **No se compara contra la lista de siete de `redLluvia` y no sería válido
// hacerlo**: aquella sale de las 71 estaciones que informaron en un evento
// real, y acá se cargan las 111 del catálogo. Con otro conjunto de estaciones
// el hueco de cobertura es otro. Lo que sí tiene que valer siempre son las
// invariantes.
const porCC = ccs.map(cc => ({ cc, r: arealPorLongitud(estaciones, tramosDe(tramos, cc)) }))
const sinCobertura = porCC.filter(x => x.r.cobertura < 0.999).map(x => x.cc)
ok('ninguna cobertura se sale de [0, 1]',
  porCC.every(x => x.r.cobertura >= 0 && x.r.cobertura <= 1))
ok('todo consorcio con cobertura tiene media, y sin cobertura no tiene',
  porCC.every(x => (x.r.cobertura > 0) === (x.r.mm !== null)))
ok('con las 111 del catálogo, los descubiertos son un puñado', sinCobertura.length <= 10)
info(`descubiertos con el catálogo completo: ${sinCobertura.join(', ')}`)

// Un consorcio chico puede leer de una sola estación: ahí la media ES esa medición
const unaSola = ccs
  .map(cc => ({ cc, r: arealPorLongitud(estaciones, tramosDe(tramos, cc)) }))
  .find(x => x.r.aportes.length === 1)
if (unaSola) {
  ok('un consorcio dentro de una sola zona toma esa medición',
    cerca(unaSola.r.mm!, unaSola.r.aportes[0].mm, 0.001))
  info(`CC ${unaSola.cc} lee sólo de ${unaSola.r.aportes[0].nombre}`)
} else {
  info('ningún consorcio cae dentro de una sola zona en este evento')
}

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
