/**
 * Verifica el balance de caudales en la confluencia del Paraná y el Paraguay.
 *
 * Dos partes. La primera arma tres ríos de mentira y una confluencia que es
 * exactamente su suma, cada uno con su demora: ahí el resto **tiene que ser
 * cero** y las partes se saben sin calcular. La segunda corre sobre la serie
 * real congelada en `public/rio/confluencia_caudal.json`, sin salir a la red.
 *
 * Nadie publicó el reparto del caudal de Corrientes con estas series, así que
 * no hay un valor oficial contra el cual comparar. Lo que sí hay es física:
 * tres caudales medidos por separado tienen que sumar el cuarto, y el mismo río
 * medido en dos lugares tiene que dar la misma parte. Con las fechas corridas,
 * las unidades cruzadas o una serie equivocada, eso no cierra.
 *
 *   npx tsx scripts/verificar-rio-caudales.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  balance, desfasesQueCierran, balanceDeLaConfluencia,
  DESFASE_BERMEJO, DESFASE_YACYRETA_MAX, DESFASE_PARAGUAY_MAX, DIAS_MINIMOS_BALANCE,
  type CaudalConfluencia, type ClaveCaudal,
} from '../src/lib/rioCaudales'

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

// ── Ríos armados a mano ─────────────────────────────────────────────────────
titulo('Una confluencia que es exactamente la suma')

const N = 3000
const onda = (t: number, medio: number, amp: number, per: number, fase: number) =>
  medio + amp * Math.sin(t / per + fase) + amp * 0.3 * Math.sin(t / (per / 4.3) + fase * 2)
const rioA = Array.from({ length: N }, (_, t) => onda(t, 12000, 3000, 41, 0))
const rioB = Array.from({ length: N }, (_, t) => onda(t, 3000, 900, 67, 1))
const rioC = Array.from({ length: N }, (_, t) => onda(t, 400, 250, 29, 2))

function armar(dA: number, dB: number, extra = 0): CaudalConfluencia {
  const suma = rioA.map((_, t) =>
    t >= Math.max(dA, dB, DESFASE_BERMEJO) ? rioA[t - dA] + rioB[t - dB] + rioC[t - DESFASE_BERMEJO] + extra : null)
  const serie = { estacion: 0, serie: 0 }
  return {
    fuente: 'prueba', variable: 'prueba', generado: '2000-01-01', desde: '2000-01-01', hasta: '2008-03-18',
    series: { corrientes: serie, yacyreta: serie, paraguay: serie, formosa: serie, bermejo: serie },
    m3s: { corrientes: suma, yacyreta: rioA, paraguay: rioB, formosa: rioB, bermejo: rioC },
  }
}

const exacta = armar(4, 9)
const dEx = desfasesQueCierran(exacta)!
ok('encuentra la demora del primero', dEx.yacyreta, 4)
ok('y la del segundo', dEx.paraguay, 9)
ok('la del tercero es la fija', dEx.bermejo, DESFASE_BERMEJO)

const bEx = balance(exacta, dEx)!
cerca('con esas demoras el resto es cero', bEx.medias.resto, 0, 1e-6)
cerca('y no varía', bEx.desvioResto, 0, 1e-3)
cerca('la suma explica todo', bEx.r2, 1, 1e-9)
cerca('las partes suman el total',
  bEx.medias.yacyreta + bEx.medias.paraguay + bEx.medias.bermejo + bEx.medias.resto, bEx.medias.corrientes, 1e-6)
ok('cada parte es su río: el primero, unos 12.000', Math.abs(bEx.medias.yacyreta - 12000) < 300)
ok('el segundo, unos 3.000', Math.abs(bEx.medias.paraguay - 3000) < 100)
ok('están los doce meses', bEx.porMes.length, 12)
ok('y sus días suman el total', bEx.porMes.reduce((s, m) => s + m.dias, 0), bEx.dias)
ok('los percentiles van en orden',
  bEx.porElParaguay.p5 <= bEx.porElParaguay.mediana && bEx.porElParaguay.mediana <= bEx.porElParaguay.p95
    && bEx.porElParaguay.p95 <= bEx.porElParaguay.max)

/*
 * Un afluente que nadie mide: 500 m³/s constantes. Tiene que aparecer entero en
 * el resto y no repartido entre los tres ríos, y no tiene que mover las demoras.
 */
const conExtra = armar(4, 9, 500)
const bExtra = balanceDeLaConfluencia(conExtra)!
cerca('un afluente sin medir va entero al resto', bExtra.medias.resto, 500, 1e-6)
ok('y no mueve las demoras', bExtra.desfases.yacyreta === 4 && bExtra.desfases.paraguay === 9)
cerca('ni las partes de los demás', bExtra.medias.paraguay, bEx.medias.paraguay, 1e-6)

/*
 * Con las demoras equivocadas el promedio casi no cambia —correr una serie unos
 * días no le mueve la media— pero el resto empieza a subir y bajar. Por eso se
 * elige mirando la variación del resto y no su tamaño.
 */
const bMal = balance(exacta, { yacyreta: 0, paraguay: 0, bermejo: DESFASE_BERMEJO })!
ok('con las demoras equivocadas el resto sí varía', bMal.desvioResto > 200)
ok('aunque su promedio siga siendo chico', Math.abs(bMal.medias.resto) < 60)

titulo('Lo que no se puede decir, no se dice')

const vacio = armar(4, 9)
vacio.m3s.bermejo = rioC.map(() => null)
ok('sin una de las series no hay balance', balanceDeLaConfluencia(vacio), null)
const corto = armar(4, 9)
corto.m3s.corrientes = corto.m3s.corrientes.map((v, t) => (t < DIAS_MINIMOS_BALANCE - 20 ? v : null))
ok('con menos de un año tampoco', balance(corto, dEx), null)
ok('una demora fuera del rango probado no da número',
  desfasesQueCierran(armar(DESFASE_YACYRETA_MAX + 6, 9)), null)

/* Los huecos no se rellenan: con un tercio de los días borrados da lo mismo. */
const conHuecos = armar(4, 9)
conHuecos.m3s.paraguay = rioB.map((v, t) => (t % 3 === 0 ? null : v))
const bH = balanceDeLaConfluencia(conHuecos)!
ok('con un tercio de huecos las demoras no cambian', bH.desfases.yacyreta === 4 && bH.desfases.paraguay === 9)
ok('y entran menos días', bH.dias < bEx.dias)

// ── La serie real ───────────────────────────────────────────────────────────
titulo('El archivo congelado')

const c: CaudalConfluencia = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'rio', 'confluencia_caudal.json'), 'utf8'))
const claves: ClaveCaudal[] = ['corrientes', 'yacyreta', 'paraguay', 'formosa', 'bermejo']

info(`${c.desde} a ${c.hasta}`)
ok('están las cinco series', claves.every(k => Array.isArray(c.m3s[k])))
ok('todas con el mismo largo', new Set(claves.map(k => c.m3s[k].length)).size, 1)
ok('en m³/s enteros y sin negativos',
  claves.every(k => c.m3s[k].every(v => v === null || (Number.isInteger(v) && v >= 0))))
ok('el largo es el de las fechas',
  c.m3s.corrientes.length, Math.round((Date.parse(c.hasta) - Date.parse(c.desde)) / 86_400_000) + 1)

/*
 * Los órdenes de magnitud. Con las series cruzadas —el Bermejo donde va el
 * Paraguay, o alturas en vez de caudales— nada de esto se cumple.
 */
const mediana = (s: (number | null)[]) => {
  const v = s.filter((x): x is number => x !== null).sort((a, b) => a - b)
  return v[v.length >> 1]
}
ok('Corrientes anda por los 16 a 18 mil m³/s', mediana(c.m3s.corrientes) > 14000 && mediana(c.m3s.corrientes) < 20000)
ok('el Paraguay, por los 3 mil', mediana(c.m3s.paraguay) > 2000 && mediana(c.m3s.paraguay) < 4500)
ok('el Bermejo, unos cientos', mediana(c.m3s.bermejo) > 100 && mediana(c.m3s.bermejo) < 500)

titulo('El balance')

const b = balanceDeLaConfluencia(c)!
const pc = (v: number) => `${(100 * v / b.medias.corrientes).toFixed(1)} %`
info(`${b.desde} a ${b.hasta}, ${b.dias} días · demoras: Yacyretá ${b.desfases.yacyreta} d, Paraguay ${b.desfases.paraguay} d`)
info(`Corrientes ${b.medias.corrientes.toFixed(0)} = Yacyretá ${b.medias.yacyreta.toFixed(0)} (${pc(b.medias.yacyreta)})`
  + ` + Paraguay ${b.medias.paraguay.toFixed(0)} (${pc(b.medias.paraguay)})`
  + ` + Bermejo ${b.medias.bermejo.toFixed(0)} (${pc(b.medias.bermejo)})`
  + ` + resto ${b.medias.resto.toFixed(0)} (${pc(b.medias.resto)})`)
info(`R² ${b.r2.toFixed(3)} · desvío del resto ${b.desvioResto.toFixed(0)} m³/s`)
for (const m of b.porMes) {
  info(`mes ${String(m.mes).padStart(2)}  ${m.corrientes.toFixed(0).padStart(6)} m³/s`
    + `  Yacyretá ${(100 * m.yacyreta / m.corrientes).toFixed(1).padStart(5)} %`
    + `  Paraguay ${(100 * m.paraguay / m.corrientes).toFixed(1).padStart(5)} %`
    + `  Bermejo ${(100 * m.bermejo / m.corrientes).toFixed(1).padStart(4)} %`
    + `  resto ${(100 * m.resto / m.corrientes).toFixed(1).padStart(5)} %  (${m.dias} d)`)
}
info(`por el Paraguay, día por día: p5 ${(100 * b.porElParaguay.p5).toFixed(0)} %, mediana ${(100 * b.porElParaguay.mediana).toFixed(0)} %,`
  + ` p95 ${(100 * b.porElParaguay.p95).toFixed(0)} %, máximo ${(100 * b.porElParaguay.max).toFixed(0)} % el ${b.porElParaguay.fechaMax}`)

/*
 * La verificación de fondo: tres caudales medidos por separado suman el cuarto.
 * Nada en el cálculo lo fuerza — el resto es una resta, no un ajuste.
 */
ok('tres ríos medidos por separado suman Corrientes: resto bajo el 5 %',
  Math.abs(b.medias.resto) < 0.05 * b.medias.corrientes)
ok('y día por día la suma sigue a Corrientes', b.r2 > 0.85)
ok('entran más de diez años de días', b.dias > 3650)

ok('la demora de Yacyretá, entre tres y cinco días', b.desfases.yacyreta >= 3 && b.desfases.yacyreta <= 5)
ok('ninguna demora cae en el borde del rango',
  b.desfases.paraguay > 0 && b.desfases.paraguay < DESFASE_PARAGUAY_MAX)

const parte = (v: number) => v / b.medias.corrientes
ok('el Paraná por Yacyretá es la mayor parte: tres cuartos', parte(b.medias.yacyreta) > 0.7 && parte(b.medias.yacyreta) < 0.85)
ok('el Paraguay, entre el 15 y el 22 %', parte(b.medias.paraguay) > 0.15 && parte(b.medias.paraguay) < 0.22)
ok('el Bermejo, menos del 5 %', parte(b.medias.bermejo) > 0.01 && parte(b.medias.bermejo) < 0.05)

/*
 * El régimen, que se conoce sin estas series: el Paraguay culmina en invierno
 * con el agua del Pantanal, y el Bermejo en el fin del verano con las lluvias
 * de la alta cuenca.
 */
const mes = (n: number) => b.porMes.find(m => m.mes === n)!
ok('el Paraguay pesa más en julio que en febrero',
  mes(7).paraguay / mes(7).corrientes > mes(2).paraguay / mes(2).corrientes + 0.04)
const mesBermejo = b.porMes.reduce((a, m) => (m.bermejo > a.bermejo ? m : a)).mes
ok('el Bermejo trae más agua entre febrero y abril', mesBermejo >= 2 && mesBermejo <= 4)
ok('y casi nada en la primavera', mes(10).bermejo < mes(3).bermejo / 5)

titulo('El control: el Paraguay medido en Formosa')

/*
 * El mismo río más abajo, con otra escala y otra curva de gasto. Si la
 * parte del Paraguay dependiera de dónde se lo mide, no sería una propiedad del
 * río sino de una curva.
 */
const bf = balanceDeLaConfluencia(c, 'formosa')!
info(`${bf.desde} a ${bf.hasta}, ${bf.dias} días · demoras: Yacyretá ${bf.desfases.yacyreta} d, Paraguay ${bf.desfases.paraguay} d`)
info(`Paraguay ${(100 * bf.medias.paraguay / bf.medias.corrientes).toFixed(1)} % · resto ${(100 * bf.medias.resto / bf.medias.corrientes).toFixed(1)} % · R² ${bf.r2.toFixed(3)}`)

ok('la parte del Paraguay difiere menos de dos puntos',
  Math.abs(bf.medias.paraguay / bf.medias.corrientes - parte(b.medias.paraguay)) < 0.02)
ok('el resto también queda bajo el 5 %', Math.abs(bf.medias.resto) < 0.05 * bf.medias.corrientes)
ok('la demora de Yacyretá es la misma', bf.desfases.yacyreta, b.desfases.yacyreta)
ok('Formosa está más cerca: su demora no es mayor que la de Pilcomayo',
  bf.desfases.paraguay <= b.desfases.paraguay)

titulo('Es estable en el tiempo')

/* Partida la serie en dos mitades, el reparto tiene que parecerse. */
const cortar = (desde: number, hasta: number): CaudalConfluencia => ({
  ...c,
  m3s: Object.fromEntries(claves.map(k => [k, c.m3s[k].map((v, t) => (t >= desde && t < hasta ? v : null))])) as CaudalConfluencia['m3s'],
})
const dias = c.m3s.corrientes.map((_, t) => t).filter(t =>
  c.m3s.corrientes[t] !== null && c.m3s.yacyreta[t] !== null && c.m3s.paraguay[t] !== null && c.m3s.bermejo[t] !== null)
const corte = dias[dias.length >> 1]
const b1 = balance(cortar(0, corte), b.desfases)!
const b2 = balance(cortar(corte, c.m3s.corrientes.length), b.desfases)!
info(`primera mitad (${b1.desde} a ${b1.hasta}): Paraguay ${(100 * b1.medias.paraguay / b1.medias.corrientes).toFixed(1)} %, resto ${(100 * b1.medias.resto / b1.medias.corrientes).toFixed(1)} %`)
info(`segunda mitad (${b2.desde} a ${b2.hasta}): Paraguay ${(100 * b2.medias.paraguay / b2.medias.corrientes).toFixed(1)} %, resto ${(100 * b2.medias.resto / b2.medias.corrientes).toFixed(1)} %`)
ok('las dos mitades cierran bajo el 5 %',
  Math.abs(b1.medias.resto) < 0.05 * b1.medias.corrientes && Math.abs(b2.medias.resto) < 0.05 * b2.medias.corrientes)
ok('y la parte del Paraguay difiere menos de cinco puntos',
  Math.abs(b1.medias.paraguay / b1.medias.corrientes - b2.medias.paraguay / b2.medias.corrientes) < 0.05)

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
