/**
 * Genera el archivo congelado de caudales en la confluencia del Paraná y el
 * Paraguay, tal como los publica el Alerta Hidrológico del INA:
 *
 *   public/rio/confluencia_caudal.json
 *
 *   node scripts/build_rio_caudales.mjs
 *
 * ── Para qué ──────────────────────────────────────────────────────────────────
 *
 * El aporte del río Paraguay se había medido con alturas —cuánto se parece lo
 * que hace Corrientes a lo que hizo el Paraguay—, y una altura no se suma. Un
 * caudal sí: lo que pasa por Corrientes es lo que largó Yacyretá más lo que
 * trajo el Paraguay más lo que trajo el Bermejo, cada uno unos días antes. Con
 * estas series se puede decir **qué parte del agua viene por cada río**.
 *
 * ── Qué series ────────────────────────────────────────────────────────────────
 *
 * Las de **«Caudal medio diario»** de cinco estaciones:
 *
 * | Clave | Estación | Qué mide |
 * |---|---|---|
 * | `corrientes` | Corrientes (19) | la suma, aguas abajo de la confluencia |
 * | `yacyreta` | Yacyretá efluente (88) | el Paraná, lo que sale de la represa |
 * | `paraguay` | Puerto Pilcomayo (55) | el Paraguay, frente a Asunción |
 * | `formosa` | Puerto Formosa (57) | el mismo río más abajo: es el control |
 * | `bermejo` | El Colorado (2046) | el Bermejo, que entra al Paraguay más abajo |
 *
 * Itá Ibaté, Paso de la Patria y Puerto Bermejo —las que están más cerca de la
 * confluencia— tienen altura y no caudal: el INA lista la serie y está vacía.
 * Por eso el Paraná se toma en Yacyretá y el Paraguay en Puerto Pilcomayo.
 *
 * ── Por qué va aparte de `build_rio_historico.mjs` ────────────────────────────
 *
 * Aquél regenera los dos archivos de alturas, y los tests afirman cosas sobre
 * ellos. Sumar los caudales no tiene por qué volver a bajar ni mover nada de
 * eso.
 *
 * ── El formato ────────────────────────────────────────────────────────────────
 *
 * Un día por posición a partir de `desde`, en **m³/s enteros**, con `null`
 * donde el INA no tiene dato. Un hueco es un hueco: no se interpola. Arranca el
 * día en que empieza la serie de Yacyretá, que es la más corta de las que hacen
 * falta siempre; el Bermejo empieza en 2001 y Formosa en 2006.
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

/** Clave → estación y serie de caudal medio diario del INA */
const SERIES = {
  corrientes: { estacion: 19,   serie: 26616 },
  yacyreta:   { estacion: 88,   serie: 26685 },
  paraguay:   { estacion: 55,   serie: 26652 },
  formosa:    { estacion: 57,   serie: 26654 },
  bermejo:    { estacion: 2046, serie: 35886 },
}

const hoy = new Date().toISOString().slice(0, 10)
const pausa = ms => new Promise(r => setTimeout(r, ms))

/** Baja una serie entera y la devuelve como fecha → m³/s */
async function bajar(serie) {
  const url = `https://alerta.ina.gob.ar/a5/obs/puntual/series/${serie}/observaciones`
    + `?timestart=1900-01-01&timeend=${hoy}&format=json`
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(240_000) })
  if (!res.ok) throw new Error(`el INA respondió ${res.status} para la serie ${serie}`)
  const filas = await res.json()
  if (!Array.isArray(filas) || filas.length < 5_000) {
    throw new Error(`respuesta inesperada para la serie ${serie}: `
      + (Array.isArray(filas) ? `${filas.length} filas` : typeof filas))
  }

  // La fecha es el día de `timestart` leído en UTC, sin convertir: ver
  // `build_rio_historico.mjs`.
  const porFecha = new Map()
  for (const f of filas) {
    if (typeof f?.valor !== 'number' || typeof f?.timestart !== 'string') continue
    const d = f.timestart.slice(0, 10)
    if (porFecha.has(d)) throw new Error(`fecha repetida en la serie ${serie}: ${d}`)
    if (f.valor < 0) throw new Error(`caudal negativo en la serie ${serie}: ${d}`)
    porFecha.set(d, f.valor)
  }
  return porFecha
}

/** De fecha → m³/s a un arreglo de enteros, un día por posición */
function aEnteros(porFecha, desde, hasta) {
  const t0 = Date.parse(desde + 'T00:00:00Z')
  const n = Math.round((Date.parse(hasta + 'T00:00:00Z') - t0) / DIA) + 1
  const q = new Array(n).fill(null)
  for (const [d, v] of porFecha) {
    const i = Math.round((Date.parse(d + 'T00:00:00Z') - t0) / DIA)
    if (i >= 0 && i < n) q[i] = Math.round(v)
  }
  return q
}

const fechas = porFecha => [...porFecha.keys()].sort()

try {
  mkdirSync(DIR, { recursive: true })
  const bajadas = {}

  // De a una y con pausa: son cinco pedidos de varios MB a un organismo público
  for (const [clave, { estacion, serie }] of Object.entries(SERIES)) {
    console.log(`Pidiendo la serie ${serie} (${clave}, estación ${estacion})…`)
    bajadas[clave] = await bajar(serie)
    await pausa(1500)
  }

  const desde = fechas(bajadas.yacyreta)[0]
  const hasta = fechas(bajadas.corrientes).at(-1)
  const m3s = {}
  for (const clave of Object.keys(SERIES)) m3s[clave] = aEnteros(bajadas[clave], desde, hasta)

  const salida = join(DIR, 'confluencia_caudal.json')
  writeFileSync(salida, JSON.stringify({
    fuente: FUENTE,
    variable: 'Caudal medio diario, en m³/s',
    generado: hoy, desde, hasta,
    series: SERIES, m3s,
  }))
  console.log(`✓ ${salida}`)
  console.log(`  ${desde} a ${hasta}`)
  for (const [clave, q] of Object.entries(m3s)) {
    const f = fechas(bajadas[clave])
    console.log(`  ${clave.padEnd(10)} ${q.filter(v => v !== null).length} días con dato de ${q.length}`
      + `  (la serie va de ${f[0]} a ${f.at(-1)})`)
  }
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : e}`)
  process.exit(1)
}
