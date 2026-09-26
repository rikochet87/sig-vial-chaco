/**
 * Trae la red vial una sola vez y le calcula la lluvia a cada tramo.
 *
 * Vive acá arriba y no adentro del mapa porque el mismo resultado lo necesitan
 * tres cosas: el mapa para pintar, el resumen para decir cuántos kilómetros
 * recibieron tanto, y la descarga. Si cada uno lo calculara por su cuenta,
 * podrían llegar a decir números distintos.
 *
 * El reparto del trabajo importa: partir el GeoJSON en tramos cuesta unos 300 ms
 * y **no depende de la fecha**, así que se hace una vez; estimar la lluvia son
 * 40 ms y se rehace en cada cambio de período.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  extraerTramos, lluviaPorTramo,
  type RedVial, type TramoRed, type LluviaTramo,
} from '@/lib/redLluvia'
import {
  arealPorLongitud, arealPorSuperficie, tramosDe, type MediaAreal,
} from '@/lib/thiessenAreal'
import { CONTORNO_CHACO } from '@/data/contornoChaco'
import type { EstacionLluvia } from '@/components/MapaLluvia'

export interface RedConLluvia {
  tramos: TramoRed[]
  lluvia: LluviaTramo[]
  /**
   * Media areal por polígonos de Thiessen sobre toda la provincia, con los dos
   * pesos. El de superficie existe sólo acá arriba porque es el único nivel con
   * polígono real; ver `lib/thiessenAreal.ts`.
   */
  arealProvincia: { porLongitud: MediaAreal; porSuperficie: MediaAreal } | null
  /** Media areal por longitud de red, por número de consorcio */
  arealPorCC: Map<number, MediaAreal>
  /** Todavía no llegó el archivo de la red */
  cargando: boolean
  /** Qué falló al traerla, para poder decirlo en pantalla. `null` si todo bien */
  error: string | null
  /** Volver a intentar la descarga */
  reintentar: () => void
}

/** Cuántas veces se reintenta solo antes de pedirle al usuario */
const INTENTOS = 3

export function useRedLluvia(estaciones: EstacionLluvia[]): RedConLluvia {
  const [red, setRed] = useState<RedVial | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  /*
   * El archivo pesa 8,6 MB y a veces no llegaba.
   *
   * Antes esto tenía un `catch` vacío, justificado con que «la pantalla sigue
   * sirviendo con los círculos por consorcio». **Los círculos se sacaron**, y
   * con ellos se fue el motivo: hoy, si la descarga falla, el mapa queda
   * literalmente vacío y no se entera nadie. El comentario quedó defendiendo
   * algo que ya no era cierto, que es la peor clase de comentario.
   *
   * Tres cosas que faltaban:
   *
   * - **Mirar `r.ok`.** Un 404 o un 502 devuelven una página HTML de error;
   *   `r.json()` revienta al parsearla y el `catch` se lo tragaba. El síntoma
   *   era idéntico al de un corte de red, así que no se podía diagnosticar.
   * - **Reintentar.** Una descarga de 8,6 MB sobre una conexión mala falla de
   *   a ratos y anda al segundo intento. Se reintenta con espera creciente.
   * - **Decirlo.** Agotados los intentos, la pantalla muestra qué pasó y un
   *   botón para volver a probar, en vez de un mapa vacío sin explicación.
   */
  useEffect(() => {
    let vivo = true
    const control = new AbortController()

    const traer = async () => {
      setError(null)
      for (let i = 0; i < INTENTOS; i++) {
        try {
          const r = await fetch('/geo/geo_cc.json', { signal: control.signal })
          if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
          const j = (await r.json()) as RedVial
          if (vivo) setRed(j)
          return
        } catch (e) {
          if (!vivo || control.signal.aborted) return
          if (i === INTENTOS - 1) {
            setError(e instanceof Error ? e.message : 'no se pudo descargar')
            return
          }
          // 400 ms, 800 ms: una conexión intermitente suele andar al segundo
          await new Promise(res => setTimeout(res, 400 * 2 ** i))
        }
      }
    }
    traer()

    return () => { vivo = false; control.abort() }
  }, [intento])

  const tramos = useMemo(() => (red ? extraerTramos(red) : []), [red])

  const lluvia = useMemo(
    () => (tramos.length && estaciones.length ? lluviaPorTramo(tramos, estaciones) : []),
    [tramos, estaciones],
  )

  // Thiessen se calcula acá y no en el componente por el mismo motivo que IDW:
  // el número del panel, el del globo y el de una eventual descarga tienen que
  // salir del mismo cálculo o pueden llegar a discrepar.
  const listo = tramos.length > 0 && estaciones.length > 0

  const arealProvincia = useMemo(() => (listo ? {
    porLongitud:   arealPorLongitud(estaciones, tramos),
    porSuperficie: arealPorSuperficie(estaciones, CONTORNO_CHACO),
  } : null), [listo, tramos, estaciones])

  const arealPorCC = useMemo(() => {
    const m = new Map<number, MediaAreal>()
    if (!listo) return m
    for (const cc of new Set(tramos.map(t => t.cc))) {
      if (!Number.isFinite(cc)) continue
      m.set(cc, arealPorLongitud(estaciones, tramosDe(tramos, cc)))
    }
    return m
  }, [listo, tramos, estaciones])

  return {
    tramos, lluvia, arealProvincia, arealPorCC,
    // Con error ya no se está cargando: se terminó de intentar y no salió.
    cargando: red === null && error === null,
    error,
    reintentar: () => setIntento(n => n + 1),
  }
}
