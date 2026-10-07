/**
 * Baja la lluvia diaria de CHIRPS promediada sobre cada cuenca, desde 1981, y
 * la deja congelada en `public/lluvia/chirps_cuencas.json`.
 *
 *   node scripts/build_chirps.mjs            las trece cuencas
 *   node scripts/build_chirps.mjs 6 8        sólo ésas, y conserva las demás
 *
 * ── Para qué ──────────────────────────────────────────────────────────────────
 *
 * Los partes de la APA empiezan en 09/2025: hay un año de lluvia medida. Con
 * un año no se puede decir qué tan raro es un evento, ni cruzar la lluvia con
 * los caudales del INA, que terminan antes de que empiecen los partes. Esto da
 * cuarenta y cinco.
 *
 * ── Qué es CHIRPS ─────────────────────────────────────────────────────────────
 *
 * Una estimación de lluvia de la Universidad de California en Santa Bárbara:
 * imágenes infrarrojas de satélite calibradas y después corregidas con
 * pluviómetros, a 0,05° (unos 5 km), diaria desde 1981.
 *
 * **Es una estimación, no una medición**, y no se mezcla con los pluviómetros
 * de la APA: ningún número de la pantalla que hoy sale de los partes pasa a
 * salir de acá. Sirve para lo que un año no puede dar —qué es normal para la
 * época, cada cuánto se repite un evento— sobre el promedio de una cuenca, que
 * es donde una estimación de satélite anda mejor. No para decir cuánto llovió
 * un día en un lugar.
 *
 * ── De dónde sale ─────────────────────────────────────────────────────────────
 *
 * De ClimateSERV, el servicio de NASA SERVIR: se le manda un polígono y un
 * rango de fechas y devuelve el promedio diario de CHIRPS adentro. Sin cuenta
 * ni clave. Se pide el contorno de cada cuenca tal como está en
 * `geo_cuencas.json`; el valle del Paraná, que son doce partes, va como
 * multipolígono.
 *
 * **Por qué no ERA5 por Open-Meteo**, que fue lo primero que se armó: ahí cada
 * nodo por cada año cuesta cupo, y la serie de la provincia llevaba dos semanas
 * de correr un comando por día. Esto son 39 pedidos y media hora. ERA5 queda de
 * respaldo (`build_era5.ts`): tiene un valor por nodo y años anteriores a 1981.
 *
 * - **Hasta 20 años por pedido** —el servicio lo rechaza con «Max date range
 *   is: 20 years»—: se pide de a 15.
 * - **El contorno va por POST.** Por GET la dirección pasa los 4.094 caracteres
 *   que acepta el servidor.
 * - De a un pedido, con pausa: es un servicio público y no hay apuro.
 *
 * ── El formato ────────────────────────────────────────────────────────────────
 *
 * Por cuenca, un día por posición a partir de `desde`, en **décimas de
 * milímetro**; `null` donde el servicio no devolvió ese día. Termina en el
 * último día que tienen todas: CHIRPS llega con algo más de un mes de atraso.
 *
 * Una cuenca se guarda entera o no se guarda. Si falla una, las demás quedan y
 * se la vuelve a pedir por número.
 *
 * El nombre empieza con `build_` y no con `verificar-` a propósito: sale a la
 * red.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SALIDA = join(AQUI, '..', 'public', 'lluvia', 'chirps_cuencas.json')
const API = 'https://climateserv.servirglobal.net/api'
const FUENTE = 'CHIRPS (Climate Hazards Center, UC Santa Barbara), vía ClimateSERV de NASA SERVIR'
const DESDE = '1981-01-01'
const ANIOS_POR_PEDIDO = 15
const PAUSA_MS = 4_000
const DIA = 86_400_000

const dormir = ms => new Promise(r => setTimeout(r, ms))
const hoy = new Date().toISOString().slice(0, 10)
/** AAAA-MM-DD → MM/DD/AAAA, que es como lo pide el servicio */
const aUsa = f => `${f.slice(5, 7)}/${f.slice(8, 10)}/${f.slice(0, 4)}`

async function json(url, opciones) {
  for (let intento = 0; ; intento++) {
    try {
      const r = await fetch(url, { ...opciones, signal: AbortSignal.timeout(300_000) })
      const texto = await r.text()
      if (!r.ok) throw new Error(`ClimateSERV respondió ${r.status}: ${texto.slice(0, 120)}`)
      return JSON.parse(texto)
    } catch (e) {
      if (intento >= 3) throw e
      await dormir(15_000)
    }
  }
}

/** El promedio diario de CHIRPS adentro de la geometría, como fecha → mm */
async function pedir(geometria, desde, hasta) {
  const cuerpo = new URLSearchParams({
    datatype: '0',            // CHIRPS
    begintime: aUsa(desde), endtime: aUsa(hasta),
    intervaltype: '0',        // diario
    operationtype: '5',       // promedio sobre el polígono
    dateType_Category: 'default', isZip_CurrentDataType: 'false',
    geometry: JSON.stringify(geometria),
  })
  const alta = await json(`${API}/submitDataRequest/`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: cuerpo.toString(),
  })
  if (!Array.isArray(alta) || typeof alta[0] !== 'string') throw new Error('el servicio no devolvió un pedido')
  if (alta.length > 1) throw new Error(`el servicio rechazó el pedido: ${alta.slice(1).join(' ')}`)

  for (let i = 0; ; i++) {
    await dormir(5_000)
    const p = await json(`${API}/getDataRequestProgress/?id=${alta[0]}`)
    const avance = Array.isArray(p) ? Number(p[0]) : NaN
    if (avance === -1) throw new Error('el servicio informó un error procesando el pedido')
    if (avance >= 100) break
    if (i > 240) throw new Error('el pedido no terminó en veinte minutos')
  }

  const res = await json(`${API}/getDataFromRequest/?id=${alta[0]}`)
  if (!Array.isArray(res?.data)) throw new Error('el resultado no trae datos')
  const porFecha = new Map()
  for (const x of res.data) {
    const f = `${x.year}-${String(x.month).padStart(2, '0')}-${String(x.day).padStart(2, '0')}`
    const v = x?.value?.avg
    if (porFecha.has(f)) throw new Error(`fecha repetida: ${f}`)
    // El servicio marca con un valor negativo los días sin dato
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) porFecha.set(f, v)
  }
  return porFecha
}

const redondear = anillo => anillo.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4])

/** La geometría de una cuenca, con los anillos exteriores: el origen no tiene huecos */
function geometriaDe(f) {
  const g = f.geometry
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: [redondear(g.coordinates[0])] }
  return { type: 'MultiPolygon', coordinates: g.coordinates.map(p => [redondear(p[0])]) }
}

try {
  const geo = JSON.parse(readFileSync(join(AQUI, '..', 'public', 'geo', 'geo_cuencas.json'), 'utf8'))
  const pedidas = process.argv.slice(2).map(Number).filter(n => n >= 1 && n <= 13)
  const cuencas = geo.features
    .map(f => ({ cod: f.properties.cod, nombre: f.properties.nombre, geometria: geometriaDe(f) }))
    .filter(c => pedidas.length === 0 || pedidas.includes(c.cod))
    .sort((a, b) => a.cod - b.cod)

  // Lo ya bajado se conserva cuando se piden sólo algunas
  const previo = existsSync(SALIDA) ? JSON.parse(readFileSync(SALIDA, 'utf8')) : null
  const series = new Map()
  if (previo && pedidas.length) {
    for (const [cod, mm] of Object.entries(previo.cuencas)) {
      const m = new Map()
      mm.forEach((v, i) => { if (v !== null) m.set(new Date(Date.parse(previo.desde) + i * DIA).toISOString().slice(0, 10), v / 10) })
      series.set(Number(cod), m)
    }
  }

  // Los tramos de fechas, de a ANIOS_POR_PEDIDO años
  const tramos = []
  for (let a = Number(DESDE.slice(0, 4)); a <= Number(hoy.slice(0, 4)); a += ANIOS_POR_PEDIDO) {
    const fin = `${a + ANIOS_POR_PEDIDO - 1}-12-31`
    tramos.push([`${a}-01-01`, fin < hoy ? fin : hoy])
  }

  for (const c of cuencas) {
    const t0 = Date.now()
    const serie = new Map()
    try {
      for (const [d, h] of tramos) {
        for (const [f, v] of await pedir(c.geometria, d, h)) serie.set(f, v)
        await dormir(PAUSA_MS)
      }
      if (serie.size < 10_000) throw new Error(`llegaron sólo ${serie.size} días`)
      series.set(c.cod, serie)
      const fs = [...serie.keys()].sort()
      console.log(`✓ ${String(c.cod).padStart(2)} ${c.nombre.padEnd(36)} ${serie.size} días, ${fs[0]} a ${fs.at(-1)}, en ${Math.round((Date.now() - t0) / 1000)} s`)
    } catch (e) {
      console.error(`✗ ${c.cod} ${c.nombre}: ${e instanceof Error ? e.message : e}`)
    }
  }
  if (series.size === 0) throw new Error('no se bajó ninguna cuenca')

  // Hasta el último día que tienen todas: que ninguna termine en hueco
  const hasta = [...series.values()].map(m => [...m.keys()].sort().at(-1)).sort()[0]
  const n = Math.round((Date.parse(hasta) - Date.parse(DESDE)) / DIA) + 1
  const salida = {}
  for (const [cod, m] of [...series].sort((a, b) => a[0] - b[0])) {
    const mm = new Array(n).fill(null)
    for (const [f, v] of m) {
      const i = Math.round((Date.parse(f) - Date.parse(DESDE)) / DIA)
      if (i >= 0 && i < n) mm[i] = Math.round(v * 10)
    }
    salida[cod] = mm
  }

  mkdirSync(dirname(SALIDA), { recursive: true })
  writeFileSync(SALIDA, JSON.stringify({
    fuente: FUENTE,
    variable: 'Lluvia diaria media sobre la cuenca, en décimas de mm',
    generado: hoy, desde: DESDE, hasta, cuencas: salida,
  }))
  console.log(`✓ ${SALIDA}`)
  console.log(`  ${DESDE} a ${hasta}: ${n} días, ${series.size} cuenca(s)`)
  if (series.size < 13) { console.error(`  faltan ${13 - series.size} cuenca(s): se las vuelve a pedir por número`); process.exit(1) }
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : e}`)
  process.exit(1)
}
