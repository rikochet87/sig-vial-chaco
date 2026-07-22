'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { setObraTransfer, saveReturnTab, consumeReturnTab } from '@/lib/obraTransfer'
import InlineMapDraw from '@/components/InlineMapDraw'

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Tab    = 'terraplen' | 'excavacion' | 'ripio' | 'canal' | 'desmalezado' | 'desbosque'
type Params = Record<string, number | string>

// ── Colores por tipo ──────────────────────────────────────────────────────────
const CLR: Record<Tab, string> = {
  terraplen: '#8D6E63', excavacion: '#FF7043', ripio: '#90A4AE', canal: '#29B6F6',
  desmalezado: '#66BB6A', desbosque: '#795548',
}

// Unidades de precio por tipo (para mostrar en el input)
const UNIDADES: Record<Tab, string> = {
  terraplen: '$/t', excavacion: '$/t', ripio: '$/t', canal: '$/t',
  desmalezado: '$/ha', desbosque: '$/ha',
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

// Pipeline de pasos
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
            <div style={{
              background: s.accent ? `${color}14` : '#080808',
              border: `1px solid ${s.accent ? color + '44' : '#1a1a1a'}`,
              borderRadius: 4, padding: '8px 10px', minWidth: 110,
            }}>
              <div style={{ fontSize: 9, color: '#444', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 10, color: '#2a2a2a', fontFamily: 'monospace', lineHeight: 1.4 }}>{s.formula}</div>
              <div style={{ fontSize: 10, color: '#383838', fontFamily: 'monospace', marginTop: 3, lineHeight: 1.4 }}>= {s.sub}</div>
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

// SVG helpers
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
function CalcTerraplen({ paramsRef }: { paramsRef?: React.MutableRefObject<Params> }) {
  const [L, setL]     = useState(1000)
  const [H, setH]     = useState(1.5)
  const [Bc, setBc]   = useState(4.0)
  const [m, setM]     = useState(1.5)
  const [rho, setRho] = useState(1.80)
  const [Fe, setFe]   = useState(20)
  const [Fc, setFc]   = useState(90)

  // Sincronizar params con ref del padre (para transferencia a Planta)
  useEffect(() => {
    if (paramsRef) paramsRef.current = { H, Bc, m, rho, Fe, Fc }
  }, [paramsRef, H, Bc, m, rho, Fe, Fc])

  const Bb     = Bc + 2 * H * m
  const A      = (Bc + Bb) / 2 * H
  const Vneto  = A * L
  const Vbanco = Vneto / (Fc / 100)
  const Vesp   = Vbanco * (1 + Fe / 100)
  const W      = Vbanco * rho
  const fmt    = (n: number) => Math.round(n).toLocaleString('es-AR')

  const W_SVG = 420, H_SVG = 210, GY = 160, PAD = 50
  const sc = Math.min((W_SVG - 2 * PAD) / Math.max(Bb, 1), (GY - 30) / Math.max(H, 0.1))
  const dH = H * sc, dBb = Bb * sc, dBc = Bc * sc
  const cx = W_SVG / 2
  const pts = `${cx - dBb / 2},${GY} ${cx + dBb / 2},${GY} ${cx + dBc / 2},${GY - dH} ${cx - dBc / 2},${GY - dH}`
  const color = CLR.terraplen

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 148px', gap: 10, height: '100%' }}>
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
function CalcExcavacion({ paramsRef }: { paramsRef?: React.MutableRefObject<Params> }) {
  const [L, setL]     = useState(500)
  const [H, setH]     = useState(2.0)
  const [Bf, setBf]   = useState(3.0)
  const [m, setM]     = useState(1.0)
  const [rho, setRho] = useState(1.80)
  const [Fe, setFe]   = useState(25)

  useEffect(() => {
    if (paramsRef) paramsRef.current = { H, Bf, m, rho, Fe }
  }, [paramsRef, H, Bf, m, rho, Fe])

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
function CalcRipio({ paramsRef }: { paramsRef?: React.MutableRefObject<Params> }) {
  const [L, setL]     = useState(1000)
  const [An, setAn]   = useState(6.0)
  const [E, setE]     = useState(0.15)
  const [rho, setRho] = useState(2.10)

  useEffect(() => {
    if (paramsRef) paramsRef.current = { An, E, rho }
  }, [paramsRef, An, E, rho])

  const V   = L * An * E
  const W   = V * rho
  const fmt = (n: number) => Math.round(n).toLocaleString('es-AR')

  const W_SVG = 420, H_SVG = 180
  const cx = W_SVG / 2
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
          {Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1={x0} y1={yMid + 4 + i*3.5} x2={x1} y2={yMid + 4 + i*3.5} stroke="#1a1a1a" strokeWidth={1} />
          ))}
          <rect x={x0} y={yMid} width={roadW} height={subH} fill="#0f0f0f" stroke="#222" strokeWidth={1} />
          <rect x={x0} y={yTop} width={roadW} height={ripH} fill={`${color}22`} stroke={color} strokeWidth={1.5} />
          <text x={cx} y={yMid + subH/2 + 4} textAnchor="middle" fontSize={9} fill="#333" fontFamily="monospace">SUBRASANTE</text>
          <text x={cx} y={yTop + ripH/2 + 4} textAnchor="middle" fontSize={11} fill={color} fontFamily="monospace" fontWeight="bold">RIPIO · e = {E.toFixed(2)} m</text>
          <DimLine x1={x0} y1={yTop - 14} x2={x1} y2={yTop - 14}
            label={`A = ${An.toFixed(1)} m`} textX={cx} textY={yTop - 18} />
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
function CalcCanal({ paramsRef }: { paramsRef?: React.MutableRefObject<Params> }) {
  const [L, setL]     = useState(1000)
  const [H, setH]     = useState(0.6)
  const [tipo, setTipo] = useState<'triangular' | 'trapezoidal'>('triangular')
  const [Bf, setBf]   = useState(0.3)
  const [m, setM]     = useState(1.5)
  const [n, setN]     = useState(0.025)
  const [S, setS]     = useState(0.5)
  const [rho, setRho] = useState(1.80)
  const [Fe, setFe]   = useState(25)

  // Transferir solo params geométricos relevantes para Planta (excluir hidráulica)
  useEffect(() => {
    if (paramsRef) paramsRef.current = { H, Bf: tipo === 'triangular' ? 0 : Bf, m, rho, Fe }
  }, [paramsRef, H, tipo, Bf, m, rho, Fe])

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
  const W   = Vex * rho
  const fmt = (n: number) => Math.round(n).toLocaleString('es-AR')

  const W_SVG = 420, H_SVG = 200, GY = 60, PAD = 60
  const sc = Math.min((W_SVG - 2*PAD) / Math.max(Bs, 0.5), (H_SVG - GY - 40) / Math.max(H, 0.1))
  const dH = H * sc, dBs = Bs * sc, dBf = Bf * sc
  const cx = W_SVG / 2
  const color = CLR.canal
  const pts_svg = tipo === 'triangular'
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
        <div style={secLabel}>Material</div>
        <Inp label="Densidad" unit="t/m³"  value={rho} onChange={setRho} step={0.05} min={1} />
        <Inp label="Esponjamiento" unit="%" value={Fe} onChange={setFe}  step={1} />
        <div style={secLabel}>Hidráulica (Manning)</div>
        <Inp label="Coef. Manning n"       value={n}  onChange={setN}  step={0.001} min={0.01} />
        <Inp label="Pendiente long." unit="%" value={S} onChange={setS} step={0.05} min={0.01} />
      </div>

      <div style={{ ...panel, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <SectionTitle>Sección tipo — Canal {tipo} (escala proporcional)</SectionTitle>
        <svg viewBox={`0 0 ${W_SVG} ${H_SVG}`} style={{ width: '100%', height: 'auto', flex: 1 }}>
          <line x1={0} y1={GY} x2={W_SVG} y2={GY} stroke="#2a2a2a" strokeWidth={1} />
          {Array.from({ length: 5 }, (_, i) => [
            <line key={`l${i}`} x1={0} y1={GY + i*9} x2={cx - dBs/2 - 2} y2={GY + i*9} stroke="#1a1a1a" strokeWidth={1} />,
            <line key={`r${i}`} x1={cx + dBs/2 + 2} y1={GY + i*9} x2={W_SVG} y2={GY + i*9} stroke="#1a1a1a" strokeWidth={1} />,
          ])}
          <polygon points={pts_svg} fill={`${color}22`} stroke={color} strokeWidth={2} />
          <DimLine x1={cx - dBs/2} y1={GY - 14} x2={cx + dBs/2} y2={GY - 14}
            label={`Boca = ${Bs.toFixed(2)} m`} textX={cx} textY={GY - 18} />
          {tipo === 'trapezoidal' && (
            <DimLine x1={cx - dBf/2} y1={GY + dH + 14} x2={cx + dBf/2} y2={GY + dH + 14}
              label={`Bf = ${Bf.toFixed(2)} m`} textX={cx} textY={GY + dH + 24} />
          )}
          <DimLine x1={cx + dBs/2 + 14} y1={GY} x2={cx + dBs/2 + 14} y2={GY + dH}
            label={`H=${H.toFixed(2)}m`} textX={cx + dBs/2 + 28} textY={GY + dH/2}
            rotate={`rotate(90,${cx + dBs/2 + 28},${GY + dH/2})`} />
          <text x={cx} y={GY + dH*0.55} textAnchor="middle" fontSize={11}
            fill={color} fontFamily="monospace" fontWeight="bold">A = {A.toFixed(4)} m²</text>
          <text x={cx} y={H_SVG - 10} textAnchor="middle" fontSize={10}
            fill={color} fontFamily="monospace">Q = {Q.toFixed(3)} m³/s · V = {V_vel.toFixed(2)} m/s</text>
        </svg>
        <Pipeline color={color} steps={[
          { label: 'Sección',     formula: tipo === 'triangular' ? 'A = H²·m' : 'A = (Bf+Bs)/2·H',
            sub: tipo === 'triangular' ? `${H}²·${m}` : `(${Bf}+${Bs.toFixed(2)})/2·${H}`,
            result: `${A.toFixed(4)} m²` },
          { label: 'Caudal',      formula: 'Q = A·R^⅔·S^½/n',
            sub: `n=${n} · S=${S}%`, result: `${Q.toFixed(4)} m³/s`, accent: true },
          { label: 'Vol. exc.',   formula: 'Ve = A · L',
            sub: `${A.toFixed(4)}·${L}`,  result: `${fmt(Vex)} m³` },
          { label: 'Peso haul',   formula: 'W = Ve · ρ',
            sub: `${fmt(Vex)}·${rho}`, result: `${fmt(W)} t` },
        ]} />
      </div>

      <div style={panel}>
        <SectionTitle>Cómputo</SectionTitle>
        <Res label="Sección hidráulica" value={A.toFixed(4)}     unit="m²" />
        <Res label="Caudal (Manning)"   value={Q.toFixed(4)}     unit="m³/s" accent />
        <Res label="Velocidad media"    value={V_vel.toFixed(3)} unit="m/s" />
        <div style={{ height: 1, background: '#1a1a1a', margin: '8px 0' }} />
        <Res label="Vol. excavación"    value={fmt(Vex)}         unit="m³" />
        <Res label="Vol. esponjado"     value={fmt(Ves)}         unit="m³" />
        <Res label="Peso a mover"       value={fmt(W)}           unit="t" />
      </div>
    </div>
  )
}

// ── DESMALEZADO DE BANQUINAS ──────────────────────────────────────────────────
function CalcDesmalezado({ paramsRef }: { paramsRef?: React.MutableRefObject<Params> }) {
  const [L, setL]         = useState(1000)
  const [Ab, setAb]       = useState(3.0)
  const [lados, setLados] = useState(2)

  useEffect(() => {
    if (paramsRef) paramsRef.current = { Ab, lados }
  }, [paramsRef, Ab, lados])

  const Sup_m2 = L * Ab * lados
  const Sup_ha = Sup_m2 / 10000
  const fmt    = (n: number) => Math.round(n).toLocaleString('es-AR')
  const color  = CLR.desmalezado

  const W_SVG = 420, H_SVG = 180
  const cx = W_SVG / 2
  const roadW_px = 130, bankW_px = 66
  const roadY = 28, roadH = 122

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 148px', gap: 10, height: '100%' }}>
      <div style={panel}>
        <SectionTitle>Geometría</SectionTitle>
        <Inp label="Longitud"       unit="m" value={L}   onChange={setL}   step={100} />
        <Inp label="Ancho banquina" unit="m" value={Ab}  onChange={setAb}  step={0.5} min={0.5} />
        <div>
          <span style={lbl}>Cantidad de lados</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2].map(l => (
              <button key={l} onClick={() => setLados(l)}
                style={{ flex: 1, padding: '6px 4px', fontSize: 13, fontFamily: 'monospace',
                  cursor: 'pointer', borderRadius: 3,
                  border: `1px solid ${lados === l ? color : '#222'}`,
                  background: lados === l ? `${color}22` : '#080808',
                  color: lados === l ? color : '#555' }}>
                {l} lado{l > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12, padding: '8px', background: '#0a0a0a', borderRadius: 4,
          fontSize: 9, color: '#333', fontFamily: 'monospace', lineHeight: 1.6 }}>
          Área total: {fmt(Sup_m2)} m²<br/>= {Sup_ha.toFixed(4)} ha
        </div>
      </div>

      <div style={{ ...panel, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <SectionTitle>Vista en planta — Desmalezado de banquinas</SectionTitle>
        <svg viewBox={`0 0 ${W_SVG} ${H_SVG}`} style={{ width: '100%', height: 'auto' }}>
          <rect x={0} y={0} width={W_SVG} height={H_SVG} fill="#0a0a0a" />
          <rect x={cx - roadW_px/2 - bankW_px} y={roadY} width={bankW_px} height={roadH}
            fill={lados === 2 ? `${color}30` : '#0d0d0d'}
            stroke={lados === 2 ? color : '#1a1a1a'} strokeWidth={lados === 2 ? 1.5 : 0.8}
            strokeDasharray={lados === 2 ? '' : '4 4'} />
          {lados === 2 && (
            <text x={cx - roadW_px/2 - bankW_px/2} y={roadY + roadH/2 + 4}
              textAnchor="middle" fontSize={9} fill={color} fontFamily="monospace">BANQ.</text>
          )}
          <rect x={cx - roadW_px/2} y={roadY} width={roadW_px} height={roadH}
            fill="#161616" stroke="#2a2a2a" strokeWidth={1} />
          <line x1={cx} y1={roadY} x2={cx} y2={roadY + roadH}
            stroke="#222" strokeWidth={1} strokeDasharray="8 6" />
          <text x={cx} y={roadY + roadH/2 + 4} textAnchor="middle"
            fontSize={9} fill="#333" fontFamily="monospace">CALZADA</text>
          <rect x={cx + roadW_px/2} y={roadY} width={bankW_px} height={roadH}
            fill={`${color}30`} stroke={color} strokeWidth={1.5} />
          <text x={cx + roadW_px/2 + bankW_px/2} y={roadY + roadH/2 + 4}
            textAnchor="middle" fontSize={9} fill={color} fontFamily="monospace">BANQ.</text>
          {lados === 2 && Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1={cx - roadW_px/2 - bankW_px + i*10} y1={roadY}
              x2={cx - roadW_px/2 - bankW_px + i*10 + roadH} y2={roadY + roadH}
              stroke={`${color}18`} strokeWidth={1.5} />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1={cx + roadW_px/2 + i*10} y1={roadY}
              x2={cx + roadW_px/2 + i*10 + roadH} y2={roadY + roadH}
              stroke={`${color}18`} strokeWidth={1.5} />
          ))}
          <DimLine x1={cx + roadW_px/2} y1={roadY - 14} x2={cx + roadW_px/2 + bankW_px} y2={roadY - 14}
            label={`Ab = ${Ab.toFixed(1)} m`} textX={cx + roadW_px/2 + bankW_px/2} textY={roadY - 18} />
          <text x={cx} y={H_SVG - 8} textAnchor="middle" fontSize={10} fill={color} fontFamily="monospace">
            Sup = {fmt(Sup_m2)} m² = {Sup_ha.toFixed(2)} ha
          </text>
        </svg>
        <Pipeline color={color} steps={[
          { label: 'Superficie', formula: 'S = L · Ab · lados',
            sub: `${L}·${Ab}·${lados}`, result: `${fmt(Sup_m2)} m²` },
          { label: 'Hectáreas',  formula: 'ha = S / 10.000',
            sub: `${fmt(Sup_m2)}/10000`, result: `${Sup_ha.toFixed(4)} ha`, accent: true },
        ]} />
      </div>

      <div style={panel}>
        <SectionTitle>Cómputo</SectionTitle>
        <Res label="Superficie total" value={fmt(Sup_m2)}        unit="m²" />
        <Res label="Hectáreas"        value={Sup_ha.toFixed(4)}  unit="ha" accent />
        <div style={{ marginTop: 8, fontSize: 11, color: '#333', fontFamily: 'monospace', lineHeight: 1.8 }}>
          {(Sup_ha / (L / 1000)).toFixed(2)} ha/km<br />
          {lados} lado{lados > 1 ? 's' : ''} · {Ab} m c/u
        </div>
      </div>
    </div>
  )
}

// ── DESBOSQUE, DESTRONQUE Y LIMPIEZA ──────────────────────────────────────────
// Ref. Ae-7/8/9: Consorcio N°55 "Tres Estacas", Zona III, sep-2024
// CR = (1+GG%)×(1+Ben%)×(1+GF%)×(1+IVA%) · Obs. Ae-7: GG entre 10%-25% según zona/viáticos
const MONTE: Record<string, { label: string; factor: number; desc: string; rendimientoDia: number }> = {
  ralo:       { label: 'Ralo',        factor: 50,  desc: '< 40% cobertura',  rendimientoDia: 2.50 },
  semitupido: { label: 'Semi-tupido', factor: 150, desc: '40-70% cobertura', rendimientoDia: 2.00 },
  tupido:     { label: 'Tupido',      factor: 400, desc: '> 70% cobertura',  rendimientoDia: 1.50 },
}

// Ae-7 default data (Consorcio N°55, sep-2024)
interface MORow { id: string; label: string; tarifaH: number; coefMO: number; hsDay: number; n: number }
interface EqRow { id: string; label: string; capUnit: number; hp: number; cant: number }
const MO_DEFAULTS: MORow[] = [
  { id: 'oe', label: 'Oficial Esp.', tarifaH: 3946, coefMO: 1.8826, hsDay: 8, n: 1 },
  { id: 'of', label: 'Oficial',      tarifaH: 3362, coefMO: 1.8827, hsDay: 8, n: 1 },
  { id: 'mo', label: '1/2 Oficial',  tarifaH: 3100, coefMO: 1.8827, hsDay: 8, n: 0 },
  { id: 'ay', label: 'Ayudante',     tarifaH: 2846, coefMO: 1.8827, hsDay: 8, n: 1 },
]
const EQ_DEFAULTS: EqRow[] = [
  { id: 't',  label: 'Topadora',        capUnit: 203929131, hp: 215, cant: 1   },
  { id: 'c',  label: 'Camión+Carretón', capUnit: 168581415, hp: 20,  cant: 0.1 },
  { id: 'tr', label: 'Tractor 120',     capUnit: 76351067,  hp: 120, cant: 1   },
  { id: 'r',  label: 'Rastra',          capUnit: 19167163,  hp: 0,   cant: 1   },
]
interface PresRow { id: string; num: number; desc: string; unit: string; cant: number; precioUnit: number }
type MonteKey = 'ralo' | 'semitupido' | 'tupido'
interface MonteEntry { id: string; ha: number; monte: MonteKey; fromMap?: boolean }

function CalcDesbosque({ paramsRef }: { paramsRef?: React.MutableRefObject<Params> }) {
  // ── Geometría — múltiples superficies por tipo en cada lado ──────────────
  const [entriesIzq, setEntriesIzq] = useState<MonteEntry[]>([
    { id: 'izq-0', ha: 1.0, monte: 'semitupido' }
  ])
  const [entriesDer, setEntriesDer] = useState<MonteEntry[]>([
    { id: 'der-0', ha: 1.0, monte: 'semitupido' }
  ])

  // ── VIII) Coeficiente Resumen ─────────────────────────────────
  const [ggPct,  setGgPct]  = useState(15)
  const [benPct, setBenPct] = useState(0)
  const [gfPct,  setGfPct]  = useState(0)
  const [ivaPct, setIvaPct] = useState(0)

  // ── I) Mano de Obra ───────────────────────────────────────────
  const [moRows, setMoRows] = useState<MORow[]>(MO_DEFAULTS.map(r => ({ ...r })))

  // ── Equipos ───────────────────────────────────────────────────
  const [eqRows, setEqRows] = useState<EqRow[]>(EQ_DEFAULTS.map(r => ({ ...r })))

  // ── II) Amortización + III) Reparación ───────────────────────
  const [amortCoef, setAmortCoef] = useState(0.0011)
  const [repCoef,   setRepCoef]   = useState(0.00056)

  // ── IV) Combustibles y Lubricantes ───────────────────────────
  const [consumoLHpH, setConsumoLHpH] = useState(0.15)
  const [hsDiaComb, setHsDiaComb]     = useState(8)
  const [precioLitro, setPrecioLitro] = useState(1198)
  const [coefLubri, setCoefLubri]     = useState(1.30)

  // ── Resumen (Ae-9) ────────────────────────────────────────────
  const [materiales, setMateriales] = useState(0)
  const [transpInt,  setTranspInt]  = useState(0)

  // ── Presupuesto (Ae-10) ───────────────────────────────────────
  const [presRows, setPresRows] = useState<PresRow[]>([
    { id: 'p1', num: 1, desc: 'DESBOSQUE-DESTRONQUE Y LIMPIEZA — Monte Semi-tupido', unit: 'Has', cant: 0, precioUnit: 0 },
    { id: 'p2', num: 2, desc: 'DESBOSQUE-DESTRONQUE Y LIMPIEZA — Monte Ralo',        unit: 'Has', cant: 0, precioUnit: 0 },
  ])
  const [dvpPct, setDvpPct] = useState(80)

  // ── Sub-vista ─────────────────────────────────────────────────
  const [view, setView] = useState<'computo' | 'jornales' | 'presupuesto'>('computo')

  // ── Derived: Ae-7 ────────────────────────────────────────────
  const combPerHpD = consumoLHpH * hsDiaComb * precioLitro * coefLubri
  const totalCap   = eqRows.reduce((s, r) => s + r.capUnit * r.cant, 0)
  const totalHP    = eqRows.reduce((s, r) => s + r.hp, 0)
  const amortD     = totalCap * amortCoef
  const repD       = totalCap * repCoef
  const combD      = totalHP  * combPerHpD
  const cEquipos   = amortD + repD + combD
  const cMO        = moRows.reduce((s, r) => s + r.tarifaH * r.coefMO * r.hsDay * r.n, 0)
  const CR         = (1 + ggPct/100) * (1 + benPct/100) * (1 + gfPct/100) * (1 + ivaPct/100)
  const costoDiario = cEquipos + cMO

  // ── Precio/ha por tipo: (ejec_t + mat + transp) × CR ─────────
  const precioHaPorTipo: Record<string, number> = Object.fromEntries(
    Object.entries(MONTE).map(([k, v]) => {
      const costoDir = (v.rendimientoDia > 0 ? costoDiario / v.rendimientoDia : 0) + materiales + transpInt
      return [k, costoDir * CR]
    })
  )

  // ── Geometría por lado y por tipo ─────────────────────────────
  const allEntries = [...entriesIzq, ...entriesDer]
  const Sup_ha_izq = entriesIzq.reduce((s, e) => s + (e.ha || 0), 0)
  const Sup_ha_der = entriesDer.reduce((s, e) => s + (e.ha || 0), 0)
  const Sup_ha     = Sup_ha_izq + Sup_ha_der
  const Sup_m2     = Sup_ha * 10000

  const haByType: Record<string, number> = { ralo: 0, semitupido: 0, tupido: 0 }
  allEntries.forEach(e => { haByType[e.monte] = (haByType[e.monte] ?? 0) + (e.ha || 0) })

  const costoByType: Record<string, number> = Object.fromEntries(
    Object.keys(MONTE).map(k => [k, (haByType[k] ?? 0) * (precioHaPorTipo[k] ?? 0)])
  )
  const CostoTotal = Object.values(costoByType).reduce((s, v) => s + v, 0)
  const diasTrab = Object.entries(MONTE).reduce((s, [k, v]) =>
    s + (v.rendimientoDia > 0 ? (haByType[k] ?? 0) / v.rendimientoDia : 0), 0)
  const VolArb = allEntries.reduce((s, e) => s + (e.ha || 0) * MONTE[e.monte].factor, 0)
  const precioHa = Sup_ha > 0 ? CostoTotal / Sup_ha : 0

  // ── Presupuesto ───────────────────────────────────────────────
  const presTotal = presRows.reduce((s, r) => s + r.cant * r.precioUnit, 0)
  const aporteDVP = presTotal * dvpPct / 100
  const aporteCC  = presTotal * (1 - dvpPct / 100)

  useEffect(() => {
    if (paramsRef) paramsRef.current = { Ad: Sup_ha * 10000, monte: 'semitupido', precioHa }
  }, [paramsRef, Sup_ha, precioHa])

  const fmt  = (n: number) => Math.round(n).toLocaleString('es-AR')
  const fmtM = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(3).replace('.', ',')}M` : `$${fmt(n)}`
  const color = CLR.desbosque

  // ── Entry CRUD ────────────────────────────────────────────────
  const updEntry = (side: 'izq' | 'der', id: string, field: keyof MonteEntry, val: string | number | boolean) => {
    const setter = side === 'izq' ? setEntriesIzq : setEntriesDer
    setter(prev => prev.map(e => e.id === id ? { ...e, [field]: val } : e))
  }
  const rmEntry = (side: 'izq' | 'der', id: string) => {
    const setter = side === 'izq' ? setEntriesIzq : setEntriesDer
    setter(prev => prev.filter(e => e.id !== id))
  }
  const addEntry = (side: 'izq' | 'der') => {
    const setter = side === 'izq' ? setEntriesIzq : setEntriesDer
    setter(prev => [...prev, { id: `${side}-${Date.now()}`, ha: 0, monte: 'semitupido' }])
  }

  // ── Row helpers ───────────────────────────────────────────────
  const setMONum   = (id: string, f: 'tarifaH' | 'coefMO' | 'hsDay' | 'n', v: number) =>
    setMoRows(rows => rows.map(r => r.id === id ? { ...r, [f]: v } : r))
  const setMOLabel = (id: string, v: string) =>
    setMoRows(rows => rows.map(r => r.id === id ? { ...r, label: v } : r))
  const setEqNum   = (id: string, f: 'capUnit' | 'hp' | 'cant', v: number) =>
    setEqRows(rows => rows.map(r => r.id === id ? { ...r, [f]: v } : r))
  const setEqLabel = (id: string, v: string) =>
    setEqRows(rows => rows.map(r => r.id === id ? { ...r, label: v } : r))
  const setPresNum = (id: string, f: 'cant' | 'precioUnit' | 'num', v: number) =>
    setPresRows(rs => rs.map(r => r.id === id ? { ...r, [f]: v } : r))
  const setPresText = (id: string, f: 'desc' | 'unit', v: string) =>
    setPresRows(rs => rs.map(r => r.id === id ? { ...r, [f]: v } : r))

  const crFields = [
    { key: 'GG',  val: ggPct,  set: (v: number) => setGgPct(v),  step: 1   },
    { key: 'Ben', val: benPct, set: (v: number) => setBenPct(v), step: 1   },
    { key: 'GF',  val: gfPct,  set: (v: number) => setGfPct(v),  step: 0.5 },
    { key: 'IVA', val: ivaPct, set: (v: number) => setIvaPct(v), step: 1   },
  ]

  const W_SVG = 420, H_SVG = 185
  const cx = W_SVG / 2, roadW_px = 80, roadY = 30, roadH = 120
  const totalClearW_px = 240
  const izqRatio = Sup_ha > 0 ? Sup_ha_izq / Sup_ha : 0.5
  const izqW_px  = Math.round(Math.max(izqRatio * totalClearW_px, 28))
  const derW_px  = Math.max(totalClearW_px - izqW_px, 28)
  const trees: [number, number][] = [
    [-(roadW_px/2 + izqW_px*0.20), 40], [-(roadW_px/2 + izqW_px*0.55), 85],
    [-(roadW_px/2 + izqW_px*0.80), 110],[-(roadW_px/2 + izqW_px*0.38), 130],
    [-(roadW_px/2 + izqW_px*0.65), 65],
    [ (roadW_px/2 + derW_px*0.20), 55], [ (roadW_px/2 + derW_px*0.55), 95],
    [ (roadW_px/2 + derW_px*0.72), 75], [ (roadW_px/2 + derW_px*0.38), 135],
    [ (roadW_px/2 + derW_px*0.80), 110],
  ]

  // ── Shared styles ─────────────────────────────────────────────
  const TH: React.CSSProperties = { padding: '4px 6px', fontSize: 10, color: '#666', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #222', fontWeight: 500, whiteSpace: 'nowrap' }
  const TD: React.CSSProperties = { padding: '2px 4px' }
  const TDr: React.CSSProperties = { padding: '2px 4px', textAlign: 'right' as const }
  const cellInp = (w: number): React.CSSProperties => ({ width: w, background: '#080808', border: '1px solid #1e1e1e', color: '#ccc', fontFamily: 'monospace', fontSize: 10, padding: '2px 4px', outline: 'none', textAlign: 'right' as const, boxSizing: 'border-box' as const })
  const labelInp: React.CSSProperties = { width: '100%', background: 'transparent', border: 'none', color: '#888', fontFamily: 'monospace', fontSize: 10, outline: 'none', padding: '2px 0' }
  const addBtn: React.CSSProperties = { marginTop: 5, fontSize: 9, color: '#555', background: 'transparent', border: '1px solid #252525', cursor: 'pointer', fontFamily: 'monospace', padding: '2px 7px' }
  const rmBtn:  React.CSSProperties = { fontSize: 11, color: '#444', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'monospace', padding: '0 3px', lineHeight: 1 }

  // ── Entry list per side ───────────────────────────────────────
  const renderSide = (side: 'izq' | 'der', entries: MonteEntry[]) => {
    const subtotal = entries.reduce((s, e) => s + (e.ha || 0), 0)
    return (
      <>
        <div style={{ fontSize: 9, color: color, textTransform: 'uppercase' as const, letterSpacing: 1, fontFamily: 'monospace', marginTop: side === 'der' ? 14 : 4, marginBottom: 5 }}>
          Lado {side === 'izq' ? 'Izquierdo' : 'Derecho'}
        </div>
        {entries.map(e => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 4 }}>
            <select value={e.monte}
              onChange={ev => updEntry(side, e.id, 'monte', ev.target.value as MonteKey)}
              style={{ flex: 1, background: '#080808', border: '1px solid #1a1a1a', color: '#888', fontFamily: 'monospace', fontSize: 9, padding: '3px 2px', outline: 'none', minWidth: 0 }}>
              <option value="ralo">Ralo</option>
              <option value="semitupido">Semi-tupido</option>
              <option value="tupido">Tupido</option>
            </select>
            <input type="number" min={0} step={0.1} value={e.ha || ''}
              onChange={ev => { const v = parseFloat(ev.target.value); if (!isNaN(v) && v >= 0) updEntry(side, e.id, 'ha', v) }}
              placeholder="0"
              style={{ width: 50, background: '#080808', border: '1px solid #1a1a1a', color: '#ccc', fontFamily: 'monospace', fontSize: 10, padding: '3px 4px', textAlign: 'right' as const, outline: 'none' }} />
            <span style={{ fontSize: 8, color: '#444', fontFamily: 'monospace', flexShrink: 0 }}>ha</span>
            {e.fromMap && <span style={{ fontSize: 7, color: color, border: `1px solid ${color}44`, padding: '1px 3px', borderRadius: 1, flexShrink: 0 }}>↗</span>}
            <button onClick={() => rmEntry(side, e.id)}
              style={{ fontSize: 13, color: '#333', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'monospace', padding: '0 2px', lineHeight: 1 }}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#555', fontFamily: 'monospace', marginTop: 1, marginBottom: 3 }}>
          <span>Subtotal {side === 'izq' ? 'izq.' : 'der.'}</span>
          <span style={{ color: subtotal > 0 ? '#888' : '#333' }}>{subtotal.toFixed(4)} ha</span>
        </div>
        <button style={{ ...addBtn, marginTop: 2 }} onClick={() => addEntry(side)}>+ agregar</button>
      </>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6 }}>

      {/* ── Sub-tab bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #1a1a1a', flexShrink: 0, paddingBottom: 4, gap: 2 }}>
        {(['computo', 'jornales', 'presupuesto'] as const).map(v => {
          const labels: Record<string, string> = { computo: 'Cómputo', jornales: 'Jornales y Coeficientes', presupuesto: 'Presupuesto' }
          return (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '3px 12px', fontSize: 10, fontFamily: 'monospace', cursor: 'pointer',
                border: 'none', borderBottom: `2px solid ${view === v ? color : 'transparent'}`,
                background: 'transparent', color: view === v ? color : '#444',
                letterSpacing: 0.5, marginBottom: -5 }}>
              {labels[v]}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: '#555', fontFamily: 'monospace', paddingRight: 4 }}>
          Eq: <span style={{ color: '#777' }}>${fmt(Math.round(cEquipos))}</span>/d · MO: <span style={{ color: '#777' }}>${fmt(Math.round(cMO))}</span>/d · Total: <span style={{ color: color }}>${fmt(Math.round(costoDiario))}</span>/d
        </span>
      </div>

      {view === 'jornales' ? (
        /* ════════════════════════════════════════════════════════
           JORNALES Y COEFICIENTES (Ae-7)
        ════════════════════════════════════════════════════════ */
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

          {/* Left: I) Mano de Obra */}
          <div style={panel}>
            <SectionTitle>I) Mano de Obra</SectionTitle>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left', width: '30%' }}>Categoría</th>
                  <th style={{ ...TH, textAlign: 'right' }}>$/h</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Coef.MO</th>
                  <th style={{ ...TH, textAlign: 'right' }}>hs/d</th>
                  <th style={{ ...TH, textAlign: 'right' }}>N°</th>
                  <th style={{ ...TH, textAlign: 'right' }}>$/día</th>
                  <th style={{ ...TH }}></th>
                </tr>
              </thead>
              <tbody>
                {moRows.map(r => {
                  const dCost = r.tarifaH * r.coefMO * r.hsDay * r.n
                  return (
                    <tr key={r.id}>
                      <td style={TD}><input value={r.label} onChange={e => setMOLabel(r.id, e.target.value)} style={labelInp} /></td>
                      <td style={TDr}><input type="number" min={0} step={10} value={r.tarifaH}
                        onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setMONum(r.id,'tarifaH',v) }}
                        style={cellInp(58)} /></td>
                      <td style={TDr}><input type="number" min={0} step={0.0001} value={r.coefMO}
                        onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setMONum(r.id,'coefMO',v) }}
                        style={cellInp(52)} /></td>
                      <td style={TDr}><input type="number" min={1} step={1} value={r.hsDay}
                        onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=1) setMONum(r.id,'hsDay',v) }}
                        style={cellInp(32)} /></td>
                      <td style={TDr}><input type="number" min={0} step={1} value={r.n}
                        onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setMONum(r.id,'n',v) }}
                        style={cellInp(28)} /></td>
                      <td style={{ ...TDr, color: '#777', fontSize: 10, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>${fmt(Math.round(dCost))}</td>
                      <td style={TD}><button onClick={() => setMoRows(rs => rs.filter(x => x.id !== r.id))} style={rmBtn}>×</button></td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ paddingTop: 6, fontSize: 9, color: '#666', borderTop: '1px solid #222', textAlign: 'right', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5 }}>Sub-total MO</td>
                  <td style={{ paddingTop: 6, textAlign: 'right', fontWeight: 700, color: color, fontSize: 13, fontFamily: 'monospace', borderTop: '1px solid #1a1a1a' }}>${fmt(Math.round(cMO))}</td>
                  <td style={{ borderTop: '1px solid #1a1a1a' }}></td>
                </tr>
              </tfoot>
            </table>
            <button style={addBtn}
              onClick={() => setMoRows(rs => [...rs, { id: Date.now().toString(), label: 'Operario', tarifaH: 2000, coefMO: 1.8827, hsDay: 8, n: 1 }])}>
              + Agregar
            </button>

            {/* VIII) CR — también en esta tab */}
            <div style={{ ...secLabel, marginTop: 18 }}>VIII) Coeficiente Resumen</div>
            <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: 3, padding: '8px 10px' }}>
              {crFields.map(({ key, val, set, step }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <span style={{ fontSize: 9, color: '#777', fontFamily: 'monospace', width: 28, flexShrink: 0 }}>{key}</span>
                  <input type="number" min={0} step={step} value={val}
                    onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) set(v) }}
                    style={{ flex: 1, background: '#0a0a0a', border: '1px solid #1e1e1e', color: '#e0e0e0', fontFamily: 'monospace', fontSize: 13, padding: '3px 6px', outline: 'none', minWidth: 0 }} />
                  <span style={{ fontSize: 9, color: '#555', fontFamily: 'monospace' }}>%</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #1a1a1a', marginTop: 4, paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: '#777', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5 }}>CR adoptado</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: color, fontFamily: 'monospace' }}>{CR.toFixed(4)}</span>
              </div>
            </div>
          </div>

          {/* Right: Equipos + Coeficientes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Equipos table */}
            <div style={panel}>
              <SectionTitle>Equipos</SectionTitle>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, textAlign: 'left' }}>Equipo</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Capital $</th>
                    <th style={{ ...TH, textAlign: 'right' }}>HP</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Cant.</th>
                    <th style={{ ...TH }}></th>
                  </tr>
                </thead>
                <tbody>
                  {eqRows.map(r => (
                    <tr key={r.id}>
                      <td style={TD}><input value={r.label} onChange={e => setEqLabel(r.id, e.target.value)} style={labelInp} /></td>
                      <td style={TDr}><input type="number" min={0} step={1000000} value={r.capUnit}
                        onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setEqNum(r.id,'capUnit',v) }}
                        style={cellInp(80)} /></td>
                      <td style={TDr}><input type="number" min={0} step={1} value={r.hp}
                        onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setEqNum(r.id,'hp',v) }}
                        style={cellInp(38)} /></td>
                      <td style={TDr}><input type="number" min={0} step={0.1} value={r.cant}
                        onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setEqNum(r.id,'cant',v) }}
                        style={cellInp(38)} /></td>
                      <td style={TD}><button onClick={() => setEqRows(rs => rs.filter(x => x.id !== r.id))} style={rmBtn}>×</button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ ...TH, textAlign: 'left', borderTop: '1px solid #1a1a1a', paddingTop: 5 }}>Total</td>
                    <td style={{ ...TH, textAlign: 'right', borderTop: '1px solid #1a1a1a', paddingTop: 5, color: '#555' }}>${fmt(Math.round(totalCap/1e6))}M</td>
                    <td style={{ ...TH, textAlign: 'right', borderTop: '1px solid #1a1a1a', paddingTop: 5, color: '#555' }}>{totalHP} HP</td>
                    <td colSpan={2} style={{ borderTop: '1px solid #1a1a1a' }}></td>
                  </tr>
                </tfoot>
              </table>
              <button style={addBtn}
                onClick={() => setEqRows(rs => [...rs, { id: Date.now().toString(), label: 'Equipo', capUnit: 50000000, hp: 100, cant: 1 }])}>
                + Agregar
              </button>
            </div>

            {/* II-III-IV Coeficientes */}
            <div style={panel}>
              <SectionTitle>II) Amortiz. · III) Repuestos</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <label style={{ display: 'block' }}>
                  <span style={lbl}>Amort+int coef/día</span>
                  <input type="number" min={0} step={0.0001} value={amortCoef}
                    onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>0) setAmortCoef(v) }}
                    style={{ ...inpStyle, fontSize: 12 }} />
                  <span style={{ fontSize: 8, color: '#2a2a2a', fontFamily: 'monospace' }}>= 8/10000 + tasa·8/(2·hs/año)</span>
                </label>
                <label style={{ display: 'block' }}>
                  <span style={lbl}>Repuestos coef/día</span>
                  <input type="number" min={0} step={0.00001} value={repCoef}
                    onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setRepCoef(v) }}
                    style={{ ...inpStyle, fontSize: 12 }} />
                  <span style={{ fontSize: 8, color: '#2a2a2a', fontFamily: 'monospace' }}>= amort_dep × 70%</span>
                </label>
              </div>

              <div style={{ ...secLabel, marginTop: 12 }}>IV) Combustibles y Lubricantes</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <label style={{ display: 'block' }}>
                  <span style={lbl}>Consumo (l/HP·h)</span>
                  <input type="number" min={0} step={0.01} value={consumoLHpH}
                    onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setConsumoLHpH(v) }}
                    style={{ ...inpStyle, fontSize: 12 }} />
                </label>
                <label style={{ display: 'block' }}>
                  <span style={lbl}>hs/día</span>
                  <input type="number" min={1} step={1} value={hsDiaComb}
                    onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>0) setHsDiaComb(v) }}
                    style={{ ...inpStyle, fontSize: 12 }} />
                </label>
                <label style={{ display: 'block' }}>
                  <span style={lbl}>Precio combustible ($/l)</span>
                  <input type="number" min={0} step={50} value={precioLitro}
                    onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setPrecioLitro(v) }}
                    style={{ ...inpStyle, fontSize: 12, borderColor: `${color}55` }} />
                </label>
                <label style={{ display: 'block' }}>
                  <span style={lbl}>Coef. lubricantes</span>
                  <input type="number" min={1} step={0.05} value={coefLubri}
                    onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=1) setCoefLubri(v) }}
                    style={{ ...inpStyle, fontSize: 12 }} />
                </label>
              </div>

              {/* Resumen equipos */}
              <div style={{ marginTop: 10, background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 3, padding: '7px 10px', fontSize: 9, fontFamily: 'monospace', lineHeight: 1.9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#333' }}>Comb/HP·día</span>
                  <span style={{ color: '#555' }}>${fmt(Math.round(combPerHpD))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#333' }}>Amortización</span>
                  <span style={{ color: '#555' }}>${fmt(Math.round(amortD))}/día</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#333' }}>Repuestos</span>
                  <span style={{ color: '#555' }}>${fmt(Math.round(repD))}/día</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#333' }}>Combustibles</span>
                  <span style={{ color: '#555' }}>${fmt(Math.round(combD))}/día</span>
                </div>
                <div style={{ borderTop: '1px solid #1a1a1a', marginTop: 4, paddingTop: 5, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 }}>Subtotal equipos</span>
                  <span style={{ color: color, fontWeight: 700, fontSize: 12 }}>${fmt(Math.round(cEquipos))}/día</span>
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* ═══ RESUMEN (Ae-9) ═══════════════════════════════ */}
          <div style={{ background: '#0e0e0e', border: '1px solid #1e1e1e', borderRadius: 6, padding: '10px 14px', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'monospace', marginBottom: 8 }}>Resumen — Ae-9</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left' }}>Tipo de monte</th>
                  <th style={{ ...TH, textAlign: 'right' }}>ha</th>
                  <th style={{ ...TH, textAlign: 'right' }}>rend.</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Ejec. $/ha</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Mat+Tra</th>
                  <th style={{ ...TH, textAlign: 'right' }}>× CR</th>
                  <th style={{ ...TH, textAlign: 'right' }}>$/ha final</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(MONTE).map(([k, v]) => {
                  const ha = haByType[k] ?? 0
                  const ejecHa = v.rendimientoDia > 0 ? costoDiario / v.rendimientoDia : 0
                  const costoDir = ejecHa + materiales + transpInt
                  const pHa = costoDir * CR
                  return (
                    <tr key={k} style={{ opacity: ha > 0 ? 1 : 0.3 }}>
                      <td style={{ ...TD, fontFamily: 'monospace', fontSize: 10, color: ha > 0 ? '#888' : '#333' }}>{v.label}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: ha > 0 ? '#aaa' : '#333' }}>{ha.toFixed(4)}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: '#555' }}>{v.rendimientoDia}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: '#555' }}>${fmt(Math.round(ejecHa))}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: '#444' }}>${fmt(Math.round(materiales + transpInt))}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: '#444' }}>×{CR.toFixed(2)}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: ha > 0 ? color : '#333' }}>${fmt(Math.round(pHa))}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: ha > 0 ? '#aaa' : '#222' }}>{ha > 0 ? fmtM(ha * pHa) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...TH, borderTop: '1px solid #1a1a1a', paddingTop: 5 }}>Total</td>
                  <td style={{ ...TH, textAlign: 'right', borderTop: '1px solid #1a1a1a', paddingTop: 5, color: '#777' }}>{Sup_ha.toFixed(4)}</td>
                  <td colSpan={5} style={{ borderTop: '1px solid #1a1a1a' }}></td>
                  <td style={{ ...TH, textAlign: 'right', borderTop: '1px solid #1a1a1a', paddingTop: 5, color: color, fontSize: 12 }}>{fmtM(CostoTotal)}</td>
                </tr>
              </tfoot>
            </table>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: '5px 14px', fontFamily: 'monospace', fontSize: 11, marginBottom: 10 }}>
              <span style={{ color: '#555' }}>II) Materiales</span>
              <input type="number" min={0} step={1000} value={materiales}
                onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setMateriales(v) }}
                style={{ background: '#0a0a0a', border: '1px solid #222', color: '#e0e0e0', fontFamily: 'monospace', fontSize: 11, padding: '2px 6px', textAlign: 'right' as const, outline: 'none', width: 120 }} />
              <span style={{ color: '#333', fontSize: 9 }}>/Ha</span>
              <span style={{ color: '#555' }}>III) Transp. Interno</span>
              <input type="number" min={0} step={1000} value={transpInt}
                onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setTranspInt(v) }}
                style={{ background: '#0a0a0a', border: '1px solid #222', color: '#e0e0e0', fontFamily: 'monospace', fontSize: 11, padding: '2px 6px', textAlign: 'right' as const, outline: 'none', width: 120 }} />
              <span style={{ color: '#333', fontSize: 9 }}>/Ha</span>
            </div>
            <div style={{ padding: '8px 14px', background: `${color}15`, border: `1px solid ${color}55`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, color: color, fontFamily: 'monospace', textTransform: 'uppercase' as const, letterSpacing: 1 }}>Costo Total Adoptado</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: color, fontFamily: 'monospace' }}>{fmtM(CostoTotal)}</span>
            </div>
          </div>
        </div>

      ) : view === 'presupuesto' ? (
        /* ════════════════════════════════════════════════════════
           PRESUPUESTO (Ae-10)
        ════════════════════════════════════════════════════════ */
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Precios de referencia por tipo */}
          <div style={{ ...panel, flexShrink: 0 }}>
            <SectionTitle>Precios de Referencia por Tipo de Monte</SectionTitle>
            <div style={{ fontSize: 9, color: '#333', fontFamily: 'monospace', marginBottom: 6 }}>incluye ejec. + mat. + transp.int. × CR</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
              {Object.entries(MONTE).map(([k, v]) => (
                <div key={k} style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 3, padding: '6px 12px', minWidth: 130 }}>
                  <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase' as const, fontFamily: 'monospace' }}>{v.label} — {v.desc}</div>
                  <div style={{ color: color, fontWeight: 700, fontFamily: 'monospace', fontSize: 14, marginTop: 3 }}>${fmt(Math.round(precioHaPorTipo[k]))}/Ha</div>
                  <div style={{ fontSize: 9, color: '#333', fontFamily: 'monospace' }}>{v.rendimientoDia} Ha/día · {(haByType[k]??0).toFixed(2)} Ha total</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabla presupuesto */}
          <div style={{ ...panel, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <SectionTitle>Presupuesto — Ae-10</SectionTitle>
              <button
                onClick={() => {
                  const rows: PresRow[] = []
                  let num = 1
                  Object.entries(MONTE).forEach(([k, v]) => {
                    const ha = haByType[k] ?? 0
                    if (ha > 0) {
                      rows.push({
                        id: `p-${k}-${Date.now()}`,
                        num: num++,
                        desc: `DESBOSQUE-DESTRONQUE Y LIMPIEZA — Monte ${v.label.toUpperCase()}`,
                        unit: 'Has',
                        cant: parseFloat(ha.toFixed(4)),
                        precioUnit: Math.round(precioHaPorTipo[k] ?? 0)
                      })
                    }
                  })
                  if (rows.length > 0) setPresRows(rows)
                }}
                style={{ fontSize: 9, color: color, background: `${color}15`, border: `1px solid ${color}55`, cursor: 'pointer', fontFamily: 'monospace', padding: '3px 10px', letterSpacing: 0.5 }}>
                ← Calcular desde cómputo
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'center', width: 28 }}>N°</th>
                  <th style={{ ...TH, textAlign: 'left' }}>Designación</th>
                  <th style={{ ...TH, textAlign: 'center', width: 36 }}>UN</th>
                  <th style={{ ...TH, textAlign: 'right', width: 72 }}>Cant.</th>
                  <th style={{ ...TH, textAlign: 'right', width: 110 }}>$/Ha</th>
                  <th style={{ ...TH, textAlign: 'right', width: 120 }}>Total</th>
                  <th style={{ ...TH, width: 18 }}></th>
                </tr>
              </thead>
              <tbody>
                {presRows.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...TD, textAlign: 'center', color: '#444', fontFamily: 'monospace', fontSize: 10 }}>{r.num}</td>
                    <td style={TD}><input value={r.desc} onChange={e => setPresText(r.id, 'desc', e.target.value)} style={{ ...labelInp, width: '100%' }} /></td>
                    <td style={TD}><input value={r.unit} onChange={e => setPresText(r.id, 'unit', e.target.value)} style={{ ...labelInp, width: 34, textAlign: 'center' as const }} /></td>
                    <td style={TD}><input type="number" min={0} step={0.5} value={r.cant}
                      onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setPresNum(r.id,'cant',v) }}
                      style={cellInp(64)} /></td>
                    <td style={TD}><input type="number" min={0} step={1000} value={r.precioUnit}
                      onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setPresNum(r.id,'precioUnit',v) }}
                      style={cellInp(100)} /></td>
                    <td style={{ ...TD, textAlign: 'right', color: '#666', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>${fmt(Math.round(r.cant * r.precioUnit))}</td>
                    <td style={TD}><button onClick={() => setPresRows(rs => rs.filter(x => x.id !== r.id))} style={rmBtn}>×</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ paddingTop: 8, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: '#444', borderTop: '1px solid #1a1a1a', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Obra</td>
                  <td style={{ paddingTop: 8, textAlign: 'right', fontWeight: 700, color: color, fontSize: 15, fontFamily: 'monospace', borderTop: '1px solid #1a1a1a' }}>${fmt(Math.round(presTotal))}</td>
                  <td style={{ borderTop: '1px solid #1a1a1a' }}></td>
                </tr>
              </tfoot>
            </table>
            <button style={addBtn}
              onClick={() => setPresRows(rs => [...rs, { id: Date.now().toString(), num: rs.length+1, desc: 'Nuevo ítem', unit: 'Has', cant: 0, precioUnit: 0 }])}>
              + Agregar ítem
            </button>

            {/* Financiamiento */}
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '260px 1fr', gap: 10 }}>
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 3, padding: '10px 14px' }}>
                <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase' as const, letterSpacing: 0.5, fontFamily: 'monospace', marginBottom: 8 }}>Financiamiento</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', flex: 1 }}>Org. financiador %</span>
                  <input type="number" min={0} max={100} step={5} value={dvpPct}
                    onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0&&v<=100) setDvpPct(v) }}
                    style={{ background: '#080808', border: `1px solid ${color}44`, color: '#e0e0e0', fontFamily: 'monospace', fontSize: 13, padding: '3px 6px', outline: 'none', width: 64, textAlign: 'right' as const }} />
                  <span style={{ fontSize: 9, color: '#444', fontFamily: 'monospace' }}>%</span>
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#444' }}>Org. financiador ({dvpPct}%)</span>
                    <span style={{ color: color, fontWeight: 700 }}>${fmt(Math.round(aporteDVP))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#444' }}>Consorcio ({(100-dvpPct).toFixed(0)}%)</span>
                    <span style={{ color: '#666' }}>${fmt(Math.round(aporteCC))}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      ) : (
        /* ════════════════════════════════════════════════════════
           CÓMPUTO (vista principal)
        ════════════════════════════════════════════════════════ */
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '210px 1fr 160px', gap: 10 }}>

          {/* ── Panel izquierdo: entradas por lado y tipo ── */}
          <div style={{ ...panel, overflowY: 'auto' }}>
            <SectionTitle>Superficie por lado y tipo</SectionTitle>
            {renderSide('izq', entriesIzq)}
            {renderSide('der', entriesDer)}

            <div style={secLabel}>Coeficiente Resumen</div>
            <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: 3, padding: '8px 10px' }}>
              {crFields.map(({ key, val, set, step }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <span style={{ fontSize: 9, color: '#777', fontFamily: 'monospace', width: 28, flexShrink: 0 }}>{key}</span>
                  <input type="number" min={0} step={step} value={val}
                    onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) set(v) }}
                    style={{ flex: 1, background: '#0a0a0a', border: '1px solid #1e1e1e', color: '#e0e0e0', fontFamily: 'monospace', fontSize: 13, padding: '3px 6px', outline: 'none', minWidth: 0 }} />
                  <span style={{ fontSize: 9, color: '#555', fontFamily: 'monospace' }}>%</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #1a1a1a', marginTop: 4, paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: '#777', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5 }}>CR adoptado</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: color, fontFamily: 'monospace' }}>{CR.toFixed(4)}</span>
              </div>
            </div>
          </div>

          {/* ── Panel central: mapa siempre visible ── */}
          <div style={{ ...panel, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            {/* Mapa Leaflet */}
            <InlineMapDraw
              color={color}
              onConfirm={(side, monteKey, area_ha) => {
                const ne: MonteEntry = { id: `${side}-${Date.now()}`, ha: area_ha, monte: monteKey, fromMap: true }
                if (side === 'izq') setEntriesIzq(prev => [...prev, ne])
                else               setEntriesDer(prev => [...prev, ne])
              }}
            />
            {/* Tabla desglose por tipo */}
            <div style={{ flexShrink: 0, maxHeight: 148, overflowY: 'auto', borderTop: '1px solid #1a1a1a' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', padding: '0 14px' }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, textAlign: 'left', paddingLeft: 10 }}>Tipo</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Ha izq.</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Ha der.</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Total ha</th>
                    <th style={{ ...TH, textAlign: 'right' }}>rend.</th>
                    <th style={{ ...TH, textAlign: 'right' }}>$/ha</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Días</th>
                    <th style={{ ...TH, textAlign: 'right', paddingRight: 10 }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(MONTE).map(([k, v]) => {
                    const haIzq = entriesIzq.filter(e => e.monte === k).reduce((s, e) => s + (e.ha||0), 0)
                    const haDer = entriesDer.filter(e => e.monte === k).reduce((s, e) => s + (e.ha||0), 0)
                    const ha = haIzq + haDer
                    const dias = v.rendimientoDia > 0 ? ha / v.rendimientoDia : 0
                    return (
                      <tr key={k} style={{ opacity: ha > 0 ? 1 : 0.3 }}>
                        <td style={{ ...TD, fontFamily: 'monospace', fontSize: 10, color: ha > 0 ? '#888' : '#333', paddingLeft: 10 }}>{v.label}</td>
                        <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: '#555' }}>{haIzq > 0 ? haIzq.toFixed(3) : '—'}</td>
                        <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: '#555' }}>{haDer > 0 ? haDer.toFixed(3) : '—'}</td>
                        <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: ha > 0 ? '#aaa' : '#333' }}>{ha > 0 ? ha.toFixed(3) : '—'}</td>
                        <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: '#444' }}>{v.rendimientoDia}</td>
                        <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: ha > 0 ? color : '#333' }}>${fmt(Math.round(precioHaPorTipo[k]))}</td>
                        <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: '#555' }}>{ha > 0 ? dias.toFixed(1) : '—'}</td>
                        <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: ha > 0 ? '#aaa' : '#222', paddingRight: 10 }}>{ha > 0 ? fmtM(costoByType[k]) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ ...TH, borderTop: '1px solid #1a1a1a', paddingTop: 5, paddingLeft: 10 }}>Total</td>
                    <td style={{ ...TH, textAlign: 'right', borderTop: '1px solid #1a1a1a', paddingTop: 5, color: '#666' }}>{Sup_ha_izq.toFixed(3)}</td>
                    <td style={{ ...TH, textAlign: 'right', borderTop: '1px solid #1a1a1a', paddingTop: 5, color: '#666' }}>{Sup_ha_der.toFixed(3)}</td>
                    <td style={{ ...TH, textAlign: 'right', borderTop: '1px solid #1a1a1a', paddingTop: 5, color: '#888' }}>{Sup_ha.toFixed(3)}</td>
                    <td style={{ borderTop: '1px solid #1a1a1a' }}></td>
                    <td style={{ borderTop: '1px solid #1a1a1a' }}></td>
                    <td style={{ ...TH, textAlign: 'right', borderTop: '1px solid #1a1a1a', paddingTop: 5, color: '#666' }}>{diasTrab.toFixed(1)}</td>
                    <td style={{ ...TH, textAlign: 'right', borderTop: '1px solid #1a1a1a', paddingTop: 5, color, fontSize: 12, paddingRight: 10 }}>{fmtM(CostoTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Panel derecho ── */}
          <div style={panel}>
            <SectionTitle>Cómputo</SectionTitle>
            <Res label="Ha izq."       value={Sup_ha_izq.toFixed(4)}           unit="ha" />
            <Res label="Ha der."       value={Sup_ha_der.toFixed(4)}           unit="ha" />
            <Res label="Total ha"      value={Sup_ha.toFixed(4)}               unit="ha" />
            <Res label="Sup. total"    value={fmt(Sup_m2)}                     unit="m²" />
            <Res label="Vol. arbóreo"  value={fmt(VolArb)}                     unit="m³" />
            <div style={{ height: 1, background: '#1a1a1a', margin: '6px 0' }} />
            {Object.entries(MONTE).map(([k, v]) => {
              const ha = haByType[k] ?? 0
              return ha > 0 ? <Res key={k} label={v.label} value={ha.toFixed(2) + ' ha'} unit="" /> : null
            })}
            <div style={{ height: 1, background: '#1a1a1a', margin: '6px 0' }} />
            <Res label="Coef. Resumen" value={CR.toFixed(4)}                   unit="" />
            <Res label="$/ha pond."    value={`$${fmt(Math.round(precioHa))}`} unit="" />
            <Res label="Días trabajo"  value={diasTrab.toFixed(1)}             unit="días" />
            <Res label="Costo total"   value={fmtM(CostoTotal)}                unit="" accent />
          </div>
        </div>
      )}
    </div>
  )
}

// ── PÁGINA PRINCIPAL ──────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'terraplen',   label: 'Terraplén',    icon: '▲' },
  { id: 'excavacion',  label: 'Excavación',   icon: '▼' },
  { id: 'ripio',       label: 'Ripio',        icon: '≡' },
  { id: 'canal',       label: 'Canal',        icon: '⌣' },
  { id: 'desmalezado', label: 'Desmalezado',  icon: '≈' },
  { id: 'desbosque',   label: 'Desbosque',    icon: '※' },
]

export default function CalculadorasPage() {
  const [tab, setTab]     = useState<Tab>(() => (consumeReturnTab() as Tab) || 'terraplen')
  const [precio, setPrecio] = useState(0)
  const paramsRef = useRef<Params>({})
  const router    = useRouter()
  const color     = CLR[tab]

  const handleDraw = () => {
    saveReturnTab(tab)
    setObraTransfer({
      type: tab,
      params: { ...paramsRef.current },
      precioUnitario: precio,
      unidad: UNIDADES[tab],
    })
    router.push('/dashboard/obras/planta')
  }

  return (
    <div style={{
      height: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column',
      padding: '10px 16px 8px', overflow: 'hidden', boxSizing: 'border-box',
      fontFamily: 'monospace', color: '#e0e0e0',
    }}>
      {/* Header */}
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

      {/* Barra precio + botón Dibujar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 0 10px', borderBottom: '1px solid #141414', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: '#444', letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Precio unit. ({UNIDADES[tab]})
          </span>
          <input
            type="number" step={100} min={0} value={precio || ''}
            placeholder="0"
            onChange={e => setPrecio(parseFloat(e.target.value) || 0)}
            style={{
              width: 130, background: '#080808', border: `1px solid ${precio > 0 ? color + '66' : '#222'}`,
              color: precio > 0 ? color : '#e0e0e0', fontFamily: 'monospace',
              fontSize: 14, padding: '4px 8px', outline: 'none',
            }}
          />
        </div>
        {precio > 0 && (
          <span style={{ fontSize: 9, color: '#333', fontFamily: 'monospace' }}>
            ARS
          </span>
        )}
        <div style={{ flex: 1 }} />
        {tab !== 'desbosque' && (
          <button
            onClick={handleDraw}
            style={{
              padding: '7px 18px', fontSize: 11, fontFamily: 'monospace',
              fontWeight: 700, letterSpacing: 0.8, cursor: 'pointer',
              border: `1px solid ${color}`, background: `${color}22`,
              color: color, transition: 'background 0.15s',
            }}
          >
            Dibujar en mapa →
          </button>
        )}
      </div>

      {/* Calculadora activa */}
      <div style={{ flex: 1, minHeight: 0, borderLeft: `2px solid ${color}44`, paddingLeft: 14, marginTop: 10 }}>
        {tab === 'terraplen'   && <CalcTerraplen   paramsRef={paramsRef} />}
        {tab === 'excavacion'  && <CalcExcavacion  paramsRef={paramsRef} />}
        {tab === 'ripio'       && <CalcRipio       paramsRef={paramsRef} />}
        {tab === 'canal'       && <CalcCanal       paramsRef={paramsRef} />}
        {tab === 'desmalezado' && <CalcDesmalezado paramsRef={paramsRef} />}
        {tab === 'desbosque'   && <CalcDesbosque   paramsRef={paramsRef} />}
      </div>
    </div>
  )
}
