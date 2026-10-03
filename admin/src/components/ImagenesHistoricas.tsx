'use client'
/**
 * Imágenes satelitales de años anteriores sobre la capa de satélite, más su
 * deslizador.
 *
 * Son dos piezas que van juntas:
 *
 * - {@link useImagenesHistoricas} averigua qué fotos distintas hay en el centro
 *   del mapa, monta la capa de la elegida y la vuelve a buscar al mover.
 * - {@link DeslizadorHistorico} muestra la fecha de toma y deja recorrerlas.
 *
 * **Lo que se ve por defecto es la imagen actual**, que es la capa de satélite
 * del mapa y no pasa por acá. Las anteriores van encima, y la última posición
 * del deslizador —«Actual»— es simplemente no poner ninguna.
 *
 * **La lista es del lugar, no del mapa.** Cada punto de la provincia tiene sus
 * propias tomas, así que al mover el mapa la lista cambia. Lo que se conserva
 * es *qué momento* se estaba mirando: la misma versión si sigue en la lista, la
 * misma toma si la hay, y si no la que esa versión muestra en el lugar nuevo.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ATRIBUCION, claveTile, entradaVigente, fechasEn, urlTiles, type Imagen,
} from '@/lib/wayback'

/**
 * Por debajo de este zoom no se busca. A escala provincial "el centro del mapa"
 * no es un lugar —el tile que se consulta mide 550 m— y cada búsqueda son unas
 * decenas de pedidos: hacerlos mientras alguien recorre la provincia sería
 * gastarlos en una respuesta que no significa nada.
 */
export const ZOOM_MIN_HISTORICO = 12

/**
 * Hasta el 17 hay tile en toda la provincia y en todas las versiones. El 18 y
 * el 19 existen sólo en las ciudades y sólo en las versiones recientes: medido
 * en Castelli y en campo abierto dan 404, y en Resistencia la versión de 2014
 * también. Pasado el 17 Leaflet agranda el tile en vez de pedir uno que falta,
 * y así todas las fechas se ven con el mismo detalle y se pueden comparar.
 */
const ZOOM_NATIVO_MAX = 17

/** Espera tras el último movimiento antes de buscar, en ms. */
const ESPERA_MS = 500

/** Si la capa nueva no termina de cargar, la anterior se saca igual. */
const RELEVO_MAX_MS = 4000

export type FaseHistorico = 'lejos' | 'buscando' | 'parcial' | 'lista' | 'vacio' | 'error'

export interface EstadoHistorico {
  fase: FaseHistorico
  /** De la más vieja a la más nueva. */
  lista: Imagen[]
  /** null es la imagen actual: la capa de satélite del mapa, sin nada encima. */
  elegida: Imagen | null
  elegir: (n: number | null) => void
  reintentar: () => void
}

/** Qué entrada de la lista nueva es "la misma" que se venía mirando. */
function conservar(lista: Imagen[], previa: Imagen): Imagen | null {
  if (!lista.length) return null
  return lista.find(i => i.n === previa.n)
    // Al colapsar, de una toma repetida queda otra versión: es la misma foto.
    ?? (previa.captura ? lista.find(i => i.captura === previa.captura) : undefined)
    ?? entradaVigente(lista, previa.publicada)
}

/**
 * @param mapaRef  ref al mapa de Leaflet — se lee adentro del efecto, no en render
 * @param listo    si el mapa ya existe — es lo que dispara el re-render
 * @param activa   si se está mirando el historial: apagada no busca ni monta nada
 */
export function useImagenesHistoricas(
  mapaRef: { current: import('leaflet').Map | null },
  listo: boolean,
  activa: boolean,
): EstadoHistorico {
  const [fase, setFase] = useState<FaseHistorico>('buscando')
  const [lista, setLista] = useState<Imagen[]>([])
  const [elegida, setElegida] = useState<Imagen | null>(null)
  const [intento, setIntento] = useState(0)

  // La elegida también en ref: la búsqueda la necesita y no debe relanzarse
  // cada vez que se mueve el deslizador.
  const elegidaRef = useRef<Imagen | null>(null)
  const fijar = useCallback((i: Imagen | null) => { elegidaRef.current = i; setElegida(i) }, [])

  // ── Qué fotos hay acá ──
  useEffect(() => {
    const map = listo ? mapaRef.current : null
    if (!map || !activa) return

    let ctrl: AbortController | null = null
    let reloj: ReturnType<typeof setTimeout> | null = null
    // Tile de la búsqueda en curso o terminada. Acercar o alejar con la rueda
    // corre el centro unos metros; si sigue en el mismo tile la lista es la
    // misma, y relanzar la búsqueda la cortaba a mitad de las fechas de toma y
    // volvía a mostrar la lista a medio armar.
    let claveActual: string | null = null

    const buscar = async () => {
      if (map.getZoom() < ZOOM_MIN_HISTORICO) {
        ctrl?.abort(); claveActual = null; setFase('lejos'); return
      }
      const { lat, lng } = map.getCenter()
      const clave = claveTile(lat, lng)
      if (clave === claveActual) return
      ctrl?.abort()
      claveActual = clave

      const mio = ctrl = new AbortController()
      const recibir = (l: Imagen[], f: FaseHistorico) => {
        if (mio.signal.aborted) return
        setLista(l)
        // Quien estaba en la actual se queda en la actual.
        if (elegidaRef.current) fijar(conservar(l, elegidaRef.current))
        setFase(l.length ? f : 'vacio')
      }
      setFase('buscando')
      try {
        const final = await fechasEn(lat, lng, { signal: mio.signal, onParcial: l => recibir(l, 'parcial') })
        recibir(final, 'lista')
      } catch {
        if (!mio.signal.aborted) { claveActual = null; setFase('error') }
      }
    }

    const programar = (ms: number) => {
      if (reloj) clearTimeout(reloj)
      reloj = setTimeout(buscar, ms)
    }
    const alMover = () => programar(ESPERA_MS)

    programar(0)
    map.on('moveend', alMover)
    return () => {
      map.off('moveend', alMover)
      if (reloj) clearTimeout(reloj)
      ctrl?.abort()
    }
  }, [mapaRef, listo, activa, intento, fijar])

  /*
   * ── Las capas ──
   *
   * Además de la elegida se montan, invisibles, **la anterior y la siguiente**:
   * son las dos a las que se puede ir con un paso del deslizador, y si sus
   * tiles ya están bajados el paso es instantáneo en vez de esperar ~0,7 s por
   * tile. Estando en la actual, la vecina es la última del historial.
   */
  const n = activa ? elegida?.n ?? null : null
  const idx = n === null ? lista.length : lista.findIndex(i => i.n === n)
  const vecinas = activa ? [lista[idx - 1]?.n, lista[idx + 1]?.n] : []
  const montadas = [n, ...vecinas].filter(v => v !== null && v !== undefined).join(',')

  const capasRef = useRef(new Map<number, import('leaflet').TileLayer>())
  const visibleRef = useRef<number | null>(null)

  useEffect(() => {
    const map = listo ? mapaRef.current : null
    if (!map) return
    let vivo = true
    let relevo: ReturnType<typeof setTimeout> | null = null

    import('leaflet').then(m => {
      if (!vivo) return
      const capas = capasRef.current
      const quiero = new Set(montadas ? montadas.split(',').map(Number) : [])
      const previa = visibleRef.current
      visibleRef.current = n

      for (const k of quiero) {
        if (capas.has(k)) continue
        capas.set(k, m.default.tileLayer(urlTiles(k), {
          attribution: ATRIBUCION, maxZoom: 21, maxNativeZoom: ZOOM_NATIVO_MAX, opacity: 0, zIndex: 2,
        }).addTo(map))
      }
      for (const [k, capa] of capas) if (k !== n) capa.setZIndex(2)

      // Esconde lo que ya no se mira y saca lo que ya no es vecino.
      const soltar = () => {
        if (!vivo) return
        if (relevo) clearTimeout(relevo)
        for (const [k, capa] of capas) {
          if (k === n) continue
          if (quiero.has(k)) capa.setOpacity(0)
          else { capa.remove(); capas.delete(k) }
        }
      }

      if (n === null) { soltar(); return }
      const capaElegida = capas.get(n)!
      capaElegida.setZIndex(3)
      capaElegida.setOpacity(1)
      // La que se venía mirando se queda debajo hasta que la nueva cargó: sin
      // eso, un paso a una fecha sin precargar parpadea a la imagen actual.
      if (previa === null || previa === n || !capaElegida.isLoading()) { soltar(); return }
      capaElegida.once('load', soltar)
      relevo = setTimeout(soltar, RELEVO_MAX_MS)
    })

    return () => { vivo = false; if (relevo) clearTimeout(relevo) }
  }, [mapaRef, listo, n, montadas])

  // Al desmontar, el mapa se lleva sus capas; sólo se sueltan las referencias.
  useEffect(() => {
    const capas = capasRef.current
    return () => { capas.clear() }
  }, [])

  const elegir = useCallback((num: number | null) => {
    if (num === null) { fijar(null); return }
    const i = lista.find(x => x.n === num)
    if (i) fijar(i)
  }, [lista, fijar])
  const reintentar = useCallback(() => setIntento(v => v + 1), [])

  return { fase, lista, elegida, elegir, reintentar }
}

// ── El deslizador ────────────────────────────────────────────────────────────

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** '2025-09-22' → '22 sep 2025' */
export function fechaLarga(f: string): string {
  const [a, m, d] = f.split('-')
  return `${Number(d)} ${MESES[Number(m) - 1]} ${a}`
}

const mono = { fontFamily: 'monospace' as const }

/*
 * El mismo lenguaje que los paneles de medición del mapa y que las pantallas de
 * Obras y Lluvias: caja casi negra, borde de 1 px, esquinas rectas, filo
 * amarillo a la izquierda y rótulos en mayúsculas espaciadas. Sin emojis: el
 * ícono es un trazo de 1,2 px como los de la barra lateral.
 */
const caja: React.CSSProperties = {
  ...mono, position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)',
  zIndex: 1000, background: '#0e0e0e', border: '1px solid #222', borderLeft: '3px solid #F5C300',
  borderRadius: 2, boxShadow: '0 4px 16px rgba(0,0,0,.7)', color: '#e0e0e0',
}
const rotulo: React.CSSProperties = {
  fontSize: 12, color: '#777', letterSpacing: 1.4, textTransform: 'uppercase',
}
const chico: React.CSSProperties = {
  fontSize: 11, color: '#666', letterSpacing: 0.8, textTransform: 'uppercase',
}
const aviso: React.CSSProperties = { fontSize: 12, color: '#888', marginTop: 6, lineHeight: 1.45 }
const botonPaso = (activo: boolean): React.CSSProperties => ({
  ...mono, background: '#0a0a0a', border: '1px solid #222', borderRadius: 2,
  color: activo ? '#F5C300' : '#333', cursor: activo ? 'pointer' : 'default',
  fontSize: 11, width: 28, height: 24, padding: 0, flexShrink: 0,
})

const IconoReloj = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.2" />
    <polyline points="8,4.2 8,8 10.8,9.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" />
  </svg>
)

/**
 * Cerrado es un botón chico al pie del mapa; abierto, el deslizador.
 *
 * Arranca cerrado a propósito: lo que se quiere casi siempre es el satélite a
 * secas, y abierto busca las fotos del lugar cada vez que se mueve el mapa.
 */
export function DeslizadorHistorico({ estado, abierto, onAbrir, onCerrar }: {
  estado: EstadoHistorico
  abierto: boolean
  onAbrir: () => void
  onCerrar: () => void
}) {
  if (!abierto) {
    return (
      <button onClick={onAbrir} title="Ver fotos satelitales de años anteriores de este lugar"
        style={{
          ...caja, ...rotulo, color: '#999', cursor: 'pointer', padding: '7px 12px',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
        <IconoReloj /> Imágenes anteriores
      </button>
    )
  }

  const { fase, lista, elegida, elegir, reintentar } = estado
  const idx = elegida ? lista.findIndex(i => i.n === elegida.n) : lista.length
  const hayLista = lista.length > 0 && idx >= 0 && fase !== 'lejos' && fase !== 'error' && fase !== 'vacio'
  const buscando = fase === 'buscando' || fase === 'parcial'
  const fechaDe = (i: Imagen) => fechaLarga(i.captura ?? i.publicada)
  // La posición que sigue a la última foto es la imagen actual.
  const ir = (i: number) => elegir(i >= lista.length ? null : lista[i].n)

  return (
    <div style={{ ...caja, width: 'min(460px, calc(100% - 40px))', padding: '9px 12px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#777' }}>
        <IconoReloj />
        <span style={rotulo}>Imágenes anteriores</span>
        <button onClick={onCerrar} title="Cerrar y volver a la imagen actual" style={{
          ...mono, background: 'none', border: 'none', color: '#555', cursor: 'pointer',
          fontSize: 13, padding: '0 2px', lineHeight: 1, marginLeft: 'auto',
        }}>✕</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 6, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 20, color: '#F5C300', lineHeight: 1.2 }}>
          {elegida ? fechaDe(elegida) : 'Actual'}
        </b>
        <span style={chico}>
          {!elegida ? 'Capa de satélite'
            : elegida.captura ? 'Fecha de toma'
              : buscando ? 'Fecha de publicación · buscando la de toma…'
                : 'Fecha de publicación · la de toma no está informada'}
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#666', marginTop: 2, minHeight: 15 }}>
        {elegida && [
          elegida.fuente,
          elegida.resolucionM !== null ? `${String(elegida.resolucionM).replace('.', ',')} m por píxel` : null,
          elegida.captura ? `publicada el ${fechaLarga(elegida.publicada)}` : null,
        ].filter(Boolean).join(' · ')}
      </div>

      {fase === 'lejos' && (
        <div style={aviso}>
          Acercá el mapa para ver qué fotos hay de ese lugar: cada punto de la
          provincia tiene sus propias fechas.
        </div>
      )}
      {fase === 'error' && (
        <div style={{ ...aviso, color: '#E57373' }}>
          No se pudo consultar el archivo de imágenes.{' '}
          <button onClick={reintentar} style={{
            ...mono, background: 'none', border: '1px solid #F5C300', borderRadius: 2,
            color: '#F5C300', cursor: 'pointer', fontSize: 11, letterSpacing: 0.8,
            textTransform: 'uppercase', padding: '3px 8px',
          }}>Reintentar</button>
        </div>
      )}
      {fase === 'vacio' && <div style={aviso}>No hay imágenes archivadas de este lugar.</div>}
      {fase === 'buscando' && !hayLista && <div style={aviso}>Buscando las fotos de este lugar…</div>}

      {hayLista && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <button title="Anterior" disabled={idx <= 0} style={botonPaso(idx > 0)}
              onClick={() => ir(idx - 1)}>◀</button>
            <input type="range" className="sv-range" min={0} max={lista.length} step={1} value={idx}
              onChange={e => ir(Number(e.target.value))}
              aria-label="Fecha de la imagen" style={{ flex: 1, minWidth: 0 }} />
            <button title="Siguiente" disabled={idx >= lista.length}
              style={botonPaso(idx < lista.length)}
              onClick={() => ir(idx + 1)}>▶</button>
          </div>

          {/* Una marca por fecha, como una regla. El margen es el de los
              botones, y el relleno la mitad del cursor, para que cada marca
              caiga donde el cursor se detiene. */}
          <div style={{ display: 'flex', justifyContent: 'space-between', margin: '1px 36px 0', padding: '0 3px' }}>
            {Array.from({ length: lista.length + 1 }, (_, k) => (
              <span key={k} style={{ width: 1, height: k === idx ? 6 : 4, background: k === idx ? '#F5C300' : '#444' }} />
            ))}
          </div>

          <div style={{ ...chico, display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span>{fechaDe(lista[0])}</span>
            <span>
              {lista.length} {lista.length === 1 ? 'anterior' : 'anteriores'}
              {buscando && ' · buscando…'}
            </span>
            <span>Actual</span>
          </div>
        </>
      )}
    </div>
  )
}
