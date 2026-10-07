/**
 * Verifica la pestaña «Gran Resistencia» de Hidrología: el armado de un
 * escenario, el cruce de caminos contra las manchas y los archivos de capas.
 *
 * No hay un valor oficial contra el cual comparar una mancha —la zonificación
 * de la APA no está en un formato que se pueda cruzar—, así que se afirman
 * casos donde la respuesta se sabe sin calcular, y las invariantes de los
 * archivos reales: que las zonas del río estén anidadas, que cada capa tenga
 * los números de `capas-resumen.json`, y que ninguna mancha observada se use
 * para una altura menor que la que tenía el río ese día.
 *
 *   npx tsx scripts/verificar-inundaciones.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  escenarioRio, IndicePoligonos, recortar, viaContra, resumirVias, rutasDelRecuadro,
  nodosDelRecuadro, cotaMop, distKm, TECHO_ZONAS_M,
  type IndiceInundaciones, type MultiPoligono, type Via,
} from '../src/lib/inundaciones'

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

const DIR = join(__dirname, '..', 'public', 'geo', 'inundaciones')
const indice = JSON.parse(readFileSync(join(DIR, 'indice.json'), 'utf8')) as IndiceInundaciones
const capa = (id: string) => (JSON.parse(readFileSync(join(DIR, `${id}.json`), 'utf8')) as { coordinates: MultiPoligono }).coordinates

// ── Geometría, con casos que se saben sin calcular ──────────────────────────

titulo('Punto en polígono')

// Un cuadrado de 0,1° con un hueco de 0,02° en el medio, y otro cuadrado aparte
const cuadrado = (x: number, y: number, l: number): [number, number][] =>
  [[x, y], [x + l, y], [x + l, y + l], [x, y + l], [x, y]]
const mp: MultiPoligono = [[cuadrado(-59, -27.5, 0.1), cuadrado(-58.96, -27.46, 0.02)], [cuadrado(-58.8, -27.5, 0.05)]]
const idx = new IndicePoligonos(mp)
ok('adentro del cuadrado', idx.contiene(-27.48, -58.98))
ok('adentro del hueco no cuenta', idx.contiene(-27.45, -58.95), false)
ok('afuera', idx.contiene(-27.3, -58.98), false)
ok('en el segundo polígono', idx.contiene(-27.48, -58.78))
ok('entre los dos', idx.contiene(-27.48, -58.85), false)

titulo('Un camino contra una mancha')

// Una recta este-oeste que cruza el cuadrado de punta a punta por abajo del hueco
const recta: Via = { clase: 'provincial', nombre: 'RP 1', material: 'PAVIMENTO', puntos: [[-27.48, -59.1], [-27.48, -58.8]] }
const largo = distKm(recta.puntos[0], recta.puntos[1])
const r = viaContra(recta, [idx])
cerca('el largo es el de la recta', r.km, largo, 0.001)
// Atraviesa 0,1° del cuadrado grande; el chico empieza justo donde termina la recta
cerca('adentro queda un tercio: 0,1° de 0,3°', r.kmDentro / r.km, 1 / 3, 0.01)
ok('es un solo pedazo', r.partes.length, 1)
cerca('el pedazo empieza en el borde del cuadrado', r.partes[0][0][1], -59, 0.001)
cerca('y termina en el otro', r.partes[0][r.partes[0].length - 1][1], -58.9, 0.001)

// La misma recta, pasando por el hueco: se parte en dos
const porElHueco: Via = { ...recta, puntos: [[-27.45, -59.1], [-27.45, -58.8]] }
const h = viaContra(porElHueco, [idx])
ok('pasando por el hueco se parte en dos', h.partes.length, 2)
cerca('y pierde el ancho del hueco: 0,08° de 0,3°', h.kmDentro / h.km, 0.08 / 0.3, 0.01)

ok('sin manchas no hay nada adentro', viaContra(recta, []).kmDentro, 0)
// Dos manchas que se pisan no cuentan doble
cerca('dos capas iguales no duplican', viaContra(recta, [idx, idx]).kmDentro, r.kmDentro, 1e-9)

// Un puente: lo que va sobre agua permanente no es camino inundado. Con el
// cuadrado chico como «agua de siempre», una recta que cruza los dos sólo
// cuenta lo que pisa del grande.
const largoPuente: Via = { ...recta, puntos: [[-27.48, -59.1], [-27.48, -58.7]] }
const soloChico = new IndicePoligonos([mp[1]])
cerca('sin la excepción cuenta los dos cuadrados: 0,15° de 0,4°', viaContra(largoPuente, [idx]).kmDentro / viaContra(largoPuente, [idx]).km, 0.15 / 0.4, 0.01)
cerca('con el chico como agua permanente, sólo el grande: 0,1°', viaContra(largoPuente, [idx], [soloChico]).kmDentro / viaContra(largoPuente, [idx]).km, 0.1 / 0.4, 0.01)

const res = resumirVias([r, h, viaContra({ ...recta, clase: 'nacional', nombre: 'RN 11' }, [])])
ok('se agrupa por nombre', res.find(x => x.clase === 'provincial')!.rutas.length, 1)
cerca('y suma los pedazos', res.find(x => x.clase === 'provincial')!.kmDentro, r.kmDentro + h.kmDentro, 1e-9)
ok('una ruta sin nada adentro no se lista', res.find(x => x.clase === 'nacional')!.rutas.length, 0)

titulo('Recorte al recuadro')

const caja = { oeste: -59, este: -58.9, sur: -27.5, norte: -27.4 }
const zigzag: [number, number][] = [[-27.45, -59.05], [-27.45, -58.98], [-27.45, -58.95], [-27.45, -58.85], [-27.45, -58.93], [-27.45, -58.91]]
const partes = recortar(zigzag, caja)
ok('un camino que sale y vuelve son dos pedazos', partes.length, 2)
ok('ningún vértice queda afuera', partes.flat().every(p => p[1] >= caja.oeste && p[1] <= caja.este))
ok('un vértice suelto adentro no es un camino', recortar([[-27.45, -59.05], [-27.45, -58.95], [-27.45, -58.8]], caja).length, 0)

// ── El escenario ─────────────────────────────────────────────────────────────

titulo('Qué capas responden a una altura del río')

const e35 = escenarioRio(indice.capas, 3.5), e45 = escenarioRio(indice.capas, 4.5)
const e60 = escenarioRio(indice.capas, 6), e69 = escenarioRio(indice.capas, 6.9)
const e70 = escenarioRio(indice.capas, 7.05), e82 = escenarioRio(indice.capas, 8.17)
const e86 = escenarioRio(indice.capas, 8.59), e95 = escenarioRio(indice.capas, 9.5)

ok('con 3,50 m, la zona de menos de 4', e35.zona?.id, 'rio-4')
ok('con 4,50 m, la de 4 a 5', e45.zona?.id, 'rio-5')
ok('en el alerta (6,00), la de 6 a 7', e60.zona?.id, 'rio-7')
ok('y sin mancha de referencia: ninguna es de 6,00 o menos', e60.referencia, null)
ok('con 6,90 m, la de 2018 (6,53) y no la de 2023 (6,94)', e69.referencia?.id, 'obs-2018-01-27')
ok('con 7,05 m, la de 2023', e70.referencia?.id, 'obs-2023-11-12')
ok('con la altura de 1998 (8,17), la de febrero de 1983 (7,80)', e82.referencia?.id, 'obs-1983-02-28')
ok('con la de 1983 (8,59), la del 20/06/1983 (8,53)', e86.referencia?.id, 'obs-1983-06-20')
ok('bajo 7 m la zona alcanza', e69.sobreZonas, false)
ok('desde 7 m es un piso', e70.sobreZonas)
ok('8,53 no pasa lo observado', escenarioRio(indice.capas, 8.53).sobreObservado, false)
ok('8,59 sí: no hay imagen del máximo', e86.sobreObservado)
ok('9,50 también', e95.sobreObservado)
cerca('y dice cuánto falta', e95.faltaM!, 0.97, 0.001)

// La regla que no se puede romper: nunca una mancha de un río más alto que el pedido
let rotas = 0
for (let m = 2; m <= 9.5; m += 0.05) {
  const e = escenarioRio(indice.capas, m)
  if (e.referencia && e.referencia.alturaM! > m + 1e-9) rotas++
}
ok('de 2 a 9,5 m, ninguna referencia es de un río más alto', rotas, 0)
ok('el techo de las zonas es el de la última', TECHO_ZONAS_M, Math.max(...indice.capas.filter(c => c.grupo === 'rio').map(c => c.alturaM!)))
cerca('8,17 m en la escala es cota MOP 49,97, como dice la Res. 1111/98', cotaMop(8.17), 49.97, 0.001)

// ── Los archivos ─────────────────────────────────────────────────────────────

titulo('Las capas que se sirven')

ok('hay cuatro zonas del río', indice.capas.filter(c => c.grupo === 'rio').length, 4)
ok('y seis manchas observadas', indice.capas.filter(c => c.grupo === 'observada').length, 6)
ok('cada capa tiene su archivo, con los polígonos que dice el índice',
  indice.capas.every(c => capa(c.id).length === c.poligonos))
ok('todas las de agua traen su superficie',
  indice.capas.filter(c => c.grupo !== 'base').every(c => typeof c.km2 === 'number' && typeof c.construidoKm2 === 'number'))
ok('todo vértice cae dentro del recuadro, con medio km de margen',
  indice.capas.every(c => capa(c.id).every(pol => pol.every(an => an.every(([x, y]) =>
    x >= indice.recuadro.oeste - 0.005 && x <= indice.recuadro.este + 0.005
    && y >= indice.recuadro.sur - 0.005 && y <= indice.recuadro.norte + 0.005)))))

titulo('Las zonas del río están anidadas')

const zonas = indice.capas.filter(c => c.grupo === 'rio').sort((a, b) => a.alturaM! - b.alturaM!)
ok('la superficie crece con la altura', zonas.every((z, i) => i === 0 || z.km2! >= zonas[i - 1].km2!))
ok('lo construido adentro también', zonas.every((z, i) => i === 0 || z.construidoKm2! >= zonas[i - 1].construidoKm2!))
info(zonas.map(z => `hasta ${z.alturaM} m: ${z.km2} km²`).join(' · '))

// Punto por punto: lo que está en una zona está en la siguiente. Los polígonos
// salen de contornear una grilla de 90 m, así que en el borde puede haber una
// celda de diferencia; se tolera el 1 %.
const indices = zonas.map(z => new IndicePoligonos(capa(z.id)))
let adentro = 0, escapan = 0
for (let lat = indice.recuadro.sur; lat <= indice.recuadro.norte; lat += 0.004) {
  for (let lng = indice.recuadro.oeste; lng <= indice.recuadro.este; lng += 0.004) {
    for (let k = 0; k < indices.length - 1; k++) {
      if (indices[k].contiene(lat, lng)) { adentro++; if (!indices[k + 1].contiene(lat, lng)) escapan++ }
    }
  }
}
ok('menos del 1 % de los puntos de una zona falta en la siguiente', escapan / adentro < 0.01)
info(`${adentro} puntos probados, ${escapan} fuera`)

titulo('Lo que se sabe de las manchas sin mirarlas')

const idxDe = (id: string) => new IndicePoligonos(capa(id))
const j83 = idxDe('obs-1983-06-20'), n23 = idxDe('obs-2023-11-12'), urb = idxDe('urbano-hoy'), perm = idxDe('permanente')
/** Qué parte de un cuadrado de `lado` grados alrededor de un punto cae en una capa */
const fraccion = (i: IndicePoligonos, lat: number, lng: number, lado: number) => {
  let n = 0, si = 0
  for (let a = lat - lado / 2; a <= lat + lado / 2; a += lado / 20) for (let b = lng - lado / 2; b <= lng + lado / 2; b += lado / 20) { n++; if (i.contiene(a, b)) si++ }
  return si / n
}
// El casco fundacional, alrededor de la plaza 25 de Mayo, en cota 50 a 51. Se
// mira un cuadrado y no un punto: la plaza misma es arbolada y no cuenta como
// construida, que es justo lo que la clasificación tiene que hacer.
const casco = fraccion(urb, -27.4514, -58.9867, 0.02)
ok('el casco fundacional está construido en más de la mitad', casco > 0.5)
ok('y seco en la crecida de 2023', fraccion(n23, -27.4514, -58.9867, 0.02), 0)
info(`construido en el casco: ${(casco * 100).toFixed(0)} %`)
// El cauce principal del Paraná frente a Barranqueras. También un cuadrado, y
// sin pedir que sea todo agua: «permanente» es lo que quedó en la bajante de
// 2021, con el río en 0,38 m, cuando afloraron bancos en medio del cauce.
const cauce = fraccion(perm, -27.5, -58.85, 0.02)
ok('en el cauce del Paraná hay agua permanente', cauce > 0.25)
ok('y en el casco, ninguna', fraccion(perm, -27.4514, -58.9867, 0.02), 0)
info(`agua permanente en el cauce: ${(cauce * 100).toFixed(0)} % del cuadrado`)
const c83 = indice.capas.find(c => c.id === 'obs-1983-06-20')!, c23 = indice.capas.find(c => c.id === 'obs-2023-11-12')!
ok('en junio de 1983 hubo más del triple de agua que en 2023', c83.km2! > 3 * c23.km2!)
ok('de lo construido hoy, casi nada se moja con el río hasta 7 m', zonas[zonas.length - 1].construidoKm2! < 0.5)
// La isla frente a Barranqueras, entre el riacho y el cauce: valle activo
ok('el valle frente a Barranqueras estaba bajo agua en 1983', j83.contiene(-27.50, -58.90))
info(`junio de 1983: ${c83.km2} km² · noviembre de 2023: ${c23.km2} km²`)

titulo('El índice en grilla, contra la prueba exacta, sobre la mancha más pesada')

// La mancha de junio de 1983 es la más grande: 26 mil vértices y cientos de
// huecos. El índice la pinta en una grilla de 30 m; acá se lo compara contra
// el punto-en-polígono de manual.
const pesada = capa('obs-1983-06-20')
const exacto = (lat: number, lng: number) => {
  let dentro = false
  // Par-impar sobre todos los anillos de todos los polígonos: los huecos se restan solos
  for (const pol of pesada) for (const an of pol) {
    for (let i = 0, j = an.length - 1; i < an.length; j = i++) {
      const [xi, yi] = an[i], [xj, yj] = an[j]
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro
    }
  }
  return dentro
}
let iguales = 0, probados = 0
for (let lat = indice.recuadro.sur + 0.0011; lat < indice.recuadro.norte; lat += 0.0097) {
  for (let lng = indice.recuadro.oeste + 0.0013; lng < indice.recuadro.este; lng += 0.0089) {
    probados++
    if (j83.contiene(lat, lng) === exacto(lat, lng)) iguales++
  }
}
// Difieren sólo los puntos a menos de media celda (15 m) de un borde
ok('coincide con la prueba exacta en más del 98 % de los puntos', iguales / probados > 0.98)
info(`${probados} puntos, ${probados - iguales} distintos · ${pesada.reduce((s, p) => s + p.reduce((t, a) => t + a.length, 0), 0)} vértices`)
const t0 = performance.now()
let n = 0
for (let k = 0; k < 500_000; k++) if (j83.contiene(-27.6 + (k % 997) * 0.0003, -59.12 + (k % 1009) * 0.00033)) n++
const ms = performance.now() - t0
// Sin margen fino: lo que se afirma es el orden de magnitud. Cruzar la red del
// recuadro son unas diez mil consultas por capa.
ok('medio millón de consultas en menos de dos segundos', ms < 2000)
info(`${ms.toFixed(0)} ms, ${n} adentro`)

titulo('Rutas y pronóstico')

const rn = JSON.parse(readFileSync(join(DIR, '..', 'geo_rn.json'), 'utf8'))
const rp = JSON.parse(readFileSync(join(DIR, '..', 'geo_rp.json'), 'utf8'))
const rutas = rutasDelRecuadro(rn, rp, indice.recuadro)
const nombres = new Set(rutas.map(v => v.nombre))
ok('la RN 11 pasa por el recuadro', nombres.has('RN 11'))
ok('y la RN 16', nombres.has('RN 16'))
ok('los nombres van sin ceros a la izquierda', [...nombres].every(n => !/ 0\d/.test(n)))
ok('ninguna traza sale del recuadro', rutas.every(v => v.puntos.every(p =>
  p[0] >= indice.recuadro.sur && p[0] <= indice.recuadro.norte && p[1] >= indice.recuadro.oeste && p[1] <= indice.recuadro.este)))
info(`${rutas.length} pedazos · ${[...nombres].sort().join(', ')}`)

// La grilla del pronóstico, de 0,25°: sobre el recuadro caen dos o tres nodos
const grilla: { lat: number; lng: number }[] = []
for (let lat = -28; lat <= -26; lat += 0.25) for (let lng = -60; lng <= -58; lng += 0.25) grilla.push({ lat, lng })
const nodos = nodosDelRecuadro(grilla, indice.recuadro)
ok('entre dos y seis nodos del pronóstico representan al recuadro', nodos.length >= 2 && nodos.length <= 6)
ok('el de 27,5° S 59,0° O está', nodos.some(i => grilla[i].lat === -27.5 && grilla[i].lng === -59))

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien')
process.exit(fallos ? 1 : 0)
