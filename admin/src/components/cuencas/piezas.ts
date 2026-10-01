/**
 * Lo que comparten las vistas del panel de cuencas: formato de números y
 * estilos de tabla. Sin componentes ni lógica de cálculo.
 */

import type { CSSProperties } from 'react'

export const mono = { fontFamily: 'monospace' } as const

export const boton: CSSProperties = {
  ...mono, fontSize: 11, padding: '3px 9px', borderRadius: 2, cursor: 'pointer',
  background: 'transparent', border: '1px solid #2d2d2d', color: '#8a8a8a',
  textTransform: 'uppercase', letterSpacing: 0.8, marginLeft: 6,
}
export const th: CSSProperties = { textAlign: 'left', fontWeight: 400, padding: '4px 6px 4px 0' }
export const thD: CSSProperties = { ...th, textAlign: 'right', padding: '4px 0 4px 10px' }
export const td: CSSProperties = { padding: '4px 6px 4px 0' }
export const tdD: CSSProperties = { padding: '4px 0 4px 10px', textAlign: 'right', whiteSpace: 'nowrap' }

/**
 * Sin decimales, como el resto de la pantalla: contra el pluviómetro el error
 * típico es de varios milímetros, y "62,4" promete una precisión que no hay.
 */
export const nMm = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Math.round(v).toLocaleString('es-AR')

export const nKm2 = (v: number) => Math.round(v).toLocaleString('es-AR')

/** Kilómetros de red, sin decimales: la traza no se conoce al décimo de km */
export const nKm = (v: number) => Math.round(v).toLocaleString('es-AR')

export const nPct = (f: number) =>
  f >= 0.9995 ? '100' : (f * 100).toFixed(1).replace('.', ',')

/** '2026-09-22' → '22/09' */
export const fCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

export function bajarCsv(csv: string, nombre: string) {
  // El BOM es lo que hace que Excel en español abra los acentos bien
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
