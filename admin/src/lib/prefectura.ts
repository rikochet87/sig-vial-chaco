/**
 * Las alturas de cada escala, desde la Prefectura Naval Argentina.
 *
 * ── Por qué Prefectura es la fuente principal de las alturas ──────────────────
 *
 * Las escalas del Paraná y del Paraguay las lee Prefectura, dos veces por día
 * —a las 00:00 y a las 12:00—, y las publica al momento. El INA copia la de las
 * 00:00 y la carga cerca de las 11:30; la de las 12:00 no la carga. Y **cuando
 * el INA carga tarde, carga otra cosa**: sobre un año de Barranqueras
 * (10/2025 a 10/2026), 54 de 365 lecturas difieren en más de un centímetro, 39
 * de ellas de sábado o domingo, hasta 33 cm. El 16/11/2025 Prefectura da
 * 3,31 · 3,24 · 3,20 · 3,15 · 3,08 —un río que baja— y el INA, cargado al día
 * siguiente, 3,53 en el medio. La serie de Prefectura es la que se sostiene
 * sola, y es la de quien lee la escala.
 *
 * Así que **la altura sale de Prefectura y el INA completa lo que Prefectura no
 * tiene**: un día sin lectura, o lo anterior al año que guarda el histórico. El
 * pronóstico, el registro largo y los caudales siguen siendo del INA.
 *
 * ── De dónde sale cada cosa ───────────────────────────────────────────────────
 *
 * - `alturas.json`: la última lectura y la anterior de los 91 puertos, con los
 *   niveles de alerta y evacuación. Es un JSON, sin clave; lo usa el mapa de la
 *   propia página. Si falla, se lee la tabla de la página, que trae lo mismo.
 * - `?page=historico&id=…`: un año de lecturas de un puerto, las dos de cada
 *   día. Es una página, ~290 KB, y **va unos días atrás**: el 10/10/2026
 *   terminaba el 09/10 a las 00:00. Por eso encima se le suman las dos lecturas
 *   de `alturas.json`.
 *
 * El servicio que alimenta el gráfico del mapa (`grafico-infowindow.php`)
 * contesta 500 desde afuera y no se usa.
 *
 * ── No está documentado ───────────────────────────────────────────────────────
 *
 * Mismo caso que el índice de avisos del SMN (`lib/tiempoFuente.ts`): si cambia
 * de forma hay que decirlo, no mostrar un dato viejo como nuevo. Lo que no se
 * puede leer se informa, y esa escala queda con lo del INA.
 *
 * ── Las horas ─────────────────────────────────────────────────────────────────
 *
 * Prefectura publica en hora local y el INA marca la lectura de las 00:00 a las
 * 03:00 UTC. Acá se convierte con el huso fijo de Argentina (UTC−3), así las
 * dos fuentes le ponen la misma fecha a la misma lectura y no se cuenta dos
 * veces.
 *
 * Funciones puras salvo las que empiezan con `traer`: las verifica
 * `scripts/verificar-prefectura.ts`, sin red.
 */
import { depurar, type LecturaRio } from './ina'

const BASE = 'https://contenidosweb.prefecturanaval.gob.ar/alturas'

const ESPERA_MS = 15_000

/** Argentina no cambia la hora: UTC−3 todo el año */
const HUSO_H = 3

const HORA_MS = 3_600_000

/**
 * Dentro de cuántas horas una lectura del INA es «la misma» que una de
 * Prefectura. Las dos marcan las 00:00, pero Prefectura tiene alguna a la 01:00.
 */
const MISMA_LECTURA_H = 3

/**
 * Cada escala en Prefectura, por el id con que este sistema la nombra: el de la
 * estación del INA, o un número negativo para las que sólo están en Prefectura.
 *
 * Va con el río porque los nombres se repiten o engañan: «BERMEJO» es Puerto
 * Bermejo, sobre el Paraguay, y «PARANA» es la ciudad. `idPna` es el del
 * histórico por puerto. El Colorado (2046) no está: Prefectura no tiene escala
 * sobre el río Bermejo.
 */
export const PUERTOS_PREFECTURA: Readonly<Record<number, { puerto: string; rio: string; idPna: number }>> = {
  14: { puerto: 'POSADAS',           rio: 'PARANA',   idPna: 80 },
  15: { puerto: 'ITUZAINGO',         rio: 'PARANA',   idPna: 90 },
  16: { puerto: 'ITA IBATE',         rio: 'PARANA',   idPna: 100 },
  17: { puerto: 'ITATI',             rio: 'PARANA',   idPna: 110 },
  18: { puerto: 'PASO DE LA PATRIA', rio: 'PARANA',   idPna: 120 },
  19: { puerto: 'CORRIENTES',        rio: 'PARANA',   idPna: 130 },
  20: { puerto: 'BARRANQUERAS',      rio: 'PARANA',   idPna: 140 },
  21: { puerto: 'EMPEDRADO',         rio: 'PARANA',   idPna: 150 },
  22: { puerto: 'BELLA VISTA',       rio: 'PARANA',   idPna: 160 },
  23: { puerto: 'GOYA',              rio: 'PARANA',   idPna: 170 },
  55: { puerto: 'PILCOMAYO',         rio: 'PARAGUAY', idPna: 490 },
  57: { puerto: 'FORMOSA',           rio: 'PARAGUAY', idPna: 510 },
  58: { puerto: 'BERMEJO',           rio: 'PARAGUAY', idPna: 520 },
  [-525]: { puerto: 'LAS PALMAS',       rio: 'PARAGUAY', idPna: 525 },
  [-530]: { puerto: 'ISLA DEL CERRITO', rio: 'PARAGUAY', idPna: 530 },
}

/**
 * Las dos escalas chaqueñas del río Paraguay que este sistema toma sólo de
 * Prefectura: Las Palmas, unos 25 km aguas abajo de Puerto Bermejo, e Isla del
 * Cerrito, en la confluencia con el Paraná. Van al bloque «Aguas arriba», con
 * el Paraguay, en ese orden, que es el del agua.
 *
 * **No tienen pronóstico ni anticipación medida**: lo primero es del INA y lo
 * segundo sale del registro desde 1970, donde no están. Sus umbrales son los
 * que publica Prefectura; no hay otros cargados acá.
 */
export const ESCALAS_SOLO_PREFECTURA: readonly { id: number; nombre: string; rio: 'Paraguay' }[] = [
  { id: -525, nombre: 'Las Palmas',       rio: 'Paraguay' },
  { id: -530, nombre: 'Isla del Cerrito', rio: 'Paraguay' },
]

export interface FilaPrefectura {
  puerto: string
  rio: string
  /** `null` cuando dice «S/E» o la fecha no se entiende */
  ultimo: LecturaRio | null
  anterior: LecturaRio | null
  /** `null` donde trae un guión */
  alerta: number | null
  evacuacion: number | null
}

const MESES: Record<string, number> = {
  ENE: 0, FEB: 1, MAR: 2, ABR: 3, MAY: 4, JUN: 5,
  JUL: 6, AGO: 7, SEP: 8, SET: 8, OCT: 9, NOV: 10, DIC: 11,
}

/** Mayúsculas, sin tildes y con un solo espacio: para comparar nombres */
const normal = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()

/**
 * «10/OCT/26 - 0000», en hora local, al instante en ISO. `null` si no tiene esa
 * forma: una fecha que no se entiende no se adivina.
 */
export function fechaPrefectura(texto: string): string | null {
  const m = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{2}|\d{4})\s*-\s*(\d{2})(\d{2})$/.exec(texto.trim())
  if (!m) return null
  const mes = MESES[m[2].toUpperCase()]
  const dia = Number(m[1]), hora = Number(m[4]), min = Number(m[5])
  if (mes === undefined || dia < 1 || dia > 31 || hora > 23 || min > 59) return null
  const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return new Date(Date.UTC(anio, mes, dia, hora + HUSO_H, min)).toISOString()
}

const numero = (s: unknown): number | null =>
  typeof s === 'string' && /^-?\d+(\.\d+)?$/.test(s.trim()) ? Number(s) : null

const lectura = (valor: unknown, fecha: unknown): LecturaRio | null => {
  const m = numero(valor)
  const f = typeof fecha === 'string' ? fechaPrefectura(fecha) : null
  return m === null || f === null ? null : { fecha: f, m }
}

/**
 * Las filas de `alturas.json`. Lista vacía si el texto no es ese JSON; decidir
 * que eso es un error es de quien llama.
 */
export function leerJson(texto: string): FilaPrefectura[] {
  let j: unknown
  try { j = JSON.parse(texto) } catch { return [] }
  const lista = (j as { Reportes?: { ReporteUltimoClass?: unknown } })?.Reportes?.ReporteUltimoClass
  if (!Array.isArray(lista)) return []

  const filas: FilaPrefectura[] = []
  for (const r of lista as Record<string, unknown>[]) {
    if (typeof r?.Puerto !== 'string' || typeof r?.Rio !== 'string') continue
    filas.push({
      puerto: normal(r.Puerto),
      rio: normal(r.Rio),
      ultimo: lectura(r.UltimoRegistro, r.FechaHora),
      anterior: lectura(r.RegistroAnterior, r.FechaAnterior),
      alerta: numero(r.Alerta),
      evacuacion: numero(r.Evacuacion),
    })
  }
  return filas
}

/** Lo mismo, de la tabla de la página: el respaldo de `leerJson()` */
export function leerTabla(html: string): FilaPrefectura[] {
  const filas: FilaPrefectura[] = []
  for (const tr of html.split(/<tr\b/i).slice(1)) {
    const celdas = new Map<string, string>()
    for (const c of tr.matchAll(/data-label="([^"]+)"[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      // La clave sin tildes ni dos puntos: «Evacuación:» y «Variacion» conviven
      celdas.set(normal(c[1]).replace(/:$/, ''), c[2].replace(/<[^>]+>/g, '').trim())
    }
    const puerto = celdas.get('PUERTO')
    const rio = celdas.get('RIO')
    if (!puerto || !rio) continue
    filas.push({
      puerto: normal(puerto),
      rio: normal(rio),
      ultimo: lectura(celdas.get('ULTIMO REGISTRO'), celdas.get('FECHA HORA')),
      anterior: lectura(celdas.get('REGISTRO ANTERIOR'), celdas.get('FECHA ANTERIOR')),
      alerta: numero(celdas.get('ALERTA')),
      evacuacion: numero(celdas.get('EVACUACION')),
    })
  }
  return filas
}

/** La fila de una escala, o `null` si Prefectura no la tiene */
export function filaDe(filas: FilaPrefectura[], id: number): FilaPrefectura | null {
  const p = PUERTOS_PREFECTURA[id]
  if (!p) return null
  return filas.find(f => f.puerto === p.puerto && f.rio === p.rio) ?? null
}

/**
 * El histórico de un puerto: de qué puerto dice ser la página y sus lecturas,
 * de la más vieja a la más nueva. Una fila sin número («S/E») se saltea.
 */
export function leerHistorico(html: string): { puerto: string | null; lecturas: LecturaRio[] } {
  const titulo = /Registros del puerto ([^'"<]+)/i.exec(html)
  const lecturas: LecturaRio[] = []
  const fila = /(\d{4})-(\d{2})-(\d{2})\s*<i[^>]*fa-clock-o[^>]*><\/i>\s*(\d{2}):(\d{2})\s*<\/td>\s*<td>\s*(-?\d+(?:\.\d+)?)\s*Mts\s*<\/td>/g
  for (const m of html.matchAll(fila)) {
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) + HUSO_H, Number(m[5]))
    lecturas.push({ fecha: new Date(t).toISOString(), m: Number(m[6]) })
  }
  lecturas.sort((a, b) => a.fecha.localeCompare(b.fecha))
  return { puerto: titulo ? normal(titulo[1]) : null, lecturas }
}

/**
 * Todo lo que Prefectura tiene de una escala: el histórico y, encima, las dos
 * lecturas de `alturas.json`, que suelen ser más nuevas. Una por instante; si
 * las dos fuentes traen la misma, vale la de `alturas.json`.
 */
export function lecturasDePrefectura(
  historico: LecturaRio[] | null, fila: FilaPrefectura | null,
): LecturaRio[] {
  const porInstante = new Map<string, number>()
  for (const l of historico ?? []) porInstante.set(l.fecha, l.m)
  for (const l of [fila?.anterior, fila?.ultimo]) if (l) porInstante.set(l.fecha, l.m)
  return [...porInstante]
    .map(([fecha, m]) => ({ fecha, m }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export interface LecturaPrefectura extends LecturaRio {
  /**
   * Cuánto cambió contra la lectura anterior y en cuántas horas. `null` si la
   * anterior está a más de un día: eso ya no es la variación de la última.
   */
  variacion: { m: number; horas: number } | null
}

export interface SerieUnida {
  /** Prefectura donde tiene lectura y el INA donde no, sin lo implausible */
  observado: LecturaRio[]
  /** La última lectura, si es de Prefectura. `null` si es del INA */
  lectura: LecturaPrefectura | null
  /** Cuántas lecturas de `observado` puso cada fuente */
  fuentes: { prefectura: number; ina: number }
  /** Lo que no se usó por salto imposible o fecha futura, por fuente */
  descartadasPrefectura: LecturaRio[]
  descartadasIna: LecturaRio[]
}

const cm = (v: number) => Math.round(v * 100) / 100

/**
 * Une las lecturas de Prefectura con las del INA.
 *
 * - **Manda Prefectura.** Una lectura del INA entra sólo si Prefectura no tiene
 *   ninguna a menos de `MISMA_LECTURA_H` horas: un día que le falta, o lo
 *   anterior a su histórico.
 * - **`desde` recorta a Prefectura**, cuyo histórico trae siempre un año; el
 *   INA ya viene pedido por fecha.
 * - **El mismo filtro para las dos** (`depurar()`, salto de más de 2 m): la
 *   falsa alarma de Empedrado salió de un dato mal cargado, y ninguna fuente
 *   está libre de eso. Lo descartado se devuelve, por fuente, para decirlo.
 * - **Una fecha futura no entra**: sería una errata de carga, y quedaría como
 *   «última» hasta que el calendario la alcance.
 */
export function unirSeries(
  prefectura: LecturaRio[], ina: LecturaRio[], desde: string, ahora: number,
): SerieUnida {
  const descartadasPrefectura: LecturaRio[] = []
  const propias: LecturaRio[] = []
  for (const l of prefectura) {
    if (l.fecha.slice(0, 10) < desde.slice(0, 10)) continue
    if (Date.parse(l.fecha) > ahora + HORA_MS) descartadasPrefectura.push(l)
    else propias.push(l)
  }

  // Ordenadas, para buscar la vecina de cada lectura del INA sin recorrer todo
  propias.sort((a, b) => a.fecha.localeCompare(b.fecha))
  const tiempos = propias.map(l => Date.parse(l.fecha))
  const cubierta = (t: number): boolean => {
    let lo = 0, hi = tiempos.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tiempos[mid] < t) lo = mid + 1; else hi = mid }
    const cerca = (i: number) => i >= 0 && i < tiempos.length
      && Math.abs(tiempos[i] - t) <= MISMA_LECTURA_H * HORA_MS
    return cerca(lo) || cerca(lo - 1)
  }

  const dePrefectura = new Set(propias)
  const todas = [...propias, ...ina.filter(l => !cubierta(Date.parse(l.fecha)))]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  const { validas, descartadas } = depurar(todas)
  for (const l of descartadas) if (dePrefectura.has(l)) descartadasPrefectura.push(l)

  const u = validas[validas.length - 1]
  const previa = validas[validas.length - 2]
  const horas = u && previa ? (Date.parse(u.fecha) - Date.parse(previa.fecha)) / HORA_MS : 0
  const nPrefectura = validas.filter(l => dePrefectura.has(l)).length

  return {
    observado: validas,
    lectura: u && dePrefectura.has(u)
      ? {
          ...u,
          variacion: previa && horas > 0 && horas <= 24
            ? { m: cm(u.m - previa.m), horas: Math.round(horas) }
            : null,
        }
      : null,
    fuentes: { prefectura: nPrefectura, ina: validas.length - nPrefectura },
    descartadasPrefectura,
    descartadasIna: descartadas.filter(l => !dePrefectura.has(l)),
  }
}

/** «10/10 00:00», en hora local, de un instante en ISO */
export function fechaHoraLocal(iso: string): string {
  const l = new Date(Date.parse(iso) - HUSO_H * HORA_MS).toISOString()
  return `${l.slice(8, 10)}/${l.slice(5, 7)} ${l.slice(11, 16)}`
}

// ── La red ───────────────────────────────────────────────────────────────────

async function pedir(ruta: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(BASE + ruta, { signal: AbortSignal.timeout(ESPERA_MS), cache: 'no-store' })
  } catch {
    throw new Error('No se pudo contactar a Prefectura.')
  }
  if (!res.ok) throw new Error(`Prefectura respondió ${res.status}`)
  return res.text()
}

const conEscalas = (filas: FilaPrefectura[]) =>
  Object.keys(PUERTOS_PREFECTURA).some(id => filaDe(filas, Number(id)))

/**
 * Las últimas alturas de todos los puertos. Primero el JSON; si no contesta o
 * no trae ninguna de las escalas buscadas, la tabla de la página. **Tira** si
 * ninguna de las dos sirve: es que Prefectura no está o cambió de forma.
 */
export async function traerPrefectura(): Promise<FilaPrefectura[]> {
  try {
    const filas = leerJson(await pedir('/alturas.json'))
    if (conEscalas(filas)) return filas
  } catch { /* se intenta con la tabla */ }

  const filas = leerTabla(await pedir('/'))
  if (!conEscalas(filas)) {
    throw new Error('Prefectura no trae las alturas en la forma esperada: puede haber cambiado la página.')
  }
  return filas
}

/** Lo mismo, sin tirar: un fallo de Prefectura no puede llevarse puesto lo del INA */
export async function prefecturaOAviso(): Promise<
  { filas: FilaPrefectura[]; motivo: null } | { filas: null; motivo: string }
> {
  try {
    return { filas: await traerPrefectura(), motivo: null }
  } catch (e) {
    return { filas: null, motivo: e instanceof Error ? e.message : 'No se pudo leer Prefectura' }
  }
}

/**
 * El histórico de una escala. **Tira** si la página es de otro puerto o no trae
 * lecturas: un id que Prefectura reasignó mostraría otro río con este nombre.
 */
export async function traerHistorico(id: number): Promise<LecturaRio[]> {
  const p = PUERTOS_PREFECTURA[id]
  if (!p) throw new Error('Esa escala no está en Prefectura')
  const h = leerHistorico(await pedir(`/?page=historico&tiempo=365&id=${p.idPna}`))
  if (h.puerto !== p.puerto) {
    throw new Error(`El histórico de Prefectura no es el de ${p.puerto}: puede haber cambiado la página.`)
  }
  if (h.lecturas.length === 0) throw new Error(`El histórico de ${p.puerto} en Prefectura vino vacío`)
  return h.lecturas
}
