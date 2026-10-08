/**
 * Genera el archivo congelado del tramo del río Paraná, tal como lo publica el
 * Alerta Hidrológico del INA:
 *
 *   public/rio/tramo_diario.json        las diez escalas del Paraná de Posadas a
 *                                       Goya, desde 1970, tres del río Paraguay
 *                                       y una del Bermejo
 *
 *   node scripts/build_rio_historico.mjs
 *
 * El registro largo —Barranqueras desde 1906— lo genera
 * `build_rio_barranqueras.mjs`. Hasta el 06/10/2026 este script escribía
 * también `corrientes_diario.json`, la serie de Corrientes desde 1901, que era
 * la del registro histórico; se sacó cuando el registro pasó a Barranqueras y
 * ninguna pantalla la leía más. Si hace falta, es la serie 26261 entera.
 *
 * ── Por qué van congelados y no se piden en vivo ──────────────────────────────
 *
 * Son décadas que ya pasaron: no cambian. Pedirlas en cada visita serían más de
 * 50 MB contra un organismo público para recalcular siempre lo mismo, y dejaría
 * la recurrencia —un número que se cita— dependiendo de que el INA conteste ese
 * día. Congelados, los tests los afirman contra las crecidas conocidas y dos
 * personas que miran la pantalla en días distintos ven la misma tabla.
 *
 * El costo es que envejecen: **el año en curso no entra hasta que se
 * regeneran.** La pantalla dice hasta qué fecha llegan. Conviene correrlo una
 * vez por año, pasado agosto, que es cuando cierra el año hidrológico.
 *
 * ── Qué series ────────────────────────────────────────────────────────────────
 *
 * Las de **«Altura hidrométrica media diaria»**, y no las de lecturas sueltas
 * que usa el panel del día: aquéllas traen una, dos o más lecturas por día
 * según la época, y un máximo anual sacado de ahí dependería de cuántas veces
 * se leyó la escala ese año.
 *
 * ── Por qué el tramo arranca en 1970 ──────────────────────────────────────────
 *
 * Barranqueras y Bella Vista no tienen media diaria anterior, y el traslado se
 * mide entre pares de estaciones: sirve el período que comparten. Coincide con
 * el régimen actual del río, que es el que interesa para anticipar.
 *
 * ── Las del río Paraguay van aparte ───────────────────────────────────────────
 *
 * En la clave `paraguay` y no en `estaciones`: no son del tramo. El Paraguay
 * entra al Paraná entre Itá Ibaté y Corrientes, y lo que se le mide no es un
 * traslado sino cuánto de lo que llega a Corrientes viene por ahí. Son Puerto
 * Pilcomayo y Puerto Bermejo, las dos con media diaria desde 1970; Formosa e
 * Isla del Cerrito arrancan en 2006.
 *
 * ── El formato ────────────────────────────────────────────────────────────────
 *
 * Un día por posición a partir de `desde`, en **centímetros enteros**, con
 * `null` donde el INA no tiene dato. Un hueco es un hueco: no se interpola.
 *
 * El nombre empieza con `build_` y no con `verificar-` a propósito: sale a la
 * red, así que no puede entrar en `npm run verificar`.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'rio')
const FUENTE = 'Alerta Hidrológico — Instituto Nacional del Agua'
const DIA = 86_400_000

/**
 * Estación → serie de altura media diaria. De aguas arriba hacia abajo.
 *
 * Desde el 08/10/2026 entran también las cuatro escalas del Paraná aguas
 * arriba de Itá Ibaté —Posadas, Ituzaingó, Itatí y Paso de la Patria—, para
 * medir cuánto antes que en Barranqueras pasa la crecida por cada una.
 */
const SERIES = {
  14: 26256, 15: 26257, 16: 26258, 17: 26259, 18: 26260,
  19: 26261, 20: 26262, 21: 26263, 22: 26264, 23: 26265,
}

/**
 * Las del río Paraguay: Puerto Pilcomayo, Puerto Formosa y Puerto Bermejo.
 * Formosa tiene media diaria recién desde 2006.
 */
const SERIES_PARAGUAY = { 55: 26297, 57: 26299, 58: 26300 }

/**
 * El río Bermejo en El Colorado (Formosa), antes de desembocar en el Paraguay.
 * Media diaria desde 2001, y **se carga con meses de atraso**: no entra en la
 * cuenta de hasta dónde llega el archivo, o lo recortaría entero.
 */
const SERIES_BERMEJO = { 2046: 29684 }

/** Las que tienen menos historia que el resto, con el mínimo de filas que se les pide */
const MINIMO_FILAS = { 26299: 5_000, 29684: 5_000 }

const hoy = new Date().toISOString().slice(0, 10)
const pausa = ms => new Promise(r => setTimeout(r, ms))

/** Baja una serie entera y la devuelve como fecha → metros */
async function bajar(serie) {
  const url = `https://alerta.ina.gob.ar/a5/obs/puntual/series/${serie}/observaciones`
    + `?timestart=1900-01-01&timeend=${hoy}&format=json`
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(240_000) })
  if (!res.ok) throw new Error(`el INA respondió ${res.status} para la serie ${serie}`)
  const filas = await res.json()
  if (!Array.isArray(filas) || filas.length < (MINIMO_FILAS[serie] ?? 15_000)) {
    throw new Error(`respuesta inesperada para la serie ${serie}: `
      + (Array.isArray(filas) ? `${filas.length} filas` : typeof filas))
  }

  /*
   * La fecha es el día de `timestart` leído en UTC, sin convertir.
   *
   * El INA marca cada día en la medianoche local, y la hora local de Argentina
   * estuvo siempre al oeste de Greenwich —de −4:16:48 en 1901 a −3 hoy—, así
   * que la medianoche local cae entre las 02:00 y las 04:17 UTC **del mismo
   * día**. Convertir con el huso de hoy correría un día las fechas viejas.
   */
  const porFecha = new Map()
  for (const f of filas) {
    if (typeof f?.valor !== 'number' || typeof f?.timestart !== 'string') continue
    const d = f.timestart.slice(0, 10)
    if (porFecha.has(d)) throw new Error(`fecha repetida en la serie ${serie}: ${d}`)
    porFecha.set(d, f.valor)
  }
  return porFecha
}

/** De fecha → metros a un arreglo de centímetros, un día por posición */
function aCentimetros(porFecha, desde, hasta) {
  const t0 = Date.parse(desde + 'T00:00:00Z')
  const n = Math.round((Date.parse(hasta + 'T00:00:00Z') - t0) / DIA) + 1
  const cm = new Array(n).fill(null)
  for (const [d, m] of porFecha) {
    const i = Math.round((Date.parse(d + 'T00:00:00Z') - t0) / DIA)
    if (i >= 0 && i < n) cm[i] = Math.round(m * 100)
  }
  return cm
}

const ultima = porFecha => [...porFecha.keys()].sort().at(-1)

try {
  mkdirSync(DIR, { recursive: true })
  const bajadas = {}

  // De a una y con pausa: son catorce pedidos de 2 a 11 MB a un organismo público
  for (const [estacion, serie] of Object.entries({ ...SERIES, ...SERIES_PARAGUAY, ...SERIES_BERMEJO })) {
    console.log(`Pidiendo la serie ${serie} (estación ${estacion})…`)
    bajadas[estacion] = await bajar(serie)
    await pausa(1500)
  }

  // ── El tramo, desde 1970 ────────────────────────────────────────────────
  {
    const desde = '1970-01-01'
    // Hasta la fecha más vieja entre las últimas del Paraná y el Paraguay: que
    // ninguna termine en hueco. El Bermejo queda afuera de esta cuenta.
    const hasta = Object.keys({ ...SERIES, ...SERIES_PARAGUAY })
      .map(e => ultima(bajadas[e])).sort()[0]
    const estaciones = {}
    for (const estacion of Object.keys(SERIES)) {
      estaciones[estacion] = aCentimetros(bajadas[estacion], desde, hasta)
    }
    const paraguay = {}
    for (const estacion of Object.keys(SERIES_PARAGUAY)) {
      paraguay[estacion] = aCentimetros(bajadas[estacion], desde, hasta)
    }
    const bermejo = {}
    for (const estacion of Object.keys(SERIES_BERMEJO)) {
      bermejo[estacion] = aCentimetros(bajadas[estacion], desde, hasta)
    }
    const salida = join(DIR, 'tramo_diario.json')
    writeFileSync(salida, JSON.stringify({
      fuente: FUENTE,
      variable: 'Altura hidrométrica media diaria, en cm sobre el cero de cada escala',
      generado: hoy, desde, hasta,
      series: { ...SERIES, ...SERIES_PARAGUAY, ...SERIES_BERMEJO }, estaciones, paraguay, bermejo,
    }))
    console.log(`✓ ${salida}`)
    for (const [e, cm] of Object.entries({ ...estaciones, ...paraguay, ...bermejo })) {
      console.log(`  estación ${e}: ${cm.filter(v => v !== null).length} días con dato de ${cm.length}`)
    }
  }
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : e}`)
  process.exit(1)
}
