'use client'
/**
 * El registro del tramo (`public/rio/tramo_diario.json`), **bajado una sola
 * vez** para todo el panel del río.
 *
 * Lo leen dos bloques de la misma pantalla —«Aguas arriba» y «Traslado de la
 * crecida»— y son ~1 MB. Con un pedido por bloque se bajaba dos veces y, peor,
 * cada uno podía terminar con una copia distinta si el archivo cambiaba entre
 * medio. La promesa se guarda a nivel módulo: el segundo que pregunta recibe la
 * misma. **Un pedido fallido no queda guardado**, para que el botón de
 * reintentar pueda reintentar (mismo criterio que `RedFondo`).
 */
import { useEffect, useState } from 'react'
import type { TramoDiario } from '@/lib/rioTraslado'

let enCurso: Promise<TramoDiario> | null = null

function cargar(): Promise<TramoDiario> {
  if (enCurso) return enCurso
  enCurso = fetch('/rio/tramo_diario.json')
    .then(r => {
      if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
      return r.json() as Promise<TramoDiario>
    })
    .then(j => {
      if (!j?.estaciones || typeof j.desde !== 'string') throw new Error('el archivo no tiene la forma esperada')
      return j
    })
    .catch(e => {
      enCurso = null
      throw e
    })
  return enCurso
}

/** `intento` sube para reintentar después de un error */
export function useTramoDiario(intento = 0): { tramo: TramoDiario | null; error: string | null } {
  const [tramo, setTramo] = useState<TramoDiario | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    cargar()
      .then(j => { if (vivo) { setTramo(j); setError(null) } })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo leer') })
    return () => { vivo = false }
  }, [intento])

  return { tramo, error }
}
