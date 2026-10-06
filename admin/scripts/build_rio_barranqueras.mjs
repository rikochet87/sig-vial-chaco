/**
 * Genera el registro largo del Paraná en Barranqueras, tal como lo publica el
 * Alerta Hidrológico del INA:
 *
 *   public/rio/barranqueras_diario.json   altura diaria desde 1906
 *
 *   node scripts/build_rio_barranqueras.mjs
 *
 * Es el archivo que lee el registro histórico de la pantalla del río
 * (`lib/rioHistorico.ts`). Por qué va congelado y no se pide en vivo está en
 * `build_rio_historico.mjs`; vale lo mismo acá, incluido que **el año en curso
 * no entra hasta regenerar**.
 *
 * ── Dos series, y por qué se pueden juntar ────────────────────────────────────
 *
 * La «Altura hidrométrica media diaria» de Barranqueras (serie 26262) arranca
 * el 01/01/1970. Sola, deja el registro en 56 años. Pero la escala se lee desde
 * 1906, y esas lecturas están en la serie 20, la de medición directa:
 *
 * - **Hasta 2012 hay exactamente una lectura por día.** El reparo contra las
 *   lecturas sueltas —que un máximo anual dependa de cuántas veces se leyó la
 *   escala— no aplica cuando se la leyó una sola vez: esa lectura es el dato
 *   del día.
 * - **Donde existen las dos, coinciden.** Sobre los 20.447 días en común
 *   (medido el 06/10/2026) el promedio de las lecturas del día contra la media
 *   diaria da sesgo 0,00 cm y error medio 0,02 cm, con un solo día a más de
 *   10 cm. La media diaria del INA *es* el promedio de estas lecturas.
 *
 * La regla es una sola para todo el registro: **la media diaria donde existe,
 * y si no, el promedio de las lecturas de ese día.** Antes de 1970 eso es
 * siempre la lectura única; después completa los pocos huecos de la media
 * diaria que la escala sí tiene —45 días—. **No rescata 1989/90 ni 1990/91**:
 * en esos huecos tampoco hay lecturas, y los dos años siguen incompletos.
 *
 * El script vuelve a medir la coincidencia en cada corrida y **se niega a
 * escribir si dejó de cumplirse**: si el INA recarga una de las dos series,
 * juntarlas deja de estar justificado.
 *
 * `origen` dice de dónde salió cada tramo, y la pantalla lo informa.
 *
 * ── Va aparte de `build_rio_historico.mjs` ────────────────────────────────────
 *
 * Para no volver a bajar ni mover `tramo_diario.json`, sobre el que hay tests.
 * Mismo motivo que `build_rio_caudales.mjs`.
 *
 * ── La fecha ──────────────────────────────────────────────────────────────────
 *
 * El día de `timestart` leído en UTC, sin convertir. Las lecturas están
 * marcadas entre las 03:00 y las 19:00 UTC —de la medianoche a la tarde, hora
 * local—, así que caen siempre en el mismo día. La coincidencia día a día con
 * la media diaria es la comprobación: con las fechas corridas no daría cero.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'rio')
const FUENTE = 'Alerta Hidrológico — Instituto Nacional del Agua'
const DIA = 86_400_000

const ESTACION = 20
/** Altura hidrométrica media diaria */
const SERIE_MEDIA = 26262
/** Altura hidrométrica, medición directa: las lecturas de la escala */
const SERIE_LECTURAS = 20

/** Error medio, en cm, por encima del cual las dos series ya no son la misma */
const MAE_MAX_CM = 0.5

const hoy = new Date().toISOString().slice(0, 10)
const pausa = ms => new Promise(r => setTimeout(r, ms))

/** Baja una serie entera y la devuelve como fecha → lista de metros */
async function bajar(serie) {
  const url = `https://alerta.ina.gob.ar/a5/obs/puntual/series/${serie}/observaciones`
    + `?timestart=1900-01-01&timeend=${hoy}&format=json`
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(300_000) })
  if (!res.ok) throw new Error(`el INA respondió ${res.status} para la serie ${serie}`)
  const filas = await res.json()
  if (!Array.isArray(filas) || filas.length < 15_000) {
    throw new Error(`respuesta inesperada para la serie ${serie}: `
      + (Array.isArray(filas) ? `${filas.length} filas` : typeof filas))
  }
  const porFecha = new Map()
  for (const f of filas) {
    if (typeof f?.valor !== 'number' || typeof f?.timestart !== 'string') continue
    const d = f.timestart.slice(0, 10)
    const lista = porFecha.get(d)
    if (lista) lista.push(f.valor)
    else porFecha.set(d, [f.valor])
  }
  return porFecha
}

const promedio = v => v.reduce((a, b) => a + b, 0) / v.length

try {
  mkdirSync(DIR, { recursive: true })

  console.log(`Pidiendo la serie ${SERIE_MEDIA} (media diaria)…`)
  const media = await bajar(SERIE_MEDIA)
  await pausa(1500)
  console.log(`Pidiendo la serie ${SERIE_LECTURAS} (lecturas de la escala)…`)
  const lecturas = await bajar(SERIE_LECTURAS)

  for (const [d, v] of media) {
    if (v.length !== 1) throw new Error(`fecha repetida en la media diaria: ${d}`)
  }

  // ── La comprobación que justifica juntarlas ─────────────────────────────
  let comunes = 0, suma = 0, sumaAbs = 0, lejos = 0
  for (const [d, [m]] of media) {
    const l = lecturas.get(d)
    if (!l) continue
    const dif = (promedio(l) - m) * 100
    comunes++
    suma += dif
    sumaAbs += Math.abs(dif)
    if (Math.abs(dif) > 10) lejos++
  }
  if (comunes < 15_000) throw new Error(`las dos series comparten sólo ${comunes} días: no alcanza para compararlas`)
  const sesgo = suma / comunes
  const mae = sumaAbs / comunes
  console.log(`  ${comunes} días en común: sesgo ${sesgo.toFixed(2)} cm, error medio ${mae.toFixed(2)} cm, ${lejos} a más de 10 cm`)
  if (mae > MAE_MAX_CM) {
    throw new Error(`las lecturas y la media diaria ya no coinciden (error medio ${mae.toFixed(2)} cm): `
      + 'no se escribe nada. Hay que mirar qué cambió en el INA antes de juntarlas.')
  }

  // ── El registro ─────────────────────────────────────────────────────────
  const fechas = [...new Set([...media.keys(), ...lecturas.keys()])].sort()
  const desde = fechas[0]
  /*
   * Hasta el último día con media diaria, no con lectura: las lecturas del día
   * en curso van llegando, y un día a medio leer no es un dato diario.
   */
  const hasta = [...media.keys()].sort().at(-1)
  const mediaDesde = [...media.keys()].sort()[0]

  const t0 = Date.parse(desde + 'T00:00:00Z')
  const n = Math.round((Date.parse(hasta + 'T00:00:00Z') - t0) / DIA) + 1
  const cm = new Array(n).fill(null)
  let deMedia = 0, deLecturaAntes = 0, deLecturaDespues = 0
  for (let i = 0; i < n; i++) {
    const d = new Date(t0 + i * DIA).toISOString().slice(0, 10)
    const m = media.get(d)
    if (m) { cm[i] = Math.round(m[0] * 100); deMedia++; continue }
    const l = lecturas.get(d)
    if (!l) continue
    cm[i] = Math.round(promedio(l) * 100)
    if (d < mediaDesde) deLecturaAntes++
    else deLecturaDespues++
  }

  const salida = join(DIR, 'barranqueras_diario.json')
  writeFileSync(salida, JSON.stringify({
    estacion: ESTACION, serie: SERIE_MEDIA, serieLecturas: SERIE_LECTURAS, fuente: FUENTE,
    variable: 'Altura hidrométrica diaria, en cm sobre el cero de escala',
    generado: hoy, desde, hasta,
    origen: {
      /** Desde qué fecha existe la media diaria; antes, todo sale de las lecturas */
      mediaDesde,
      deMedia, deLecturaAntes, deLecturaDespues,
      /** La coincidencia entre las dos series, medida en esta corrida */
      comunes, sesgoCm: Number(sesgo.toFixed(3)), maeCm: Number(mae.toFixed(3)),
    },
    cm,
  }))

  const conDato = cm.filter(v => v !== null).length
  console.log(`✓ ${salida}`)
  console.log(`  ${desde} a ${hasta}: ${n} días, ${conDato} con dato, ${n - conDato} sin dato`)
  console.log(`  ${deMedia} de la media diaria · ${deLecturaAntes} de lecturas antes de ${mediaDesde}`
    + ` · ${deLecturaDespues} de lecturas en huecos posteriores`)
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : e}`)
  process.exit(1)
}
