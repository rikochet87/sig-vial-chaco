/**
 * Verifica el tiempo de traslado de la crecida entre las estaciones del tramo.
 *
 * Dos partes. La primera usa series armadas a mano donde el desfase **se sabe
 * sin calcular** —una serie y la misma corrida tres días—, y es la que atrapa
 * un signo dado vuelta o un índice corrido. La segunda corre sobre la serie
 * real congelada en `public/rio/tramo_diario.json`, sin salir a la red, y
 * afirma lo que tiene que cumplir cualquier río: que aguas arriba llega antes,
 * aguas abajo después, y en orden.
 *
 * **La referencia es Barranqueras** desde el 08/10/2026 (antes, Corrientes).
 *
 * Al final van los afluentes —tres escalas del río Paraguay y una del
 * Bermejo—, que no son del tramo y a los que se les mide otra cosa: el aporte,
 * no el traslado.
 *
 * No hay un valor oficial del traslado contra el cual comparar. Lo que sí hay
 * es geografía: Corrientes está enfrente de Barranqueras, así que su desfase
 * tiene que ser cero. Si eso no da cero, las fechas de alguna serie están
 * corridas.
 *
 *   npx tsx scripts/verificar-rio-traslado.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  correlacionCambios, desfasePorCambios, desfasePorPicos, trasladoDelTramo,
  trasladoDelParaguay, trasladoDelBermejo, aporteNoExplicado, cambioEn,
  DESFASE_MIN, DESFASE_MAX, ESTACION_REFERENCIA, ESTACION_CONTROL, ESTACION_ARRIBA,
  type TramoDiario,
} from '../src/lib/rioTraslado'
import { ESCALAS_PARANA, ESTACIONES_PARAGUAY, ESTACION_BERMEJO } from '../src/lib/ina'

let fallos = 0
const fmt = (v: unknown) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : JSON.stringify(v)

function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(62)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}
const cerca = (que: string, valor: number, esperado: number, tol: number) => {
  const bien = Math.abs(valor - esperado) <= tol
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(62)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)} ± ${tol})`))
}
const info = (s: string) => console.log(`       ${s}`)
const titulo = (s: string) => console.log(`\n— ${s} —`)

// ── Series armadas a mano ───────────────────────────────────────────────────
titulo('Una serie y la misma corrida tres días')

/*
 * Un río de mentira: varias ondas de distinto período sumadas, para que el
 * cambio diario no sea periódico y la correlación tenga un solo máximo.
 */
const N = 4000
const base: number[] = Array.from({ length: N }, (_, t) =>
  Math.round(400 + 150 * Math.sin(t / 58) + 60 * Math.sin(t / 13.7 + 1) + 25 * Math.sin(t / 4.3 + 2)))
const corrida = (k: number): (number | null)[] =>
  base.map((_, t) => (t - k >= 0 && t - k < N ? base[t - k] : null))

const d3 = desfasePorCambios(base, corrida(3))!
ok('el desfase entero es 3', d3.k, 3)
cerca('y afinado sigue siendo 3', d3.dias, 3, 0.05)
cerca('con correlación 1', d3.r, 1, 1e-9)

const dm2 = desfasePorCambios(base, corrida(-2))!
ok('corrida hacia atrás, el desfase es −2', dm2.k, -2)

const d0 = desfasePorCambios(base, base)!
ok('una serie contra sí misma, cero', d0.k, 0)
cerca('exacto', d0.dias, 0, 1e-9)

/*
 * La parábola. Una estación que recibe la mitad de la onda a los dos días y la
 * otra mitad a los tres está, en promedio, a dos días y medio — y eso es lo que
 * tiene que salir, aunque ningún desfase entero sea 2,5.
 */
const c2 = corrida(2), c3 = corrida(3)
const mezcla = c2.map((v, t) => (v === null || c3[t] === null ? null : (v + c3[t]!) / 2))
const dmz = desfasePorCambios(base, mezcla)!
cerca('mitad a 2 días y mitad a 3 da 2,5', dmz.dias, 2.5, 0.1)

titulo('Lo que no se puede decir, no se dice')

ok('un desfase fuera del rango probado no da número', desfasePorCambios(base, corrida(DESFASE_MAX + 5)), null)
ok('una serie vacía tampoco', desfasePorCambios(base, base.map(() => null)), null)
ok('sin datos la correlación no es un número', Number.isNaN(correlacionCambios([1, 2], [null, null], 0).r))

/*
 * Los huecos no se rellenan: con un tercio de los días borrados el desfase
 * tiene que ser el mismo, calculado sobre menos días.
 */
const conHuecos = corrida(3).map((v, t) => (t % 3 === 0 ? null : v))
const dh = desfasePorCambios(base, conHuecos)!
ok('con un tercio de huecos el desfase no cambia', dh.k, 3)
ok('y entran menos días', dh.n < d3.n)

titulo('El pico anual, sobre la serie armada')

/*
 * Una crecida por año, en marzo, con forma de campana. La segunda estación la
 * recibe cuatro días después.
 */
const DESDE = '1970-01-01'
const ANIOS = 30
const campana = (corr: number): number[] => Array.from({ length: ANIOS * 365 }, (_, t) => {
  const dia = ((t - corr) % 365 + 365) % 365
  return Math.round(300 + 400 * Math.exp(-(((dia - 75) / 25) ** 2)))
})
const pk = desfasePorPicos(campana(0), campana(4), DESDE)!
ok('la mediana es 4 días', pk.mediana, 4)
ok('y los cuartiles también', pk.p25 === 4 && pk.p75 === 4)
ok('con menos de diez años no hay respuesta',
  desfasePorPicos(campana(0).slice(0, 365 * 5), campana(4).slice(0, 365 * 5), DESDE), null)
ok('picos a meses de distancia no son el mismo evento',
  desfasePorPicos(campana(0), campana(120), DESDE), null)

// ── La serie real ───────────────────────────────────────────────────────────
titulo('El archivo congelado')

const tramo: TramoDiario = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'rio', 'tramo_diario.json'), 'utf8'))
const ids = Object.keys(tramo.estaciones).map(Number).sort((a, b) => a - b)

info(`${tramo.desde} a ${tramo.hasta}, ${ids.length} estaciones`)
ok('la referencia es Barranqueras', ESTACION_REFERENCIA, 20)
ok('están las diez escalas del Paraná, de Posadas a Goya',
  ESCALAS_PARANA.every(e => ids.includes(e.id)) && ids.length === ESCALAS_PARANA.length)
ok('todas con el mismo largo',
  new Set(ids.map(e => tramo.estaciones[String(e)].length)).size, 1)
ok('en centímetros enteros',
  ids.every(e => tramo.estaciones[String(e)].every(v => v === null || Number.isInteger(v))))

titulo('El traslado medido')

const tr = trasladoDelTramo(tramo)
const de = (id: number) => tr.find(t => t.estacion === id)!
const nombre = (id: number) => ESCALAS_PARANA.find(e => e.id === id)!.nombre

for (const t of tr) {
  info(`${nombre(t.estacion).padEnd(17)} variaciones ${t.cambios ? t.cambios.dias.toFixed(2).padStart(6) : '     —'} d`
    + ` (r ${t.cambios?.r.toFixed(2) ?? '—'}, ${t.cambios?.n ?? 0} días)`
    + ` · pico ${t.picos ? `${t.picos.mediana} d [${t.picos.p25} a ${t.picos.p75}], ${t.picos.usados} de ${t.picos.anios} años` : '—'}`)
}

ok('la referencia no se compara consigo misma', tr.some(t => t.estacion === ESTACION_REFERENCIA), false)
ok('las nueve restantes tienen los dos resultados', tr.length === 9 && tr.every(t => t.cambios && t.picos))

/*
 * La comprobación que no depende de este sistema: Corrientes está enfrente
 * de Barranqueras. Si el desfase no es cero, alguna serie tiene las fechas
 * corridas un día.
 */
ok('el control es Corrientes', ESTACION_CONTROL, 19)
cerca('Corrientes, enfrente de Barranqueras: cero por variaciones', de(19).cambios!.dias, 0, 0.2)
ok('y cero por picos', de(19).picos!.mediana, 0)

ok('Itá Ibaté, aguas arriba, llega antes', de(16).cambios!.dias < -1)
ok('también por picos', de(16).picos!.mediana < 0)
ok('Posadas, la más alejada, es la que antes llega', de(14).picos!.mediana < de(15).picos!.mediana)
ok('y no a más de diez días', de(14).picos!.mediana > -10)

// ESCALAS_PARANA va de aguas arriba hacia abajo
const orden = ESCALAS_PARANA.filter(e => e.id !== ESTACION_REFERENCIA).map(e => e.id)
const creciente = (v: number[]) => v.every((x, i) => i === 0 || x >= v[i - 1])
ok('por variaciones, el desfase crece aguas abajo',
  creciente(orden.map(id => de(id).cambios!.dias)))
ok('por picos también', creciente(orden.map(id => de(id).picos!.mediana)))
ok('Goya es la que más tarda', de(23).cambios!.dias > de(22).cambios!.dias)
ok('y no llega a una semana', de(23).cambios!.dias < 7 && de(23).picos!.mediana < 7)

/*
 * Los dos métodos no comparten cálculo. Tienen que coincidir en el signo, y el
 * pico no puede adelantarse a la variación común: la cresta es chata y se
 * demora más.
 */
ok('los dos métodos coinciden en el signo',
  tr.every(t => Math.sign(Math.round(t.cambios!.dias)) === Math.sign(t.picos!.mediana)
    || Math.round(t.cambios!.dias) === 0))
/*
 * La primera versión de este test pedía que difirieran menos de dos días, y
 * falló en Goya: 1,9 por variaciones contra 4 por picos. No era un error del
 * cálculo sino la suposición, y es el dato más útil que salió de acá — la
 * cresta tarda el doble que una variación común en llegar a Goya. Lo que sí
 * se sostiene es la dirección: el pico nunca tarda menos.
 */
ok('el pico nunca tarda menos que la variación común',
  tr.every(t => Math.abs(t.picos!.mediana) >= Math.abs(t.cambios!.dias) - 0.5))
ok('y la diferencia no pasa de tres días',
  tr.every(t => Math.abs(t.cambios!.dias - t.picos!.mediana) < 3))

ok('la correlación es más baja en Itá Ibaté que en Corrientes', de(16).cambios!.r < de(19).cambios!.r)
ok('y más baja todavía en Posadas, la más lejana', de(14).cambios!.r < de(16).cambios!.r)

titulo('Es estable en el tiempo')

/*
 * Partida la serie en dos mitades, el desfase tiene que ser el mismo. Si
 * dependiera del período, no sería una propiedad del río.
 */
const mitad = Math.floor(tramo.estaciones[String(ESTACION_REFERENCIA)].length / 2)
const ref = tramo.estaciones[String(ESTACION_REFERENCIA)]
for (const id of [16, 19, 22, 23]) {
  const s = tramo.estaciones[String(id)]
  const a = desfasePorCambios(ref.slice(0, mitad), s.slice(0, mitad))
  const b = desfasePorCambios(ref.slice(mitad), s.slice(mitad))
  info(`${nombre(id).padEnd(17)} primera mitad ${a?.dias.toFixed(2)} · segunda ${b?.dias.toFixed(2)}`)
  ok(`${nombre(id)}: las dos mitades difieren menos de medio día`,
    !!a && !!b && Math.abs(a.dias - b.dias) < 0.5)
}

/*
 * Posadas e Ituzaingó cambian más entre mitades: Yacyretá se llenó entre 1994
 * y 2011, en el medio de la serie, y regula lo que pasa por ahí. Se les pide
 * menos de un día.
 */
for (const id of [14, 15]) {
  const s = tramo.estaciones[String(id)]
  const a = desfasePorCambios(ref.slice(0, mitad), s.slice(0, mitad))
  const b = desfasePorCambios(ref.slice(mitad), s.slice(mitad))
  info(`${nombre(id).padEnd(17)} primera mitad ${a?.dias.toFixed(2)} · segunda ${b?.dias.toFixed(2)}`)
  ok(`${nombre(id)}: las dos mitades difieren menos de un día`,
    !!a && !!b && Math.abs(a.dias - b.dias) < 1)
}

ok('el rango probado cubre todos los resultados',
  tr.every(t => t.cambios!.k > DESFASE_MIN && t.cambios!.k < DESFASE_MAX))

// ── El río Paraguay ─────────────────────────────────────────────────────────
titulo('El aporte, sobre series armadas')

/*
 * Dos ríos de mentira que no se parecen entre sí. La referencia recibe uno a
 * los dos días y el otro, más débil, a los cinco: el resto de ajustar contra el
 * primero tiene que ser el segundo, cinco días antes.
 */
const otroRio: number[] = Array.from({ length: N }, (_, t) =>
  Math.round(300 + 120 * Math.sin(t / 91 + 2) + 50 * Math.sin(t / 23.3) + 30 * Math.sin(t / 7.9 + 1)))
const confluencia: (number | null)[] = base.map((_, t) =>
  t >= 5 ? Math.round(0.8 * base[t - 2] + 0.3 * otroRio[t - 5]) : null)

const ap = aporteNoExplicado(confluencia, base, otroRio)!
ok('el aporte se encuentra cinco días antes', ap.k, -5)
ok('con correlación casi 1', ap.r > 0.97)
ok('sumarlo explica casi todo', ap.explicadoCon > 0.99 && ap.explicadoCon > ap.explicadoSin)
ok('sin datos no hay respuesta', aporteNoExplicado(confluencia, base, base.map(() => null)), null)
ok('el cambio en 15 días de una rampa es 15',
  cambioEn([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 15).filter(v => v !== null).join(','), '15,15')
ok('y con un hueco en una punta no hay cambio', cambioEn([null, 5], 1)[1], null)

titulo('El río Paraguay, sobre la serie real')

const pg = trasladoDelParaguay(tramo)
const dePg = (id: number) => pg.find(t => t.estacion === id)!
const nombrePg = (id: number) => ESTACIONES_PARAGUAY.find(e => e.id === id)!.nombre

ok('están las tres del Paraguay, aparte de las del tramo',
  ESTACIONES_PARAGUAY.every(e => !!tramo.paraguay?.[String(e.id)] && !ids.includes(e.id)) && pg.length === 3)
ok('con el mismo largo que las demás',
  pg.every(t => tramo.paraguay![String(t.estacion)].length === ref.length))

for (const t of pg) {
  const a = t.aporte
  info(`${nombrePg(t.estacion).padEnd(17)} variaciones r ${t.cambios?.r.toFixed(2) ?? '—'} a ${t.cambios?.dias.toFixed(1) ?? '—'} d`
    + ` · mismo pico en ${t.picos?.usados ?? '—'} de ${t.picos?.anios ?? '—'} años`
    + ` · aporte r ${a?.r.toFixed(2) ?? '—'} a ${a?.k ?? '—'} d [${a?.desde} a ${a?.hasta}],`
    + ` R² ${a?.explicadoSin.toFixed(3)} → ${a?.explicadoCon.toFixed(3)}`)
}

/*
 * Lo que se esperaba y no pasó: que se comportaran como Itá Ibaté. No lo hacen,
 * y eso es lo que se afirma — si algún día dan un traslado nítido, cambió algo.
 */
ok('sus variaciones diarias casi no se parecen a las de Barranqueras',
  pg.every(t => t.cambios!.r < 0.4 && t.cambios!.r < de(16).cambios!.r))
ok('Pilcomayo: en más de la mitad de los años el pico es otra crecida',
  dePg(55).picos!.usados < dePg(55).picos!.anios / 2)

ok('y aun así las tres explican parte de lo que Itá Ibaté no',
  pg.every(t => t.aporte!.r > 0.4 && t.aporte!.explicadoCon > t.aporte!.explicadoSin + 0.02))
ok('Puerto Pilcomayo, antes que Barranqueras', dePg(55).aporte!.k <= -2 && dePg(55).aporte!.k >= -8)
ok('con una cima ancha, que no pasa del mismo día', dePg(55).aporte!.hasta <= 1 && dePg(55).aporte!.desde <= -7)
ok('Puerto Formosa y Puerto Bermejo no adelantan: a la vez que Barranqueras',
  Math.abs(dePg(57).aporte!.k) <= 1 && Math.abs(dePg(58).aporte!.k) <= 1)
ok('con la cima a los dos lados del cero',
  [57, 58].every(id => dePg(id).aporte!.desde < 0 && dePg(id).aporte!.hasta > 0))
ok('Formosa es la que más explica de las tres',
  dePg(57).aporte!.r > dePg(55).aporte!.r && dePg(57).aporte!.r > dePg(58).aporte!.r)

/*
 * El control que encontró el error de la primera versión. Con Itá Ibaté en un
 * solo desfase, la escala de enfrente aparecía «aportando» seis días antes: el
 * resto era la onda del Paraná mal ajustada. Enfrente tiene que dar cero, y
 * aguas abajo tiene que dar después.
 */
const control = (id: number) =>
  aporteNoExplicado(ref, tramo.estaciones[String(ESTACION_ARRIBA)], tramo.estaciones[String(id)])!
ok('control: Corrientes, enfrente, da cero', control(19).k, 0)
ok('control: Goya, aguas abajo, da después', control(23).k > 0)

for (const id of [55, 58]) {  // Formosa tiene la mitad de los años: no se parte
  const s = tramo.paraguay![String(id)]
  const arriba = tramo.estaciones['16']
  const a = aporteNoExplicado(ref.slice(0, mitad), arriba.slice(0, mitad), s.slice(0, mitad))
  const b = aporteNoExplicado(ref.slice(mitad), arriba.slice(mitad), s.slice(mitad))
  info(`${nombrePg(id).padEnd(17)} primera mitad ${a?.k} d (r ${a?.r.toFixed(2)}) · segunda ${b?.k} d (r ${b?.r.toFixed(2)})`)
  ok(`${nombrePg(id)}: las dos mitades difieren dos días o menos`, !!a && !!b && Math.abs(a.k - b.k) <= 2)
}

titulo('El río Bermejo')

/*
 * El Bermejo desemboca en el Paraguay y pesa poco en caudal. Lo que se afirma
 * es lo medido: está, con su registro desde 2001, y en la altura de
 * Barranqueras no se distingue. Si algún día da un aporte nítido, cambió algo
 * y conviene mirarlo antes de mostrarlo.
 */
const bm = trasladoDelBermejo(tramo)
ok('está El Colorado, aparte del Paraguay',
  bm.length === 1 && bm[0].estacion === ESTACION_BERMEJO.id && !tramo.paraguay?.[String(ESTACION_BERMEJO.id)])
ok('con el mismo largo que las demás', tramo.bermejo![String(ESTACION_BERMEJO.id)].length === ref.length)
ok('con registro desde 2001: más de 6.000 días', bm[0].dias > 6000)
{
  const a = bm[0].aporte
  info(`El Colorado aporte r ${a?.r.toFixed(2)} a ${a?.k} d · R² ${a?.explicadoSin.toFixed(3)} → ${a?.explicadoCon.toFixed(3)}`)
  ok('en la altura de Barranqueras no se distingue: r bajo 0,3', !!a && a.r < 0.3)
  ok('y sumarlo no explica más', !!a && a.explicadoCon - a.explicadoSin < 0.01)
}

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
