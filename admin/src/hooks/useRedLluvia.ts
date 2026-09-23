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
import type { EstacionLluvia } from '@/components/MapaLluvia'

export interface RedConLluvia {
  tramos: TramoRed[]
  lluvia: LluviaTramo[]
  /** Todavía no llegó el archivo de la red */
  cargando: boolean
}

export function useRedLluvia(estaciones: EstacionLluvia[]): RedConLluvia {
  const [red, setRed] = useState<RedVial | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/geo/geo_cc.json')
      .then(r => r.json())
      .then((j: RedVial) => { if (vivo) setRed(j) })
      // Sin la red vial la pantalla sigue sirviendo con los círculos por
      // consorcio, así que esto no es motivo para romper nada.
      .catch(() => { /* se ignora a propósito */ })
    return () => { vivo = false }
  }, [])

  const tramos = useMemo(() => (red ? extraerTramos(red) : []), [red])

  const lluvia = useMemo(
    () => (tramos.length && estaciones.length ? lluviaPorTramo(tramos, estaciones) : []),
    [tramos, estaciones],
  )

  return { tramos, lluvia, cargando: red === null }
}
