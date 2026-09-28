'use client'

/**
 * Las piezas compartidas de las calculadoras de obra.
 *
 * Estaban adentro de `app/dashboard/obras/calculadoras/page.tsx`, que es una
 * página: las usaban las cinco calculadoras de ese archivo y nadie más podía.
 * Al sacar terraplén a su propio componente había que copiarlas o moverlas, y
 * **copiarlas habría sumado a la duplicación que ya es el problema más grande
 * de esta parte del repo** — cuatro mapas casi iguales, 3.729 líneas.
 *
 * Acá no hay lógica de cálculo: sólo entradas, resultados y el dibujo del
 * procedimiento. Los motores viven en `lib/`.
 */

import type { CSSProperties, ReactNode } from 'react'

// ── Estilos ──────────────────────────────────────────────────────────────────

export const panel: CSSProperties = {
  background: '#0e0e0e', border: '1px solid #1e1e1e', borderRadius: 6, padding: 14,
  overflowY: 'auto', minHeight: 0,
}

export const secLabel: CSSProperties = {
  fontSize: 13, color: '#444', textTransform: 'uppercase', letterSpacing: 1.2,
  fontFamily: 'monospace', marginBottom: 10, marginTop: 16,
}

/** Exportados porque varias calculadoras arman inputs a medida con estos estilos */
export const inpStyle: CSSProperties = {
  width: '100%', background: '#080808', border: '1px solid #222', color: '#e0e0e0',
  fontFamily: 'monospace', fontSize: 17, padding: '6px 10px', borderRadius: 3,
  outline: 'none', boxSizing: 'border-box',
}

export const lbl: CSSProperties = {
  fontSize: 13, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8,
  fontFamily: 'monospace', marginBottom: 3, marginTop: 10, display: 'block',
}

// ── Entradas y resultados ────────────────────────────────────────────────────

export function Inp({ label, unit, value, onChange, step = 0.1, min = 0 }: {
  label: string; unit?: string; value: number
  onChange: (v: number) => void; step?: number; min?: number
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={lbl}>{label}{unit ? ` (${unit})` : ''}</span>
      <input type="number" min={min} step={step} value={value}
        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= min) onChange(v) }}
        style={inpStyle} />
    </label>
  )
}

export function Res({ label, value, unit, accent }: {
  label: string; value: string; unit: string; accent?: boolean
}) {
  return (
    <div style={{ marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid #141414' }}>
      <div style={{ fontSize: 12, color: '#444', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'monospace' }}>{label}</div>
      <div style={{ marginTop: 1 }}>
        <span style={{ fontSize: accent ? 16 : 13, fontWeight: 700, color: accent ? '#F5C300' : '#bbb', fontFamily: 'monospace' }}>{value}</span>
        <span style={{ fontSize: 12, color: '#444', marginLeft: 3, fontFamily: 'monospace' }}>{unit}</span>
      </div>
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 14, color: '#666', fontFamily: 'monospace', marginBottom: 6 }}>{children}</div>
}

// ── Procedimiento de cálculo ─────────────────────────────────────────────────

export interface PasoCalculo {
  label: string
  formula: string
  sub: string
  result: string
  accent?: boolean
}

/**
 * La cadena de pasos, con la fórmula, los números reemplazados y el resultado.
 *
 * Es lo que hace auditable el cómputo: cualquiera puede seguir de dónde sale
 * cada número sin abrir el código. Va con `titulo` porque en terraplén la
 * cadena se parte en dos —lo que depende de la sección tipo y lo que depende de
 * la longitud medida sobre el mapa— y cada mitad necesita decir cuál es.
 */
export function Pipeline({ steps, color, titulo = 'Procedimiento de cálculo' }: {
  steps: PasoCalculo[]
  color: string
  titulo?: string
}) {
  return (
    <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 12, marginTop: 8 }}>
      <div style={{ fontSize: 12, color: '#333', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'monospace', marginBottom: 8 }}>
        {titulo}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
            <div style={{
              background: s.accent ? `${color}14` : '#080808',
              border: `1px solid ${s.accent ? color + '44' : '#1a1a1a'}`,
              borderRadius: 4, padding: '8px 10px', minWidth: 110,
            }}>
              <div style={{ fontSize: 12, color: '#444', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 12, color: '#2a2a2a', fontFamily: 'monospace', lineHeight: 1.4 }}>{s.formula}</div>
              <div style={{ fontSize: 12, color: '#383838', fontFamily: 'monospace', marginTop: 3, lineHeight: 1.4 }}>= {s.sub}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.accent ? color : '#666', fontFamily: 'monospace', marginTop: 4 }}>{s.result}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ display: 'flex', alignItems: 'center', color: '#222', fontSize: 14, paddingTop: 14 }}>→</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Ayudantes de dibujo ──────────────────────────────────────────────────────

/** Las líneas horizontales que sugieren el terreno bajo la sección */
export const HATCH = (y0: number, w: number) =>
  Array.from({ length: 6 }, (_, i) => (
    <line key={i} x1={0} y1={y0 + 6 + i * 9} x2={w} y2={y0 + 6 + i * 9}
      stroke="#1a1a1a" strokeWidth={1} />
  ))

/** Línea de cota con su rótulo */
export function DimLine({ x1, y1, x2, y2, label, textX, textY, rotate }: {
  x1: number; y1: number; x2: number; y2: number
  label: string; textX: number; textY: number; rotate?: string
}) {
  return (
    <>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2a2a2a" strokeWidth={0.8} strokeDasharray="3 3" />
      <text x={textX} y={textY} textAnchor="middle" fontSize={9} fill="#555"
        fontFamily="monospace" transform={rotate}>{label}</text>
    </>
  )
}

// ── El dibujo de la sección trapecial ────────────────────────────────────────

/**
 * La sección tipo de un terraplén, a escala proporcional.
 *
 * Se dibuja **siempre con una altura real** — la del tramo que se esté mirando,
 * no una genérica. Un dibujo con altura inventada sería lo único de la pantalla
 * que no corresponde a nada, y en una pantalla donde todo lo demás sale de un
 * dato medido eso se nota.
 */
export function SeccionTerraplen({ H, Bc, m, A, Bb, color, alto = 210 }: {
  H: number; Bc: number; m: number; A: number; Bb: number
  color: string; alto?: number
}) {
  const W_SVG = 420, GY = Math.round(alto * 0.76), PAD = 50
  const sc = Math.min((W_SVG - 2 * PAD) / Math.max(Bb, 1), (GY - 30) / Math.max(H, 0.1))
  const dH = H * sc, dBb = Bb * sc, dBc = Bc * sc
  const cx = W_SVG / 2
  const pts = `${cx - dBb / 2},${GY} ${cx + dBb / 2},${GY} ${cx + dBc / 2},${GY - dH} ${cx - dBc / 2},${GY - dH}`

  return (
    <svg viewBox={`0 0 ${W_SVG} ${alto}`} style={{ width: '100%', height: 'auto' }}>
      {HATCH(GY, W_SVG)}
      <line x1={0} y1={GY} x2={W_SVG} y2={GY} stroke="#2a2a2a" strokeWidth={1} />
      <polygon points={pts} fill={`${color}18`} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <DimLine x1={cx - dBc / 2} y1={GY - dH - 14} x2={cx + dBc / 2} y2={GY - dH - 14}
        label={`Bc = ${Bc.toFixed(1)} m`} textX={cx} textY={GY - dH - 18} />
      <DimLine x1={cx - dBb / 2} y1={GY + 16} x2={cx + dBb / 2} y2={GY + 16}
        label={`Bb = ${Bb.toFixed(2)} m — huella`} textX={cx} textY={GY + 26} />
      <DimLine x1={cx - dBb / 2 - 16} y1={GY} x2={cx - dBb / 2 - 16} y2={GY - dH}
        label={`H=${H.toFixed(2)}m`} textX={cx - dBb / 2 - 30} textY={(GY + GY - dH) / 2}
        rotate={`rotate(-90,${cx - dBb / 2 - 30},${(GY + GY - dH) / 2})`} />
      <text x={cx - dBb / 2 + dBb * 0.13} y={GY - dH * 0.45} fontSize={9} fill="#555" fontFamily="monospace">{m}:1</text>
      <text x={cx + dBb / 2 - dBb * 0.13} y={GY - dH * 0.45} fontSize={9} fill="#555" fontFamily="monospace" textAnchor="end">{m}:1</text>
      <text x={cx} y={(GY + GY - dH) / 2 + 4} textAnchor="middle" fontSize={12}
        fill={color} fontFamily="monospace" fontWeight="bold">A = {A.toFixed(2)} m²</text>
    </svg>
  )
}
