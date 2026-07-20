'use client'
import { useState } from 'react'

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Tab = 'terraplen' | 'excavacion' | 'ripio' | 'canal'

// ── Colores por tipo ──────────────────────────────────────────────────────────
const CLR: Record<Tab, string> = {
  terraplen: '#8D6E63', excavacion: '#FF7043', ripio: '#90A4AE', canal: '#29B6F6',
}

// ── Estilos base ──────────────────────────────────────────────────────────────
const panel: React.CSSProperties = {
  background: '#0e0e0e', border: '1px solid #1e1e1e', borderRadius: 6, padding: 14,
  overflowY: 'auto', minHeight: 0,
}
const secLabel: React.CSSProperties = {
  fontSize: 13, color: '#444', textTransform: 'uppercase', letterSpacing: 1.2,
  fontFamily: 'monospace', marginBottom: 10, marginTop: 16,
}
const inpStyle: React.CSSProperties = {
  width: '100%', background: '#080808', border: '1px solid #222', color: '#e0e0e0',
  fontFamily: 'monospace', fontSize: 17, padding: '6px 10px', borderRadius: 3,
  outline: 'none', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8,
  fontFamily: 'monospace', marginBottom: 3, marginTop: 10, display: 'block',
}

// ── Componentes base ──────────────────────────────────────────────────────────
function Inp({ label, unit, value, onChange, step = 0.1, min = 0 }: {
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

function Res({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: boolean }) {
  return (
    <div style={{ marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid #141414' }}>
      <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'monospace' }}>{label}</div>
      <div style={{ marginTop: 1 }}>
        <span style={{ fontSize: accent ? 15 : 12, fontWeight: 700, color: accent ? '#F5C300' : '#bbb', fontFamily: 'monospace' }}>{value}</span>
        <span style={{ fontSize: 9, color: '#444', marginLeft: 3, fontFamily: 'monospace' }}>{unit}</span>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: '#666', fontFamily: 'monospace', marginBottom: 6 }}>{children}</div>
}

// Pipeline de pasos — se renderiza DEBAJO del SVG en el panel central
function Pipeline({ steps, color }: {
  steps: { label: string; formula: string; sub: string; result: string; accent?: boolean }[]
  color: string
}) {
  return (
    <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 12, marginTop: 8 }}>
      <div style={{ fontSize: 9, color: '#333', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'monospace', marginBottom: 8 }}>
        Procedimiento de cálculo
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
            {/* Tarjeta */}
            <div style={{
              background: s.accent ? `${color}14` : '#080808',
              border: `1px solid ${s.accent ? color + '44' : '#1a1a1a'}`,
              borderRadius: 4, padding: '8px 10px', minWidth: 110,
            }}>
              <div style={{ fontSize: 9, color: '#444', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 10, color: '#2a2a2a', fontFamily: 'monospace', lineHeight: 1.4 }}>
                {s.formula}
              </div>
              <div style={{ fontSize: 10, color: '#383838', fontFamily: 'monospace', marginTop: 3, lineHeight: 1.4 }}>
                = {s.sub}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.accent ? color : '#666', fontFamily: 'monospace', marginTop: 4 }}>
                {s.result}
              </div>
            </div>
            {/* Flecha entre pasos */}
            {i < steps.length - 1 && (
              <div style={{ display: 'flex', alignItems: 'center', color: '#222', fontSize: 14, paddingTop: 14 }}>→</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── SVG helpers ───────────────────────────────────────────────────────────────
const HATCH = (y0: number, w: number) =>
  Array.from({ length: 6 }, (_, i) => (
    <line key={i} x1={0} y1={y0 + 6 + i * 9} x2={w} y2={y0 + 6 + i * 9}
      stroke="#1a1a1a" strokeWidth={1} />
  ))

function DimLine({ x1, y1, x2, y2, label, textX, textY, rotate }: {
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

// ── TERRAPLÉN ─────────────────────────────────────────────────────────────────
function CalcTerraplen() {
  const [L, setL]     = useState(1000)
  const [H, setH]     = useState(1.5)
  const [Bc, setBc]   = useState(4.0)
  const [m, setM]     = useState(1.5)
  const [rho, setRho] = useState(1.80)
  const [Fe, setFe]   = useState(20)
  const [Fc, setFc]   = useState(90)

  const Bb     = Bc + 2 * H * m
  const A      = (Bc + Bb) / 2 * H
  const Vneto  = A * L
  const Vbanco = Vneto / (Fc / 100)
  const Vesp   = Vbanco * (1 + Fe / 100)
  const W      = Vbanco * rho
  const fmt    = (n: number) => Math.round(n).toLocaleString('es-AR')

  // SVG geometry
  const W_SVG = 420, H_SVG = 210, GY = 160, PAD = 50
  const sc = Math.min((W_SVG - 2 * PAD) / Math.max(Bb, 1), (GY - 30) / Math.max(H, 0.1))
  const dH = H * sc, dBb = Bb * sc, dBc = Bc * sc
  const cx = W_SVG / 2
  const pts = `${cx - dBb / 2},${GY} ${cx + dBb / 2},${GY} ${cx + dBc / 2},${GY - dH} ${cx - dBc / 2},${GY - dH}`
  const color = CLR.terraplen

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 148px', gap: 10, height: '100%' }}>
      {/* Inputs */}
      <div style={panel}>
        <SectionTitle>Geometría</SectionTitle>
        <Inp label="Longitud" unit="m"         value={L}   onChange={setL}   step={10} />
        <Inp label="Altura media" unit="m"     value={H}   onChange={setH}   />
        <Inp label="Ancho de corona" unit="m"  value={Bc}  onChange={setBc}  />
        <Inp label="Talud H:V"                 value={m}   onChange={setM}   step={0.5} min={0.5} />
        <div style={secLabel}>Material</div>
        <Inp label="Densidad" unit="t/m³"      value={rho} onChange={setRho} step={0.05} min={1} />
        <Inp label="Esponjamiento" unit="%"    value={Fe}  onChange={setFe}  step={1} />
        <Inp label="Compactación" unit="%"     value={Fc}  onChange={setFc}  step={1} min={50} />
        <div style={{ marginTop: 12, padding: '8px', background: '#0a0a0a', borderRadius: 4, fontSize: 9, color: '#333', fontFamily: 'monospace', lineHeight: 1.6 }}>
          Ancho base = {Bb.toFixed(2)} m<br />
          A sección  = {A.toFixed(3)} m²
        </div>
      </div>

      {/* SVG + Pipeline */}
      <div style={{ ...panel, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <SectionTitle>Sección tipo — Terraplén (escala proporcional)</SectionTitle>
        <svg viewBox={`0 0 ${W_SVG} ${H_SVG}`} style={{ width: '100%', height: 'auto' }}>
          {HATCH(GY, W_SVG)}
          <line x1={0} y1={GY} x2={W_SVG} y2={GY} stroke="#2a2a2a" strokeWidth={1} />
          <polygon points={pts} fill={`${color}18`} stroke={color} strokeWidth={2} strokeLinejoin="round" />
          <DimLine x1={cx - dBc/2} y1={GY - dH - 14} x2={cx + dBc/2} y2={GY - dH - 14}
            label={`Bc = ${Bc.toFixed(1)} m`} textX={cx} textY={GY - dH - 18} />
          <DimLine x1={cx - dBb/2} y1={GY + 16} x2={cx + dBb/2} y2={GY + 16}
            label={`Bb = ${Bb.toFixed(2)} m`} textX={cx} textY={GY + 26} />
          <DimLine x1={cx - dBb/2 - 16} y1={GY} x2={cx - dBb/2 - 16} y2={GY - dH}
            label={`H=${H.toFixed(1)}m`} textX={cx - dBb/2 - 30} textY={(GY + GY - dH)/2}
            rotate={`rotate(-90,${cx - dBb/2 - 30},${(GY + GY - dH)/2})`} />
          <text x={cx - dBb/2 + dBb*0.13} y={GY - dH*0.45} fontSize={9} fill="#555" fontFamily="monospace">{m}:1</text>
          <text x={cx + dBb/2 - dBb*0.13} y={GY - dH*0.45} fontSize={9} fill="#555" fontFamily="monospace" textAnchor="end">{m}:1</text>
          <text x={cx} y={(GY + GY - dH)/2 + 4} textAnchor="middle" fontSize={12}
            fill={color} fontFamily="monospace" fontWeight="bold">A = {A.toFixed(2)} m²</text>
        </svg>
        <Pipeline color={color} steps={[
          { label: 'Ancho base',      formula: 'Bb = Bc + 2·H·m',       sub: `${Bc} + 2·${H}·${m}`,                     result: `${Bb.toFixed(3)} m` },
          { label: 'Sección',         formula: 'A = (Bc+Bb)/2 · H',     sub: `(${Bc}+${Bb.toFixed(2)})/2 · ${H}`,       result: `${A.toFixed(3)} m²` },
          { label: 'Vol. compactado', formula: 'V = A · L',              sub: `${A.toFixed(3)} · ${L}`,                  result: `${fmt(Vneto)} m³` },
          { label: 'Material banco',  formula: 'Vb = V / (Fc/100)',      sub: `${fmt(Vneto)} / ${(Fc/100).toFixed(2)}`,  result: `${fmt(Vbanco)} m³` },
          { label: 'Vol. esponjado',  formula: 'Ve = Vb · (1+Fe/100)',   sub: `${fmt(Vbanco)} · ${(1+Fe/100).toFixed(2)}`, result: `${fmt(Vesp)} m³` },
          { label: 'Peso total',      formula: 'W = Vb · ρ',             sub: `${fmt(Vbanco)} · ${rho}`,                 result: `${fmt(W)} t`, accent: true },
        ]} />
      </div>

      {/* Resultados */}
      <div style={panel}>
        <SectionTitle>Cómputo</SectionTitle>
        <Res label="Sección"             value={A.toFixed(3)}  unit="m²" />
        <Res label="Volumen compactado"  value={fmt(Vneto)}    unit="m³" />
        <Res label="Material en banco"   value={fmt(Vbanco)}   unit="m³" />
        <Res label="Volumen esponjado"   value={fmt(Vesp)}     unit="m³" />
        <Res label="Peso total"          value={fmt(W)}        unit="t" accent />
        <div style={{ marginTop: 8, fontSize: 11, color: '#333', fontFamily: 'monospace', lineHeight: 1.8 }}>
          Camiones 15t: ~{Math.ceil(W/15).toLocaleString('es-AR')}<br/>
          Camiones 20t: ~{Math.ceil(W/20).toLocaleString('es-AR')}
        </div>
      </div>
    </div>
  )
}

// ── EXCAVACIÓN ────────────────────────────────────────────────────────────────
function CalcExcavacion() {
  const [L, setL]     = useState(500)
  const [H, setH]     = useState(2.0)
  const [Bf, setBf]   = useState(3.0)
  const [m, setM]     = useState(1.0)
  const [rho, setRho] = useState(1.80)
  const [Fe, setFe]   = useState(25)

  const Bb  = Bf + 2 * H * m
  const A   = (Bf + Bb) / 2 * H
  const Vc  = A * L
  const Ves = Vc * (1 + Fe / 100)
  const W   = Vc * rho
  const fmt = (n: number) => Math.round(n).toLocaleString('es-AR')

  const W_SVG = 420, H_SVG = 200, GY = 50, PAD = 50
  const sc = Math.min((W_SVG - 2 * PAD) / Math.max(Bb, 1), (H_SVG - GY - 40) / Math.max(H, 0.1))
  const dH = H * sc, dBb = Bb * sc, dBf = Bf * sc
  const cx = W_SVG / 2
  const pts = `${cx - dBb/2},${GY} ${cx + dBb/2},${GY} ${cx + dBf/2},${GY + dH} ${cx - dBf/2},${GY + dH}`
  const color = CLR.excavacion

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 148px', gap: 10, height: '100%' }}>
      <div style={panel}>
        <SectionTitle>Geometría</SectionTitle>
        <Inp label="Longitud"           unit="m"   value={L}   onChange={setL}   step={10} />
        <Inp label="Profundidad"        unit="m"   value={H}   onChange={setH}   />
        <Inp label="Ancho de fondo"     unit="m"   value={Bf}  onChange={setBf}  />
        <Inp label="Talud H:V"                     value={m}   onChange={setM}   step={0.5} />
        <div style={secLabel}>Material extraído</div>
        <Inp label="Densidad natural"   unit="t/m³" value={rho} onChange={setRho} step={0.05} min={1} />
        <Inp label="Esponjamiento"      unit="%"   value={Fe}  onChange={setFe}  step={1} />
        <div style={{ marginTop: 12, padding: '8px', background: '#0a0a0a', borderRadius: 4, fontSize: 9, color: '#333', fontFamily: 'monospace', lineHeight: 1.6 }}>
          Ancho boca = {Bb.toFixed(2)} m<br />
          A sección  = {A.toFixed(3)} m²
        </div>
      </div>

      <div style={{ ...panel, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <SectionTitle>Sección tipo — Excavación / Corte (escala proporcional)</SectionTitle>
        <svg viewBox={`0 0 ${W_SVG} ${H_SVG}`} style={{ width: '100%', height: 'auto' }}>
          <line x1={0} y1={GY} x2={W_SVG} y2={GY} stroke="#2a2a2a" strokeWidth={1} />
          {Array.from({ length: 5 }, (_, i) => (
            <line key={i} x1={0} y1={GY + i * 9} x2={cx - dBb/2 - 2} y2={GY + i * 9} stroke="#1a1a1a" strokeWidth={1} />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <line key={i} x1={cx + dBb/2 + 2} y1={GY + i * 9} x2={W_SVG} y2={GY + i * 9} stroke="#1a1a1a" strokeWidth={1} />
          ))}
          <polygon points={pts} fill={`${color}18`} stroke={color} strokeWidth={2} strokeLinejoin="round" />
          <DimLine x1={cx - dBb/2} y1={GY - 16} x2={cx + dBb/2} y2={GY - 16}
            label={`Boca = ${Bb.toFixed(2)} m`} textX={cx} textY={GY - 20} />
          <DimLine x1={cx - dBf/2} y1={GY + dH + 16} x2={cx + dBf/2} y2={GY + dH + 16}
            label={`Bf = ${Bf.toFixed(1)} m`} textX={cx} textY={GY + dH + 26} />
          <DimLine x1={cx + dBb/2 + 14} y1={GY} x2={cx + dBb/2 + 14} y2={GY + dH}
            label={`H=${H.toFixed(1)}m`} textX={cx + dBb/2 + 28} textY={GY + dH/2}
            rotate={`rotate(90,${cx + dBb/2 + 28},${GY + dH/2})`} />
          <text x={cx - dBb/2 + dBb*0.13} y={GY + dH*0.45} fontSize={9} fill="#555" fontFamily="monospace">{m}:1</text>
          <text x={cx} y={GY + dH/2 + 4} textAnchor="middle" fontSize={12}
            fill={color} fontFamily="monospace" fontWeight="bold">A = {A.toFixed(2)} m²</text>
        </svg>
        <Pipeline color={color} steps={[
          { label: 'Ancho boca',     formula: 'Bb = Bf + 2·H·m',      sub: `${Bf}+2·${H}·${m}`,                    result: `${Bb.toFixed(3)} m` },
          { label: 'Sección',        formula: 'A = (Bf+Bb)/2 · H',    sub: `(${Bf}+${Bb.toFixed(2)})/2·${H}`,      result: `${A.toFixed(3)} m²` },
          { label: 'Vol. corte',     formula: 'Vc = A · L',            sub: `${A.toFixed(3)}·${L}`,                 result: `${fmt(Vc)} m³` },
          { label: 'Vol. esponjado', formula: 'Ve = Vc · (1+Fe/100)', sub: `${fmt(Vc)}·${(1+Fe/100).toFixed(2)}`,  result: `${fmt(Ves)} m³` },
          { label: 'Peso haul',      formula: 'W = Vc · ρ',           sub: `${fmt(Vc)}·${rho}`,                    result: `${fmt(W)} t`, accent: true },
        ]} />
      </div>

      <div style={panel}>
        <SectionTitle>Cómputo</SectionTitle>
        <Res label="Sección"            value={A.toFixed(3)}  unit="m²" />
        <Res label="Volumen de corte"   value={fmt(Vc)}       unit="m³" />
        <Res label="Vol. esponjado"     value={fmt(Ves)}      unit="m³" />
        <Res label="Peso a transportar" value={fmt(W)}        unit="t" accent />
        <div style={{ marginTop: 8, fontSize: 11, color: '#333', fontFamily: 'monospace', lineHeight: 1.8 }}>
          Camiones 15t: ~{Math.ceil(W/15).toLocaleString('es-AR')}<br/>
          Camiones 20t: ~{Math.ceil(W/20).toLocaleString('es-AR')}
        </div>
      </div>
    </div>
  )
}

// ── RIPIO ─────────────────────────────────────────────────────────────────────
function CalcRipio() {
  const [L, setL]     = useState(1000)
  const [An, setAn]   = useState(6.0)
  const [E, setE]     = useState(0.15)
  const [rho, setRho] = useState(2.10)

  const V   = L * An * E
  const W   = V * rho
  const fmt = (n: number) => Math.round(n).toLocaleString('es-AR')

  const W_SVG = 420, H_SVG = 180
  const cx = W_SVG / 2
  // Draw road cross-section: subrasante + capa de ripio
  const roadW = 260, subH = 30, ripH = 60
  const x0 = cx - roadW/2, x1 = cx + roadW/2
  const yBot = 150, yMid = yBot - subH, yTop = yMid - ripH
  const color = CLR.ripio

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 148px', gap: 10, height: '100%' }}>
      <div style={panel}>
        <SectionTitle>Geometría</SectionTitle>
        <Inp label="Longitud"      unit="m"   value={L}   onChange={setL}   step={100} />
        <Inp label="Ancho"         unit="m"   value={An}  onChange={setAn}  step={0.5} />
        <Inp label="Espesor"       unit="m"   value={E}   onChange={setE}   step={0.01} />
        <div style={secLabel}>Material</div>
        <Inp label="Densidad"      unit="t/m³" value={rho} onChange={setRho} step={0.05} min={1.5} />
        <div style={{ marginTop: 16, padding: '8px', background: '#0a0a0a', borderRadius: 4, fontSize: 9, color: '#333', fontFamily: 'monospace', lineHeight: 1.6 }}>
          Área de sección: {(An * E).toFixed(4)} m²<br/>
          Volumen: {fmt(V)} m³
        </div>
      </div>

      <div style={{ ...panel, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <SectionTitle>Sección tipo — Capa granular (escala referencial)</SectionTitle>
        <svg viewBox={`0 0 ${W_SVG} ${H_SVG}`} style={{ width: '100%', height: 'auto' }}>
          {/* Subrasante */}
          {Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1={x0} y1={yMid + 4 + i*3.5} x2={x1} y2={yMid + 4 + i*3.5} stroke="#1a1a1a" strokeWidth={1} />
          ))}
          <rect x={x0} y={yMid} width={roadW} height={subH} fill="#0f0f0f" stroke="#222" strokeWidth={1} />
          {/* Ripio layer */}
          <rect x={x0} y={yTop} width={roadW} height={ripH} fill={`${color}22`} stroke={color} strokeWidth={1.5} />
          {/* Labels */}
          <text x={cx} y={yMid + subH/2 + 4} textAnchor="middle" fontSize={9} fill="#333" fontFamily="monospace">SUBRASANTE</text>
          <text x={cx} y={yTop + ripH/2 + 4} textAnchor="middle" fontSize={11} fill={color} fontFamily="monospace" fontWeight="bold">RIPIO · e = {E.toFixed(2)} m</text>
          {/* Width */}
          <DimLine x1={x0} y1={yTop - 14} x2={x1} y2={yTop - 14}
            label={`A = ${An.toFixed(1)} m`} textX={cx} textY={yTop - 18} />
          {/* Espesor */}
          <DimLine x1={x1 + 14} y1={yTop} x2={x1 + 14} y2={yMid}
            label={`e=${E.toFixed(2)}m`} textX={x1 + 28} textY={yTop + ripH/2}
            rotate={`rotate(90,${x1+28},${yTop + ripH/2})`} />
        </svg>
        <Pipeline color={color} steps={[
          { label: 'Volumen',   formula: 'V = L · A · e', sub: `${L}·${An}·${E}`,        result: `${V.toFixed(3)} m³` },
          { label: 'Toneladas', formula: 'W = V · ρ',     sub: `${V.toFixed(3)}·${rho}`, result: `${fmt(W)} t`, accent: true },
          { label: 'Por metro', formula: 'w = W / L',     sub: `${fmt(W)}/${L}`,         result: `${(W/L).toFixed(2)} t/m` },
        ]} />
      </div>

      <div style={panel}>
        <SectionTitle>Cómputo</SectionTitle>
        <Res label="Volumen"    value={fmt(V)}   unit="m³" />
        <Res label="Toneladas"  value={fmt(W)}   unit="t" accent />
        <Res label="Longitud"   value={fmt(L)}   unit="m" />
        <div style={{ marginTop: 8, fontSize: 11, color: '#333', fontFamily: 'monospace', lineHeight: 1.8 }}>
          Camiones 15t: ~{Math.ceil(W/15).toLocaleString('es-AR')}<br/>
          Camiones 20t: ~{Math.ceil(W/20).toLocaleString('es-AR')}<br/>
          {Math.round(W/L * 10)/10} t/m lineal
        </div>
      </div>
    </div>
  )
}

// ── CANAL ─────────────────────────────────────────────────────────────────────
function CalcCanal() {
  const [L, setL]     = useState(1000)
  const [H, setH]     = useState(0.6)
  const [tipo, setTipo] = useState<'triangular' | 'trapezoidal'>('triangular')
  const [Bf, setBf]   = useState(0.3)
  const [m, setM]     = useState(1.5)
  const [n, setN]     = useState(0.025)
  const [S, setS]     = useState(0.5)   // slope %

  // Geometry
  const Bs = tipo === 'triangular' ? 2 * H * m : Bf + 2 * H * m
  const A  = tipo === 'triangular' ? H * H * m : (Bf + Bs) / 2 * H
  const P  = tipo === 'triangular'
    ? 2 * Math.sqrt(H * H + (H * m) * (H * m))
    : Bf + 2 * Math.sqrt(H * H + (H * m) * (H * m))
  const R  = A / P
  const Sl = S / 100
  const Q  = (1 / n) * A * Math.pow(R, 2/3) * Math.pow(Sl, 1/2)
  const V_vel = Q / A
  const Vex = A * L
  const Ves = Vex * 1.25
  const fmt = (n: number) => Math.round(n).toLocaleString('es-AR')

  const W_SVG = 420, H_SVG = 200, GY = 60, PAD = 60
  const sc = Math.min((W_SVG - 2*PAD) / Math.max(Bs, 0.5), (H_SVG - GY - 40) / Math.max(H, 0.1))
  const dH = H * sc, dBs = Bs * sc, dBf = Bf * sc
  const cx = W_SVG / 2
  const color = CLR.canal
  const pts = tipo === 'triangular'
    ? `${cx - dBs/2},${GY} ${cx + dBs/2},${GY} ${cx},${GY + dH}`
    : `${cx - dBs/2},${GY} ${cx + dBs/2},${GY} ${cx + dBf/2},${GY + dH} ${cx - dBf/2},${GY + dH}`

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 148px', gap: 10, height: '100%' }}>
      <div style={panel}>
        <SectionTitle>Geometría</SectionTitle>
        <div>
          <span style={lbl}>Tipo de sección</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['triangular', 'trapezoidal'] as const).map(t => (
              <button key={t} onClick={() => setTipo(t)}
                style={{ flex: 1, padding: '6px 4px', fontSize: 13, fontFamily: 'monospace', cursor: 'pointer', borderRadius: 3, border: `1px solid ${tipo === t ? color : '#222'}`, background: tipo === t ? `${color}22` : '#080808', color: tipo === t ? color : '#555' }}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <Inp label="Longitud"    unit="m"   value={L}  onChange={setL}  step={100} />
        <Inp label="Profundidad" unit="m"   value={H}  onChange={setH}  step={0.05} />
        {tipo === 'trapezoidal' && <Inp label="Ancho fondo" unit="m" value={Bf} onChange={setBf} step={0.1} />}
        <Inp label="Talud H:V"             value={m}  onChange={setM}  step={0.5} min={0.1} />
        <div style={secLabel}>Hidráulica (Manning)</div>
        <Inp label="Coef. Manning n"       value={n}  onChange={setN}  step={0.001} min={0.01} />
        <Inp label="Pendiente long." unit="%" value={S} onChange={setS} step={0.05} min={0.01} />
      </div>

      <div style={{ ...panel, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <SectionTitle>Sección tipo — Canal {tipo} (escala proporcional)</SectionTitle>
        <svg viewBox={`0 0 ${W_SVG} ${H_SVG}`} style={{ width: '100%', height: 'auto', flex: 1 }}>
          <line x1={0} y1={GY} x2={W_SVG} y2={GY} stroke="#2a2a2a" strokeWidth={1} />
          {/* Ground hatch on sides */}
          {Array.from({ length: 5 }, (_, i) => [
            <line key={`l${i}`} x1={0} y1={GY + i*9} x2={cx - dBs/2 - 2} y2={GY + i*9} stroke="#1a1a1a" strokeWidth={1} />,
            <line key={`r${i}`} x1={cx + dBs/2 + 2} y1={GY + i*9} x2={W_SVG} y2={GY + i*9} stroke="#1a1a1a" strokeWidth={1} />,
          ])}
          {/* Water surface */}
          {tipo === 'triangular'
            ? <polygon points={pts} fill={`${color}22`} stroke={color} strokeWidth={2} />
            : <polygon points={pts} fill={`${color}22`} stroke={color} strokeWidth={2} />}
          {/* Bs label */}
          <DimLine x1={cx - dBs/2} y1={GY - 14} x2={cx + dBs/2} y2={GY - 14}
            label={`Boca = ${Bs.toFixed(2)} m`} textX={cx} textY={GY - 18} />
          {tipo === 'trapezoidal' && (
            <DimLine x1={cx - dBf/2} y1={GY + dH + 14} x2={cx + dBf/2} y2={GY + dH + 14}
              label={`Bf = ${Bf.toFixed(2)} m`} textX={cx} textY={GY + dH + 24} />
          )}
          {/* H label */}
          <DimLine x1={cx + dBs/2 + 14} y1={GY} x2={cx + dBs/2 + 14} y2={GY + dH}
            label={`H=${H.toFixed(2)}m`} textX={cx + dBs/2 + 28} textY={GY + dH/2}
            rotate={`rotate(90,${cx + dBs/2 + 28},${GY + dH/2})`} />
          {/* Area in center */}
          <text x={cx} y={GY + dH*0.55} textAnchor="middle" fontSize={11}
            fill={color} fontFamily="monospace" fontWeight="bold">A = {A.toFixed(4)} m²</text>
          {/* Q label */}
          <text x={cx} y={H_SVG - 10} textAnchor="middle" fontSize={10}
            fill="#29B6F6" fontFamily="monospace">Q = {Q.toFixed(3)} m³/s · V = {V_vel.toFixed(2)} m/s</text>
        </svg>
        <Pipeline color={color} steps={[
          { label: 'Sección',     formula: tipo === 'triangular' ? 'A = H²·m' : 'A = (Bf+Bs)/2·H',
            sub: tipo === 'triangular' ? `${H}²·${m}` : `(${Bf}+${Bs.toFixed(2)})/2·${H}`,
            result: `${A.toFixed(4)} m²` },
          { label: 'Per. mojado', formula: 'P = Bf + 2·√(H²+(H·m)²)',
            sub: `Σ lados mojados`,       result: `${P.toFixed(3)} m` },
          { label: 'Radio hidráu.', formula: 'R = A / P',
            sub: `${A.toFixed(4)}/${P.toFixed(3)}`, result: `${R.toFixed(4)} m` },
          { label: 'Caudal',      formula: 'Q = A·R^⅔·S^½/n',
            sub: `n=${n} · S=${S}%`,      result: `${Q.toFixed(4)} m³/s`, accent: true },
          { label: 'Velocidad',   formula: 'V = Q / A',
            sub: `${Q.toFixed(4)}/${A.toFixed(4)}`, result: `${V_vel.toFixed(3)} m/s` },
          { label: 'Vol. exc.',   formula: 'Ve = A · L',
            sub: `${A.toFixed(4)}·${L}`,  result: `${fmt(Vex)} m³` },
        ]} />
      </div>

      <div style={panel}>
        <SectionTitle>Cómputo</SectionTitle>
        <Res label="Sección hidráulica" value={A.toFixed(4)}     unit="m²" />
        <Res label="Perímetro mojado"   value={P.toFixed(3)}     unit="m" />
        <Res label="Radio hidráulico"   value={R.toFixed(4)}     unit="m" />
        <Res label="Caudal (Manning)"   value={Q.toFixed(4)}     unit="m³/s" accent />
        <Res label="Velocidad media"    value={V_vel.toFixed(3)} unit="m/s" />
        <div style={{ height: 1, background: '#1a1a1a', margin: '8px 0' }} />
        <Res label="Vol. excavación"    value={fmt(Vex)}         unit="m³" />
        <Res label="Vol. esponjado"     value={fmt(Ves)}         unit="m³" />
      </div>
    </div>
  )
}

// ── PÁGINA PRINCIPAL ──────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'terraplen',  label: 'Terraplén',   icon: '▲' },
  { id: 'excavacion', label: 'Excavación',  icon: '▼' },
  { id: 'ripio',      label: 'Ripio',       icon: '≡' },
  { id: 'canal',      label: 'Canal',       icon: '⌣' },
]

export default function CalculadorasPage() {
  const [tab, setTab] = useState<Tab>('terraplen')
  const color = CLR[tab]

  return (
    <div style={{
      height: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column',
      padding: '10px 16px 8px', overflow: 'hidden', boxSizing: 'border-box',
      fontFamily: 'monospace', color: '#e0e0e0',
    }}>
      {/* Header compacto */}
      <div style={{ flexShrink: 0, marginBottom: 6 }}>
        <span style={{ fontSize: 9, color: '#444', letterSpacing: 1.5, textTransform: 'uppercase', marginRight: 8 }}>Obras · Etapa 1</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#e0e0e0', letterSpacing: 0.5 }}>Calculadoras de Ingeniería Vial</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0, borderBottom: '1px solid #1a1a1a' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '6px 14px', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
              border: 'none', borderBottom: `2px solid ${tab === t.id ? CLR[t.id] : 'transparent'}`,
              background: 'transparent', letterSpacing: 0.5, transition: 'all 0.15s',
              color: tab === t.id ? CLR[t.id] : '#555', marginBottom: -1,
            }}>
            <span style={{ marginRight: 5, fontSize: 11 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Calculadora activa — ocupa todo el espacio restante */}
      <div style={{ flex: 1, minHeight: 0, borderLeft: `2px solid ${color}44`, paddingLeft: 14, marginTop: 10 }}>
        {tab === 'terraplen'  && <CalcTerraplen />}
        {tab === 'excavacion' && <CalcExcavacion />}
        {tab === 'ripio'      && <CalcRipio />}
        {tab === 'canal'      && <CalcCanal />}
      </div>
    </div>
  )
}
