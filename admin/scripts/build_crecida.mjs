/**
 * Baja los datos de Brasil que usa el cálculo de crecida en Barranqueras
 * (`src/lib/crecida.ts`):
 *
 *   public/rio/ons_represas.json    caudales diarios de siete represas del ONS
 *   public/rio/lluvia_brasil.json   lluvia y ET0 diarias por cuenca (ERA5)
 *
 *   node scripts/build_crecida.mjs            las dos cosas
 *   node scripts/build_crecida.mjs ons        sólo el ONS (un minuto)
 *   node scripts/build_crecida.mjs lluvia     sólo la lluvia (~20 minutos)
 *   node scripts/build_crecida.mjs puntos     lista los puntos de lluvia, sin red
 *
 * Node puro, sin dependencias. El nombre empieza con `build_` y no con
 * `verificar-` a propósito: sale a la red.
 *
 * ── El ONS ────────────────────────────────────────────────────────────────────
 *
 * El Operador Nacional do Sistema Elétrico publica los datos hidrológicos
 * diarios de cada represa de Brasil en un balde S3 abierto, un CSV por año
 * (`DADOS_HIDROLOGICOS_RES_<año>.csv`, ~9 MB). Se baja cada año desde 2000 y se
 * queda con las represas de `REPRESAS`.
 *
 * **El formato cambió en 2022.** Hasta 2021 no existe la columna
 * `id_reservatorio`: el código va en la última columna y los números vienen con
 * ocho decimales. Se lee por encabezado, nunca por posición.
 *
 * Qué variable de cada una:
 *
 * - `def`: caudal defluente, lo que larga la represa. Es lo que llega aguas abajo.
 * - `nat`: caudal natural, el río sin el efecto de las represas de arriba. Es
 *   contra lo que se calibra el modelo del Iguazú.
 * - `inc`: caudal incremental natural, lo que escurre de la cuenca propia entre
 *   la represa de arriba y ésta. Es contra lo que se calibra el modelo de la
 *   incremental de Itaipú.
 *
 * ── La lluvia ─────────────────────────────────────────────────────────────────
 *
 * ERA5 por la API de archivo de Open-Meteo, con `models=era5` fijo: para una
 * serie de dieciocho años el producto no puede cambiar en el medio (ver
 * «Lluvia histórica: ERA5» en el CLAUDE.md). Precipitación y ET0 FAO diarias en
 * los puntos de grilla de cada cuenca, promediados.
 *
 * - **Los puntos van cada 0,5° en tresbolillo** —enteros y medios a la vez—, así
 *   que quedan a ~0,7° entre sí. Open-Meteo cuenta el cupo por ubicación, y una
 *   ubicación por dieciocho años es mucho cupo: con la grilla entera de 0,5° el
 *   cupo por hora no alcanzaba.
 * - **De a un punto, con pausa, y un 429 se espera un minuto.** Es lo que dice
 *   la API cuando se pasa el cupo por minuto.
 * - **Se guarda punto por punto** en `scripts/.cache-crecida/`: una corrida
 *   cortada sigue desde donde quedó. La carpeta no va al repo.
 * - **Termina siete días antes de hoy**: ERA5 llega con unos cinco de atraso.
 *   Lo que falta hasta hoy lo completa el pronóstico, que es otra fuente.
 *
 * Las cuencas salen de los contornos del ONS (ver `CUENCAS`). Sirven para
 * elegir puntos de lluvia; el área que se usa para pasar mm/d a m³/s es la de
 * la represa (`areaKm2`).
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const DIR = join(AQUI, '..', 'public', 'rio')
const CACHE = join(AQUI, '.cache-crecida')
const DIA = 86_400_000
const hoyIso = () => new Date().toISOString().slice(0, 10)
const isoDe = d => new Date(d * DIA).toISOString().slice(0, 10)
const diaDe = s => Math.round(Date.parse(s + 'T00:00:00Z') / DIA)
const dormir = ms => new Promise(r => setTimeout(r, ms))

// ── ONS ───────────────────────────────────────────────────────────────────────

const ONS = 'https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/dados_hidrologicos_di'
const DESDE_ONS = 2000

/** Clave → código del ONS y qué variables guardar */
const REPRESAS = {
  itaipu: { id: 'PNITAI', nombre: 'Itaipu', vars: ['def', 'nat', 'inc'] },
  baixoiguacu: { id: 'IGUHBI', nombre: 'Baixo Iguaçu', vars: ['def', 'nat'] },
  caxias: { id: 'IGSCAX', nombre: 'Salto Caxias', vars: ['def', 'nat'] },
  primavera: { id: 'PNPPRI', nombre: 'Porto Primavera', vars: ['def'] },
  rosana: { id: 'PPROSA', nombre: 'Rosana', vars: ['def'] },
  jupia: { id: 'PNJUPI', nombre: 'Jupiá', vars: ['def'] },
  isol: { id: 'PNISOL', nombre: 'Ilha Solteira', vars: ['def'] },
  tirm: { id: 'TITIRM', nombre: 'Três Irmãos', vars: ['def'] },
}
const COLUMNA = { def: 'val_vazaodefluente', nat: 'val_vazaonatural', inc: 'val_vazaoincremental' }

async function bajarOns() {
  const porId = Object.fromEntries(Object.entries(REPRESAS).map(([k, v]) => [v.id, k]))
  const datos = {} // clave → var → fecha → valor
  for (const k of Object.keys(REPRESAS)) datos[k] = Object.fromEntries(REPRESAS[k].vars.map(v => [v, new Map()]))
  const hasta = new Date().getUTCFullYear()
  for (let anio = DESDE_ONS; anio <= hasta; anio++) {
    const url = `${ONS}/DADOS_HIDROLOGICOS_RES_${anio}.csv`
    let texto = null
    for (let intento = 1; intento <= 3 && texto === null; intento++) {
      try {
        const r = await fetch(url)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        texto = await r.text()
      } catch (e) {
        console.log(`  ${anio}: ${e.message}; reintento`)
        await dormir(3000 * intento)
      }
    }
    if (texto === null) throw new Error(`No se pudo bajar ${url}`)
    const lineas = texto.split('\n')
    const enc = lineas[0].trim().split(';')
    const col = n => enc.indexOf(n)
    const iId = col('id_reservatorio') >= 0 ? col('id_reservatorio') : enc.length - 1
    const iFecha = col('din_instante')
    const iVar = Object.fromEntries(Object.entries(COLUMNA).map(([v, n]) => [v, col(n)]))
    if (iFecha < 0 || Object.values(iVar).some(i => i < 0)) throw new Error(`${anio}: faltan columnas en el encabezado`)
    let filas = 0
    for (let j = 1; j < lineas.length; j++) {
      const c = lineas[j].trim().split(';')
      const k = porId[(c[iId] ?? '').trim()]
      if (!k) continue
      const fecha = c[iFecha].slice(0, 10)
      for (const v of REPRESAS[k].vars) {
        const x = parseFloat(c[iVar[v]])
        if (Number.isFinite(x)) datos[k][v].set(fecha, Math.round(x))
      }
      filas++
    }
    console.log(`  ${anio}: ${filas} filas`)
  }
  const fechas = [...datos.itaipu.def.keys()].sort()
  const desde = fechas[0], hastaF = fechas[fechas.length - 1]
  const n = diaDe(hastaF) - diaDe(desde) + 1
  const series = {}
  for (const [k, def] of Object.entries(REPRESAS)) {
    series[k] = { id: def.id, nombre: def.nombre }
    for (const v of def.vars) {
      const arr = new Array(n).fill(null)
      for (const [f, x] of datos[k][v]) arr[diaDe(f) - diaDe(desde)] = x
      series[k][v] = arr
    }
  }
  const salida = {
    fuente: 'ONS — Dados hidrológicos de reservatórios, base diária',
    url: 'https://dados.ons.org.br/dataset/dados-hidrologicos-res',
    unidad: 'm³/s enteros; null donde no hay dato',
    generado: hoyIso(), desde, hasta: hastaF, series,
  }
  mkdirSync(DIR, { recursive: true })
  writeFileSync(join(DIR, 'ons_represas.json'), JSON.stringify(salida))
  console.log(`ons_represas.json: ${desde} a ${hastaF}, ${n} días`)
}

// ── Lluvia por cuenca ─────────────────────────────────────────────────────────

const OPEN_METEO = 'https://archive-api.open-meteo.com/v1/archive'
/**
 * Producto de lluvia. `era5` por defecto, fijo para toda la serie. Con
 * `MODELO_LLUVIA=best_match` se baja la mezcla que arma Open-Meteo (ERA5 y,
 * desde 2017, el análisis del IFS operativo) a otro archivo, para comparar.
 */
const MODELO = process.env.MODELO_LLUVIA || 'era5'
const ARCHIVO_LLUVIA = MODELO === 'era5' ? 'lluvia_brasil.json' : `lluvia_brasil_${MODELO}.json`
const DESDE_LLUVIA = '2008-01-01'
const PAUSA_MS = 9000
const ESPERA_429_MS = 65_000

/**
 * Los contornos son los del ONS (`public/geo/cuencas_brasil.json`, que arma
 * `build_cuencas_brasil.mjs`), en [lon, lat]:
 *
 * - **Iguazú**: la cuenca entera, tal cual.
 * - **Incremental de Itaipú**: la cuenca «Paraná» del ONS **aguas abajo de
 *   Porto Primavera y Rosana**. El ONS la da entera, desde Ilha Solteira; lo
 *   que llueve arriba de Porto Primavera llega medido por la represa y no hay
 *   que modelarlo. El corte (`CORTE`) sigue a mano la divisoria entre el
 *   Ivinhema, que entra abajo de Porto Primavera, y el Pardo y el Verde, que
 *   entran arriba; al este, el Paranapanema, que el ONS ya da aparte. Lo que
 *   queda son 155.218 km².
 *
 * `areaKm2` es la superficie hasta la represa contra cuyo caudal se calibra,
 * no la del polígono: para el Iguazú, Salto Caxias.
 */
const CONTORNOS = JSON.parse(readFileSync(join(AQUI, '..', 'public', 'geo', 'cuencas_brasil.json'), 'utf8')).cuencas

/** Divisoria por arriba de la incremental de Itaipú, [lat, lon] de oeste a este */
const CORTE = [[-19.9, -56.5], [-19.9, -56.0], [-20.5, -54.6], [-21.3, -54.0], [-22.0, -53.4], [-22.5, -52.95],
  [-22.7, -52.0], [-22.9, -50.0], [-23.0, -48.0]]

function latitudDelCorte(lo) {
  if (lo <= CORTE[0][1]) return CORTE[0][0]
  for (let i = 1; i < CORTE.length; i++) {
    const [a1, o1] = CORTE[i - 1], [a2, o2] = CORTE[i]
    if (lo <= o2) return a1 + (a2 - a1) * (lo - o1) / (o2 - o1)
  }
  return CORTE[CORTE.length - 1][0]
}

/** Punto [lat, lon] en un anillo [lon, lat] */
function adentro([la, lo], anillo) {
  let c = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i], [xj, yj] = anillo[j]
    if ((yi > la) !== (yj > la) && lo < (xj - xi) * (la - yi) / (yj - yi) + xi) c = !c
  }
  return c
}

const CUENCAS = {
  iguacu: {
    nombre: 'Iguazú', represa: 'Salto Caxias (caudal natural)', areaKm2: 57000,
    contiene: p => adentro(p, CONTORNOS.iguacu.anillo),
  },
  itaipu_inc: {
    nombre: 'Incremental de Itaipú', represa: 'Itaipu (caudal incremental)', areaKm2: 150000,
    contiene: p => adentro(p, CONTORNOS.parana.anillo) && p[0] < latitudDelCorte(p[1]),
  },
}

/** Tresbolillo de 0,5°: puntos donde lat y lon son los dos enteros o los dos medios */
function puntosDe(contiene) {
  const pts = []
  for (let la = -27; la <= -17; la += 0.5) for (let lo = -56.5; lo <= -48.5; lo += 0.5) {
    const entero = Number.isInteger(la) && Number.isInteger(lo)
    const medio = Number.isInteger(la + 0.5) && Number.isInteger(lo + 0.5)
    if ((entero || medio) && contiene([la, lo])) pts.push([la, lo])
  }
  return pts
}

async function bajarPunto([la, lo], hasta) {
  mkdirSync(CACHE, { recursive: true })
  const archivo = join(CACHE, `${MODELO}_${la}_${lo}_${DESDE_LLUVIA}_${hasta}.json`)
  if (existsSync(archivo)) return JSON.parse(readFileSync(archivo, 'utf8'))
  const url = `${OPEN_METEO}?latitude=${la}&longitude=${lo}&start_date=${DESDE_LLUVIA}&end_date=${hasta}`
    + `&daily=precipitation_sum,et0_fao_evapotranspiration&models=${MODELO}&timezone=GMT`
  for (let intento = 1; intento <= 8; intento++) {
    const r = await fetch(url).catch(e => ({ ok: false, status: 0, text: async () => String(e) }))
    if (r.status === 429) {
      console.log(`    cupo de Open-Meteo; espero ${ESPERA_429_MS / 1000} s`)
      await dormir(ESPERA_429_MS)
      continue
    }
    if (!r.ok) {
      console.log(`    HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`)
      await dormir(5000 * intento)
      continue
    }
    const j = await r.json()
    const d = { time: j.daily.time, p: j.daily.precipitation_sum, e: j.daily.et0_fao_evapotranspiration }
    writeFileSync(archivo, JSON.stringify(d))
    await dormir(PAUSA_MS)
    return d
  }
  throw new Error(`No se pudo bajar el punto ${la}, ${lo}`)
}

async function bajarLluvia() {
  const hasta = isoDe(diaDe(hoyIso()) - 7)
  const n = diaDe(hasta) - diaDe(DESDE_LLUVIA) + 1
  const cuencas = {}
  for (const [k, c] of Object.entries(CUENCAS)) {
    const pts = puntosDe(c.contiene)
    console.log(`${c.nombre}: ${pts.length} puntos`)
    const sp = new Float64Array(n), se = new Float64Array(n), cp = new Int32Array(n), ce = new Int32Array(n)
    for (const p of pts) {
      const d = await bajarPunto(p, hasta)
      if (d.time.length !== n || d.time[0] !== DESDE_LLUVIA) throw new Error(`${p}: llegaron ${d.time.length} días, se esperaban ${n}`)
      for (let i = 0; i < n; i++) {
        if (d.p[i] !== null) { sp[i] += d.p[i]; cp[i]++ }
        if (d.e[i] !== null) { se[i] += d.e[i]; ce[i]++ }
      }
      console.log(`  ${p.join(', ')} listo`)
    }
    const dec = (s, c) => Array.from(s, (v, i) => (c[i] ? Math.round(10 * v / c[i]) : null))
    cuencas[k] = {
      nombre: c.nombre, represa: c.represa, areaKm2: c.areaKm2, puntos: pts,
      lluvia: dec(sp, cp), etp: dec(se, ce),
    }
  }
  const salida = {
    fuente: `Open-Meteo, API de archivo, models=${MODELO}`,
    unidad: 'décimas de mm por día, promedio de los puntos de cada cuenca; null sin dato',
    generado: hoyIso(), desde: DESDE_LLUVIA, hasta, cuencas,
  }
  mkdirSync(DIR, { recursive: true })
  writeFileSync(join(DIR, ARCHIVO_LLUVIA), JSON.stringify(salida))
  console.log(`${ARCHIVO_LLUVIA}: ${DESDE_LLUVIA} a ${hasta}`)
}

const que = process.argv[2]
if (que === 'puntos') {
  for (const c of Object.values(CUENCAS)) console.log(`${c.nombre}: ${puntosDe(c.contiene).map(p => p.join(' ')).join(' · ')}`)
  process.exit(0)
}
if (!que || que === 'ons') { console.log('— ONS —'); await bajarOns() }
if (!que || que === 'lluvia') { console.log('— Lluvia —'); await bajarLluvia() }
