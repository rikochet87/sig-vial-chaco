/**
 * Verifica el cómputo de excavación contra casos de respuesta conocida.
 *
 * Lo que más importa acá **no son los números sino tres confusiones que dan un
 * resultado plausible y equivocado**:
 *
 * - Que el peso salga del volumen esponjado en vez del natural. El material no
 *   pesa más por estar suelto, ocupa más.
 * - Que el modo área aplique talud. El polígono dibujado ya es lo que se
 *   excava; meter talud duplica un efecto que la traza contiene.
 * - Que alguien "simplifique" el modo lineal promediando la profundidad. El
 *   trapecio hace que el volumen crezca con el cuadrado de la profundidad.
 *
 *   npx tsx scripts/verificar-excavacion.ts
 */
import {
  perfilDe, computarTramo, computarRecinto, computarObraLineal, computarObraArea,
  geometriaAnillo, viajes, SECCION_POR_DEFECTO, CAPACIDADES_T,
  type SeccionExcavacion, type TramoExcavacion, type RecintoExcavacion,
} from '../src/lib/excavacionCalculo'

let fallos = 0
const fmt = (v: unknown) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : JSON.stringify(v)

function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(58)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}
const cerca = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol
const info = (s: string) => console.log(`       ${s}`)
const titulo = (s: string) => console.log(`\n— ${s} —`)

const sec: SeccionExcavacion = { Bf: 3, m: 1, rho: 1.8, Fe: 25 }
const tramo = (id: string, H: number, l_m: number): TramoExcavacion =>
  ({ id, nombre: id, H, l_m, coords: null, orden: 0, color: null })
const recinto = (id: string, H: number, area_ha: number): RecintoExcavacion =>
  ({ id, nombre: id, H, area_ha, coords: null, orden: 0, color: null })

// ── Geometría ───────────────────────────────────────────────────────────────
titulo('El trapecio, y que va al revés que el terraplén')

// A mano: Bf = 4, H = 2, m = 1,5 → Bb = 4 + 2·2·1,5 = 10; A = (4+10)/2·2 = 14
const g = perfilDe({ ...sec, Bf: 4, m: 1.5 }, 2)
ok('el ancho de boca suma el talud de los dos lados', cerca(g.Bb, 10))
ok('el área es la del trapecio', cerca(g.A, 14))

ok('la boca es más ancha que el fondo', perfilDe(sec, 2).Bb > sec.Bf)
info('en terraplén el ancho de corona es el de ARRIBA; acá el de fondo es el de ABAJO')

const vert = perfilDe({ ...sec, m: 0, Bf: 5 }, 2)
ok('con talud 0 la sección es rectangular', cerca(vert.Bb, 5) && cerca(vert.A, 10))

const plano = perfilDe(sec, 0)
ok('sin profundidad no hay sección', plano.A === 0)

// ── Los volúmenes ───────────────────────────────────────────────────────────
titulo('Dos volúmenes, no tres')

const c = computarTramo(sec, tramo('a', 2, 1000))
info(`corte ${c.Vcorte.toFixed(1)} · esponjado ${c.Vesp.toFixed(1)} m³ · ${c.W.toFixed(1)} t`)

ok('el esponjado es mayor que el de corte', c.Vesp > c.Vcorte)
ok('esponjado = corte · (1 + Fe/100)', cerca(c.Vesp, c.Vcorte * 1.25, 1e-9))

/*
 * Acá no hay compactación, y eso es lo que separa a excavación de terraplén: el
 * material se saca de donde está, así que el volumen de corte YA es el volumen
 * en banco. Si alguien agregara un factor de compactación, este test no lo
 * atraparía — pero el de abajo, que fija el peso contra el corte, sí.
 */
const neutro = computarTramo({ ...sec, Fe: 0 }, tramo('a', 2, 1000))
ok('con Fe=0 el esponjado coincide con el corte', cerca(neutro.Vcorte, neutro.Vesp))

titulo('El peso sale del volumen natural')

ok('W = Vcorte · ρ', cerca(c.W, c.Vcorte * sec.rho, 1e-9))
ok('y NO del esponjado', !cerca(c.W, c.Vesp * sec.rho, 1e-6))
info(`${c.W.toFixed(1)} t — contra ${(c.Vesp * sec.rho).toFixed(1)} si se usara el esponjado`)

ok('el esponjamiento no cambia el peso',
  cerca(computarTramo({ ...sec, Fe: 60 }, tramo('a', 2, 1000)).W, c.W, 1e-9))
info('el material no pesa más por estar suelto: ocupa más')

ok('duplicar la densidad duplica el peso',
  cerca(computarTramo({ ...sec, rho: 3.6 }, tramo('a', 2, 1000)).W, c.W * 2, 1e-9))

// ── Modo lineal por tramos ──────────────────────────────────────────────────
titulo('La obra lineal se suma tramo por tramo')

const dos = computarObraLineal(sec, [tramo('a', 1, 500), tramo('b', 3, 500)])

ok('la longitud total es la suma de las longitudes', dos.L_total, 1000)
ok('el volumen total es la suma de los volúmenes',
  cerca(dos.Vcorte, computarTramo(sec, tramo('a', 1, 500)).Vcorte
                  + computarTramo(sec, tramo('b', 3, 500)).Vcorte, 1e-9))

/*
 * La que justifica el diseño, igual que en terraplén: con sección trapecial el
 * volumen crece con el CUADRADO de la profundidad, así que computar una sola vez
 * con la profundidad media y la longitud total NO da lo mismo que sumar tramo
 * por tramo. Subestima.
 */
const promediando = perfilDe(sec, dos.H_media).A * dos.L_total
ok('promediar la profundidad primero NO da lo mismo', !cerca(promediando, dos.Vcorte, 1))
ok('y subestima el volumen', promediando < dos.Vcorte)
info(`sumando ${dos.Vcorte.toFixed(0)} m³ contra ${promediando.toFixed(0)} promediando`
  + ` — ${((1 - promediando / dos.Vcorte) * 100).toFixed(1)} % menos`)

ok('la profundidad media se pesa por longitud, no a secas',
  cerca(computarObraLineal(sec, [tramo('a', 1, 900), tramo('b', 5, 100)]).H_media, 1.4, 1e-9))
info('a secas daría 3,0; pesada da 1,4 porque el tramo hondo mide 100 m de 1000')

const conVacio = computarObraLineal(sec, [tramo('a', 2, 500), tramo('b', 2, 0)])
ok('un tramo sin dibujar se cuenta aparte', conVacio.sinDibujar, 1)
ok('y no aporta longitud ni volumen', conVacio.L_total === 500
  && cerca(conVacio.Vcorte, computarTramo(sec, tramo('a', 2, 500)).Vcorte, 1e-9))

ok('una obra sin tramos da todo en cero',
  computarObraLineal(sec, []).L_total === 0 && computarObraLineal(sec, []).W === 0)

// ── Modo área ───────────────────────────────────────────────────────────────
titulo('La geometría del recinto sale del polígono, no de un número suelto')

/*
 * Un rectángulo de 200 × 100 m, cerca de Resistencia. Está elegido para que
 * TODO se pueda verificar a mano: área 20.000 m², perímetro 600 m, y como los
 * cuatro ángulos son rectos, Σ cot(θ/2) = 4 · cot(45°) = 4.
 *
 * Ese 4 es lo que hace exacta la reducción del área al aplicar el talud:
 * (200−2d)(100−2d) = 20.000 − 600·d + 4·d². Sin el término de esquinas el
 * fondo saldría más chico de lo que es.
 */
const LAT0 = -27.45, LNG0 = -58.98
const mPorLat = 6_371_008.8 * Math.PI / 180
const mPorLng = mPorLat * Math.cos(LAT0 * Math.PI / 180)
const rect = (anchoM: number, altoM: number): [number, number][] => [
  [LAT0, LNG0],
  [LAT0, LNG0 + anchoM / mPorLng],
  [LAT0 + altoM / mPorLat, LNG0 + anchoM / mPorLng],
  [LAT0 + altoM / mPorLat, LNG0],
]

const geo = geometriaAnillo(rect(200, 100))
ok('el área del rectángulo', Math.round(geo.area_m2), 20_000)
ok('el perímetro del rectángulo', Math.round(geo.perim_m), 600)
ok('Σ cot(θ/2) de cuatro ángulos rectos da 4', cerca(geo.sumaCot, 4, 1e-6))
info('ese término no es un refinamiento: es el 4·d² de (200−2d)(100−2d)')

ok('un anillo de menos de tres puntos no rompe', geometriaAnillo([[0, 0], [1, 1]]).area_m2, 0)

titulo('El recinto es un tronco de pirámide, y el polígono es la BOCA')

const conTraza = (H: number, coords: [number, number][]): RecintoExcavacion =>
  ({ id: 'p', nombre: 'p', H, area_ha: 0, coords, orden: 0, color: null })

const sinTalud = computarRecinto(sec, conTraza(2, rect(200, 100)), 0)
ok('sin talud vuelve a ser un prisma: A · H', cerca(sinTalud.Vcorte, 40_000, 1))
ok('y el fondo mide lo mismo que la boca', cerca(sinTalud.areaFondo_m2, sinTalud.area_m2, 1))

const conTalud = computarRecinto(sec, conTraza(2, rect(200, 100)), 1.5)
/*
 * d = H·m = 3 m. Fondo = (200−6)(100−6) = 194 · 94 = 18.236 m².
 * V = H/3 · (A + Af + √(A·Af)) = 2/3 · (20.000 + 18.236 + √(20.000·18.236))
 */
const Af = 194 * 94
const Vesperado = (2 / 3) * (20_000 + Af + Math.sqrt(20_000 * Af))
ok('el fondo es la boca reducida por el talud', Math.round(conTalud.areaFondo_m2), Af)
ok('el volumen es el del prismatoide', cerca(conTalud.Vcorte, Vesperado, 2))
ok('y es MENOR que el del prisma recto', conTalud.Vcorte < sinTalud.Vcorte)
info(`${conTalud.Vcorte.toFixed(0)} m³ contra ${sinTalud.Vcorte.toFixed(0)} tratándolo como prisma`
  + ` — ${((1 - conTalud.Vcorte / sinTalud.Vcorte) * 100).toFixed(1)} % menos`)

ok('más talud, menos volumen',
  computarRecinto(sec, conTraza(2, rect(200, 100)), 3).Vcorte < conTalud.Vcorte)

titulo('Cuando el talud cierra el fondo')

/*
 * El lado corto mide 100 m, así que con talud 1,5 el fondo se cierra cuando
 * 2·d = 100, o sea d = 50 m, o sea H = 50/1,5 = 33,33 m. Un pozo más hondo que
 * eso no se puede hacer con ese talud sin ensanchar la boca: es un dato del
 * proyecto, no un error del cálculo.
 */
const cierre = computarRecinto(sec, conTraza(2, rect(200, 100)), 1.5)
ok('avisa a qué profundidad se cerraría', cerca(cierre.profundidadCierre ?? 0, 50 / 1.5, 0.01))
ok('a 2 m todavía no está cerrado', cierre.fondoCerrado, false)

const pozoHondo = computarRecinto(sec, conTraza(40, rect(200, 100)), 1.5)
ok('a 40 m sí está cerrado', pozoHondo.fondoCerrado, true)
ok('el fondo es cero', pozoHondo.areaFondo_m2, 0)
ok('y entonces el cuerpo es una pirámide: V = A·H/3',
  cerca(pozoHondo.Vcorte, pozoHondo.area_m2 * 40 / 3, 1e-6))
ok('el volumen sigue siendo finito y positivo', pozoHondo.Vcorte > 0 && Number.isFinite(pozoHondo.Vcorte))

titulo('Los recintos se suman')

const obraA = computarObraArea(sec, [
  conTraza(2, rect(200, 100)), conTraza(3, rect(100, 100)),
], 1.5)
ok('el volumen total es la suma',
  cerca(obraA.Vcorte,
    computarRecinto(sec, conTraza(2, rect(200, 100)), 1.5).Vcorte
    + computarRecinto(sec, conTraza(3, rect(100, 100)), 1.5).Vcorte, 1e-6))
ok('el peso sale del volumen natural', cerca(obraA.W, obraA.Vcorte * sec.rho, 1e-6))
ok('ninguno quedó cerrado en este caso', obraA.algunoCerrado, false)

/*
 * Con talud, el volumen NO es lineal en la profundidad: el fondo se achica a
 * medida que se baja. Así que promediar profundidades tampoco da lo mismo acá,
 * aunque la geometría sea otra que en el modo lineal.
 */
const dosPozos = computarObraArea(sec, [
  conTraza(1, rect(200, 100)), conTraza(3, rect(200, 100)),
], 1.5)
const promediado = computarRecinto(sec, conTraza(2, rect(200, 100)), 1.5).Vcorte * 2
ok('promediar la profundidad tampoco da lo mismo con talud',
  !cerca(dosPozos.Vcorte, promediado, 1))
info(`sumando ${dosPozos.Vcorte.toFixed(0)} m³ contra ${promediado.toFixed(0)} promediando`)

const sinTraza = computarObraArea(sec, [
  conTraza(2, rect(200, 100)),
  { id: 'b', nombre: 'b', H: 2, area_ha: 0, coords: null, orden: 1, color: null },
], 1.5)
ok('un recinto sin dibujar se cuenta aparte', sinTraza.sinDibujar, 1)
ok('y no aporta volumen',
  cerca(sinTraza.Vcorte, computarRecinto(sec, conTraza(2, rect(200, 100)), 1.5).Vcorte, 1e-6))

// ── Transporte ──────────────────────────────────────────────────────────────
titulo('Viajes de camión')

ok('redondea hacia arriba: medio viaje no existe', viajes(31, 15), 3)
ok('una carga exacta no agrega un viaje', viajes(30, 15), 2)
ok('sin peso no hay viajes', viajes(0, 15), 0)
ok('capacidad cero no divide por cero', viajes(100, 0), 0)
info(`${CAPACIDADES_T.map(x => `${x}t: ${viajes(c.W, x)}`).join(' · ')}`)

// ── La sección por defecto ──────────────────────────────────────────────────
titulo('La sección por defecto da un resultado sensato')

const d = computarTramo(SECCION_POR_DEFECTO, tramo('a', 2, 500))
info(`500 m · H 2 m → ${d.Vcorte.toFixed(0)} m³ · ${d.W.toFixed(0)} t`)
ok('la sección es positiva', d.A > 0)
ok('el orden de magnitud es de obra vial', d.W > 100 && d.W < 100_000)

titulo('El ancho de banda del mapa')

const bajo = computarTramo(sec, tramo('a', 1, 100))
const hondo = computarTramo(sec, tramo('b', 3, 100))
ok('es el ancho de boca, no el de fondo', cerca(bajo.anchoBanda, bajo.Bb) && bajo.anchoBanda > sec.Bf)
ok('y crece con la profundidad del tramo', hondo.anchoBanda > bajo.anchoBanda)
info(`H 1 m → ${bajo.anchoBanda.toFixed(2)} m de boca · H 3 m → ${hondo.anchoBanda.toFixed(2)} m`)

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
