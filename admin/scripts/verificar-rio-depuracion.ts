/**
 * Verifica el filtro de lecturas implausibles del río.
 *
 * **El caso de prueba es real, no inventado.** Son las observaciones que el INA
 * publicó para Empedrado entre el 22 y el 28 de septiembre de 2026: las
 * mediciones normales de las 03:00 UTC, en torno a 4 m, y un lote cargado el
 * 28/09 a las 16:34 con cinco ceros exactos y dos saltos a 12 m. Con ese lote
 * adentro, la pantalla anunció que Empedrado había superado su nivel de
 * evacuación — una falsa alarma en la única pantalla que alguien mira para
 * decidir.
 *
 * Lo que este test defiende no es un número sino una postura: **ante una lectura
 * que no puede ser cierta, no usarla y decirlo.**
 *
 *   npx tsx scripts/verificar-rio-depuracion.ts
 */
import { depurar, estadoDe, ESTACIONES, SALTO_MAX_M, type LecturaRio } from '../src/lib/ina'

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

const L = (fecha: string, m: number): LecturaRio => ({ fecha, m })

// ── El caso real ────────────────────────────────────────────────────────────
titulo('Empedrado, 22 al 28/09/2026 — lo que publicó el INA')

const empedrado: LecturaRio[] = [
  L('2026-09-22T03:00:00.000Z', 4.03),
  L('2026-09-22T12:00:00.000Z', 0),      // ← lote del 28/09 16:34
  L('2026-09-23T03:00:00.000Z', 4.20),
  L('2026-09-23T12:00:00.000Z', 0),
  L('2026-09-24T03:00:00.000Z', 4.23),
  L('2026-09-24T12:00:00.000Z', 0),
  L('2026-09-25T03:00:00.000Z', 4.28),
  L('2026-09-25T12:00:00.000Z', 0),
  L('2026-09-26T03:00:00.000Z', 4.18),
  L('2026-09-26T12:00:00.000Z', 0),
  L('2026-09-27T03:00:00.000Z', 4.10),
  L('2026-09-27T12:00:00.000Z', 12.33),
  L('2026-09-28T03:00:00.000Z', 3.97),
  L('2026-09-28T12:00:00.000Z', 12.44),
]

const d = depurar(empedrado)
info(`${d.validas.length} válidas · ${d.descartadas.length} descartadas de ${empedrado.length}`)

ok('quedan las siete mediciones de las 03:00', d.validas.length, 7)
ok('se descartan las siete del lote de las 12:00', d.descartadas.length, 7)
ok('ninguna válida es un cero', d.validas.every(l => l.m > 0))
ok('ninguna válida pasa los 5 m', d.validas.every(l => l.m < 5))
ok('las descartadas son los ceros y los doces',
  d.descartadas.every(l => l.m === 0 || l.m > 12))

/*
 * La que importa de verdad: lo que termina diciendo la pantalla.
 *
 * El estado sale de la ÚLTIMA lectura, así que una sola basura al final cambia
 * el cartel entero. Con el lote adentro Empedrado figuraba sobre nivel de
 * evacuación; con el filtro, normal — que es donde realmente está.
 */
const emp = ESTACIONES.find(e => e.nombre === 'Empedrado')!
const ultimaCruda = empedrado[empedrado.length - 1]
const ultimaLimpia = d.validas[d.validas.length - 1]

ok('sin filtrar, la pantalla decía evacuación', estadoDe(emp, ultimaCruda.m), 'evacuacion')
ok('filtrando, dice normal', estadoDe(emp, ultimaLimpia.m), 'normal')
ok('y la altura que muestra es la medida', ultimaLimpia.m, 3.97)
info(`${ultimaCruda.m} m contra ${ultimaLimpia.m} m — alerta de esta estación: ${emp.alerta} m`)

// ── Lo que NO debe descartar ────────────────────────────────────────────────
titulo('Una crecida real pasa entera')

/*
 * Una crecida del Paraná sube del orden de 10 a 30 cm por día. Ésta sube 25 cm
 * diarios durante diez días y cruza los dos umbrales: el filtro no puede
 * tocarla. Descartar una lectura real en un evento extremo sería mucho peor que
 * dejar pasar una basura chica — la basura se lee como ruido, la lectura
 * descartada se lee como que no pasó nada.
 */
const crecida = Array.from({ length: 12 }, (_, i) =>
  L(`2026-01-${String(i + 1).padStart(2, '0')}T03:00:00.000Z`, 5 + i * 0.25))

const c = depurar(crecida)
ok('no descarta ninguna lectura de la crecida', c.descartadas.length, 0)
ok('y llega hasta el final', c.validas[c.validas.length - 1].m, 7.75)
info(`de ${crecida[0].m} a ${crecida[crecida.length - 1].m} m en ${crecida.length} días`)

titulo('El umbral es el que se documentó')

const justoAbajo = depurar([L('a', 4), L('b', 4 + SALTO_MAX_M - 0.01)])
ok('un salto menor al umbral pasa', justoAbajo.descartadas.length, 0)
const justoArriba = depurar([L('a', 4), L('b', 4 + SALTO_MAX_M + 0.01)])
ok('un salto mayor al umbral no pasa', justoArriba.descartadas.length, 1)

titulo('La referencia inicial es la mediana, no la primera lectura')

/*
 * Si la serie arrancara encadenando desde la primera lectura, una basura en la
 * primera posición se aceptaría y se descartaría todo lo bueno que viene
 * después. La mediana no se mueve porque unas pocas lecturas sean disparatadas,
 * que es justamente la propiedad que hace falta.
 */
const malaPrimero = depurar([
  L('a', 99), L('b', 4.0), L('c', 4.1), L('d', 4.2), L('e', 4.1), L('f', 4.0),
])
ok('la basura inicial se descarta', malaPrimero.descartadas.length, 1)
ok('y el resto de la serie sobrevive', malaPrimero.validas.length, 5)
info('encadenando desde la primera habría quedado 1 válida y 5 descartadas')

titulo('Casos de borde')

ok('una serie vacía no rompe', depurar([]).validas.length, 0)
ok('una sola lectura se acepta', depurar([L('a', 4.2)]).validas.length, 1)

/*
 * Una altura negativa NO se descarta por negativa. En bajantes extremas el
 * Paraná ha marcado valores bajo el cero de escala, y ese es exactamente el
 * otro evento que esta pantalla tiene que poder mostrar.
 */
const bajante = depurar([L('a', 0.4), L('b', 0.1), L('c', -0.2), L('d', -0.4)])
ok('una bajante bajo cero de escala pasa entera', bajante.descartadas.length, 0)

ok('lo descartado se devuelve, no se pierde',
  d.validas.length + d.descartadas.length, empedrado.length)

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
