/**
 * Verifica el cómputo de terraplén contra casos de respuesta conocida.
 *
 * Lo que más importa acá **no son los números sino que los tres volúmenes no se
 * mezclen**. Compactado, en banco y esponjado son distintos, crecen en ese
 * orden, y el peso sale del de banco. Confundirlos no rompe nada: devuelve un
 * número plausible y equivocado, que después se presupuesta.
 *
 *   npx tsx scripts/verificar-terraplen.ts
 */
import {
  computarTerraplen, viajes, ENTRADA_POR_DEFECTO, CAPACIDADES_T,
  computarObra, computarTramo, SECCION_POR_DEFECTO,
  type EntradaTerraplen, type TramoTerraplen,
} from '../src/lib/terraplenCalculo'

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

// ── Geometría ───────────────────────────────────────────────────────────────
titulo('Geometría de la sección')

// Trapecio a mano: Bc = 4, H = 2, m = 1.5 → Bb = 4 + 2·2·1,5 = 10; A = (4+10)/2·2 = 14
const g = computarTerraplen({ ...ENTRADA_POR_DEFECTO, H: 2, Bc: 4, m: 1.5, L: 100, Fc: 100, Fe: 0, rho: 1 })
ok('el ancho de base suma el talud de los dos lados', cerca(g.Bb, 10))
ok('el área es la del trapecio', cerca(g.A, 14))
ok('el volumen compactado es área por longitud', cerca(g.Vneto, 1400))

// Talud vertical: no hay ensanche, la sección es un rectángulo
const vert = computarTerraplen({ ...ENTRADA_POR_DEFECTO, m: 0, H: 2, Bc: 5, L: 10, Fc: 100, Fe: 0, rho: 1 })
ok('con talud 0 la sección es rectangular', cerca(vert.Bb, 5) && cerca(vert.A, 10))

// Altura cero: no hay terraplén
const plano = computarTerraplen({ ...ENTRADA_POR_DEFECTO, H: 0 })
ok('sin altura no hay sección ni volumen', plano.A === 0 && plano.Vneto === 0 && plano.W === 0)

// ── Los tres volúmenes ──────────────────────────────────────────────────────
titulo('Los tres volúmenes son distintos y crecen en orden')

const e: EntradaTerraplen = { L: 1000, H: 1.5, Bc: 4, m: 1.5, rho: 1.8, Fe: 20, Fc: 90 }
const c = computarTerraplen(e)
info(`compactado ${c.Vneto.toFixed(1)} · banco ${c.Vbanco.toFixed(1)} · esponjado ${c.Vesp.toFixed(1)} m³`)

ok('el de banco es mayor que el compactado', c.Vbanco > c.Vneto)
ok('el esponjado es mayor que el de banco', c.Vesp > c.Vbanco)
ok('banco = compactado / (Fc/100)', cerca(c.Vbanco, c.Vneto / 0.9, 1e-9))
ok('esponjado = banco · (1 + Fe/100)', cerca(c.Vesp, c.Vbanco * 1.2, 1e-9))

// Con compactación 100 % y esponjamiento 0 los tres coinciden: es el control de
// que las conversiones no están aplicadas al revés.
const neutro = computarTerraplen({ ...e, Fc: 100, Fe: 0 })
ok('con Fc=100 y Fe=0 los tres volúmenes coinciden',
  cerca(neutro.Vneto, neutro.Vbanco) && cerca(neutro.Vbanco, neutro.Vesp))

/*
 * Ésta es la que atrapa el error clásico. Si la compactación se aplicara como
 * multiplicación en vez de división, el volumen en banco daría MENOR que el
 * compactado — o sea, habría que extraer menos suelo del que ocupa el
 * terraplén terminado, que es imposible.
 */
ok('más compactación exigida ⇒ más material en banco',
  computarTerraplen({ ...e, Fc: 85 }).Vbanco > computarTerraplen({ ...e, Fc: 95 }).Vbanco)

// ── El peso ─────────────────────────────────────────────────────────────────
titulo('El peso sale del volumen en banco')

ok('W = Vbanco · ρ', cerca(c.W, c.Vbanco * e.rho, 1e-9))
ok('y NO del compactado', !cerca(c.W, c.Vneto * e.rho, 1e-6))
ok('ni del esponjado', !cerca(c.W, c.Vesp * e.rho, 1e-6))
info(`${c.W.toFixed(1)} t — contra ${(c.Vneto * e.rho).toFixed(1)} si se usara el compactado`)

ok('duplicar la densidad duplica el peso',
  cerca(computarTerraplen({ ...e, rho: e.rho * 2 }).W, c.W * 2, 1e-9))
ok('duplicar la longitud duplica el peso',
  cerca(computarTerraplen({ ...e, L: e.L * 2 }).W, c.W * 2, 1e-9))

// ── División por cero ───────────────────────────────────────────────────────
titulo('Compactación cero no propaga infinito')

const cero = computarTerraplen({ ...e, Fc: 0 })
ok('el volumen en banco no es infinito', Number.isFinite(cero.Vbanco), true)
ok('devuelve cero', cero.Vbanco === 0 && cero.W === 0)
info('un Infinity acá se guardaría como presupuesto sin que nadie lo note')

// ── Viajes ──────────────────────────────────────────────────────────────────
titulo('Viajes de camión')

ok('redondea hacia arriba: medio viaje no existe', viajes(31, 15), 3)
ok('una carga exacta no agrega un viaje', viajes(30, 15), 2)
ok('sin peso no hay viajes', viajes(0, 15), 0)
ok('capacidad cero no divide por cero', viajes(100, 0), 0)
ok('menos capacidad ⇒ más viajes', viajes(c.W, 15) > viajes(c.W, 20))
info(`${CAPACIDADES_T.map(x => `${x}t: ${viajes(c.W, x)}`).join(' · ')}`)

// ── La entrada por defecto ──────────────────────────────────────────────────
titulo('La entrada por defecto da un resultado sensato')

const d = computarTerraplen(ENTRADA_POR_DEFECTO)
info(`${ENTRADA_POR_DEFECTO.L} m · H ${ENTRADA_POR_DEFECTO.H} m → ${d.W.toFixed(0)} t`)
ok('la sección es positiva', d.A > 0)
ok('el peso es positivo', d.W > 0)
ok('el orden de magnitud es de obra vial, no de un rascacielos', d.W > 100 && d.W < 100_000)

// ── Obra por tramos ─────────────────────────────────────────────────────────
titulo('La obra se suma tramo por tramo')

const tramo = (id: string, H: number, l_m: number): TramoTerraplen =>
  ({ id, nombre: id, H, l_m, coords: null, orden: 0, color: null })

const sec = SECCION_POR_DEFECTO
const dos = computarObra(sec, [tramo('a', 1, 500), tramo('b', 3, 500)])

ok('la longitud total es la suma de las longitudes', dos.L_total, 1000)
ok('el volumen total es la suma de los volúmenes',
  cerca(dos.Vneto, computarTramo(sec, tramo('a', 1, 500)).Vneto
                 + computarTramo(sec, tramo('b', 3, 500)).Vneto, 1e-9))

/*
 * La que justifica todo el diseño.
 *
 * Con la sección trapecial el volumen crece con el CUADRADO de la altura, por
 * el ensanche del talud. Así que computar una sola vez con la altura media y la
 * longitud total NO da lo mismo que sumar tramo por tramo: subestima.
 *
 * Si algún día alguien "simplifica" el motor promediando primero, esta prueba
 * es la que lo detiene.
 */
const promediando = computarTerraplen({ ...sec, H: dos.H_media, L: dos.L_total })
ok('promediar la altura primero NO da lo mismo', !cerca(promediando.Vneto, dos.Vneto, 1))
ok('y subestima el volumen', promediando.Vneto < dos.Vneto)
info(`sumando ${dos.Vneto.toFixed(0)} m³ contra ${promediando.Vneto.toFixed(0)} promediando`
  + ` — ${((1 - promediando.Vneto / dos.Vneto) * 100).toFixed(1)} % menos`)

titulo('Altura media y tramos sin dibujar')

ok('la altura media se pesa por longitud, no a secas',
  cerca(computarObra(sec, [tramo('a', 1, 900), tramo('b', 5, 100)]).H_media, 1.4, 1e-9))
info('a secas daría 3,0; pesada da 1,4 porque el tramo alto mide 100 m de 1000')

const conVacio = computarObra(sec, [tramo('a', 2, 500), tramo('b', 2, 0)])
ok('un tramo sin dibujar se cuenta aparte', conVacio.sinDibujar, 1)
ok('y no aporta longitud ni volumen', conVacio.L_total === 500
  && cerca(conVacio.Vneto, computarTramo(sec, tramo('a', 2, 500)).Vneto, 1e-9))

ok('una obra sin tramos da todo en cero',
  computarObra(sec, []).L_total === 0 && computarObra(sec, []).W === 0)

titulo('El ancho de banda del mapa')

const bajo = computarTramo(sec, tramo('a', 1, 100))
const alto = computarTramo(sec, tramo('b', 3, 100))
ok('es el ancho de base, no el de corona', cerca(bajo.anchoBanda, bajo.Bb) && bajo.anchoBanda > sec.Bc)
ok('y crece con la altura del tramo', alto.anchoBanda > bajo.anchoBanda)
info(`H 1 m → ${bajo.anchoBanda.toFixed(2)} m de huella · H 3 m → ${alto.anchoBanda.toFixed(2)} m`)

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
