'use client'
/**
 * Imágenes satelitales históricas sobre un mapa de Leaflet, más su deslizador.
 *
 * Son dos piezas que van juntas:
 *
 * - {@link useImagenesHistoricas} averigua qué fotos distintas hay en el centro
 *   del mapa, monta la capa de la elegida y la vuelve a buscar al mover.
 * - {@link DeslizadorHistorico} muestra la fecha de toma y deja recorrerlas.
 *
 * **La lista es del lugar, no del mapa.** Cada punto de la provincia tiene sus
 * propias tomas, así que al mover el mapa la lista cambia. Lo que se conserva
 * es *qué momento* se estaba mirando: la misma versión si sigue en la lista, la
 * misma toma si la hay, y si no la que esa versión muestra en el lugar nuevo.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ATRIBUCION, entradaVigente, fechasEn, urlTiles, type Imagen,
} from '@/lib/wayback'

/**
 * Por debajo de este zoom no se busca. A escala provincial "el centro del mapa"
 * no es un lugar —el tile que se consulta mide 550 m— y cada búsqueda son de
 * 12 a 22 pedidos encadenados más los metadatos: hacerlos mientras alguien
 * recorre la provincia sería gastarlos en una respuesta que no significa nada.
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
  elegida: Imagen | null
  elegir: (n: number) => void
  reintentar: () => void
}

/** Qué entrada de la lista nueva es "la misma" que se venía mirando. */
function conservar(lista: Imagen[], previa: Imagen | null): Imagen | null {
  if (!lista.length) return null
  if (!previa) return lista[lista.length - 1]
  return lista.find(i => i.n === previa.n)
    // Al colapsar, de una toma repetida queda otra versión: es la misma foto.
    ?? (previa.captura ? lista.find(i => i.captura === previa.captura) : undefined)
    ?? entradaVigente(lista, previa.publicada)
}

/**
 * @param mapaRef  ref al mapa de Leaflet — se lee adentro del efecto, no en render
 * @param listo    si el mapa ya existe — es lo que dispara el re-render
 * @param activa   permite apagar la capa sin desmontar el componente
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

    const buscar = async () => {
      ctrl?.abort()
      if (map.getZoom() < ZOOM_MIN_HISTORICO) { setFase('lejos'); return }

      const mio = ctrl = new AbortController()
      const { lat, lng } = map.getCenter()
      const recibir = (l: Imagen[], f: FaseHistorico) => {
        if (mio.signal.aborted) return
        setLista(l)
        fijar(conservar(l, elegidaRef.current))
        setFase(l.length ? f : 'vacio')
      }
      setFase('buscando')
      try {
        const final = await fechasEn(lat, lng, { signal: mio.signal, onParcial: l => recibir(l, 'parcial') })
        recibir(final, 'lista')
      } catch {
        if (!mio.signal.aborted) setFase('error')
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

  // ── La capa de la foto elegida ──
  const capaRef = useRef<import('leaflet').TileLayer | null>(null)
  const n = activa ? elegida?.n ?? null : null

  useEffect(() => {
    const map = listo ? mapaRef.current : null
    if (!map) return
    let vivo = true
    let relevo: ReturnType<typeof setTimeout> | null = null

    import('leaflet').then(m => {
      if (!vivo) return
      const anterior = capaRef.current
      if (n === null) {
        anterior?.remove()
        capaRef.current = null
        return
      }
      const nueva = m.default.tileLayer(urlTiles(n), {
        attribution: ATRIBUCION, maxZoom: 21, maxNativeZoom: ZOOM_NATIVO_MAX, zIndex: 2,
      }).addTo(map)
      capaRef.current = nueva
      if (!anterior) return
      // La anterior se queda debajo hasta que la nueva cargó: sin eso, cada
      // paso del deslizador parpadea al mapa base y no se pueden comparar.
      const sacar = () => { if (relevo) clearTimeout(relevo); anterior.remove() }
      nueva.once('load', sacar)
      relevo = setTimeout(sacar, RELEVO_MAX_MS)
    })

    return () => { vivo = false }
  }, [mapaRef, listo, n])

  // Al desmontar el mapa se lleva sus capas; sólo se suelta la referencia.
  useEffect(() => () => { capaRef.current = null }, [])

  const elegir = useCallback((num: number) => {
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
const botonPaso = (activo: boolean): React.CSSProperties => ({
  ...mono, background: '#111', border: '1px solid #333', borderRadius: 4,
  color: activo ? '#F5C300' : '#444', cursor: activo ? 'pointer' : 'default',
  fontSize: 14, width: 30, height: 28, padding: 0, flexShrink: 0,
})

export function DeslizadorHistorico({ estado }: { estado: EstadoHistorico }) {
  const { fase, lista, elegida, elegir, reintentar } = estado
  const idx = elegida ? lista.findIndex(i => i.n === elegida.n) : -1
  const hayLista = lista.length > 0 && idx >= 0 && fase !== 'lejos' && fase !== 'error' && fase !== 'vacio'

  return (
    <div style={{
      ...mono, position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1000, width: 'min(460px, calc(100% - 40px))',
      background: 'rgba(26,26,26,.95)', border: '1px solid #333', borderRadius: 6,
      boxShadow: '0 4px 16px rgba(0,0,0,.7)', padding: '9px 12px', color: '#e0e0e0',
    }}>
      <div style={{ fontSize: 11, color: '#8a8a8a', textTransform: 'uppercase', letterSpacing: 0.6 }}>
        Imagen satelital histórica
      </div>

      {fase === 'lejos' && (
        <div style={{ fontSize: 12, color: '#b8b8b8', marginTop: 5, lineHeight: 1.45 }}>
          Acercá el mapa para ver qué fotos hay de ese lugar: cada punto de la
          provincia tiene sus propias fechas.
        </div>
      )}

      {fase === 'error' && (
        <div style={{ fontSize: 12, color: '#ffb199', marginTop: 5, lineHeight: 1.45 }}>
          No se pudo consultar el archivo de imágenes.{' '}
          <button onClick={reintentar} style={{
            ...mono, background: 'none', border: '1px solid #F5C300', borderRadius: 4,
            color: '#F5C300', cursor: 'pointer', fontSize: 12, padding: '2px 8px',
          }}>Reintentar</button>
        </div>
      )}

      {fase === 'vacio' && (
        <div style={{ fontSize: 12, color: '#b8b8b8', marginTop: 5 }}>
          No hay imágenes archivadas de este lugar.
        </div>
      )}

      {fase === 'buscando' && !hayLista && (
        <div style={{ fontSize: 12, color: '#b8b8b8', marginTop: 5 }}>
          Buscando las fotos de este lugar…
        </div>
      )}

      {hayLista && elegida && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 17, color: '#F5C300' }}>
              {fechaLarga(elegida.captura ?? elegida.publicada)}
            </b>
            <span style={{ fontSize: 12, color: '#b8b8b8' }}>
              {elegida.captura
                ? 'fecha de toma'
                : fase === 'lista' ? 'fecha de publicación — la de toma no está informada'
                  : 'fecha de publicación — buscando la de toma…'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#8a8a8a', marginTop: 2, minHeight: 15 }}>
            {[
              elegida.fuente,
              elegida.resolucionM !== null ? `${String(elegida.resolucionM).replace('.', ',')} m por píxel` : null,
              elegida.captura ? `publicada el ${fechaLarga(elegida.publicada)}` : null,
            ].filter(Boolean).join(' · ')}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
            <button title="Anterior" disabled={idx <= 0} style={botonPaso(idx > 0)}
              onClick={() => elegir(lista[idx - 1].n)}>◀</button>
            <input type="range" min={0} max={lista.length - 1} step={1} value={idx}
              disabled={lista.length < 2}
              onChange={e => elegir(lista[Number(e.target.value)].n)}
              aria-label="Fecha de la imagen"
              style={{ flex: 1, accentColor: '#F5C300', cursor: 'pointer' }} />
            <button title="Siguiente" disabled={idx >= lista.length - 1}
              style={botonPaso(idx < lista.length - 1)}
              onClick={() => elegir(lista[idx + 1].n)}>▶</button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8a8a8a', marginTop: 3 }}>
            <span>{fechaLarga(lista[0].captura ?? lista[0].publicada)}</span>
            <span>
              {idx + 1} de {lista.length}
              {fase !== 'lista' && ' · buscando…'}
            </span>
            <span>{fechaLarga(lista[lista.length - 1].captura ?? lista[lista.length - 1].publicada)}</span>
          </div>
        </>
      )}
    </div>
  )
}
