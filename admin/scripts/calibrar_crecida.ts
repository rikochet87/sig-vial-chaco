/**
 * Calibra la cadena de crecida en Barranqueras y congela los parámetros en
 *
 *   public/rio/crecida_parametros.json
 *
 *   npx tsx scripts/calibrar_crecida.ts
 *
 * No sale a la red: lee los archivos que arma `build_crecida.mjs`
 * (`ons_represas.json`, `lluvia_brasil.json`) y los del INA que ya estaban
 * (`confluencia_caudal.json`, `barranqueras_diario.json`).
 *
 * Qué ajusta, en orden, y con qué período:
 *
 * | Paso | Qué | Ajuste | Validación |
 * |---|---|---|---|
 * | GR4J | Iguazú contra el natural de Salto Caxias; incremental de Itaipú contra el incremental del ONS | 2009–2018 (2008 de calentamiento) | 2019 en adelante |
 * | Respuesta | Itaipú + Iguazú + Paraguay → Barranqueras | 2008–2018 | 2019 en adelante |
 * | Curva | altura–caudal de Barranqueras | 1994 en adelante | — |
 * | α | mezcla con la persistencia, por anticipación | 2009–2018 | 2019 en adelante |
 *
 * Después corre la cadena entera hacia atrás («pronóstico» emitido cada día
 * con la lluvia que cayó) e informa cuánto mejora a la persistencia. **Es el
 * acierto con un pronóstico de lluvia perfecto**: un techo, no lo que se va a
 * lograr. El archivo lo dice.
 *
 * Volver a correrlo cambia los parámetros sólo si cambiaron los datos. **Si al
 * regenerar se mueven números que no se esperaban, eso es el hallazgo**: el
 * diff de git del JSON muestra cuáles y cuánto.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gr4j, mmDiaAM3s, X4_MAX, type ParametrosGr4j } from '../src/lib/gr4j'
import {
  diaDe, isoDe, lector, kge, nse, nelderMead, acotar,
  ajustarRespuesta, caudalRespuesta, armarCurva,
  proyectarI, alturaPronosticada, ATRASO_ONS,
  type Alfa, type Respuesta, type Curva,
} from '../src/lib/crecida'

const RIO = join(__dirname, '..', 'public', 'rio')
const leer = (f: string) => JSON.parse(readFileSync(join(RIO, f), 'utf8'))

const ons = leer('ons_represas.json')
// Para comparar productos de lluvia: LLUVIA=lluvia_brasil_best_match.json SALIDA=… npx tsx …
const lluvia = leer(process.env.LLUVIA || 'lluvia_brasil.json')
const conf = leer('confluencia_caudal.json')
const barr = leer('barranqueras_diario.json')

const serieOns = (k: string, v: string) => lector({ desde: ons.desde, valores: ons.series[k][v] })
const itaipu = serieOns('itaipu', 'def')
const incItaipu = serieOns('itaipu', 'inc')
const baixo = serieOns('baixoiguacu', 'def')
const caxiasDef = serieOns('caxias', 'def')
const caxiasNat = serieOns('caxias', 'nat')
const primavera = serieOns('primavera', 'def')
const rosana = serieOns('rosana', 'def')
const iguazu = (d: number) => { const b = baixo(d); return b !== null && b > 0 ? b : caxiasDef(d) }
const suma = (...f: ((d: number) => number | null)[]) => (d: number) => {
  let s = 0
  for (const g of f) { const v = g(d); if (v === null) return null; s += v }
  return s
}
const I = suma(itaipu, iguazu)
const altoParana = suma(primavera, rosana)
const B = lector({ desde: conf.desde, valores: conf.m3s.barranqueras })
const Py = lector({ desde: conf.desde, valores: conf.m3s.paraguay })
const H = lector({ desde: barr.desde, valores: barr.cm.map((v: number | null) => (v === null ? null : v / 100)) })

const d = diaDe
const fmt = (x: number, dec = 3) => +x.toFixed(dec)

// ── GR4J ──────────────────────────────────────────────────────────────────────

const t0Lluvia = d(lluvia.desde)
const LIMITES: [number, number][] = [[10, 3000], [-10, 10], [5, 2000], [0.5, X4_MAX]]
const aParams = (u: number[]): ParametrosGr4j => {
  const [x1, x2, x3, x4] = u.map((v, i) => acotar(v, ...LIMITES[i]))
  return { x1, x2, x3, x4 }
}

function simular(clave: string, p: ParametrosGr4j): Float64Array {
  const c = lluvia.cuencas[clave]
  const P = c.lluvia.map((v: number | null) => (v === null ? 0 : v / 10))
  const E = c.etp.map((v: number | null) => (v === null ? 0 : v / 10))
  const q = gr4j(P, E, p).q
  return q.map(v => mmDiaAM3s(v, c.areaKm2))
}

function puntaje(clave: string, obs: (d: number) => number | null, p: ParametrosGr4j, desde: string, hasta: string, f = kge) {
  const s = simular(clave, p)
  const o: number[] = [], m: number[] = []
  for (let t = d(desde); t < d(hasta); t++) {
    const v = obs(t), i = t - t0Lluvia
    if (v !== null && i >= 0 && i < s.length) { o.push(v); m.push(s[i]) }
  }
  return f(o, m)
}

const OBS_GR4J: Record<string, (d: number) => number | null> = { iguacu: caxiasNat, itaipu_inc: incItaipu }
const finLluvia = lluvia.hasta
const gr4jRes: Record<string, { params: ParametrosGr4j; kgeCal: number; kgeVal: number; nseCal: number; nseVal: number }> = {}
const SIM: Record<string, Float64Array> = {}

for (const clave of ['iguacu', 'itaipu_inc']) {
  const obs = OBS_GR4J[clave]
  let mejor: { x: number[]; f: number } | null = null
  for (const arranque of [[0, 0, 0, -1], [1, -1, 1, 0], [-1, 0.5, -1, -2], [2, 0, -0.5, -1]]) {
    const r = nelderMead(u => -puntaje(clave, obs, aParams(u), '2009-01-01', '2019-01-01'), arranque, 350)
    if (!mejor || r.f < mejor.f) mejor = r
  }
  const p = aParams(mejor!.x)
  gr4jRes[clave] = {
    params: { x1: fmt(p.x1, 2), x2: fmt(p.x2, 4), x3: fmt(p.x3, 2), x4: fmt(p.x4, 4) },
    kgeCal: fmt(puntaje(clave, obs, p, '2009-01-01', '2019-01-01')),
    kgeVal: fmt(puntaje(clave, obs, p, '2019-01-01', finLluvia)),
    nseCal: fmt(puntaje(clave, obs, p, '2009-01-01', '2019-01-01', nse)),
    nseVal: fmt(puntaje(clave, obs, p, '2019-01-01', finLluvia, nse)),
  }
  SIM[clave] = simular(clave, gr4jRes[clave].params)
  console.log(`GR4J ${clave}:`, gr4jRes[clave])
}
const modelo = (clave: string) => (dia: number) => {
  const i = dia - t0Lluvia
  return i >= 0 && i < SIM[clave].length ? SIM[clave][i] : null
}
const incModelo = modelo('itaipu_inc')
const iguazuModelo = modelo('iguacu')

// Razón entre lo que larga el Iguazú abajo y el natural de Salto Caxias
let sA = 0, sB = 0
for (let t = d('2019-01-01'); t < d(ons.hasta); t++) { const a = baixo(t), b = caxiasNat(t); if (a && b) { sA += a; sB += b } }
const razonIguazu = fmt(sA / sB)

// ── Respuesta y curva ─────────────────────────────────────────────────────────

const { respuesta: resp, n: nResp } = ajustarRespuesta(I, Py, B, d('2008-01-20'), d('2019-01-01'))
const respuesta: Respuesta = { pesos: resp.pesos.map(v => fmt(v, 4)), paraguay: fmt(resp.paraguay, 4), constante: Math.round(resp.constante) }
function nseRespuesta(desde: string, hasta: string) {
  const o: number[] = [], s: number[] = []
  for (let t = d(desde); t < d(hasta); t++) { const b = B(t), q = caudalRespuesta(respuesta, t, I, Py); if (b !== null && q !== null) { o.push(b); s.push(q) } }
  return { nse: fmt(nse(o, s)), dias: o.length }
}
const respuestaVal = { cal: nseRespuesta('2008-01-20', '2019-01-01'), val: nseRespuesta('2019-01-01', ons.hasta) }
console.log('Respuesta:', respuesta, 'suma de pesos', fmt(respuesta.pesos.reduce((a, b) => a + b, 0)), respuestaVal)

const pares: [number, number][] = []
for (let t = d('1994-08-01'); t < d(conf.hasta); t++) { const h = H(t), q = B(t); if (h !== null && q !== null) pares.push([h, q]) }
const curva: Curva = armarCurva(pares).map(([h, q]) => [h, Math.round(q)])

// ── α: mezcla con la persistencia ─────────────────────────────────────────────

const DIAS_ALFA = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 18]
const soloModelo: Alfa = [[0, 1], [100, 1]]
const entradas = (hoy: number, alfa: Alfa) => ({
  hoy, I, itaipu, iguazu, altoParana, incItaipu, incModelo, iguazuModelo, razonIguazu, alfa,
})
const alfa: Alfa = []
const alfaVal: Record<number, { persistencia: number; mezcla: number; mejora: number }> = {}
for (const k of DIAS_ALFA) {
  let sxy = 0, sxx = 0
  for (let hoy = d('2009-03-01'); hoy < d('2019-01-01'); hoy++) {
    const L = hoy - ATRASO_ONS, IL = I(L), It = I(L + k)
    const f = proyectarI(entradas(hoy, soloModelo))
    const m = f?.(L + k) ?? null
    if (IL === null || It === null || m === null) continue
    sxy += (It - IL) * (m - IL); sxx += (m - IL) ** 2
  }
  const a = fmt(sxy / sxx)
  alfa.push([k, a])
}
for (const k of DIAS_ALFA) {
  let ep = 0, em = 0
  for (let hoy = d('2019-01-01'); hoy < d(ons.hasta) - k; hoy++) {
    const L = hoy - ATRASO_ONS, IL = I(L), It = I(L + k)
    const m = proyectarI(entradas(hoy, alfa))?.(L + k) ?? null
    if (IL === null || It === null || m === null) continue
    ep += Math.abs(It - IL); em += Math.abs(It - m)
  }
  alfaVal[k] = { persistencia: Math.round(ep), mezcla: Math.round(em), mejora: fmt(1 - em / ep, 2) }
}
console.log('α:', alfa.map(([k, a]) => `${k}d ${a}`).join(' '), 'validación', Object.entries(alfaVal).map(([k, v]) => `${k}d ${v.mejora}`).join(' '))

// ── La cadena hacia atrás ─────────────────────────────────────────────────────

const UMBRAL_ALTO = 24000
const ANTICIPACIONES = [3, 5, 7, 10, 15]
type Fila = { dias: number; n: number; persistencia: number; cadena: number; soloMedido: number; mejora: number; mejoraSoloMedido: number }
function hacia_atras(desde: string, hasta: string): Fila[] {
  return ANTICIPACIONES.map(k => {
    let ep = 0, ec = 0, es = 0, n = 0
    for (let hoy = d(desde); hoy < d(hasta) - k; hoy++) {
      const b0 = B(hoy), b1 = B(hoy + k)
      if (b0 === null || b1 === null || b1 < UMBRAL_ALTO) continue
      const f = proyectarI(entradas(hoy, alfa))
      const L = hoy - ATRASO_ONS, IL = I(L)
      if (!f || IL === null) continue
      const quieto = (t: number) => (t <= L ? I(t) : IL)
      const pc = cambio(f, hoy, k), ps = cambio(quieto, hoy, k)
      if (pc === null || ps === null) continue
      ep += Math.abs(b1 - b0); ec += Math.abs(b1 - (b0 + pc)); es += Math.abs(b1 - (b0 + ps)); n++
    }
    return { dias: k, n, persistencia: Math.round(ep / n), cadena: Math.round(ec / n), soloMedido: Math.round(es / n), mejora: fmt(1 - ec / ep, 2), mejoraSoloMedido: fmt(1 - es / ep, 2) }
  })
}
function cambio(If: (t: number) => number | null, hoy: number, k: number): number | null {
  let ultimo: number | null = null
  for (let j = 1; j <= 20 && ultimo === null; j++) ultimo = Py(hoy - j)
  const P = (t: number) => (t < hoy ? Py(t) ?? ultimo : ultimo)
  const a = caudalRespuesta(respuesta, hoy, If, P), b = caudalRespuesta(respuesta, hoy + k, If, P)
  return a === null || b === null ? null : b - a
}
const validacion = { todo: hacia_atras('2009-03-01', conf.hasta), desde2019: hacia_atras('2019-01-01', conf.hasta) }
console.log('Hacia atrás, aguas altas, todo:'); console.table(validacion.todo)
console.log('Hacia atrás, aguas altas, desde 2019:'); console.table(validacion.desde2019)

// ── Crecidas pasadas, en metros ───────────────────────────────────────────────

const PICOS = ['2009-10-30', '2013-07-04', '2014-06-18', '2016-03-11', '2023-11-10']
const casos = PICOS.map(aprox => {
  let hm = -Infinity, tm = d(aprox)
  for (let t = d(aprox) - 6; t <= d(aprox) + 6; t++) { const h = H(t); if (h !== null && h > hm) { hm = h; tm = t } }
  const emitido: Record<string, number | null> = {}
  for (const k of [15, 10, 7, 5, 3]) {
    const hoy = tm - k, h0 = H(hoy), f = proyectarI(entradas(hoy, alfa))
    emitido[`${k}d`] = h0 === null || !f ? null : fmt(alturaPronosticada(respuesta, curva, hoy, h0, k, f, Py) ?? NaN, 2)
  }
  return { pico: isoDe(tm), observado: fmt(hm, 2), emitido }
})
console.log('Crecidas pasadas:'); console.table(casos.map(c => ({ pico: c.pico, obs: c.observado, ...c.emitido })))

// ── Escribir ──────────────────────────────────────────────────────────────────

const salida = {
  generado: new Date().toISOString().slice(0, 10),
  metodo: 'docs/pronostico-crecida-barranqueras.md',
  datos: { ons: `${ons.desde} a ${ons.hasta}`, lluvia: `${lluvia.desde} a ${lluvia.hasta}`, ina: `${conf.desde} a ${conf.hasta}` },
  gr4j: Object.fromEntries(Object.entries(gr4jRes).map(([k, v]) => [k, { ...v, areaKm2: lluvia.cuencas[k].areaKm2 }])),
  razonIguazu,
  respuesta: { ...respuesta, nResp, ...respuestaVal },
  curva,
  alfa,
  alfaValidacion: alfaVal,
  validacion: {
    nota: 'Con la lluvia que cayó (ERA5): es el acierto con un pronóstico de lluvia perfecto, un techo. Error medio en m³/s, días con Barranqueras sobre 24.000 m³/s.',
    ...validacion,
  },
  casos,
}
const destino = process.env.SALIDA || join(RIO, 'crecida_parametros.json')
writeFileSync(destino, JSON.stringify({ lluvia: lluvia.fuente, ...salida }, null, 1))
console.log(`${destino} escrito`)
