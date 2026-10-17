/**
 * La red vial como la ven las pantallas: el archivo de QGIS con los cambios
 * cargados en el panel aplicados encima. Sólo navegador.
 *
 * Es el único lugar donde se bajan `geo_cc.json` y `geo_rp.json`. Antes cada
 * mapa hacía su propio `fetch` del archivo; si alguno se hubiera quedado con el
 * archivo crudo, un tramo nuevo se vería en Panorama y no en la lluvia.
 *
 * - **El archivo se baja una vez por sesión** (8,6 MB) y los cambios cada vez
 *   que alguien guarda. Un fallo no queda cacheado: el próximo intento reintenta.
 * - **Si los cambios no cargan, se sigue con el archivo y se avisa.** Antes de
 *   aplicar `docs/sql/18` la tabla no existe, y los mapas no pueden quedar
 *   vacíos por eso. El aviso queda en `errorCambios`.
 * - **Al guardar, `avisarCambio()`** invalida los cambios y avisa a las
 *   pantallas abiertas por el evento `sv-red-vial`, que vuelven a pedir la red.
 */
import { aplicarCambios, type Cambio, type Red, type RedAplicada, type TipoRed } from './redVial'

const ARCHIVO: Record<TipoRed, string> = { cc: '/geo/geo_cc.json', rp: '/geo/geo_rp.json' }
export const EVENTO_RED = 'sv-red-vial'

const archivos = new Map<TipoRed, Promise<Red>>()
let cambiosCache: Promise<{ cambios: Cambio[]; error: string | null }> | null = null

function archivo(tipo: TipoRed, signal?: AbortSignal): Promise<Red> {
  let p = archivos.get(tipo)
  if (!p) {
    p = fetch(ARCHIVO[tipo], { signal }).then(async r => {
      if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
      return (await r.json()) as Red
    })
    p.catch(() => archivos.delete(tipo))
    archivos.set(tipo, p)
  }
  return p
}

function cambios(): Promise<{ cambios: Cambio[]; error: string | null }> {
  if (!cambiosCache) {
    cambiosCache = fetch('/api/red-vial', { cache: 'no-store' })
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) return { cambios: [], error: (j as { error?: string }).error ?? `respondió ${r.status}` }
        return { cambios: ((j as { cambios?: Cambio[] }).cambios ?? []).map(normalizar), error: null }
      })
      .catch(e => {
        cambiosCache = null
        return { cambios: [], error: e instanceof Error ? e.message : 'no se pudo leer' }
      })
  }
  return cambiosCache
}

/** PostgREST puede mandar `numeric` como texto */
const normalizar = (c: Cambio): Cambio => ({ ...c, km: Number(c.km) || 0, ajuste: c.ajuste ?? [] })

export interface RedCargada extends RedAplicada {
  cambios: Cambio[]
  /** Por qué no se pudieron aplicar los cambios, o null */
  errorCambios: string | null
}

/** La red de consorcios (`cc`) o de rutas provinciales (`rp`) con los cambios */
export async function cargarRed(tipo: TipoRed, opciones: { signal?: AbortSignal } = {}): Promise<RedCargada> {
  const [base, c] = await Promise.all([archivo(tipo, opciones.signal), cambios()])
  if (c.error) console.warn('[red vial] se muestra el archivo sin los cambios del panel:', c.error)
  return { ...aplicarCambios(tipo, base, c.cambios), cambios: c.cambios, errorCambios: c.error }
}

/** Atajo para las pantallas que sólo necesitan la red, no de dónde sale cada tramo */
export async function cargarRedVial(tipo: TipoRed, opciones: { signal?: AbortSignal } = {}): Promise<Red> {
  return (await cargarRed(tipo, opciones)).red
}

/** Después de guardar: que todas las pantallas abiertas vuelvan a pedir la red */
export function avisarCambio() {
  cambiosCache = null
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_RED))
}

/** Para un `useEffect`: llama a `fn` cada vez que alguien guarda un cambio */
export function alCambiarRed(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENTO_RED, fn)
  return () => window.removeEventListener(EVENTO_RED, fn)
}
