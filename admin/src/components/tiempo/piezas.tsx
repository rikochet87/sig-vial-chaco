'use client'
/**
 * Lo que comparten las pantallas del tiempo: los íconos de cielo, los colores
 * de nivel de alerta y los formatos.
 *
 * **Los íconos son SVG de trazo 1,2 px**, como los de la barra lateral: la
 * convención del panel prohíbe emojis, y los de clima son justo los que más
 * tientan.
 */
import type { Cielo, Nivel } from '@/lib/tiempo'

export const mono = { fontFamily: 'monospace' } as const

/** Los colores del SMN para cada nivel */
export const COLOR_NIVEL: Record<Nivel, string> = { amarillo: '#F5C300', naranja: '#FF8C1A', rojo: '#E53935' }

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** '2026-10-03' → 'sáb 03/10'. Al mediodía UTC para que ningún huso corra el día */
export function fDia(f: string): string {
  const d = new Date(`${f}T12:00:00Z`)
  return `${DIAS[d.getUTCDay()]} ${f.slice(8, 10)}/${f.slice(5, 7)}`
}

/** Una fecha ISO con hora → 'sáb 03/10 15:00', en hora de Argentina */
export function fHora(iso: string | null): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return iso
  const d = new Date(t - 3 * 3600_000)
  const f = d.toISOString()
  return `${DIAS[d.getUTCDay()]} ${f.slice(8, 10)}/${f.slice(5, 7)} ${f.slice(11, 16)}`
}

export const n0 = (v: number | null) => (v === null ? '—' : Math.round(v).toLocaleString('es-AR'))

export function IconoCielo({ cielo, tam = 18, color = '#c8c8c8' }: { cielo: Cielo; tam?: number; color?: string }) {
  const p = { stroke: color, strokeWidth: 1.2, fill: 'none', strokeLinecap: 'square' as const }
  const nube = <path {...p} d="M5 12.5h7.2a2.6 2.6 0 0 0 .3-5.2 3.8 3.8 0 0 0-7.3.9A2.2 2.2 0 0 0 5 12.5z" />
  return (
    <svg width={tam} height={tam} viewBox="0 0 16 16" aria-hidden style={{ flexShrink: 0 }}>
      {cielo === 'despejado' && (<>
        <circle {...p} cx="8" cy="8" r="3" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
          <line key={a} {...p} x1="8" y1="1.6" x2="8" y2="3.2" transform={`rotate(${a} 8 8)`} />
        ))}
      </>)}
      {cielo === 'nubes' && nube}
      {cielo === 'niebla' && (<>
        <line {...p} x1="2.5" y1="6" x2="13.5" y2="6" />
        <line {...p} x1="3.5" y1="9" x2="12.5" y2="9" />
        <line {...p} x1="2.5" y1="12" x2="13.5" y2="12" />
      </>)}
      {(cielo === 'llovizna' || cielo === 'lluvia') && (<>
        <g transform="translate(0 -2)">{nube}</g>
        <line {...p} x1="6" y1="12.5" x2="5.2" y2="14.5" />
        <line {...p} x1="9" y1="12.5" x2="8.2" y2="14.5" />
        {cielo === 'lluvia' && <line {...p} x1="12" y1="12.5" x2="11.2" y2="14.5" />}
      </>)}
      {cielo === 'tormenta' && (<>
        <g transform="translate(0 -2)">{nube}</g>
        <polyline {...p} points="8.6,11 7,13.3 9,13.3 7.6,15.5" />
      </>)}
      {cielo === 'nieve' && (<>
        <g transform="translate(0 -2)">{nube}</g>
        <circle {...p} cx="6" cy="13.5" r="0.6" />
        <circle {...p} cx="10" cy="13.5" r="0.6" />
      </>)}
    </svg>
  )
}

/** Una flecha que apunta hacia donde va el viento (viene del rumbo que se indica) */
export function FlechaViento({ grados, tam = 12 }: { grados: number | null; tam?: number }) {
  if (grados === null) return null
  return (
    <svg width={tam} height={tam} viewBox="0 0 12 12" aria-hidden style={{ transform: `rotate(${grados + 180}deg)`, flexShrink: 0 }}>
      <polyline points="6,1 6,11" stroke="#a0a0a0" strokeWidth={1.2} fill="none" />
      <polyline points="3,4 6,1 9,4" stroke="#a0a0a0" strokeWidth={1.2} fill="none" />
    </svg>
  )
}
