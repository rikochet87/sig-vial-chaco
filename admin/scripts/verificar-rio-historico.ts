/**
 * Verifica la recurrencia y la permanencia del Paraná en Barranqueras.
 *
 * **Corre sobre la serie real**, la que está congelada en
 * `public/rio/barranqueras_diario.json`, y no sale a la red. Acá sí hay contra
 * qué comparar, al revés de lo que pasa con la lámina por cuenca, y son dos
 * controles que no se conocen entre sí:
 *
 * - **La Resolución 1111/98 de la APA** da el pico del 04/05/1998 como «8,17 m
 *   en el hidrómetro de Puerto Barranqueras». Con las fechas corridas o las
 *   unidades cruzadas, ese día no da ese número.
 * - **Corrientes está enfrente** y tiene su propia media diaria, que está en
 *   `tramo_diario.json`: los máximos anuales de las dos escalas tienen que
 *   moverse juntos.
 *
 * El registro son dos series del INA —lecturas hasta 1969, media diaria desde
 * 1970— y también se afirma la costura: que no haya un escalón donde cambian.
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

const RIO = join(__dirname, '..', 'public', 'rio')
const serie: SerieDiariaRio = JSON.parse(readFileSync(join(RIO, 'barranqueras_diario.json'), 'utf8'))
const tramo: { desde: string; estaciones: Record<string, (number | null)[]> } =
  JSON.parse(readFileSync(join(RIO, 'tramo_diario.json'), 'utf8'))
const barranqueras = ESTACIONES.find(e => e.id === 20)!

const DIA_MS = 86_400_000
/** La posición de una fecha en la serie */
const indiceDe = (fecha: string) =>
  Math.round((Date.parse(fecha + 'T00:00:00Z') - Date.parse(serie.desde + 'T00:00:00Z')) / DIA_MS)
/** La altura de un día, en metros */
const alturaEl = (fecha: string) => {
  const cm = serie.cm[indiceDe(fecha)]
  return cm === null || cm === undefined ? null : cm / 100
}

// ── El archivo ──────────────────────────────────────────────────────────────
titulo('El archivo congelado')

const conDato = serie.cm.filter(v => v !== null).length
info(`${serie.desde} a ${serie.hasta}: ${serie.cm.length} días, ${conDato} con dato`)
ok('es la estación Barranqueras', serie.estacion, barranqueras.id)
ok('arranca en marzo de 1906', serie.desde, '1906-03-02')
ok('tiene más de 43 mil días con dato', conDato > 43_000)
ok('falta menos del 2 % de los días', (serie.cm.length - conDato) / serie.cm.length < 0.02)
ok('la última posición es la fecha `hasta`', fechaDe(serie, serie.cm.length - 1), serie.hasta)
ok('las alturas están en centímetros enteros', serie.cm.every(v => v === null || Number.isInteger(v)))

// ── Las dos series ──────────────────────────────────────────────────────────
titulo('El registro junta dos series, y se sabe cuánto de cada una')

const origen = serie.origen!
info(`${origen.deLecturaAntes} días de lecturas antes de ${origen.mediaDesde} · ${origen.deMedia} de media diaria · ${origen.deLecturaDespues} de lecturas en huecos`)
info(`en los ${origen.comunes} días en común: sesgo ${origen.sesgoCm} cm, error medio ${origen.maeCm} cm`)

ok('el archivo dice de dónde salió cada parte', serie.origen !== undefined && serie.serieLecturas === 20)
ok('la media diaria arranca en 1970', origen.mediaDesde, '1970-01-01')
ok('las tres partes suman los días con dato',
  origen.deMedia + origen.deLecturaAntes + origen.deLecturaDespues, conDato)
ok('todo lo anterior a 1970 son lecturas',
  serie.cm.slice(0, indiceDe(origen.mediaDesde)).filter(v => v !== null).length, origen.deLecturaAntes)
ok('las dos series comparten más de 20 mil días', origen.comunes > 20_000)
ok('y ahí difieren menos de medio centímetro', origen.maeCm < 0.5 && Math.abs(origen.sesgoCm) < 0.5)
ok('lo que se completa después de 1970 es marginal', origen.deLecturaDespues < 100)

/*
 * La costura. Si las dos series estuvieran en ceros distintos, o con un día de
 * corrimiento, el río pegaría un salto el 1 de enero de 1970. Se compara el
 * cambio de ese día contra lo que el río venía haciendo esa semana.
 */
const antes70 = alturaEl('1969-12-31')!
const desde70 = alturaEl('1970-01-01')!
const semana = [-3, -2, -1, 1, 2, 3].map(d => {
  const i = indiceDe('1970-01-01') + d
  return Math.abs((serie.cm[i]! - serie.cm[i - 1]!) / 100)
})
info(`31/12/1969 ${antes70} m · 01/01/1970 ${desde70} m · cambios diarios de esa semana: ${semana.join(' ')}`)
ok('no hay escalón donde cambia la serie', Math.abs(desde70 - antes70) <= Math.max(...semana) + 0.05)

// ── El año hidrológico ──────────────────────────────────────────────────────
titulo('El año hidrológico va de septiembre a agosto')

ok('agosto de 1983 es 1982/83', anioHidrologico('1983-08-31'), 1983)
ok('septiembre de 1983 ya es 1983/84', anioHidrologico('1983-09-01'), 1984)
ok('diciembre de 1982 es 1982/83', anioHidrologico('1982-12-15'), 1983)
ok('la etiqueta', etiquetaAnio(1983), '1982/83')
ok('y la del cambio de siglo', etiquetaAnio(2000), '1999/00')

// ── Las crecidas conocidas ──────────────────────────────────────────────────
titulo('Las grandes crecidas están donde tienen que estar')

const umbrales = [barranqueras.alerta, barranqueras.evacuacion]
const anios = extremosAnuales(serie, umbrales)
const completos = anios.filter(a => a.completo)
const de = (anio: number) => anios.find(a => a.anio === anio)!
const ranking = [...completos].sort((a, b) => b.max - a.max)

info(`${anios.length} años hidrológicos, ${completos.length} completos`)
info('mayores: ' + ranking.slice(0, 5).map(a => `${etiquetaAnio(a.anio)} ${a.max} m`).join(' · '))

ok('la mayor del registro es 1982/83', ranking[0].anio, 1983)
ok('con 8,59 m', ranking[0].max, 8.59)
ok('la segunda es 1991/92', ranking[1].anio, 1992)
ok('la tercera es 1997/98', ranking[2].anio, 1998)
ok('la cuarta es 1965/66', ranking[3].anio, 1966)

/*
 * La crecida de 1983 tuvo dos crestas casi iguales, y en Barranqueras la mayor
 * es la de junio por un centímetro: 8,59 m el 22/06 y 8,58 el 18/07, que es el
 * día del máximo en Corrientes. Se afirman las dos para que nadie lea la fecha
 * de junio como un corrimiento.
 */
ok('1983: la cresta de junio', ranking[0].fechaMax, '1983-06-22')
ok('1983: y la de julio, un centímetro abajo', alturaEl('1983-07-18'), 8.58)

/*
 * El control externo. La Resolución 1111/98 de la APA: «8,17 m en el hidrómetro
 * de Puerto Barranqueras» el 4 de mayo de 1998. No sale del INA.
 */
ok('1998: 8,17 m, como dice la Resolución 1111/98 de la APA', de(1998).max, 8.17)
ok('1998: el 4 de mayo', de(1998).fechaMax, '1998-05-04')

/*
 * Para esto existe el año hidrológico. Con el año calendario, la crecida de
 * 1982/83 aporta dos máximos, el de diciembre de 1982 y el de 1983. Es un solo
 * evento.
 */
ok('diciembre de 1982 ya estaba sobre evacuación', alturaEl('1982-12-15')! >= barranqueras.evacuacion)
ok('1982/83 es un solo año, no dos', completos.filter(a => a.max >= 7.5 && (a.anio === 1982 || a.anio === 1983)).length, 1)

titulo('La bajante de 1944 también')

const masBajo = [...completos].sort((a, b) => a.min - b.min)[0]
ok('el mínimo del registro es de 1944', masBajo.fechaMin.slice(0, 4), '1944')
ok('y está bajo el cero de escala', masBajo.min < 0)
info(`${masBajo.min} m el ${masBajo.fechaMin}`)

// ── Contra Corrientes ───────────────────────────────────────────────────────
titulo('Corrientes, que está enfrente, dice lo mismo')

/*
 * Otra escala, otra serie, otro cero. Los metros no tienen por qué coincidir
 * —y no coinciden—, pero los años grandes y los chicos tienen que ser los
 * mismos. Sólo desde 1970, que es lo que el archivo del tramo tiene de
 * Corrientes.
 */
const maxCorrientes = new Map<number, { max: number; dias: number }>()
{
  const t0 = Date.parse(tramo.desde + 'T00:00:00Z')
  tramo.estaciones['19'].forEach((cm, i) => {
    if (cm === null) return
    const anio = anioHidrologico(new Date(t0 + i * DIA_MS).toISOString().slice(0, 10))
    const a = maxCorrientes.get(anio) ?? { max: -Infinity, dias: 0 }
    a.max = Math.max(a.max, cm / 100)
    a.dias++
    maxCorrientes.set(anio, a)
  })
}
const pares = completos
  .filter(a => (maxCorrientes.get(a.anio)?.dias ?? 0) >= 330)
  .map(a => [a.max, maxCorrientes.get(a.anio)!.max] as const)
const prom = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length
const mb = prom(pares.map(p => p[0])), mc = prom(pares.map(p => p[1]))
const r = pares.reduce((q, p) => q + (p[0] - mb) * (p[1] - mc), 0) / Math.sqrt(
  pares.reduce((q, p) => q + (p[0] - mb) ** 2, 0) * pares.reduce((q, p) => q + (p[1] - mc) ** 2, 0))
const difs = pares.map(p => p[1] - p[0])
info(`${pares.length} años en común · correlación de los máximos ${r.toFixed(4)}`)
info(`Corrientes menos Barranqueras: de ${Math.min(...difs).toFixed(2)} a ${Math.max(...difs).toFixed(2)} m, media ${prom(difs).toFixed(2)}`)

ok('hay más de 50 años para comparar', pares.length > 50)
ok('los máximos anuales correlacionan sobre 0,99', r > 0.99)
ok('y ningún año se aparta más de medio metro', difs.every(d => Math.abs(d) < 0.5))

// ── El máximo de un año no es una lectura suelta ────────────────────────────
titulo('Ningún máximo anual es un pico de un día')

/*
 * La serie no se depuró: tiene saltos de un día que parecen errores de carga
 * —el 14/09/1990 baja tres metros y vuelve—. No se filtran, porque sería
 * afirmar algo distinto de la fuente; lo que se afirma es que ninguno decide
 * un máximo anual, que es de donde sale la recurrencia.
 */
const aislado = (fecha: string, m: number) => {
  const i = indiceDe(fecha)
  const vecinos = [serie.cm[i - 1], serie.cm[i + 1]].filter((v): v is number => v !== null && v !== undefined)
  return vecinos.length === 0 ? 0 : Math.min(...vecinos.map(v => Math.abs(v / 100 - m)))
}
const peorMax = Math.max(...completos.map(a => aislado(a.fechaMax, a.max)))
info(`el máximo anual más apartado de sus días vecinos: ${peorMax.toFixed(2)} m`)
/*
 * 25 cm y no menos: una cresta real sube y baja en punta. La de diciembre de
 * 2003 queda a 21 cm de sus vecinos —5,48 · 5,69 · 5,41— después de subir más
 * de un metro en cinco días. Un error como el de 1990 son tres metros.
 */
ok('todo máximo anual tiene un día vecino a menos de 25 cm', peorMax < 0.25)

/*
 * El único máximo anual que sí parece un error de carga: el 09/02/1981 la
 * serie da 6,16 · 6,36 · 6,16, sobre un río quieto. Decide el máximo de
 * 1980/81 por 20 cm. No se corrige; se afirma que no cambia nada de lo que se
 * cuenta —con 6,16 o con 6,36 el año pasó el alerta y no llegó a evacuación—.
 */
const m81 = de(1981)
const sin81 = Math.max(alturaEl('1981-02-08')!, alturaEl('1981-02-10')!)
info(`1980/81: máximo ${m81.max} m el ${m81.fechaMax}; los días de al lado, ${sin81} m`)
ok('1980/81: el pico dudoso es el del 9 de febrero', m81.fechaMax, '1981-02-09')
ok('y con o sin él, el año queda entre alerta y evacuación',
  [m81.max, sin81].every(m => m >= barranqueras.alerta && m < barranqueras.evacuacion))

const minSueltos = completos.filter(a => aislado(a.fechaMin, a.min) > 0.25)
info('mínimos anuales que sí son un día suelto: '
  + (minSueltos.map(a => `${etiquetaAnio(a.anio)} ${a.min} m el ${a.fechaMin}`).join(' · ') || 'ninguno'))
ok('a lo sumo uno, y no es el mínimo del registro',
  minSueltos.length <= 1 && minSueltos.every(a => a.anio !== masBajo.anio))

// ── Años incompletos ────────────────────────────────────────────────────────
titulo('Los años incompletos se marcan, no se tiran')

ok('1905/06 está y no es completo', de(1906).completo, false)
ok('2009/10, sin enero, entra igual', de(2010).completo, true)
info(`2009/10 tiene ${de(2010).dias} días con dato`)
info('incompletos: ' + anios.filter(a => !a.completo).map(a => `${etiquetaAnio(a.anio)} (${a.dias} días)`).join(' · '))
/*
 * 1989/90 fue una crecida grande —7,66 m en lo que hay— y queda afuera por
 * tres días. Se afirma para que el día que se regenere el archivo y entre, el
 * cambio en la recurrencia no pase sin que nadie lo vea.
 */
ok('1989/90 queda afuera del ajuste', de(1990).completo, false)
ok('y son cinco los incompletos, con el año en curso', anios.filter(a => !a.completo).length, 5)
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
  anios.filter(a => a.max < barranqueras.alerta).every(a => a.diasSobre[0] === 0))
ok('y uno que llegó tiene al menos uno',
  anios.filter(a => a.max >= barranqueras.alerta).every(a => a.diasSobre[0] >= 1))

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

for (const [nombre, h] of [['alerta', barranqueras.alerta], ['evacuación', barranqueras.evacuacion]] as const) {
  const c = aniosSobre(maximos, h)
  const contado = c.de / c.veces
  const ajustado = recurrenciaDe(g, h)
  info(`${nombre} ${h} m: ${c.veces} de ${c.de} años (1 cada ${contado.toFixed(1)}) · Gumbel 1 cada ${ajustado.toFixed(1)}`)
  ok(`${nombre}: contado y ajustado difieren menos del 50 %`, Math.abs(ajustado / contado - 1) < 0.5)
}
ok('se superó el alerta más veces que la evacuación',
  aniosSobre(maximos, barranqueras.alerta).veces > aniosSobre(maximos, barranqueras.evacuacion).veces)

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
info(`sobre alerta ${(p.sobre(barranqueras.alerta) * 100).toFixed(2)} % · sobre evacuación ${(p.sobre(barranqueras.evacuacion) * 100).toFixed(2)} %`)

ok('entran todos los días con dato', p.dias, conDato)
ok('toda altura está sobre el mínimo del registro', p.sobre(-5), 1)
ok('y ninguna sobre diez metros', p.sobre(10), 0)
ok('el máximo se igualó un solo día', Math.round(p.sobre(8.59) * p.dias), 1)
ok('a más altura, menos tiempo', p.sobre(6.5) < p.sobre(6) && p.sobre(6) < p.sobre(4))
cerca('la mediana se supera la mitad del tiempo', p.sobre(p.alturaDe(0.5)), 0.5, 0.01)
ok('la altura del 0 % es el máximo', p.alturaDe(0), 8.59)
ok('el río estuvo sobre el alerta menos del 5 % del tiempo', p.sobre(barranqueras.alerta) < 0.05)
ok('desde 1971 la mediana es más alta', pr.alturaDe(0.5) > p.alturaDe(0.5))

/*
 * La cuenta directa contra la búsqueda binaria: `sobre()` no recorre la serie,
 * y un error de un índice ahí no se ve a ojo.
 */
const directo = serie.cm.filter(v => v !== null && v >= 600).length / conDato
cerca('`sobre` da lo mismo que contar día por día', p.sobre(6), directo, 1e-12)

titulo('La última vez')

const ult = ultimaVezSobre(serie, barranqueras.evacuacion)
info(`última vez sobre evacuación: ${ult}`)
ok('la última vez sobre 8,5 m fue en 1983', ultimaVezSobre(serie, 8.5)?.slice(0, 4), '1983')
ok('nunca llegó a 9 m', ultimaVezSobre(serie, 9), null)
ok('la evacuación se superó después del alerta, o el mismo día',
  (ultimaVezSobre(serie, barranqueras.alerta) ?? '') >= (ult ?? ''))

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
