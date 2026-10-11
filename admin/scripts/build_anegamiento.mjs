/**
 * Mide, por cuenca y por quincena, cuánta superficie clasifica Dynamic World
 * como «vegetación inundada», y lo deja congelado en
 * `public/lluvia/anegamiento_cuencas.json`.
 *
 *   node scripts/build_anegamiento.mjs          las trece cuencas, lo que falte
 *   node scripts/build_anegamiento.mjs 6 8      sólo ésas
 *
 * Necesita dos cosas que no están en el repo, y las toma del entorno:
 *
 *   EE_CLAVE     la clave JSON de la cuenta de servicio de Earth Engine
 *   EE_MODULOS   una carpeta donde se hizo `npm i @google/earthengine`
 *
 * ── Para qué ──────────────────────────────────────────────────────────────────
 *
 * Es la observación que el plan del balance hídrico pide antes de cualquier
 * modelo: qué superficie queda con agua después de que llueve. Las escalas del
 * INA dicen cuánto subió un río en un punto; esto, cuánto terreno se ve mojado
 * en toda la cuenca.
 *
 * ── Qué es Dynamic World ──────────────────────────────────────────────────────
 *
 * Una clasificación automática de cada imagen de Sentinel-2 (10 m, desde
 * 06/2015) en nueve clases de cobertura, hecha por Google y el World Resources
 * Institute. Acá se usa una sola: la 3, «vegetación inundada».
 *
 * **Es una clasificación, no una medición ni una mancha dibujada.** Y es
 * óptica: no ve con nubes ni debajo del monte.
 *
 * ── Lo que se probó antes y no sirvió ─────────────────────────────────────────
 *
 * - El producto de inundación de Copernicus (GFM, sobre Sentinel-1): excluye la
 *   mitad del terreno y marca suelo seco como agua.
 * - Sentinel-1 crudo, cada pasada contra la mediana de su órbita: lo oscuro
 *   aumenta en seco, y el brillo sigue a la lluvia de los últimos días, no al
 *   río.
 * - **La clase 0, «agua», de este mismo producto**: en 09/2024 da más de
 *   1.000 km² en Negro - Salado con el río bajo. Se deja afuera.
 *
 * ── Cómo se cuenta ────────────────────────────────────────────────────────────
 *
 * - **Por quincena de calendario** —del 1 al 15 y del 16 a fin de mes—, no por
 *   pasada: la huella de una pasada cambia de una a otra y sumar por fecha
 *   suelta engaña.
 * - **Un píxel cuenta si está clasificado así en la mitad o más de las pasadas
 *   despejadas** de la quincena. Una sola pasada no alcanza.
 * - Se guarda además cuánta superficie de la cuenca se vio al menos una vez:
 *   una quincena nublada no es una quincena seca. Qué se hace con eso lo decide
 *   `lib/anegamiento.ts`.
 * - A 30 m, que es lo que el cupo gratuito deja correr: once años de las trece
 *   cuencas tardan dos horas y media.
 *
 * ── El formato ────────────────────────────────────────────────────────────────
 *
 * Por cuenca, una quincena por posición desde `desde`, con dos números en km²:
 * `visto` y `veg`. Una quincena sin ninguna imagen va con `visto` en cero.
 *
 * **Retoma solo.** Se escribe después de cada tanda, y al volver a correrlo
 * pide lo que falte desde la última quincena guardada de cada cuenca. Las dos
 * últimas se vuelven a pedir siempre: las imágenes se siguen cargando unos días
 * después de tomadas. **La quincena en curso no se pide**: no terminó.
 *
 * El nombre empieza con `build_` y no con `verificar-` a propósito: sale a la
 * red.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SALIDA = join(AQUI, '..', 'public', 'lluvia', 'anegamiento_cuencas.json')
const FUENTE = 'Dynamic World V1 (Google y World Resources Institute), sobre Sentinel-2, vía Google Earth Engine'
const COLECCION = 'GOOGLE/DYNAMICWORLD/V1'
/** La clase «vegetación inundada» de la banda `label` */
const CLASE = 3
/** La primera quincena con imágenes: Dynamic World empieza el 27/06/2015 */
const DESDE = '2015-06-16'
const ESCALA_M = 30
/** Quincenas ya guardadas que se vuelven a pedir en cada corrida */
const REPASO = 2
const POR_TANDA = 3

const dormir = ms => new Promise(r => setTimeout(r, ms))
const hoy = new Date().toISOString().slice(0, 10)

/** El primer día de la quincena que sigue a la que empieza en `f` */
function siguiente(f) {
  const [a, m, d] = f.split('-').map(Number)
  return (d === 1 ? new Date(Date.UTC(a, m - 1, 16)) : new Date(Date.UTC(a, m, 1))).toISOString().slice(0, 10)
}

/** Las quincenas que ya terminaron, como [primer día, primer día de la siguiente] */
function quincenasCerradas() {
  const out = []
  for (let f = DESDE; siguiente(f) <= hoy; f = siguiente(f)) out.push([f, siguiente(f)])
  return out
}

/** `@google/earthengine`, de donde esté instalado */
function cargarEarthEngine() {
  const carpetas = [join(AQUI, '..'), process.env.EE_MODULOS].filter(Boolean)
  for (const c of carpetas) {
    try { return createRequire(join(c, 'package.json'))('@google/earthengine') } catch { /* la siguiente */ }
  }
  throw new Error('no se encontró @google/earthengine: instalarlo en una carpeta fuera del repo '
    + '(npm i @google/earthengine) y pasarla en EE_MODULOS')
}

async function conReintento(f, veces = 4) {
  for (let i = 0; ; i++) {
    try { return await f() } catch (e) {
      if (i >= veces - 1) throw e
      await dormir(5_000 * (i + 1))
    }
  }
}

const km2 = v => Math.round((v ?? 0) * 10) / 10

try {
  if (!process.env.EE_CLAVE) throw new Error('falta EE_CLAVE, la ruta a la clave JSON de la cuenta de servicio')
  const clave = JSON.parse(readFileSync(process.env.EE_CLAVE, 'utf8'))
  const ee = cargarEarthEngine()
  await new Promise((res, rej) => ee.data.authenticateViaPrivateKey(
    clave, () => ee.initialize(null, null, res, rej, null, clave.project_id), rej))
  const evaluar = obj => new Promise((res, rej) => obj.evaluate((v, e) => (e ? rej(new Error(e)) : res(v))))

  const geo = JSON.parse(readFileSync(join(AQUI, '..', 'public', 'geo', 'geo_cuencas.json'), 'utf8'))
  const pedidas = process.argv.slice(2).map(Number).filter(n => n >= 1 && n <= 13)
  const cuencas = geo.features
    .filter(f => pedidas.length === 0 || pedidas.includes(f.properties.cod))
    .sort((a, b) => a.properties.cod - b.properties.cod)

  const quincenas = quincenasCerradas()
  const previo = existsSync(SALIDA) ? JSON.parse(readFileSync(SALIDA, 'utf8')) : null
  if (previo && previo.desde !== DESDE) throw new Error(`el archivo arranca el ${previo.desde} y el script el ${DESDE}`)
  const salida = previo?.cuencas ?? {}

  const guardar = () => {
    const largos = Object.values(salida).map(c => c.veg.length)
    const comunes = Math.min(...largos)
    mkdirSync(dirname(SALIDA), { recursive: true })
    writeFileSync(SALIDA, JSON.stringify({
      fuente: FUENTE,
      variable: 'Superficie clasificada como vegetación inundada en la mitad o más de las pasadas despejadas de cada quincena, y superficie vista, en km²',
      generado: hoy, desde: DESDE,
      // El último día de la última quincena que tienen todas las cuencas
      hasta: comunes > 0 ? new Date(Date.parse(quincenas[comunes - 1][1]) - 86_400_000).toISOString().slice(0, 10) : null,
      escalaM: ESCALA_M, cuencas: salida,
    }))
  }

  for (const f of cuencas) {
    const { cod, nombre, ha } = f.properties
    const t0 = Date.now()
    const c = salida[cod] ?? { km2: Math.round(ha) / 100, visto: [], veg: [] }
    salida[cod] = c
    const desdeI = Math.max(0, Math.min(c.veg.length, quincenas.length) - REPASO)
    const geom = ee.Geometry(f.geometry)
    const col = ee.ImageCollection(COLECCION).filterBounds(geom).select('label')

    const una = async ([dia, sig]) => {
      const q = col.filterDate(dia, sig)
      // Una quincena sin ninguna imagen no es un error: no se vio nada
      if ((await conReintento(() => evaluar(q.size()))) === 0) return { visto: 0, veg: 0 }
      const area = ee.Image.pixelArea().divide(1e6)
      const bandas = ee.Image.cat([
        area.updateMask(q.count().gte(1)).rename('visto'),
        area.updateMask(q.map(i => i.eq(CLASE)).mean().gte(0.5)).rename('veg'),
      ])
      const r = await conReintento(() => evaluar(bandas.reduceRegion({
        reducer: ee.Reducer.sum(), geometry: geom, scale: ESCALA_M, maxPixels: 1e10, tileScale: 4,
      })))
      return { visto: km2(r.visto), veg: km2(r.veg) }
    }

    try {
      for (let i = desdeI; i < quincenas.length; i += POR_TANDA) {
        const tanda = await Promise.all(quincenas.slice(i, i + POR_TANDA).map(una))
        tanda.forEach((r, k) => { c.visto[i + k] = r.visto; c.veg[i + k] = r.veg })
        guardar()
      }
      console.log(`✓ ${String(cod).padStart(2)} ${nombre.padEnd(36)} ${quincenas.length - desdeI} quincenas pedidas, `
        + `${c.veg.length} guardadas, en ${Math.round((Date.now() - t0) / 1000)} s`)
    } catch (e) {
      console.error(`✗ ${cod} ${nombre}: ${e instanceof Error ? e.message : e} — volver a correr retoma donde quedó`)
    }
  }

  guardar()
  const final = JSON.parse(readFileSync(SALIDA, 'utf8'))
  console.log(`\nEscrito ${SALIDA}: ${Object.keys(final.cuencas).length} cuencas, del ${final.desde} al ${final.hasta}, `
    + `${Math.round(JSON.stringify(final).length / 1024)} KB`)
  process.exit(0)
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}
