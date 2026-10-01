/**
 * Verifica la recurrencia y la permanencia del Paraná en Corrientes.
 *
 * **Corre sobre la serie real**, la que está congelada en
 * `public/rio/corrientes_diario.json`, y no sale a la red. Acá sí hay contra
 * qué comparar, al revés de lo que pasa con la lámina por cuenca: las grandes
 * crecidas del Paraná están documentadas, así que si el archivo se generó con
 * las fechas corridas o las unidades cruzadas, 1983 no da 9 metros en julio.
 *
 * La parte de Gumbel se afirma contra propiedades que se saben sin calcular —la
 * de 2 años es la mediana, ida y vuelta devuelve lo mismo— y no contra un
 * número oficial: nadie publicó la recurrencia con esta serie y este método.
 *
 *   npx tsx scripts/verificar-rio-historico.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  extremosAnuales, delPeriodo, ajustarGumbel, alturaDeRecurrencia, recurrenciaDe,
  errorEstandar, bondadKS, aniosSobre, permanencia, ultimaVezSobre, anioHidrologico,
  etiquetaAnio, fechaDe, ANIO_REGIMEN, type SerieDiariaRio,
} from '../src/lib/rioHistorico'
import { ESTACIONES } from '../src/lib/ina'

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

const serie: SerieDiariaRio = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'rio', 'corrientes_diario.json'), 'utf8'))
const corrientes = ESTACIONES.find(e => e.id === 19)!

// ── El archivo ──────────────────────────────────────────────────────────────
titulo('El archivo congelado')

const conDato = serie.cm.filter(v => v !== null).length
info(`${serie.desde} a ${serie.hasta}: ${serie.cm.length} días, ${conDato} con dato`)
ok('es la estación Corrientes', serie.estacion, corrientes.id)
ok('arranca en 1901', serie.desde, '1901-01-01')
ok('tiene más de 45 mil días con dato', conDato > 45_000)
ok('falta menos del 0,5 % de los días', (serie.cm.length - conDato) / serie.cm.length < 0.005)
ok('la última posición es la fecha `hasta`', fechaDe(serie, serie.cm.length - 1), serie.hasta)
ok('las alturas están en centímetros enteros', serie.cm.every(v => v === null || Number.isInteger(v)))

// ── El año hidrológico ──────────────────────────────────────────────────────
titulo('El año hidrológico va de septiembre a agosto')

ok('agosto de 1983 es 1982/83', anioHidrologico('1983-08-31'), 1983)
ok('septiembre de 1983 ya es 1983/84', anioHidrologico('1983-09-01'), 1984)
ok('diciembre de 1982 es 1982/83', anioHidrologico('1982-12-15'), 1983)
ok('la etiqueta', etiquetaAnio(1983), '1982/83')
ok('y la del cambio de siglo', etiquetaAnio(2000), '1999/00')

// ── Las crecidas conocidas ──────────────────────────────────────────────────
titulo('Las grandes crecidas están donde tienen que estar')

const umbrales = [corrientes.alerta, corrientes.evacuacion]
const anios = extremosAnuales(serie, umbrales)
const completos = anios.filter(a => a.completo)
const de = (anio: number) => anios.find(a => a.anio === anio)!
const ranking = [...completos].sort((a, b) => b.max - a.max)

info(`${anios.length} años hidrológicos, ${completos.length} completos`)
info('mayores: ' + ranking.slice(0, 5).map(a => `${etiquetaAnio(a.anio)} ${a.max} m`).join(' · '))

ok('la mayor del registro es 1982/83', ranking[0].anio, 1983)
ok('con 9,02 m', ranking[0].max, 9.02)
ok('y el pico fue en julio de 1983', ranking[0].fechaMax.slice(0, 7), '1983-07')
ok('la segunda es 1991/92', ranking[1].anio, 1992)
ok('la tercera es 1904/05', ranking[2].anio, 1905)
ok('la cuarta es 1997/98', ranking[3].anio, 1998)

/*
 * Para esto existe el año hidrológico. Con el año calendario, la crecida de
 * 1982/83 aporta dos máximos: 7,8 m en diciembre de 1982 y 9,02 en julio de
 * 1983. Es un solo evento.
 */
ok('1982/83 es un solo año, no dos', completos.filter(a => a.max >= 7.8 && (a.anio === 1982 || a.anio === 1983)).length, 1)

titulo('La bajante de 1944 también')

const masBajo = [...completos].sort((a, b) => a.min - b.min)[0]
ok('el mínimo del registro es de 1944', masBajo.fechaMin.slice(0, 4), '1944')
ok('y está bajo el cero de escala', masBajo.min < 0)
info(`${masBajo.min} m el ${masBajo.fechaMin}`)

// ── Años incompletos ────────────────────────────────────────────────────────
titulo('Los años incompletos se marcan, no se tiran')

ok('1900/01 está y no es completo', de(1901).completo, false)
ok('2009/10, sin enero, entra igual', de(2010).completo, true)
info(`2009/10 tiene ${de(2010).dias} días con dato`)
ok('el año en curso no entra en el ajuste', anios[anios.length - 1].completo, false)
ok('ningún año completo tiene menos de 330 días', completos.every(a => a.dias >= 330))

// ── Días sobre los umbrales ─────────────────────────────────────────────────
titulo('Días sobre los umbrales del INA')

const a83 = de(1983)
info(`1982/83: ${a83.diasSobre[0]} días sobre alerta, ${a83.diasSobre[1]} sobre evacuación`)
ok('1982/83 pasó más de 200 días sobre el alerta', a83.diasSobre[0] > 200)
ok('nunca hay más días sobre evacuación que sobre alerta',
  anios.every(a => a.diasSobre[1] <= a.diasSobre[0]))
ok('un año que no llegó al alerta tiene cero días',
  anios.filter(a => a.max < corrientes.alerta).every(a => a.diasSobre[0] === 0))
ok('y uno que llegó tiene al menos uno',
  anios.filter(a => a.max >= corrientes.alerta).every(a => a.diasSobre[0] >= 1))

// ── Gumbel ──────────────────────────────────────────────────────────────────
titulo('Gumbel sobre los máximos anuales')

const maximos = completos.map(a => a.max)
const g = ajustarGumbel(maximos)!
info(`n ${g.n} · media ${g.media.toFixed(3)} · desvío ${g.desvio.toFixed(3)} · u ${g.u.toFixed(3)} · α ${g.alfa.toFixed(3)}`)

/*
 * Tres propiedades que no dependen de los datos. Si alguna falla, la fórmula
 * está mal escrita, no la serie.
 */
cerca('la altura de 2 años es la mediana de la distribución',
  Math.exp(-Math.exp(-(alturaDeRecurrencia(g, 2) - g.u) / g.alfa)), 0.5, 1e-9)
cerca('ida y vuelta: la recurrencia de la altura de 50 años es 50',
  recurrenciaDe(g, alturaDeRecurrencia(g, 50)), 50, 1e-6)
ok('a más recurrencia, más altura',
  [2, 5, 10, 25, 50, 100].every((T, i, l) => i === 0 || alturaDeRecurrencia(g, T) > alturaDeRecurrencia(g, l[i - 1])))
ok('y más error', errorEstandar(g, 100) > errorEstandar(g, 10))
ok('con menos de diez años no ajusta', ajustarGumbel([5, 6, 7]), null)

const ks = bondadKS(maximos, g)
info(`Kolmogorov-Smirnov: D ${ks.d.toFixed(3)} contra ${ks.critico.toFixed(3)}`)
ok('el ajuste no se aparta de lo observado', ks.pasa)

info('recurrencia: ' + [2, 5, 10, 25, 50, 100]
  .map(T => `${T} años ${alturaDeRecurrencia(g, T).toFixed(2)} ±${errorEstandar(g, T).toFixed(2)}`).join(' · '))

/*
 * Lo contado contra lo ajustado. No tienen por qué coincidir —uno es una
 * cuenta y el otro un modelo— pero si difieren en más de un factor dos, el
 * modelo no describe la zona de los umbrales, que es la que importa.
 */
titulo('Lo ajustado no contradice lo contado')

for (const [nombre, h] of [['alerta', corrientes.alerta], ['evacuación', corrientes.evacuacion]] as const) {
  const c = aniosSobre(maximos, h)
  const contado = c.de / c.veces
  const ajustado = recurrenciaDe(g, h)
  info(`${nombre} ${h} m: ${c.veces} de ${c.de} años (1 cada ${contado.toFixed(1)}) · Gumbel 1 cada ${ajustado.toFixed(1)}`)
  ok(`${nombre}: contado y ajustado difieren menos del 50 %`, Math.abs(ajustado / contado - 1) < 0.5)
}
ok('se superó el alerta más veces que la evacuación',
  aniosSobre(maximos, corrientes.alerta).veces > aniosSobre(maximos, corrientes.evacuacion).veces)

// ── El cambio de régimen ────────────────────────────────────────────────────
titulo(`El régimen antes y después de ${ANIO_REGIMEN}`)

const media = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
const antes = completos.filter(a => a.anio < ANIO_REGIMEN)
const despues = delPeriodo(completos, 'reciente')
info(`mínimo anual medio: ${media(antes.map(a => a.min)).toFixed(2)} m antes, ${media(despues.map(a => a.min)).toFixed(2)} m después`)
info(`máximo anual medio: ${media(antes.map(a => a.max)).toFixed(2)} m antes, ${media(despues.map(a => a.max)).toFixed(2)} m después`)

ok('el período reciente arranca en 1970/71', despues[0].anio, ANIO_REGIMEN)
ok('los dos períodos suman la serie completa', antes.length + despues.length, completos.length)
ok('el mínimo anual subió más de un metro',
  media(despues.map(a => a.min)) - media(antes.map(a => a.min)) > 1)
ok('`completo` devuelve todos los años', delPeriodo(completos, 'completo').length, completos.length)

// ── Permanencia ─────────────────────────────────────────────────────────────
titulo('Curva de permanencia')

const p = permanencia(serie, 'completo')
const pr = permanencia(serie, 'reciente')
info(`${p.dias} días en la serie completa, ${pr.dias} desde 1970/71`)
info(`sobre alerta ${(p.sobre(corrientes.alerta) * 100).toFixed(2)} % · sobre evacuación ${(p.sobre(corrientes.evacuacion) * 100).toFixed(2)} %`)

ok('entran todos los días con dato', p.dias, conDato)
ok('toda altura está sobre el mínimo del registro', p.sobre(-5), 1)
ok('y ninguna sobre diez metros', p.sobre(10), 0)
ok('el máximo se igualó un solo día', Math.round(p.sobre(9.02) * p.dias), 1)
ok('a más altura, menos tiempo', p.sobre(7) < p.sobre(6.5) && p.sobre(6.5) < p.sobre(4))
cerca('la mediana se supera la mitad del tiempo', p.sobre(p.alturaDe(0.5)), 0.5, 0.01)
ok('la altura del 0 % es el máximo', p.alturaDe(0), 9.02)
ok('el río estuvo sobre el alerta menos del 5 % del tiempo', p.sobre(corrientes.alerta) < 0.05)
ok('desde 1971 la mediana es más alta', pr.alturaDe(0.5) > p.alturaDe(0.5))

/*
 * La cuenta directa contra la búsqueda binaria: `sobre()` no recorre la serie,
 * y un error de un índice ahí no se ve a ojo.
 */
const directo = serie.cm.filter(v => v !== null && v >= 650).length / conDato
cerca('`sobre` da lo mismo que contar día por día', p.sobre(6.5), directo, 1e-12)

titulo('La última vez')

const ult = ultimaVezSobre(serie, corrientes.evacuacion)
info(`última vez sobre evacuación: ${ult}`)
ok('la última vez sobre 9 m fue en 1983', ultimaVezSobre(serie, 9)?.slice(0, 4), '1983')
ok('nunca llegó a 10 m', ultimaVezSobre(serie, 10), null)
ok('la evacuación se superó después del alerta, o el mismo día',
  (ultimaVezSobre(serie, corrientes.alerta) ?? '') >= (ult ?? ''))

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
