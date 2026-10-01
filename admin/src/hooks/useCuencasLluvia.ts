/**
 * Las cuencas y su lluvia del período, calculadas una sola vez.
 *
 * Vive acá arriba por el mismo motivo que `useRedLluvia`: el resultado lo
 * necesitan dos lugares —la lista de cuencas al lado del mapa y la pestaña
 * Cuencas— y si cada uno lo calculara por su cuenta podrían llegar a decir
 * números distintos.
 *
 * **No hace nada hasta que alguien lo pide** (`activo`). Son 310 KB y un
 * cálculo de ~150 ms por período, y la mayoría de las visitas a la pantalla
 * miran el mapa por consorcio y se van.
 */

import { useEffect, useMemo, useState } from 'react'
import { cargarCuencas, type Cuenca } from '@/lib/cuencas'
import {
  laminaPorCuenca, muestrasDe, totalCuencas, type LaminaCuenca, type Muestra,
} from '@/lib/lluviaCuencas'
import type { MedicionConNombre } from '@/lib/thiessenAreal'

export interface CuencasConLluvia {
  /** Las 13 cuencas, o null mientras no llegaron */
  cuencas: Cuenca[] | null
  /** La grilla de muestreo de cada una; no depende de la fecha */
  muestras: Muestra[][] | null
  /** La lámina del período por cuenca; null sin cuencas o sin mediciones */
  filas: LaminaCuenca[] | null
  total: ReturnType<typeof totalCuencas> | null
  error: string | null
  reintentar: () => void
}

export function useCuencasLluvia(estaciones: MedicionConNombre[], activo: boolean): CuencasConLluvia {
  const [cuencas, setCuencas] = useState<Cuenca[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!activo) return
    let vivo = true
    cargarCuencas()
      .then(c => { if (vivo) { setCuencas(c); setError(null) } })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo descargar') })
    return () => { vivo = false }
  }, [activo, intento])

  const muestras = useMemo(() => cuencas?.map(c => muestrasDe(c)) ?? null, [cuencas])

  const filas = useMemo(
    () => (cuencas && muestras && estaciones.length > 0
      ? laminaPorCuenca(cuencas, muestras, estaciones)
      : null),
    [cuencas, muestras, estaciones],
  )
  const total = useMemo(() => (filas ? totalCuencas(filas) : null), [filas])

  return { cuencas, muestras, filas, total, error, reintentar: () => setIntento(n => n + 1) }
}
