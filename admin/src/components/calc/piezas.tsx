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

import { useCallback, useState, type CSSProperties, type ReactNode } from 'react'

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

/**
 * Línea de cota con su rótulo.
 *
 * `fs` va en unidades del `viewBox` de quien la dibuja, que **no siempre son
 * píxeles**: las secciones de excavación y canal usan un viewBox fijo que se
 * estira, así que ahí 9 se ve grande. `SeccionTerraplen` dibuja en píxeles
 * reales y le pasa 11, que es el piso de tamaño de la pantalla.
 */
export function DimLine({ x1, y1, x2, y2, label, textX, textY, rotate, fs = 9 }: {
  x1: number; y1: number; x2: number; y2: number
  label: string; textX: number; textY: number; rotate?: string; fs?: number
}) {
  return (
    <>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2a2a2a" strokeWidth={0.8} strokeDasharray="3 3" />
      <text x={textX} y={textY} textAnchor="middle" fontSize={fs} fill="#666"
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
 *
 * ── El viewBox es el ancho real en píxeles, y eso no es un detalle ────────────
 *
 * La versión anterior tenía un `viewBox` fijo de 420 unidades y se estiraba al
 * contenedor con `width: 100%`. Eso significa que **el texto escalaba con el
 * dibujo**: los mismos rótulos de 9 unidades se veían a 24 px en el panel grande
 * y a 5 px en la miniatura de la columna de tramos. Cinco píxeles es ilegible, y
 * además incumple el piso de 11 px de la pantalla — sin que se note al leer el
 * código, porque el número que dice 9 no es píxeles.
 *
 * Midiendo el ancho y armando el `viewBox` con él, **una unidad del SVG es un
 * píxel de pantalla**, así que `fontSize={11}` significa once píxeles en
 * cualquier tamaño de panel. La geometría del terraplén sigue escalando; lo que
 * deja de escalar es la tipografía, que es lo correcto.
 *
 * El ancho se mide con un *callback ref* y no con un efecto, a propósito: el
 * nodo llega al callback ya montado, así que no hace falta el `useEffect` +
 * `setState` que la regla `react-hooks/set-state-in-effect` marca — y que en
 * este repo ya tiene veintiséis falsos positivos que no conviene engrosar.
 */
export function SeccionTerraplen({ H, Bc, m, A, Bb, color, alto = 210 }: {
  H: number; Bc: number; m: number; A: number; Bb: number
  color: string; alto?: number
}) {
  const [w, setW] = useState(420)

  const medir = useCallback((nodo: HTMLDivElement | null) => {
    if (!nodo) return
    const leer = () => setW(Math.max(180, Math.round(nodo.getBoundingClientRect().width)))
    leer()
    // Sigue midiendo mientras el usuario arrastra el divisor de la columna
    const obs = new ResizeObserver(leer)
    obs.observe(nodo)
    return () => obs.disconnect()
  }, [])

  const FS = 11                                   // el piso de la pantalla
  const GY = Math.round(alto * 0.74)              // la línea de terreno
  const PAD = Math.max(46, Math.round(w * 0.11))  // margen para las cotas laterales

  const sc = Math.min(
    (w - 2 * PAD) / Math.max(Bb, 1),
    (GY - FS * 2.4) / Math.max(H, 0.1),
  )
  const dH = H * sc, dBb = Bb * sc, dBc = Bc * sc
  const cx = w / 2
  const yCorona = GY - dH
  const pts = `${cx - dBb / 2},${GY} ${cx + dBb / 2},${GY} ${cx + dBc / 2},${yCorona} ${cx - dBc / 2},${yCorona}`

  /*
   * Con el terraplén muy bajo el rótulo del área no entra adentro del trapecio y
   * se monta sobre las líneas. En ese caso va afuera, arriba a la izquierda: es
   * el dato más importante del dibujo y perderlo por un pixeleo no se justifica.
   */
  const areaAdentro = dH > FS * 2.2
  const taludesAdentro = dH > FS * 2.8 && dBb - dBc > FS * 6

  return (
    <div ref={medir} style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${w} ${alto}`} width={w} height={alto} style={{ display: 'block', maxWidth: '100%' }}>
        {HATCH(GY, w)}
        <line x1={0} y1={GY} x2={w} y2={GY} stroke="#2a2a2a" strokeWidth={1} />
        <polygon points={pts} fill={`${color}18`} stroke={color} strokeWidth={2} strokeLinejoin="round" />

        <DimLine x1={cx - dBc / 2} y1={yCorona - FS} x2={cx + dBc / 2} y2={yCorona - FS}
          label={`Bc = ${Bc.toFixed(1)} m`} textX={cx} textY={yCorona - FS - 4} fs={FS} />
        <DimLine x1={cx - dBb / 2} y1={GY + FS + 3} x2={cx + dBb / 2} y2={GY + FS + 3}
          label={`Bb = ${Bb.toFixed(2)} m — huella`} textX={cx} textY={GY + FS * 2 + 4} fs={FS} />
        <DimLine x1={cx - dBb / 2 - 14} y1={GY} x2={cx - dBb / 2 - 14} y2={yCorona}
          label={`H = ${H.toFixed(2)} m`} textX={cx - dBb / 2 - 26} textY={GY - dH / 2}
          rotate={`rotate(-90,${cx - dBb / 2 - 26},${GY - dH / 2})`} fs={FS} />

        {taludesAdentro && (
          <>
            <text x={cx - dBb / 2 + dBb * 0.10} y={GY - dH * 0.42} fontSize={FS}
              fill="#5a5a5a" fontFamily="monospace">{m}:1</text>
            <text x={cx + dBb / 2 - dBb * 0.10} y={GY - dH * 0.42} fontSize={FS}
              fill="#5a5a5a" fontFamily="monospace" textAnchor="end">{m}:1</text>
          </>
        )}

        <text
          x={areaAdentro ? cx : 4}
          y={areaAdentro ? GY - dH / 2 + FS * 0.38 : FS + 2}
          textAnchor={areaAdentro ? 'middle' : 'start'}
          fontSize={areaAdentro ? Math.min(16, Math.max(FS, Math.round(w / 26))) : FS + 1}
          fill={color} fontFamily="monospace" fontWeight="bold">
          A = {A.toFixed(2)} m²
        </text>
      </svg>
    </div>
  )
}
