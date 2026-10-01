/**
 * Genera `public/rio/corrientes_diario.json`: la altura media diaria del Paraná
 * en Corrientes desde 1901, tal como la publica el Alerta Hidrológico del INA.
 *
 *   node scripts/build_rio_historico.mjs
 *
 * ── Por qué va congelada en un archivo y no se pide en vivo ───────────────────
 *
 * Son 125 años que ya pasaron: no cambian. Pedirlos en cada visita serían 11 MB
 * contra un organismo público para recalcular siempre lo mismo, y dejaría la
 * recurrencia —un número que se cita— dependiendo de que el INA conteste ese
 * día. Congelada, el test la afirma contra las crecidas conocidas y dos
 * personas que miran la pantalla en días distintos ven la misma tabla.
 *
 * El costo es que el archivo envejece: **el año en curso no entra hasta que se
 * regenera.** La pantalla dice hasta qué fecha llega. Conviene correrlo una vez
 * por año, pasado agosto, que es cuando cierra el año hidrológico.
 *
 * ── Qué serie ─────────────────────────────────────────────────────────────────
 *
 * La **26261, «Altura hidrométrica media diaria»** de la estación 19, y no la
 * serie 19 de lecturas sueltas que usa el panel del día: aquélla trae una, dos
 * o más lecturas por día según la época, y un máximo anual sacado de ahí
 * dependería de cuántas veces se leyó la escala ese año.
 *
 * ── El formato ────────────────────────────────────────────────────────────────
 *
 * Un día por posición a partir de `desde`, en **centímetros enteros**, con
 * `null` donde el INA no tiene dato. Así 45 mil días pesan ~200 KB en vez de
 * los 11 MB del original, y un hueco es un hueco: no se interpola nada.
 *
 * El nombre empieza con `build_` y no con `verificar-` a propósito: sale a la
 * red, así que no puede entrar en `npm run verificar`.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ESTACION = 19
const SERIE = 26261
const DESDE = '1901-01-01'
const SALIDA = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'rio', 'corrientes_diario.json')

const hoy = new Date().toISOString().slice(0, 10)
const url = `https://alerta.ina.gob.ar/a5/obs/puntual/series/${SERIE}/observaciones`
  + `?timestart=${DESDE}&timeend=${hoy}&format=json`

console.log(`Pidiendo la serie ${SERIE} al Alerta Hidrológico…`)
const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(180_000) })
if (!res.ok) {
  console.error(`✗ El INA respondió ${res.status}`)
  process.exit(1)
}
const filas = await res.json()
if (!Array.isArray(filas) || filas.length < 40_000) {
  console.error(`✗ Respuesta inesperada: ${Array.isArray(filas) ? filas.length + ' filas' : typeof filas}`)
  process.exit(1)
}

/*
 * La fecha es el día de `timestart` leído en UTC, sin convertir.
 *
 * El INA marca cada día en la medianoche local, y la hora local de Argentina
 * estuvo siempre al oeste de Greenwich —de −4:16:48 en 1901 a −3 hoy—, así que
 * la medianoche local cae entre las 02:00 y las 04:17 UTC **del mismo día**.
 * Convertir a hora local con el huso de hoy correría un día las fechas viejas.
 */
const porFecha = new Map()
let repetidas = 0
for (const f of filas) {
  if (typeof f?.valor !== 'number' || typeof f?.timestart !== 'string') continue
  const d = f.timestart.slice(0, 10)
  if (porFecha.has(d)) repetidas++
  porFecha.set(d, f.valor)
}
if (repetidas > 0) {
  console.error(`✗ ${repetidas} fechas repetidas: la serie dejó de ser una por día`)
  process.exit(1)
}

const fechas = [...porFecha.keys()].sort()
const hasta = fechas[fechas.length - 1]
const DIA = 86_400_000
const t0 = Date.parse(DESDE + 'T00:00:00Z')
const n = Math.round((Date.parse(hasta + 'T00:00:00Z') - t0) / DIA) + 1

const cm = new Array(n).fill(null)
for (const [d, m] of porFecha) {
  const i = Math.round((Date.parse(d + 'T00:00:00Z') - t0) / DIA)
  if (i >= 0 && i < n) cm[i] = Math.round(m * 100)
}

const conDato = cm.filter(v => v !== null).length
mkdirSync(dirname(SALIDA), { recursive: true })
writeFileSync(SALIDA, JSON.stringify({
  estacion: ESTACION,
  serie: SERIE,
  fuente: 'Alerta Hidrológico — Instituto Nacional del Agua',
  variable: 'Altura hidrométrica media diaria, en cm sobre el cero de escala',
  generado: hoy,
  desde: DESDE,
  hasta,
  cm,
}))

console.log(`✓ ${SALIDA}`)
console.log(`  ${DESDE} a ${hasta}: ${n} días, ${conDato} con dato, ${n - conDato} sin dato`)
