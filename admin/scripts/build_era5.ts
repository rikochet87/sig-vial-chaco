/**
 * Baja la lluvia diaria de ERA5 sobre la provincia, año por año, y la deja
 * congelada en `public/lluvia/era5/`.
 *
 *   npx tsx scripts/build_era5.ts              baja el año que sigue, hacia atrás
 *   npx tsx scripts/build_era5.ts --anios 2    hasta dos años en esta corrida
 *   npx tsx scripts/build_era5.ts 2019 2018    esos años, aunque ya estén
 *
 * ── Para qué ──────────────────────────────────────────────────────────────────
 *
 * Los partes de la APA empiezan en 09/2025: hay un año de lluvia medida. Con
 * un año no se puede decir qué tan raro es un evento, ni cruzar la lluvia con
 * los caudales del INA, que terminan antes de que empiecen los partes. ERA5 es
 * lo único que hay hacia atrás.
 *
 * **Es lluvia modelada, no medida.** Contra los pluviómetros la serie modelada
 * correlaciona 0,38 y se queda corta en los eventos fuertes. Sirve para
 * frecuencias y promedios sobre una cuenca, no para decir cuánto llovió un día
 * en un lugar.
 *
 * ── Por qué `models=era5` y no el pedido de siempre ───────────────────────────
 *
 * La ingesta diaria no fija modelo, y entonces Open-Meteo mezcla tres: IFS
 * desde 2017, ERA5 y ERA5-Land. Para el día de ayer eso es lo mejor que hay;
 * para una serie de décadas es un problema, porque el producto cambia en el
 * medio y un salto en la serie puede ser del modelo y no de la lluvia. Acá se
 * pide ERA5 solo: el mismo modelo de punta a punta, a 0,25°.
 *
 * ── Los nodos ─────────────────────────────────────────────────────────────────
 *
 * Los de `grillaEn(CONTORNO_CHACO)`: la grilla de 0,25° que cae dentro de la
 * provincia, **la misma del pronóstico por cuenca**. Con los mismos nodos el
 * pronóstico se puede poner al lado de lo que es normal para la época.
 *
 * ── El cupo, que es lo que manda ──────────────────────────────────────────────
 *
 * Open-Meteo cuenta cada ubicación por separado, y un rango de más de dos
 * semanas como varias llamadas: un nodo por un año son unas 26. Un año de
 * todos los nodos son ~3.600, contra topes de 600 por minuto, 5.000 por hora y
 * 10.000 por día.
 *
 * - De a `LOTE` nodos por pedido y con `PAUSA_MS` entre pedidos, para no
 *   pasar el tope por minuto: un año tarda unos ocho minutos.
 * - **Un año por hora**: entre un año y el siguiente espera lo que falte para
 *   completar la hora.
 * - Por defecto baja un año por corrida. Con dos por día la serie desde 2001
 *   lleva dos semanas, y no hay apuro: son décadas que no cambian.
 *
 * **El cupo es por dirección de red, no por proyecto**: lo que se baja desde
 * esta máquina no le saca nada al cron de Vercel, que sale desde otra.
 *
 * Un año se escribe entero o no se escribe: si el servicio corta a la mitad,
 * queda como estaba y la próxima corrida lo vuelve a pedir.
 *
 * ── El formato ────────────────────────────────────────────────────────────────
 *
 * `indice.json` tiene los nodos y los años que hay. Cada `AAAA.json` trae un
 * arreglo plano, día por día y adentro de cada día nodo por nodo, en **décimas
 * de milímetro**; `null` donde el modelo no tiene dato. El día es el local
 * (America/Argentina/Cordoba), igual que en la ingesta.
 *
 * El año en curso queda incompleto —ERA5 llega con unos cinco días de atraso— y
 * hay que volver a pedirlo por nombre para completarlo.
 *
 * El nombre empieza con `build_` y no con `verificar-` a propósito: sale a la
 * red y gasta cupo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONTORNO_CHACO } from '../src/data/contornoChaco'
import { grillaEn } from '../src/lib/pronostico'

const DIR = join(__dirname, '..', 'public', 'lluvia', 'era5')
const API = 'https://archive-api.open-meteo.com/v1/archive'
const MODELO = 'era5'
const FUENTE = 'ERA5 (ECMWF / Copernicus), vía Open-Meteo'

/** El año más viejo que se baja solo. Más atrás hay que pedirlo por nombre */
const DESDE_ANIO = 2001

/** Nodos por pedido: 8 nodos por un año son ~210 llamadas de cupo */
const LOTE = 8
/** Entre pedidos, para quedar bien abajo de las 600 llamadas por minuto */
const PAUSA_MS = 25_000
/** Entre un año y el siguiente, por el tope de 5.000 por hora */
const HORA_MS = 61 * 60_000
const REINTENTOS = 4
const ESPERA_429_MS = 70_000

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))
const hoy = new Date().toISOString().slice(0, 10)

interface Indice {
  fuente: string
  modelo: string
  variable: string
  generado: string
  nodos: { lat: number; lng: number }[]
  /** Año → hasta qué día llega su archivo */
  anios: Record<string, { hasta: string; dias: number; completo: boolean }>
}

const nodos = grillaEn(CONTORNO_CHACO)

function leerIndice(): Indice {
  const f = join(DIR, 'indice.json')
  if (existsSync(f)) {
    const i = JSON.parse(readFileSync(f, 'utf8')) as Indice
    // Si la grilla cambió, lo bajado ya no corresponde a estos nodos
    const igual = i.nodos.length === nodos.length
      && i.nodos.every((n, k) => n.lat === nodos[k].lat && n.lng === nodos[k].lng)
    if (!igual) throw new Error('los nodos del índice no son los de la grilla actual: hay que rehacer la descarga')
    return i
  }
  return {
    fuente: FUENTE, modelo: MODELO,
    variable: 'Precipitación diaria, en décimas de mm, por día local y por nodo',
    generado: hoy, nodos, anios: {},
  }
}

/** Un pedido: `grupo` de nodos, un año. Devuelve las fechas y los mm de cada nodo */
async function pedir(grupo: typeof nodos, desde: string, hasta: string) {
  const url = `${API}?latitude=${grupo.map(p => p.lat).join(',')}`
    + `&longitude=${grupo.map(p => p.lng).join(',')}`
    + `&start_date=${desde}&end_date=${hasta}`
    + `&daily=precipitation_sum&timezone=America%2FArgentina%2FCordoba&models=${MODELO}`

  for (let intento = 0; ; intento++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
    if (res.ok) {
      const json = await res.json()
      const rs = (Array.isArray(json) ? json : [json]) as { daily?: { time?: string[]; precipitation_sum?: (number | null)[] } }[]
      if (rs.length !== grupo.length) throw new Error(`se pidieron ${grupo.length} nodos y volvieron ${rs.length}`)
      return rs.map(r => ({ fechas: r.daily?.time ?? [], mm: r.daily?.precipitation_sum ?? [] }))
    }
    const cuerpo = (await res.text()).slice(0, 200)
    if (res.status === 429 && intento < REINTENTOS) {
      console.log(`    cupo agotado (${cuerpo.trim()}); espero ${ESPERA_429_MS / 1000} s…`)
      await dormir(ESPERA_429_MS)
      continue
    }
    throw new Error(`Open-Meteo respondió ${res.status} — ${cuerpo}`)
  }
}

async function bajarAnio(anio: number, indice: Indice) {
  const desde = `${anio}-01-01`
  const finDeAnio = `${anio}-12-31`
  const hasta = finDeAnio < hoy ? finDeAnio : hoy
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1

  const porNodo: (number | null)[][] = []
  let fechas: string[] | null = null
  for (let i = 0; i < nodos.length; i += LOTE) {
    if (i > 0) await dormir(PAUSA_MS)
    const rs = await pedir(nodos.slice(i, i + LOTE), desde, hasta)
    for (const r of rs) {
      if (r.fechas.length !== dias || r.mm.length !== dias) {
        throw new Error(`${anio}: se esperaban ${dias} días y llegaron ${r.fechas.length}`)
      }
      fechas ??= r.fechas
      if (r.fechas[0] !== desde || r.fechas[dias - 1] !== hasta) throw new Error(`${anio}: las fechas no son las pedidas`)
      porNodo.push(r.mm)
    }
    process.stdout.write(`\r  ${anio}: ${Math.min(i + LOTE, nodos.length)} de ${nodos.length} nodos`)
  }
  process.stdout.write('\n')

  // Día por día, y adentro de cada día nodo por nodo
  const mm: (number | null)[] = new Array(dias * nodos.length)
  let nulos = 0, ultimoConDato = -1
  for (let d = 0; d < dias; d++) {
    let hay = false
    for (let n = 0; n < nodos.length; n++) {
      const v = porNodo[n][d]
      if (v !== null && v !== undefined && (!Number.isFinite(v) || v < 0)) throw new Error(`${anio}: valor imposible ${v}`)
      if (v === null || v === undefined) { mm[d * nodos.length + n] = null; nulos++ }
      else { mm[d * nodos.length + n] = Math.round(v * 10); hay = true }
    }
    if (hay) ultimoConDato = d
  }
  if (ultimoConDato < 0) throw new Error(`${anio}: el modelo no devolvió ningún dato`)

  // Se corta en el último día con dato: lo que sigue todavía no existe
  const diasUtiles = ultimoConDato + 1
  const hastaReal = fechas![ultimoConDato]
  writeFileSync(join(DIR, `${anio}.json`), JSON.stringify({
    anio, modelo: MODELO, desde, hasta: hastaReal, dias: diasUtiles, nodos: nodos.length,
    mm: mm.slice(0, diasUtiles * nodos.length),
  }))
  indice.anios[String(anio)] = { hasta: hastaReal, dias: diasUtiles, completo: hastaReal === finDeAnio }
  indice.generado = hoy
  writeFileSync(join(DIR, 'indice.json'), JSON.stringify(indice))

  const total = mm.slice(0, diasUtiles * nodos.length).reduce((s: number, v) => s + (v ?? 0), 0) / 10 / nodos.length
  console.log(`✓ ${anio}: ${desde} a ${hastaReal}, ${diasUtiles} días, media de la provincia ${total.toFixed(0)} mm`
    + (nulos ? `, ${nulos} valores sin dato` : ''))
}

async function main() {
  mkdirSync(DIR, { recursive: true })
  const indice = leerIndice()
  const args = process.argv.slice(2)
  const iAnios = args.indexOf('--anios')
  const cuantos = iAnios >= 0 ? Math.max(1, Number(args[iAnios + 1]) || 1) : 1
  // El número que sigue a `--anios` es una cantidad, no un año
  const pedidos = args.filter((a, i) => /^\d{4}$/.test(a) && !(iAnios >= 0 && i === iAnios + 1)).map(Number)

  let lista: number[]
  if (pedidos.length) lista = pedidos
  else {
    // De lo más nuevo hacia atrás: primero lo que se cruza con los datos que ya hay
    lista = []
    for (let a = Number(hoy.slice(0, 4)); a >= DESDE_ANIO && lista.length < cuantos; a--) {
      if (!indice.anios[String(a)]) lista.push(a)
    }
  }
  if (!lista.length) { console.log(`No falta ningún año desde ${DESDE_ANIO}.`); return }

  console.log(`${nodos.length} nodos · años a bajar: ${lista.join(', ')}`)
  for (let k = 0; k < lista.length; k++) {
    const t0 = Date.now()
    await bajarAnio(lista[k], indice)
    if (k < lista.length - 1) {
      const falta = HORA_MS - (Date.now() - t0)
      if (falta > 0) {
        console.log(`  espero ${Math.round(falta / 60_000)} min antes del año siguiente, por el tope por hora…`)
        await dormir(falta)
      }
    }
  }
  const hay = Object.keys(indice.anios).sort()
  console.log(`Hay ${hay.length} año(s): ${hay[0]} a ${hay[hay.length - 1]}.`)
}

main().catch(e => { console.error(`✗ ${e instanceof Error ? e.message : e}`); process.exit(1) })
