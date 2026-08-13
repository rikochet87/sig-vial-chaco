'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { setObraTransfer, saveReturnTab, consumeReturnTab } from '@/lib/obraTransfer'
import InlineMapDraw from '@/components/InlineMapDraw'
import InlineLineDraw from '@/components/InlineLineDraw'
import DesmMapPanel, { type TramoForMap } from '@/components/DesmMapPanel'
import GuardarObraModal, { type GuardarObraData, type ObraTipo } from '@/components/GuardarObraModal'

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Tab    = 'terraplen' | 'excavacion' | 'ripio' | 'canal' | 'limpieza'
type Params = Record<string, number | string>

// ── Colores por tipo ──────────────────────────────────────────────────────────
const CLR: Record<Tab, string> = {
  terraplen: '#8D6E63', excavacion: '#FF7043', ripio: '#90A4AE', canal: '#29B6F6',
  limpieza: '#66BB6A',
}

// Unidades de precio por tipo (para mostrar en el input)
const UNIDADES: Record<Tab, string> = {
  terraplen: '$/t', excavacion: '$/t', ripio: '$/t', canal: '$/t',
  limpieza: '$/ha',
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
const th: React.CSSProperties = {
  padding: '4px 8px', fontWeight: 400, fontSize: 9, color: '#555',
  textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'left', fontFamily: 'monospace',
}

// ── Pesos en letras ──────────────────────────────────────────────────────────
function pesosEnLetras(n: number): string {
  const u20 = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
    'diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve']
  const v20 = ['','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco',
    'veintiséis','veintisiete','veintiocho','veintinueve']
  const dec = ['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa']
  const cen = ['','cien','doscientos','trescientos','cuatrocientos','quinientos',
    'seiscientos','setecientos','ochocientos','novecientos']

  function s100(n: number): string {
    if (n <= 0) return ''
    if (n < 20) return u20[n]
    if (n < 30) return n === 20 ? 'veinte' : v20[n - 20]
    const t = Math.floor(n/10), r = n%10
    return dec[t] + (r ? ' y ' + u20[r] : '')
  }
  function s1000(n: number): string {
    if (n <= 0) return ''
    const h = Math.floor(n/100), r = n%100
    if (n === 100) return 'cien'
    return [h > 0 ? cen[h] : '', r > 0 ? s100(r) : ''].filter(Boolean).join(' ')
  }

  const int  = Math.floor(n)
  const cts  = Math.round((n - int) * 100)
  const mil  = Math.floor(int / 1000000)
  const mile = Math.floor((int % 1000000) / 1000)
  const rem  = int % 1000

  const parts: string[] = []
  if (mil  > 0) parts.push(mil  === 1 ? 'un millón'         : s1000(mil)  + ' millones')
  if (mile > 0) parts.push(mile === 1 ? 'mil'               : s1000(mile) + ' mil')
  if (rem  > 0) parts.push(s1000(rem))

  const str = parts.join(' ') || 'cero'
  const cap = str.charAt(0).toUpperCase() + str.slice(1)
  return `Son pesos ${cap}${cts > 0 ? ` con ${cts}/100` : ''}.`
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
      <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'monospace' }}>{label}</div>
      <div style={{ marginTop: 1 }}>
        <span style={{ fontSize: accent ? 16 : 13, fontWeight: 700, color: accent ? '#F5C300' : '#bbb', fontFamily: 'monospace' }}>{value}</span>
        <span style={{ fontSize: 10, color: '#444', marginLeft: 3, fontFamily: 'monospace' }}>{unit}</span>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 14, color: '#666', fontFamily: 'monospace', marginBottom: 6 }}>{children}</div>
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

  const Bb     = Bc + 2 * H * m
  const A      = (Bc + Bb) / 2 * H
  const Vneto  = A * L
  const Vbanco = Vneto / (Fc / 100)
  const Vesp   = Vbanco * (1 + Fe / 100)
  const W      = Vbanco * rho

  // Sincronizar params con ref del padre (para transferencia a Planta y Guardar Obra)
  useEffect(() => {
    if (paramsRef) paramsRef.current = { H, Bc, m, rho, Fe, Fc, W_t: W, L_m: L }
  }, [paramsRef, L, H, Bc, m, rho, Fe, Fc, W])
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

  const Bb  = Bf + 2 * H * m
  const A   = (Bf + Bb) / 2 * H
  const Vc  = A * L
  const Ves = Vc * (1 + Fe / 100)
  const W   = Vc * rho

  useEffect(() => {
    if (paramsRef) paramsRef.current = { H, Bf, m, rho, Fe, W_t: W, L_m: L }
  }, [paramsRef, L, H, Bf, m, rho, Fe, W])
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

  const V   = L * An * E
  const W   = V * rho

  useEffect(() => {
    if (paramsRef) paramsRef.current = { An, E, rho, W_t: W, L_m: L }
  }, [paramsRef, L, An, E, rho, W])
  const fmt = (n: number) => Math.round(n).toLocaleString('es-AR')
  const color = CLR.ripio

  return (
    <div style={{ display: 'flex', gap: 10, height: '100%' }}>
      {/* Panel izquierdo */}
      <div style={{ ...panel, width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
        <SectionTitle>Dimensiones</SectionTitle>
        <Inp label="Ancho"    unit="m"    value={An}  onChange={setAn}  step={0.5} />
        <Inp label="Espesor"  unit="m"    value={E}   onChange={setE}   step={0.01} />
        <div style={secLabel}>Material</div>
        <Inp label="Densidad" unit="t/m³" value={rho} onChange={setRho} step={0.05} min={1.5} />

        <div style={{ marginTop: 16, borderTop: '1px solid #1a1a1a', paddingTop: 12 }}>
          <div style={{ fontSize: 8, color: '#444', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Longitud medida
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: L > 0 ? color : '#333', marginBottom: 2 }}>
            {fmt(L)} <span style={{ fontSize: 11, fontWeight: 400, color: '#444' }}>m</span>
          </div>
          {L >= 1000 && (
            <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>
              {(L/1000).toFixed(3)} km
            </div>
          )}
        </div>

        <div style={{ marginTop: 'auto', borderTop: '1px solid #1a1a1a', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Res label="Volumen"   value={fmt(V)} unit="m³" />
          <Res label="Toneladas" value={fmt(W)} unit="t" accent />
          <div style={{ fontSize: 9, color: '#333', fontFamily: 'monospace', lineHeight: 1.7, marginTop: 4 }}>
            Camiones 15t: ~{Math.ceil(W/15).toLocaleString('es-AR')}<br/>
            Camiones 20t: ~{Math.ceil(W/20).toLocaleString('es-AR')}
          </div>
        </div>
      </div>

      {/* Mapa */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <InlineLineDraw
          color={color}
          onConfirm={(lengthM) => { setL(Math.round(lengthM)) }}
        />
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

  // Transferir params geométricos + cantidad para Planta y Guardar Obra
  useEffect(() => {
    if (paramsRef) paramsRef.current = { H, Bf: tipo === 'triangular' ? 0 : Bf, m, rho, Fe, W_t: W, L_m: L }
  }, [paramsRef, L, H, tipo, Bf, m, rho, Fe, W])
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
const CLR_DESM = '#66BB6A'
const RUTA_PALETTE = ['#66BB6A','#42a5f5','#FFA726','#EC407A','#AB47BC','#26C6DA','#D4E157','#FF7043']

interface DesmEntry { id: string; ha: number; side: 'izq' | 'der'; pts?: [number,number][] }
interface TramoDesm {
  id: string; ruta: string; lados: 1 | 2
  progMode: 'auto' | 'manual'
  desdeIzq: number; hastaIzq: number; anchoIzq: number
  desdeDer: number; hastaDer: number; anchoDer: number
  coords: [number, number][]   // polilínea georreferenciada del tramo
  longGeo: number              // longitud geodésica calculada desde coords (m)
}
interface EquipoAP     { id: string; nombre: string; hp: number; valor: number }
interface MORigAP      { id: string; cargo: string; n: number; tarifa: number; coef: number; hs: number }

function CalcDesmalezado({ paramsRef, onGuardarObra, initialData }: { paramsRef?: React.MutableRefObject<Params>; onGuardarObra?: (d: GuardarObraData) => void; initialData?: Record<string, unknown> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _i: any = initialData ?? {}

  const [method,        setMethod]        = useState<'formula' | 'mapa'>(_i.method ?? 'formula')
  const [view,          setView]          = useState<'computo' | 'jornales' | 'presupuesto'>('computo')
  const [mapaActivated, setMapaActivated] = useState(false)  // lazy-mount: nunca desmontar InlineMapDraw

  // Fórmula — tramos
  const [tramos,      setTramos]      = useState<TramoDesm[]>(_i.tramos ?? [])
  const [fmRuta,      setFmRuta]      = useState(_i.fmRuta ?? 'RP 1')
  const [fmLados,     setFmLados]     = useState<1 | 2>(_i.fmLados ?? 2)
  const [fmDesdeIzq,  setFmDesdeIzq]  = useState(_i.fmDesdeIzq ?? 0)
  const [fmHastaIzq,  setFmHastaIzq]  = useState(_i.fmHastaIzq ?? 3000)
  const [fmAnchoIzq,  setFmAnchoIzq]  = useState(_i.fmAnchoIzq ?? 3)
  const [fmDesdeDer,  setFmDesdeDer]  = useState(_i.fmDesdeDer ?? 0)
  const [fmHastaDer,  setFmHastaDer]  = useState(_i.fmHastaDer ?? 3000)
  const [fmAnchoDer,  setFmAnchoDer]  = useState(_i.fmAnchoDer ?? 3)
  const [fmProgMode,    setFmProgMode]    = useState<'auto'|'manual'>(_i.fmProgMode ?? 'auto')
  const [pendingCoords, setPendingCoords] = useState<[number,number][]>([])
  const [pendingLong,   setPendingLong]   = useState(0)

  // Mapa/drone
  const [mapEntries, setMapEntries] = useState<DesmEntry[]>(_i.mapEntries ?? [])

  // ── Análisis de Precio ──────────────────────────────────────────────────────
  const [apEquipos,      setApEquipos]      = useState<EquipoAP[]>(_i.apEquipos ?? [
    { id: 'tr', nombre: 'Tractor 120 HP',       hp: 120, valor: 120235050 },
    { id: 'dm', nombre: 'Desmalezadora 4,20 m', hp: 0,   valor: 38125815  },
    { id: 'mg', nombre: 'Motoguadaña 1 HP',     hp: 0,   valor: 500000    },
  ])
  const [apVidaHs,       setApVidaHs]       = useState(_i.apVidaHs       ?? 10000)
  const [apHsDia,        setApHsDia]        = useState(_i.apHsDia        ?? 8)
  const [apHsAnio,       setApHsAnio]       = useState(_i.apHsAnio       ?? 2000)
  const [apI,            setApI]            = useState(_i.apI            ?? 0.12)
  const [apPctRep,       setApPctRep]       = useState(_i.apPctRep       ?? 80)
  const [apConsDiesel,   setApConsDiesel]   = useState(_i.apConsDiesel   ?? 0.16)
  const [apPrecioDiesel, setApPrecioDiesel] = useState(_i.apPrecioDiesel ?? 2121)
  const [apConsNafta,    setApConsNafta]    = useState(_i.apConsNafta    ?? 1)
  const [apPrecioNafta,  setApPrecioNafta]  = useState(_i.apPrecioNafta  ?? 2757)
  const [apPctLub,       setApPctLub]       = useState(_i.apPctLub       ?? 30)
  const [apMO,           setApMO]           = useState<MORigAP[]>(_i.apMO ?? [
    { id: 'oe', cargo: 'Oficial Esp.', n: 1, tarifa: 0, coef: 0, hs: 8 },
    { id: 'ay', cargo: 'Ayudante',     n: 1, tarifa: 0, coef: 0, hs: 8 },
  ])
  const [apPctEqMen,     setApPctEqMen]     = useState(_i.apPctEqMen     ?? 8)
  const [apPctGG,        setApPctGG]        = useState(_i.apPctGG        ?? 15)
  const [apRendHa,       setApRendHa]       = useState(_i.apRendHa       ?? 90)
  const [apRendDias,     setApRendDias]     = useState(_i.apRendDias     ?? 5)
  const [apAdoptado,     setApAdoptado]     = useState(_i.apAdoptado     ?? 37848)

  // ── Computed AP ──────────────────────────────────────────────────────────────
  const apTotalV     = apEquipos.reduce((s, e) => s + e.valor, 0)
  const apHPDiesel   = apEquipos.filter(e => e.hp > 1).reduce((s, e) => s + e.hp, 0)
  const apAmort      = apTotalV * apHsDia / apVidaHs
  const apInteres    = apTotalV * apI * apHsDia / (2 * apHsAnio)
  const apAI         = apAmort + apInteres
  const apRep        = apPctRep / 100 * apAmort
  const apCombDiesel = apHPDiesel * apConsDiesel * apHsDia * apPrecioDiesel
  const apCombNafta  = apConsNafta * apHsDia * apPrecioNafta
  const apCombTotal  = apCombDiesel + apCombNafta
  const apLub        = apPctLub / 100 * apCombTotal
  const apMOTotal    = apMO.reduce((s, r) => s + r.n * r.tarifa * r.coef * r.hs, 0)
  const apSubtotal   = apRep + apCombTotal + apLub + apMOTotal
  const apEqMen      = apPctEqMen / 100 * apSubtotal
  const apGG         = apPctGG  / 100 * apSubtotal
  const apCDE        = apSubtotal + apEqMen + apGG
  const apRendDiaHa  = apRendHa / apRendDias
  const apCU         = apRendDiaHa > 0 ? apCDE / apRendDiaHa : 0

  // ── Cómputo derivados (deben estar antes del bloque presupuesto) ─────────────
  const tramoHa = (t: TramoDesm) => {
    const Lizq = t.hastaIzq - t.desdeIzq
    const Lder = t.hastaDer - t.desdeDer
    return Lizq * t.anchoIzq / 10000 + (t.lados === 2 ? Lder * t.anchoDer / 10000 : 0)
  }
  const tramoHaIzq = (t: TramoDesm) => (t.hastaIzq - t.desdeIzq) * t.anchoIzq / 10000
  const tramoHaDer = (t: TramoDesm) => t.lados === 2 ? (t.hastaDer - t.desdeDer) * t.anchoDer / 10000 : 0
  const formulaHaEarly = tramos.reduce((s, t) => s + tramoHa(t), 0)
  const mapaHaEarly    = mapEntries.reduce((s, e) => s + e.ha, 0)

  // ── Presupuesto state ────────────────────────────────────────────────────────
  const [prespPlazo,     setPrespPlazo]     = useState(_i.prespPlazo     ?? 6)
  const [prespPctDVP,    setPrespPctDVP]    = useState(_i.prespPctDVP    ?? 80)
  const [prespDescTramo, setPrespDescTramo] = useState(_i.prespDescTramo ?? 'Ruta Prov. Nº 1 y 3')

  // Ha por lado para presupuesto
  const haIzqPres = method === 'formula'
    ? tramos.reduce((a, t) => a + tramoHaIzq(t), 0)
    : mapEntries.filter(e => e.side === 'izq').reduce((a, e) => a + e.ha, 0)
  const haDerPres = method === 'formula'
    ? tramos.reduce((a, t) => a + tramoHaDer(t), 0)
    : mapEntries.filter(e => e.side === 'der').reduce((a, e) => a + e.ha, 0)

  const parcIzq      = haIzqPres * apAdoptado
  const parcDer      = haDerPres * apAdoptado
  const subtotalPres = parcIzq + parcDer
  const totalPres    = subtotalPres * prespPlazo
  const montoDVP     = totalPres * prespPctDVP / 100
  const montoCCC     = totalPres * (100 - prespPctDVP) / 100

  const color   = CLR_DESM
  const mapaHa  = mapEntries.reduce((s, e) => s + e.ha, 0)
  const Sup_ha  = method === 'formula' ? formulaHaEarly : mapaHa
  const fmt     = (n: number) => Math.round(n).toLocaleString('es-AR')

  useEffect(() => {
    if (paramsRef) paramsRef.current = { ha: formulaHaEarly }
  }, [paramsRef, formulaHaEarly])

  const addTramo = () => {
    if (fmHastaIzq <= fmDesdeIzq || !fmRuta.trim()) return
    if (fmLados === 2 && fmHastaDer <= fmDesdeDer) return
    setTramos(prev => [...prev, {
      id: Math.random().toString(36).slice(2, 8),
      ruta: fmRuta.trim(),
      lados: fmLados,
      progMode: fmProgMode,
      desdeIzq: fmDesdeIzq, hastaIzq: fmHastaIzq, anchoIzq: fmAnchoIzq,
      desdeDer: fmDesdeDer, hastaDer: fmHastaDer,  anchoDer: fmAnchoDer,
      coords: pendingCoords,
      longGeo: pendingLong,
    }])
    setPendingCoords([])
    setPendingLong(0)
    setFmDesdeIzq(fmHastaIzq)
    setFmHastaIzq(fmHastaIzq + 3000)
    setFmDesdeDer(fmHastaDer)
    setFmHastaDer(fmHastaDer + 3000)
  }

  // Callback que recibe coords + longitud desde DesmMapPanel
  const handleLineDone = (coords: [number, number][], lengthM: number) => {
    setPendingCoords(coords)
    setPendingLong(lengthM)
    if (fmProgMode === 'auto') {
      // Propagar longitud al lado izquierdo (base)
      setFmHastaIzq(Math.round(fmDesdeIzq + lengthM))
      if (fmLados === 2) setFmHastaDer(Math.round(fmDesdeDer + lengthM))
    }
  }

  // Helpers de color por ruta y lista de tramos para el mapa
  const rutasUnicas = [...new Set(tramos.map(t => t.ruta))]
  const getRutaColor = (ruta: string): string => {
    const idx = rutasUnicas.indexOf(ruta)
    return RUTA_PALETTE[idx % RUTA_PALETTE.length]
  }
  const tramosMap: TramoForMap[] = tramos
    .filter(t => t.coords.length >= 2)
    .map(t => ({
      id:     t.id,
      coords: t.coords,
      color:  getRutaColor(t.ruta),
      label:  `${t.ruta} – ${(t.desdeIzq / 1000).toFixed(1)} km`,
    }))
  const sColor = (s: 'izq' | 'der') => s === 'izq' ? '#66bb6a' : '#42a5f5'
  const mono: React.CSSProperties = { fontFamily: 'monospace' }

  const W_SVG = 420, H_SVG = 180
  const cx = W_SVG / 2
  const roadW_px = 130, bankW_px = 66
  const roadY = 28, roadH = 122

  const subTabs = [
    { id: 'computo'     as const, label: 'Cómputo' },
    { id: 'jornales'    as const, label: 'Análisis de Precio' },
    { id: 'presupuesto' as const, label: 'Presupuesto' },
  ]

  const METHODS = [
    { id: 'formula' as const, label: '∑ Fórmula' },
    { id: 'mapa'    as const, label: '◈ Dibujar'  },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Sub-tab bar + method toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {subTabs.map(st => (
            <button key={st.id} onClick={() => setView(st.id)}
              style={{
                padding: '4px 12px', fontSize: 10, fontFamily: 'monospace', cursor: 'pointer',
                border: `1px solid ${view === st.id ? color + '88' : '#1e1e1e'}`,
                background: view === st.id ? `${color}18` : '#0a0a0a',
                color: view === st.id ? color : '#555', borderRadius: 2,
              }}>
              {st.label}
            </button>
          ))}
        </div>

        {view === 'computo' && (
          <>
            <div style={{ width: 1, height: 16, background: '#222' }} />
            <div style={{ display: 'flex', gap: 2 }}>
              {METHODS.map(m => (
                <button key={m.id} onClick={() => { if (m.id === 'mapa') setMapaActivated(true); setMethod(m.id) }}
                  style={{
                    padding: '4px 10px', fontSize: 9, ...mono, cursor: 'pointer',
                    border: `1px solid ${method === m.id ? color + '66' : '#1a1a1a'}`,
                    background: method === m.id ? `${color}15` : '#080808',
                    color: method === m.id ? color : '#444', borderRadius: 2,
                  }}>
                  {m.label}
                </button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ fontFamily: 'monospace', fontSize: 11 }}>
              <span style={{ color: '#555' }}>Sup. total</span>
              <span style={{ color, fontWeight: 700, marginLeft: 8, fontSize: 13 }}>{Sup_ha.toFixed(4)} ha</span>
            </div>
          </>
        )}
        {view !== 'computo' && <div style={{ flex: 1 }} />}
        {totalPres > 0 && onGuardarObra && (
          <button
            onClick={() => onGuardarObra({
              tipo: 'limpieza',
              cantidad: formulaHaEarly > 0 ? formulaHaEarly : mapaHaEarly,
              unidad: 'ha',
              presupuesto_total: totalPres,
              aporte_dvp: montoDVP,
              aporte_ccc: montoCCC,
              precio_unitario: apAdoptado,
              coordsLinea: tramos.flatMap(t => t.coords.map(([lat, lng]) => ({ lat, lng }))),
              datos_calculadora: {
                calculadora: 'desmalezado',
                // ── Inputs (para restaurar estado al editar) ──────────────
                inputs: {
                  method,
                  tramos,
                  mapEntries,
                  fmRuta, fmLados, fmProgMode,
                  fmDesdeIzq, fmHastaIzq, fmAnchoIzq,
                  fmDesdeDer, fmHastaDer, fmAnchoDer,
                  apEquipos, apVidaHs, apHsDia, apHsAnio, apI, apPctRep,
                  apConsDiesel, apPrecioDiesel, apConsNafta, apPrecioNafta,
                  apPctLub, apMO, apPctEqMen, apPctGG,
                  apRendHa, apRendDias, apAdoptado,
                  prespPlazo, prespPctDVP, prespDescTramo,
                },
                // ── Cómputo ───────────────────────────────────────────────
                computo: {
                  method,
                  Sup_ha,
                  haIzq: haIzqPres,
                  haDer: haDerPres,
                  tramos: tramos.map(t => ({
                    ...t,
                    haIzq: tramoHaIzq(t),
                    haDer: tramoHaDer(t),
                    ha:    tramoHa(t),
                    longIzq: t.hastaIzq - t.desdeIzq,
                    longDer: t.hastaDer - t.desdeDer,
                  })),
                  mapEntries,
                },
                // ── Análisis de Precios ───────────────────────────────────
                analisis_precio: {
                  equipos:     apEquipos,
                  mo:          apMO,
                  totalV:      apTotalV,
                  hpDiesel:    apHPDiesel,
                  hsDia:       apHsDia,
                  amort:       apAmort,
                  interes:     apInteres,
                  ai:          apAI,
                  pctRep:      apPctRep,
                  rep:         apRep,
                  consDiesel:  apConsDiesel,
                  precioDiesel:apPrecioDiesel,
                  combDiesel:  apCombDiesel,
                  consNafta:   apConsNafta,
                  precioNafta: apPrecioNafta,
                  combNafta:   apCombNafta,
                  combTotal:   apCombTotal,
                  pctLub:      apPctLub,
                  lub:         apLub,
                  moTotal:     apMOTotal,
                  subtotal:    apSubtotal,
                  pctEqMen:    apPctEqMen,
                  eqMen:       apEqMen,
                  pctGG:       apPctGG,
                  gg:          apGG,
                  cde:         apCDE,
                  rendHa:      apRendHa,
                  rendDias:    apRendDias,
                  rendDiaHa:   apRendDiaHa,
                  cu:          apCU,
                  adoptado:    apAdoptado,
                },
                // ── Presupuesto ───────────────────────────────────────────
                presupuesto: {
                  descTramo:  prespDescTramo,
                  haIzq:      haIzqPres,
                  haDer:      haDerPres,
                  precioUnit: apAdoptado,
                  parcIzq,
                  parcDer,
                  subtotal:   subtotalPres,
                  plazo:      prespPlazo,
                  total:      totalPres,
                  dvpPct:     prespPctDVP,
                  dvp:        montoDVP,
                  ccc:        montoCCC,
                },
              },
            })}
            style={{ padding: '4px 14px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
              letterSpacing: 0.8, cursor: 'pointer', border: '1px solid #F5C300',
              background: '#F5C30022', color: '#F5C300', borderRadius: 2 }}
          >
            💾 Guardar obra
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0 }}>

        {/* ── Cómputo — Fórmula (tramos por progresivas) ── */}
        {view === 'computo' && method === 'formula' && (
          <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr 148px', gap: 10, height: '100%' }}>

            {/* Panel izquierdo: formulario de tramo */}
            <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
              <SectionTitle>Agregar tramo</SectionTitle>
              <div>
                <span style={lbl}>Ruta</span>
                <input value={fmRuta} onChange={e => setFmRuta(e.target.value)}
                  placeholder="ej. RP 1"
                  style={{ width: '100%', boxSizing: 'border-box', background: '#0a0a0a', border: '1px solid #222',
                    color: '#ccc', padding: '5px 8px', fontSize: 11, ...mono, borderRadius: 2, outline: 'none' }} />
              </div>
              <div>
                <span style={lbl}>Lados</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {([1, 2] as const).map(l => (
                    <button key={l} onClick={() => setFmLados(l)}
                      style={{ flex: 1, padding: '5px 4px', fontSize: 11, ...mono, cursor: 'pointer',
                        borderRadius: 2, border: `1px solid ${fmLados === l ? color : '#222'}`,
                        background: fmLados === l ? `${color}22` : '#080808',
                        color: fmLados === l ? color : '#555' }}>
                      {l} {l === 1 ? 'lado' : 'lados'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Modo de progresivas */}
              <div>
                <span style={lbl}>Progresivas</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['auto', 'manual'] as const).map(m => (
                    <button key={m} onClick={() => setFmProgMode(m)}
                      style={{ flex: 1, padding: '5px 4px', fontSize: 11, ...mono, cursor: 'pointer',
                        borderRadius: 2, border: `1px solid ${fmProgMode === m ? color : '#222'}`,
                        background: fmProgMode === m ? `${color}22` : '#080808',
                        color: fmProgMode === m ? color : '#555' }}>
                      {m === 'auto' ? '↗ Auto' : '✎ Manual'}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: '#444', ...mono, marginTop: 3, lineHeight: 1.4 }}>
                  {fmProgMode === 'auto'
                    ? 'La longitud del trazado llena las progresivas'
                    : 'Progresivas manuales; trazado solo visual'}
                </div>
              </div>

              {/* Estado de tramo pendiente */}
              {pendingCoords.length >= 2 && (
                <div style={{ fontSize: 9, ...mono, color, padding: '4px 8px',
                  background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>↗ {(pendingLong / 1000).toFixed(3)} km trazados</span>
                  <button onClick={() => { setPendingCoords([]); setPendingLong(0) }}
                    style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 9 }}>✕</button>
                </div>
              )}

              {/* Lado Izquierdo */}
              <div style={{ borderLeft: `2px solid ${sColor('izq')}`, paddingLeft: 8, marginTop: 4 }}>
                <div style={{ fontSize: 8, color: sColor('izq'), ...mono, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Lado Izquierdo</div>
                <Inp label="Prog. desde" unit="m" value={fmDesdeIzq} onChange={setFmDesdeIzq} step={100} min={0} />
                <Inp label="Prog. hasta" unit="m" value={fmHastaIzq} onChange={setFmHastaIzq} step={100} min={0} />
                <div style={{ fontSize: 9, ...mono, color: '#555', marginTop: -2, marginBottom: 4 }}>
                  Long: {fmHastaIzq > fmDesdeIzq ? ((fmHastaIzq - fmDesdeIzq) / 1000).toFixed(3) : '0.000'} km
                </div>
                <Inp label="Ancho banquina" unit="m" value={fmAnchoIzq} onChange={setFmAnchoIzq} step={0.5} min={0.5} />
                {fmHastaIzq > fmDesdeIzq && (
                  <div style={{ fontSize: 9, ...mono, color: sColor('izq'), marginTop: 2 }}>
                    = {((fmHastaIzq - fmDesdeIzq) * fmAnchoIzq / 10000).toFixed(4)} ha
                  </div>
                )}
              </div>

              {/* Lado Derecho */}
              {fmLados === 2 && (
                <div style={{ borderLeft: `2px solid ${sColor('der')}`, paddingLeft: 8, marginTop: 4 }}>
                  <div style={{ fontSize: 8, color: sColor('der'), ...mono, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Lado Derecho</div>
                  <Inp label="Prog. desde" unit="m" value={fmDesdeDer} onChange={setFmDesdeDer} step={100} min={0} />
                  <Inp label="Prog. hasta" unit="m" value={fmHastaDer} onChange={setFmHastaDer} step={100} min={0} />
                  <div style={{ fontSize: 9, ...mono, color: '#555', marginTop: -2, marginBottom: 4 }}>
                    Long: {fmHastaDer > fmDesdeDer ? ((fmHastaDer - fmDesdeDer) / 1000).toFixed(3) : '0.000'} km
                  </div>
                  <Inp label="Ancho banquina" unit="m" value={fmAnchoDer} onChange={setFmAnchoDer} step={0.5} min={0.5} />
                  {fmHastaDer > fmDesdeDer && (
                    <div style={{ fontSize: 9, ...mono, color: sColor('der'), marginTop: 2 }}>
                      = {((fmHastaDer - fmDesdeDer) * fmAnchoDer / 10000).toFixed(4)} ha
                    </div>
                  )}
                </div>
              )}

              {/* Preview total */}
              {fmHastaIzq > fmDesdeIzq && (
                <div style={{ fontSize: 9, ...mono, color, padding: '4px 8px', background: '#0a0a0a',
                  borderRadius: 2, border: `1px solid ${color}22`, lineHeight: 1.7, marginTop: 4 }}>
                  <strong>Total tramo: {(
                    (fmHastaIzq - fmDesdeIzq) * fmAnchoIzq / 10000 +
                    (fmLados === 2 && fmHastaDer > fmDesdeDer ? (fmHastaDer - fmDesdeDer) * fmAnchoDer / 10000 : 0)
                  ).toFixed(4)} ha</strong>
                </div>
              )}
              <button onClick={addTramo}
                style={{ padding: '7px', fontSize: 11, ...mono, cursor: 'pointer', borderRadius: 2,
                  border: `1px solid ${color}66`, background: `${color}15`, color, fontWeight: 700, marginTop: 4 }}>
                + Agregar tramo
              </button>

              {tramos.length > 0 && (
                <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 10, marginTop: 6 }}>
                  <div style={{ fontSize: 8, color: '#444', ...mono, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    Resumen por lado
                  </div>
                  {(['izq', 'der'] as const).map(s => {
                    const haS = s === 'izq'
                      ? tramos.reduce((a, t) => a + tramoHaIzq(t), 0)
                      : tramos.filter(t => t.lados === 2).reduce((a, t) => a + tramoHaDer(t), 0)
                    return haS > 0 ? (
                      <div key={s} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, ...mono, marginBottom: 4 }}>
                        <span style={{ color: sColor(s) }}>{s === 'izq' ? 'Izquierdo' : 'Derecho'}</span>
                        <span style={{ color: '#aaa' }}>{haS.toFixed(4)} ha</span>
                      </div>
                    ) : null
                  })}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, ...mono,
                    fontWeight: 700, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${color}33` }}>
                    <span style={{ color: '#666' }}>Total</span>
                    <span style={{ color }}>{Sup_ha.toFixed(4)} ha</span>
                  </div>
                  <button onClick={() => setTramos([])}
                    style={{ marginTop: 10, width: '100%', padding: '4px', fontSize: 9, ...mono,
                      cursor: 'pointer', borderRadius: 2, border: '1px solid #1a1a1a',
                      background: '#080808', color: '#333' }}>
                    ✕ Limpiar todo
                  </button>
                </div>
              )}
            </div>

            {/* Panel central: mapa + tabla compacta */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
              {/* Mapa Leaflet multi-tramo */}
              <div style={{ flex: 1, minHeight: 0, borderRadius: 3, overflow: 'hidden' }}>
                <DesmMapPanel
                  tramosMap={tramosMap}
                  pendingColor={fmRuta ? getRutaColor(fmRuta) : color}
                  onLineDone={handleLineDone}
                />
              </div>
              {/* Tabla de tramos compacta */}
              <div style={{ ...panel, maxHeight: 140, overflowY: 'auto', flexShrink: 0 }}>
                {tramos.length === 0 ? (
                  <div style={{ padding: '8px', ...mono, fontSize: 9, color: '#333', textAlign: 'center' }}>
                    Trazá un tramo en el mapa y agregalo desde el panel izquierdo
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', ...mono, fontSize: 10 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #222' }}>
                        <th style={th} />
                        <th style={th}>Ruta</th>
                        <th style={{ ...th, textAlign: 'left' }}>Progresivas (desde – hasta)</th>
                        <th style={{ ...th, textAlign: 'right' }}>Long.</th>
                        <th style={{ ...th, textAlign: 'center' }}>Lados</th>
                        <th style={{ ...th, textAlign: 'right' }}>Ancho banq.</th>
                        <th style={th} />
                        <th style={{ ...th, textAlign: 'right' }}>Sup. (ha)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rutasUnicas.map(ruta => {
                        const rutaTramos = tramos.filter(t => t.ruta === ruta)
                        const rutaHa = rutaTramos.reduce((a, t) => a + tramoHa(t), 0)
                        return (
                          <React.Fragment key={`ruta-${ruta}`}>
                            <tr>
                              <td colSpan={10} style={{ padding: '10px 8px 2px', color, fontWeight: 700, fontSize: 10 }}>
                                {ruta}
                              </td>
                            </tr>
                            {rutaTramos.map((t, i) => {
                              const ha = tramoHa(t)
                              return (
                                <tr key={t.id} style={{ background: i % 2 === 0 ? '#080808' : 'transparent' }}>
                                  <td style={{ padding: '2px 4px 2px 8px' }}>
                                    <button onClick={() => setTramos(p => p.filter(x => x.id !== t.id))}
                                      title="Eliminar"
                                      style={{ background: 'none', border: 'none', color: '#2a2a2a', cursor: 'pointer', fontSize: 9, padding: 0 }}>✕</button>
                                  </td>
                                  <td style={{ padding: '2px 8px', color: '#555', fontSize: 9 }}>{ruta}</td>
                                  <td style={{ padding: '2px 4px', fontSize: 9 }}>
                                    <div style={{ color: sColor('izq') }}>
                                      {t.desdeIzq > 0 ? fmt(t.desdeIzq) : '0'} – {fmt(t.hastaIzq)} m
                                    </div>
                                    {t.lados === 2 && (
                                      <div style={{ color: sColor('der') }}>
                                        {t.desdeDer > 0 ? fmt(t.desdeDer) : '0'} – {fmt(t.hastaDer)} m
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: '2px 4px', fontSize: 9, textAlign: 'right' }}>
                                    <div style={{ color: sColor('izq') }}>{fmt(t.hastaIzq - t.desdeIzq)} m</div>
                                    {t.lados === 2 && <div style={{ color: sColor('der') }}>{fmt(t.hastaDer - t.desdeDer)} m</div>}
                                  </td>
                                  <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                                    <span style={{ color: sColor('izq'), fontSize: 8 }}>IZQ</span>
                                    {t.lados === 2 && <><span style={{ color: '#333', margin: '0 2px' }}>+</span><span style={{ color: sColor('der'), fontSize: 8 }}>DER</span></>}
                                  </td>
                                  <td style={{ padding: '2px 4px', fontSize: 9, textAlign: 'right' }}>
                                    <div style={{ color: sColor('izq') }}>{t.anchoIzq} m</div>
                                    {t.lados === 2 && <div style={{ color: sColor('der') }}>{t.anchoDer} m</div>}
                                  </td>
                                  <td style={{ padding: '2px 8px', color: '#aaa', textAlign: 'right' }}>{ha.toFixed(4)}</td>
                                </tr>
                              )
                            })}
                            <tr style={{ borderTop: `1px solid ${color}22` }}>
                              <td colSpan={7} style={{ padding: '3px 8px', textAlign: 'right', fontSize: 9, color: '#444' }}>
                                Total {ruta}
                              </td>
                              <td style={{ padding: '3px 8px 8px', textAlign: 'right', color: '#888', fontWeight: 700 }}>
                                {rutaHa.toFixed(4)}
                              </td>
                            </tr>
                          </React.Fragment>
                        )
                      })}
                      {Sup_ha > 0 && (
                        <tr style={{ borderTop: `2px solid ${color}55` }}>
                          <td colSpan={7} style={{ padding: '8px', textAlign: 'right', fontSize: 12, color: '#666', fontWeight: 700 }}>
                            TOTAL GENERAL
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', color, fontSize: 14, fontWeight: 700 }}>
                            {Sup_ha.toFixed(4)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Panel computo */}
            <div style={panel}>
              <SectionTitle>Cómputo</SectionTitle>
              <Res label="Hectáreas total" value={Sup_ha.toFixed(4)} unit="ha" accent />
              {Sup_ha > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#555', ...mono, lineHeight: 1.9 }}>
                  <div style={{ color: sColor('izq') }}>Izq: {haIzqPres.toFixed(4)} ha</div>
                  <div style={{ color: sColor('der') }}>Der: {haDerPres.toFixed(4)} ha</div>
                  <div style={{ color: '#444', marginTop: 4 }}>
                    {tramos.length} tramo{tramos.length !== 1 ? 's' : ''}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Cómputo — Mapa/Drone ── lazy-mount: nunca desmontar una vez activado */}
        {mapaActivated && (
          <div style={{ display: view === 'computo' && method === 'mapa' ? 'flex' : 'none', gap: 10, height: '100%', minHeight: 0 }}>

            {/* Panel izquierdo: superficie por lado */}
            <div style={{ ...panel, width: 200, flexShrink: 0, overflowY: 'auto' }}>
              <SectionTitle>Superficie por lado</SectionTitle>
              {mapEntries.length === 0 && (
                <div style={{ fontSize: 9, color: '#333', fontFamily: 'monospace', lineHeight: 1.8, marginTop: 4 }}>
                  Dibujá polígonos en el mapa para agregar superficies.
                  <br /><br />
                  <span style={{ color: '#2a2a2a' }}>Ideal para relevamiento con drone (mayor exactitud).</span>
                </div>
              )}
              {(['izq', 'der'] as const).map(s => {
                const entries  = mapEntries.filter(e => e.side === s)
                const sColor   = s === 'izq' ? '#66bb6a' : '#42a5f5'
                const sLbl     = s === 'izq' ? 'LADO IZQUIERDO' : 'LADO DERECHO'
                const subtotal = entries.reduce((acc, e) => acc + e.ha, 0)
                return (
                  <div key={s} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 8, color: sColor, letterSpacing: 1, textTransform: 'uppercase',
                      fontFamily: 'monospace', marginBottom: 6 }}>{sLbl}</div>
                    {entries.length === 0
                      ? <div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: 'monospace' }}>Sin polígonos</div>
                      : entries.map((e, i) => (
                          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between',
                            fontSize: 10, fontFamily: 'monospace', marginBottom: 3 }}>
                            <span style={{ color: '#555' }}>Sup. {i + 1}</span>
                            <span style={{ color: '#aaa' }}>{e.ha.toFixed(4)} ha</span>
                          </div>
                        ))
                    }
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11,
                      fontFamily: 'monospace', marginTop: 5, paddingTop: 5, borderTop: '1px solid #1a1a1a' }}>
                      <span style={{ color: '#555' }}>Subtotal {s === 'izq' ? 'Izq.' : 'Der.'}</span>
                      <span style={{ color: sColor, fontWeight: 700 }}>{subtotal.toFixed(4)} ha</span>
                    </div>
                  </div>
                )
              })}
              {mapEntries.length > 0 && (
                <div style={{ borderTop: '1px solid #252525', paddingTop: 8, marginTop: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                    fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}>
                    <span style={{ color: '#777' }}>Total</span>
                    <span style={{ color }}>{Sup_ha.toFixed(4)} ha</span>
                  </div>
                </div>
              )}
            </div>

            {/* Mapa */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <InlineMapDraw
                color={color}
                hideMonte={true}
                onConfirm={(id, side, _monte, area_ha, pts) => {
                  setMapEntries(prev => [...prev, { id, ha: area_ha, side, pts }])
                }}
                onDelete={id => setMapEntries(prev => prev.filter(e => e.id !== id))}
                onUpdate={(id, area_ha, pts) => {
                  setMapEntries(prev => prev.map(e => e.id === id ? { ...e, ha: area_ha, pts } : e))
                }}
              />
            </div>
          </div>
        )}

        {/* ── Análisis de Precio ── */}
        {view === 'jornales' && (
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 10, height: '100%', minHeight: 0 }}>

            {/* LEFT: Inputs */}
            <div style={{ ...panel, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

              <SectionTitle>Equipos</SectionTitle>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, ...mono }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                    <th style={th}>Equipo</th>
                    <th style={{ ...th, textAlign: 'right', width: 36 }}>HP</th>
                    <th style={{ ...th, textAlign: 'right', width: 88 }}>Valor $</th>
                    <th style={{ width: 16 }} />
                  </tr>
                </thead>
                <tbody>
                  {apEquipos.map(eq => (
                    <tr key={eq.id}>
                      <td style={{ padding: '2px 2px' }}>
                        <input value={eq.nombre}
                          onChange={e => setApEquipos(p => p.map(x => x.id === eq.id ? {...x, nombre: e.target.value} : x))}
                          style={{ background: 'none', border: 'none', color: '#999', ...mono, fontSize: 10, width: '100%', outline: 'none' }} />
                      </td>
                      <td style={{ padding: '2px 2px' }}>
                        <input type="number" value={eq.hp}
                          onChange={e => setApEquipos(p => p.map(x => x.id === eq.id ? {...x, hp: +e.target.value} : x))}
                          style={{ background: 'none', border: '1px solid #1a1a1a', color: '#777', ...mono,
                            fontSize: 10, width: 36, textAlign: 'right', padding: '1px 3px', outline: 'none' }} />
                      </td>
                      <td style={{ padding: '2px 2px' }}>
                        <input type="number" value={eq.valor}
                          onChange={e => setApEquipos(p => p.map(x => x.id === eq.id ? {...x, valor: +e.target.value} : x))}
                          style={{ background: 'none', border: '1px solid #1a1a1a', color: '#777', ...mono,
                            fontSize: 10, width: 88, textAlign: 'right', padding: '1px 3px', outline: 'none' }} />
                      </td>
                      <td>
                        <button onClick={() => setApEquipos(p => p.filter(x => x.id !== eq.id))}
                          style={{ background: 'none', border: 'none', color: '#2a2a2a', cursor: 'pointer', fontSize: 9 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <button onClick={() => setApEquipos(p => [...p, { id: Math.random().toString(36).slice(2,6), nombre: 'Equipo nuevo', hp: 0, valor: 0 }])}
                  style={{ fontSize: 9, ...mono, background: 'none', border: '1px solid #1a1a1a', color: '#444', cursor: 'pointer', borderRadius: 2, padding: '2px 8px' }}>
                  + equipo
                </button>
                <span style={{ fontSize: 9, ...mono, color: '#444' }}>
                  {apEquipos.reduce((s,e)=>s+e.hp,0)} HP · ${apTotalV.toLocaleString('es-AR')}
                </span>
              </div>

              <SectionTitle>Vida útil y financiero</SectionTitle>
              <Inp label="Vida útil"       unit="hs"  value={apVidaHs}       onChange={setApVidaHs}       step={500} />
              <Inp label="Hs/día"                     value={apHsDia}        onChange={setApHsDia}        step={1} min={1} />
              <Inp label="Hs/año"                     value={apHsAnio}       onChange={setApHsAnio}       step={100} />
              <Inp label="Interés anual"   unit="%"   value={apI * 100}      onChange={v => setApI(v/100)} step={1} />
              <Inp label="Reparaciones"    unit="% A" value={apPctRep}       onChange={setApPctRep}       step={5} />

              <SectionTitle>Combustibles</SectionTitle>
              <Inp label="Consumo diesel"  unit="L/HP/hs" value={apConsDiesel}   onChange={setApConsDiesel}   step={0.01} />
              <Inp label="Precio diesel"   unit="$/L"     value={apPrecioDiesel} onChange={setApPrecioDiesel} step={100} />
              <div style={secLabel}>Nafta / Mezcla</div>
              <Inp label="Consumo nafta"   unit="L/hs"    value={apConsNafta}    onChange={setApConsNafta}    step={0.1} />
              <Inp label="Precio nafta"    unit="$/L"     value={apPrecioNafta}  onChange={setApPrecioNafta}  step={100} />
              <Inp label="Lubricantes"     unit="% comb"  value={apPctLub}       onChange={setApPctLub}       step={5} />

              <SectionTitle>Mano de Obra</SectionTitle>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, ...mono }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                    <th style={th}>Cargo</th>
                    <th style={{ ...th, textAlign: 'center', width: 20 }}>n</th>
                    <th style={{ ...th, textAlign: 'right', width: 70 }}>$/h</th>
                    <th style={{ ...th, textAlign: 'right', width: 46 }}>Coef.</th>
                  </tr>
                </thead>
                <tbody>
                  {apMO.map(row => (
                    <tr key={row.id}>
                      <td style={{ padding: '2px 2px' }}>
                        <input value={row.cargo}
                          onChange={e => setApMO(p => p.map(x => x.id === row.id ? {...x, cargo: e.target.value} : x))}
                          style={{ background: 'none', border: 'none', color: '#777', ...mono, fontSize: 9, width: '100%', outline: 'none' }} />
                      </td>
                      <td><input type="number" value={row.n}
                        onChange={e => setApMO(p => p.map(x => x.id === row.id ? {...x, n: +e.target.value} : x))}
                        style={{ background: 'none', border: '1px solid #1a1a1a', color: '#666', ...mono, fontSize: 9, width: 20, textAlign: 'center', padding: 1, outline: 'none' }} /></td>
                      <td><input type="number" value={row.tarifa}
                        onChange={e => setApMO(p => p.map(x => x.id === row.id ? {...x, tarifa: +e.target.value} : x))}
                        style={{ background: 'none', border: '1px solid #1a1a1a', color: '#666', ...mono, fontSize: 9, width: 70, textAlign: 'right', padding: '1px 2px', outline: 'none' }} /></td>
                      <td><input type="number" value={row.coef}
                        onChange={e => setApMO(p => p.map(x => x.id === row.id ? {...x, coef: +e.target.value} : x))}
                        style={{ background: 'none', border: '1px solid #1a1a1a', color: '#666', ...mono, fontSize: 9, width: 46, textAlign: 'right', padding: '1px 2px', outline: 'none' }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={() => setApMO(p => [...p, { id: Math.random().toString(36).slice(2,6), cargo: 'Operario', n: 1, tarifa: 0, coef: 0, hs: 8 }])}
                style={{ fontSize: 9, ...mono, background: 'none', border: '1px solid #1a1a1a', color: '#444', cursor: 'pointer', borderRadius: 2, padding: '2px 8px', marginTop: 4, alignSelf: 'flex-start' }}>
                + cargo
              </button>

              <SectionTitle>Gastos</SectionTitle>
              <Inp label="Equipos menores"  unit="%" value={apPctEqMen} onChange={setApPctEqMen} step={1} />
              <Inp label="Gastos generales" unit="%" value={apPctGG}    onChange={setApPctGG}    step={1} />
            </div>

            {/* RIGHT: Breakdown + results */}
            <div style={{ ...panel, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <SectionTitle>ANÁLISIS DE PRECIO — Desmalezado de Banquinas</SectionTitle>

              {/* Equipos summary */}
              <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #111' }}>
                {apEquipos.map(eq => (
                  <div key={eq.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, ...mono, marginBottom: 2 }}>
                    <span style={{ color: '#555' }}>↳ {eq.nombre}{eq.hp > 0 ? ` (${eq.hp} HP)` : ''}</span>
                    <span style={{ color: '#777' }}>$ {eq.valor.toLocaleString('es-AR')}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, ...mono, borderTop: '1px solid #1a1a1a', paddingTop: 4, marginTop: 4 }}>
                  <span style={{ color: '#555' }}>Total {apEquipos.reduce((s,e)=>s+e.hp,0)} HP</span>
                  <span style={{ color: '#aaa', fontWeight: 700 }}>$ {apTotalV.toLocaleString('es-AR')}</span>
                </div>
                <div style={{ fontSize: 8, ...mono, color: '#333', marginTop: 3 }}>
                  Vida útil: {apVidaHs.toLocaleString('es-AR')} hs · {Math.round(apVidaHs/apHsAnio)} años · V. Residual {0}%
                </div>
              </div>

              {/* Cost rows */}
              {[
                { label: 'Amortización e Intereses',
                  sub: `$ ${apTotalV.toLocaleString('es-AR')} × ${apHsDia}/${apVidaHs} + ${apHsDia}×${apI*100}%/(2×${apHsAnio})`,
                  val: apAI, ref: true },
                { label: `Reparación y Repuestos (${apPctRep}% amort.)`,
                  sub: `${apPctRep}% × $ ${Math.round(apAmort).toLocaleString('es-AR')} $/d`,
                  val: apRep },
                { label: `Combustibles — Diesel (${apHPDiesel} HP × ${apConsDiesel} L/HP/hs)`,
                  sub: `${apHPDiesel} × ${apConsDiesel} × ${apHsDia} hs × $ ${apPrecioDiesel.toLocaleString('es-AR')}/L`,
                  val: apCombDiesel },
                { label: `Combustibles — Nafta/Mezcla (${apConsNafta} L/hs)`,
                  sub: `${apConsNafta} × ${apHsDia} hs × $ ${apPrecioNafta.toLocaleString('es-AR')}/L`,
                  val: apCombNafta },
                { label: `Lubricantes (${apPctLub}% de combustibles)`,
                  sub: `${apPctLub}% × $ ${Math.round(apCombTotal).toLocaleString('es-AR')}`,
                  val: apLub },
                { label: 'Mano de Obra',
                  sub: apMO.map(r => `${r.cargo}: ${r.n}×$${r.tarifa}×${r.coef}×${r.hs}hs`).join(' · '),
                  val: apMOTotal },
              ].map(({ label, sub, val, ref }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  fontSize: 10, ...mono, marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid #0d0d0d' }}>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                    <div style={{ color: ref ? '#555' : '#777' }}>{label}</div>
                    {sub && <div style={{ color: '#2a2a2a', fontSize: 8, marginTop: 1 }}>{sub}</div>}
                  </div>
                  <span style={{ color: val > 0 ? (ref ? '#555' : '#aaa') : '#2a2a2a', fontWeight: val > 0 ? 700 : 400, whiteSpace: 'nowrap' }}>
                    $ {Math.round(val).toLocaleString('es-AR')} $/d
                  </span>
                </div>
              ))}

              {/* Subtotal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, ...mono,
                fontWeight: 700, paddingTop: 4, borderTop: '1px solid #222', marginBottom: 8 }}>
                <span style={{ color: '#666' }}>Subtotal</span>
                <span style={{ color: '#aaa' }}>$ {Math.round(apSubtotal).toLocaleString('es-AR')} $/d</span>
              </div>

              {[
                { label: `Incidencia equipos menores (${apPctEqMen}%)`, val: apEqMen },
                { label: `Gastos generales (${apPctGG}%)`,              val: apGG   },
              ].map(({ label, val }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, ...mono, marginBottom: 4 }}>
                  <span style={{ color: '#555' }}>{label}</span>
                  <span style={{ color: '#777' }}>$ {Math.round(val).toLocaleString('es-AR')} $/d</span>
                </div>
              ))}

              {/* CDE */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, ...mono, fontWeight: 700,
                marginTop: 8, paddingTop: 10, borderTop: `1px solid ${color}44`, marginBottom: 18 }}>
                <span style={{ color: '#777' }}>COSTO DIARIO DEL EQUIPO</span>
                <span style={{ color }}>$ {Math.round(apCDE).toLocaleString('es-AR')} $/d</span>
              </div>

              {/* Rendimiento */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, ...mono, color: '#555' }}>Rendimiento:</span>
                <input type="number" value={apRendHa}  onChange={e => setApRendHa(+e.target.value)}
                  style={{ width: 55, background: '#0a0a0a', border: '1px solid #222', color: '#ccc',
                    ...mono, fontSize: 11, padding: '3px 6px', textAlign: 'right', outline: 'none' }} />
                <span style={{ fontSize: 10, ...mono, color: '#444' }}>Ha en</span>
                <input type="number" value={apRendDias} onChange={e => setApRendDias(+e.target.value)}
                  style={{ width: 36, background: '#0a0a0a', border: '1px solid #222', color: '#ccc',
                    ...mono, fontSize: 11, padding: '3px 6px', textAlign: 'right', outline: 'none' }} />
                <span style={{ fontSize: 10, ...mono, color: '#444' }}>días =</span>
                <span style={{ fontSize: 12, ...mono, color: '#888', fontWeight: 700 }}>
                  {apRendDiaHa.toFixed(2)} Ha/d
                </span>
              </div>

              {/* Costo unitario */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, ...mono, marginBottom: 6 }}>
                <span style={{ color: '#666' }}>Costo unitario</span>
                <span style={{ color: '#999' }}>$ {apCU.toFixed(2)} $/Ha</span>
              </div>

              {/* ADOPTADO */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderTop: `2px solid ${color}55`, paddingTop: 14, marginTop: 6 }}>
                <span style={{ fontSize: 13, ...mono, fontWeight: 700, color: '#888' }}>ADOPTADO</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, ...mono, color: '#555' }}>$</span>
                  <input type="number" value={apAdoptado} onChange={e => setApAdoptado(+e.target.value)}
                    style={{ width: 110, background: '#0a0a0a', border: `1px solid ${color}55`, color,
                      ...mono, fontSize: 20, fontWeight: 700, padding: '5px 8px',
                      textAlign: 'right', outline: 'none', borderRadius: 2 }} />
                  <span style={{ fontSize: 11, ...mono, color: '#666' }}>$/Ha</span>
                  <button onClick={() => setApAdoptado(Math.round(apCU))}
                    title="Sincronizar con costo calculado"
                    style={{ fontSize: 9, ...mono, background: `${color}11`, border: `1px solid ${color}33`,
                      color, cursor: 'pointer', padding: '4px 10px', borderRadius: 2 }}>
                    ↺ Recalc.
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Presupuesto ── */}
        {view === 'presupuesto' && (
          <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 10, height: '100%', minHeight: 0 }}>

            {/* LEFT: settings */}
            <div style={{ ...panel, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <SectionTitle>Datos del convenio</SectionTitle>
              <div>
                <span style={lbl}>Tramo / Descripción</span>
                <input value={prespDescTramo} onChange={e => setPrespDescTramo(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', background: '#0a0a0a', border: '1px solid #222',
                    color: '#ccc', padding: '5px 8px', fontSize: 11, ...mono, borderRadius: 2, outline: 'none' }} />
              </div>
              <Inp label="Plazo"         unit="meses" value={prespPlazo}  onChange={setPrespPlazo}  step={1} min={1} />
              <Inp label="Aporte DVP"    unit="%"     value={prespPctDVP} onChange={setPrespPctDVP} step={5} min={0} />
              <div style={{ marginTop: 12, padding: '8px', background: '#0a0a0a', borderRadius: 4, fontSize: 9, ...mono, color: '#444', lineHeight: 1.8 }}>
                Aporte CCC: {100 - prespPctDVP}%<br/>
                Precio unit.: ${apAdoptado.toLocaleString('es-AR')}/Ha
              </div>

              <SectionTitle>Origen de cantidades</SectionTitle>
              <div style={{ fontSize: 9, ...mono, color: '#444', lineHeight: 1.9 }}>
                {method === 'formula' && `∑ Fórmula: ${tramos.length} tramo${tramos.length !== 1 ? 's' : ''}\n${formulaHaEarly.toFixed(4)} ha totales`}
                {method === 'mapa'    && `◈ Dibujar: ${mapEntries.length} polígono${mapEntries.length !== 1 ? 's' : ''}\n${mapaHaEarly.toFixed(4)} ha totales`}
                <br/>
                <span style={{ color: '#333' }}>(editá en pestaña Cómputo)</span>
              </div>

              {subtotalPres > 0 && (
                <div style={{ marginTop: 'auto', borderTop: `1px solid ${color}22`, paddingTop: 12 }}>
                  <div style={{ fontSize: 8, ...mono, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Resumen</div>
                  {[
                    { label: 'Obra',    val: subtotalPres },
                    { label: `DVP ${prespPctDVP}%`, val: montoDVP },
                    { label: `CCC ${100-prespPctDVP}%`, val: montoCCC },
                    { label: `Total (×${prespPlazo} m)`, val: totalPres, accent: true },
                  ].map(({ label, val, accent }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, ...mono, marginBottom: 4 }}>
                      <span style={{ color: accent ? color : '#555' }}>{label}</span>
                      <span style={{ color: accent ? color : '#888', fontWeight: accent ? 700 : 400 }}>
                        ${Math.round(val).toLocaleString('es-AR')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT: tabla presupuesto */}
            <div style={{ ...panel, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 14, ...mono, fontWeight: 700, color: '#999', textAlign: 'center',
                letterSpacing: 2, textTransform: 'uppercase', marginBottom: 20, paddingBottom: 12,
                borderBottom: '1px solid #1a1a1a' }}>
                PRESUPUESTO
              </div>

              {/* Tabla */}
              <table style={{ width: '100%', borderCollapse: 'collapse', ...mono, fontSize: 10 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #222' }}>
                    <th style={{ ...th, width: 36 }}>ÍTEM</th>
                    <th style={th}>Designación Obras</th>
                    <th style={{ ...th, textAlign: 'center', width: 36 }}>Uni.</th>
                    <th style={{ ...th, textAlign: 'right', width: 72 }}>Cantidad</th>
                    <th style={{ ...th, textAlign: 'right', width: 100 }}>Precio Unit.</th>
                    <th style={{ ...th, textAlign: 'right', width: 110 }}>Parciales</th>
                    <th style={{ ...th, textAlign: 'right', width: 110 }}>Totales</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Item header */}
                  <tr>
                    <td style={{ padding: '10px 8px 2px', color: '#aaa', fontWeight: 700 }}>I</td>
                    <td colSpan={6} style={{ padding: '10px 8px 2px', color: '#aaa', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                      Desmalezado de Banquina
                    </td>
                  </tr>
                  <tr>
                    <td />
                    <td colSpan={6} style={{ padding: '2px 8px 8px 16px', color: '#666', fontSize: 9 }}>
                      Tramo: {prespDescTramo}
                    </td>
                  </tr>

                  {/* Lado Izquierdo */}
                  {haIzqPres > 0 && (
                    <tr style={{ background: '#080808' }}>
                      <td />
                      <td style={{ padding: '6px 8px 6px 20px', color: '#888' }}>Lado Izquierdo</td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', color: '#555' }}>Ha.</td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: '#aaa', fontWeight: 700 }}>
                        {haIzqPres.toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: '#777' }}>
                        $ {apAdoptado.toLocaleString('es-AR')},00
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: '#aaa' }}>
                        $ {parcIzq.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td />
                    </tr>
                  )}

                  {/* Lado Derecho */}
                  {haDerPres > 0 && (
                    <tr>
                      <td />
                      <td style={{ padding: '6px 8px 6px 20px', color: '#888' }}>Lado Derecho</td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', color: '#555' }}>Ha.</td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: '#aaa', fontWeight: 700 }}>
                        {haDerPres.toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: '#777' }}>
                        $ {apAdoptado.toLocaleString('es-AR')},00
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', color: '#aaa' }}>
                        $ {parcDer.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td />
                    </tr>
                  )}

                  {/* Subtotal obra */}
                  <tr style={{ borderTop: '1px solid #1a1a1a' }}>
                    <td colSpan={6} />
                    <td style={{ padding: '6px 4px 16px', textAlign: 'right', color: '#bbb', fontWeight: 700, fontSize: 11 }}>
                      $ {subtotalPres.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* Fila financiamiento */}
                  <tr style={{ borderTop: '1px solid #222' }}>
                    <td />
                    <td colSpan={3} style={{ padding: '8px 8px', color: '#666', fontSize: 10 }}>
                      $ {subtotalPres.toLocaleString('es-AR', { minimumFractionDigits: 2 })} × {prespPlazo} meses
                    </td>
                    <td />
                    <td style={{ padding: '8px 4px', textAlign: 'right', color: '#888' }}>
                      $ {totalPres.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td />
                  </tr>

                  {/* DVP */}
                  <tr>
                    <td />
                    <td style={{ padding: '4px 8px', color: '#555', fontSize: 10 }}>
                      Aporte D.V.P. ···· {prespPctDVP}%
                    </td>
                    <td colSpan={3} />
                    <td style={{ padding: '4px 4px', textAlign: 'right', color: '#777' }}>
                      $ {montoDVP.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td />
                  </tr>

                  {/* CCC */}
                  <tr>
                    <td />
                    <td style={{ padding: '4px 8px 12px', color: '#555', fontSize: 10 }}>
                      Aporte C°C° ···· {100 - prespPctDVP}%
                    </td>
                    <td colSpan={3} />
                    <td style={{ padding: '4px 4px 12px', textAlign: 'right', color: '#777', borderBottom: '1px solid #1a1a1a' }}>
                      $ {montoCCC.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td />
                  </tr>

                  {/* TOTAL */}
                  <tr style={{ borderTop: '2px solid #2a2a2a' }}>
                    <td colSpan={5} style={{ padding: '10px 8px', textAlign: 'right', fontSize: 11, color: '#777', fontWeight: 700, letterSpacing: 1 }}>
                      $
                    </td>
                    <td style={{ padding: '10px 4px', textAlign: 'right', color, fontWeight: 700, fontSize: 14 }}>
                      $ {totalPres.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>

              {/* En letras */}
              {totalPres > 0 && (
                <div style={{ marginTop: 20, padding: '10px 14px', background: '#080808',
                  border: '1px solid #1a1a1a', borderRadius: 3, fontSize: 10, ...mono, color: '#666',
                  lineHeight: 1.6, fontStyle: 'italic' }}>
                  {pesosEnLetras(totalPres)}
                </div>
              )}

              {/* Vacío */}
              {subtotalPres === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flex: 1, ...mono, fontSize: 10, color: '#2a2a2a', textAlign: 'center' }}>
                  Completá el Cómputo y el Análisis de Precio<br />
                  <span style={{ fontSize: 8, color: '#222', marginTop: 4 }}>para ver el presupuesto calculado</span>
                </div>
              )}

            </div>
          </div>
        )}


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
interface MonteEntry { id: string; ha: number; monte: MonteKey; fromMap?: boolean; pts?: [number,number][] }

function CalcDesbosque({ paramsRef, onGuardarObra, initialData }: { paramsRef?: React.MutableRefObject<Params>; onGuardarObra?: (d: GuardarObraData) => void; initialData?: Record<string, unknown> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _i: any = initialData ?? {}

  // ── Geometría — múltiples superficies por tipo en cada lado ──────────────
  const [entriesIzq, setEntriesIzq] = useState<MonteEntry[]>(_i.entriesIzq ?? [])
  const [entriesDer, setEntriesDer] = useState<MonteEntry[]>(_i.entriesDer ?? [])

  // ── VIII) Coeficiente Resumen ─────────────────────────────────
  const [ggPct,  setGgPct]  = useState(_i.ggPct  ?? 15)
  const [benPct, setBenPct] = useState(_i.benPct ?? 0)
  const [gfPct,  setGfPct]  = useState(_i.gfPct  ?? 0)
  const [ivaPct, setIvaPct] = useState(_i.ivaPct ?? 0)

  // ── I) Mano de Obra ───────────────────────────────────────────
  const [moRows, setMoRows] = useState<MORow[]>(_i.moRows ?? MO_DEFAULTS.map(r => ({ ...r })))

  // ── Equipos ───────────────────────────────────────────────────
  const [eqRows, setEqRows] = useState<EqRow[]>(_i.eqRows ?? EQ_DEFAULTS.map(r => ({ ...r })))

  // ── II) Amortización + III) Reparación ───────────────────────
  const [amortCoef, setAmortCoef] = useState(_i.amortCoef ?? 0.0011)
  const [repCoef,   setRepCoef]   = useState(_i.repCoef   ?? 0.00056)

  // ── IV) Combustibles y Lubricantes ───────────────────────────
  const [consumoLHpH, setConsumoLHpH] = useState(_i.consumoLHpH ?? 0.15)
  const [hsDiaComb, setHsDiaComb]     = useState(_i.hsDiaComb   ?? 8)
  const [precioLitro, setPrecioLitro] = useState(_i.precioLitro ?? 1198)
  const [coefLubri, setCoefLubri]     = useState(_i.coefLubri   ?? 1.30)

  // ── Resumen (Ae-9) ────────────────────────────────────────────
  const [materiales, setMateriales] = useState(_i.materiales ?? 0)
  const [transpInt,  setTranspInt]  = useState(_i.transpInt  ?? 0)

  // ── Presupuesto (Ae-10) ───────────────────────────────────────
  const [presRows, setPresRows] = useState<PresRow[]>(_i.presRows ?? [
    { id: 'p1', num: 1, desc: 'DESBOSQUE-DESTRONQUE Y LIMPIEZA — Monte Semi-tupido', unit: 'Has', cant: 0, precioUnit: 0 },
    { id: 'p2', num: 2, desc: 'DESBOSQUE-DESTRONQUE Y LIMPIEZA — Monte Ralo',        unit: 'Has', cant: 0, precioUnit: 0 },
  ])
  const [dvpPct, setDvpPct] = useState(_i.dvpPct ?? 80)

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
  const color = '#795548'

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

  // ── Generar PDF ───────────────────────────────────────────────────────────
  const generatePdf = async () => {
    const { jsPDF } = await import('jspdf')
    const autoTable  = (await import('jspdf-autotable')).default

    const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W    = 210, M = 14, CW = W - 2 * M
    const date = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

    // ── Encabezado ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(30, 30, 30)
    doc.text('INFORME TÉCNICO DE OBRA', M, 18)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('Desbosque, Destronque y Limpieza de Banquinas', M, 24)
    doc.text(`Fecha: ${date}`, M, 29)
    doc.text(`CR: ${CR.toFixed(4)}   ·   Total ha: ${Sup_ha.toFixed(4)}   ·   Vol. arbóreo: ${fmt(VolArb)} m³`, M, 34)
    doc.setDrawColor(200, 200, 200)
    doc.line(M, 37, W - M, 37)

    // ── I. Cómputo de cantidades ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(30, 30, 30)
    doc.text('I.  Cómputo de Cantidades', M, 44)

    const computoBody = Object.entries(MONTE).map(([k, v]) => {
      const haIzq = entriesIzq.filter(e => e.monte === k).reduce((s, e) => s + (e.ha || 0), 0)
      const haDer = entriesDer.filter(e => e.monte === k).reduce((s, e) => s + (e.ha || 0), 0)
      const ha    = haIzq + haDer
      const dias  = v.rendimientoDia > 0 ? (ha / v.rendimientoDia) : 0
      return [
        v.label,
        haIzq > 0 ? haIzq.toFixed(4) : '—',
        haDer > 0 ? haDer.toFixed(4) : '—',
        ha    > 0 ? ha.toFixed(4)    : '—',
        String(v.rendimientoDia),
        ha > 0 ? `$${fmt(Math.round(precioHaPorTipo[k]))}` : '—',
        ha > 0 ? dias.toFixed(1) : '—',
        ha > 0 ? fmtM(costoByType[k]) : '—',
      ]
    })

    autoTable(doc, {
      startY: 47,
      margin: { left: M, right: M },
      head: [['Tipo de Monte', 'Ha Izq.', 'Ha Der.', 'Total Ha', 'rend.', '$/Ha', 'Días', 'Subtotal']],
      body: computoBody,
      foot: [['TOTAL', Sup_ha_izq.toFixed(4), Sup_ha_der.toFixed(4), Sup_ha.toFixed(4), '', '', diasTrab.toFixed(1), fmtM(CostoTotal)]],
      styles:           { fontSize: 8, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
      headStyles:       { fillColor: [30, 30, 30], textColor: [200, 200, 200], fontStyle: 'bold', fontSize: 7 },
      footStyles:       { fillColor: [20, 20, 20], textColor: [180, 180, 180], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: {
        0: { cellWidth: 36 },
        1: { halign: 'right' as const },
        2: { halign: 'right' as const },
        3: { halign: 'right' as const, fontStyle: 'bold' as const },
        4: { halign: 'right' as const },
        5: { halign: 'right' as const },
        6: { halign: 'right' as const },
        7: { halign: 'right' as const, fontStyle: 'bold' as const },
      },
    })

    // ── Cuadro resumen ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let y = (doc as any).lastAutoTable.finalY + 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(80, 80, 80)
    const resumen = [
      ['Total ha',      `${Sup_ha.toFixed(4)} ha`],
      ['Vol. arbóreo',  `${fmt(VolArb)} m³`],
      ['Días trabajo',  `${diasTrab.toFixed(1)} días`],
      ['CR adoptado',   CR.toFixed(4)],
      ['Costo total',   fmtM(CostoTotal)],
    ]
    const bw = CW / resumen.length
    resumen.forEach(([lbl, val], i) => {
      const x = M + i * bw
      doc.setFillColor(14, 14, 14)
      doc.rect(x, y, bw - 2, 14, 'F')
      doc.setTextColor(100, 100, 100)
      doc.setFontSize(6.5)
      doc.text(String(lbl).toUpperCase(), x + 2, y + 5)
      doc.setTextColor(220, 220, 220)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(String(val), x + 2, y + 11)
      doc.setFont('helvetica', 'normal')
    })
    y += 20

    // ── Línea separadora ──
    doc.setDrawColor(200, 200, 200)
    doc.line(M, y, W - M, y)
    y += 6

    // ── II. Presupuesto Ae-10 ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(30, 30, 30)
    doc.text('II.  Presupuesto — Ae-10', M, y)
    y += 4

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['N°', 'Designación', 'UN', 'Cant.', '$/Ha', 'Total']],
      body: presRows.map(r => [
        String(r.num),
        r.desc,
        r.unit,
        r.cant.toFixed(4),
        `$${fmt(r.precioUnit)}`,
        `$${fmt(Math.round(r.cant * r.precioUnit))}`,
      ]),
      foot: [['', 'TOTAL OBRA', '', '', '', `$${fmt(Math.round(presTotal))}`]],
      styles:           { fontSize: 7.5, fontFamily: 'monospace', cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
      headStyles:       { fillColor: [30, 30, 30], textColor: [200, 200, 200], fontStyle: 'bold', fontSize: 7 },
      footStyles:       { fillColor: [20, 20, 20], textColor: [200, 200, 200], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' as const },
        1: { cellWidth: 88 },
        2: { cellWidth: 14, halign: 'center' as const },
        3: { halign: 'right' as const },
        4: { halign: 'right' as const },
        5: { halign: 'right' as const, fontStyle: 'bold' as const },
      },
    })

    // ── Financiamiento ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 5
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Financiamiento: Org. financiador ${dvpPct}% — $${fmt(Math.round(aporteDVP))}     Consorcio ${(100-dvpPct).toFixed(0)}% — $${fmt(Math.round(aporteCC))}`, M, y)
    y += 8

    // ── III. Plano de obra (sketch de polígonos) ──
    const allPtsFlat = [...entriesIzq, ...entriesDer].flatMap(e => e.pts ?? [])
    if (allPtsFlat.length >= 3) {
      doc.setDrawColor(200, 200, 200)
      doc.line(M, y, W - M, y)
      y += 6
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(30, 30, 30)
      doc.text('III.  Plano esquemático de la obra', M, y)
      y += 4

      // Build canvas sketch
      const SW = 600, SH = 360
      const canvas = document.createElement('canvas')
      canvas.width = SW; canvas.height = SH
      const ctx = canvas.getContext('2d')!

      const lats = allPtsFlat.map(p => p[0]), lngs = allPtsFlat.map(p => p[1])
      const minLat = Math.min(...lats), maxLat = Math.max(...lats)
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
      const padF = 0.15
      const dLat = (maxLat - minLat) || 0.001, dLng = (maxLng - minLng) || 0.001
      const padLat = dLat * padF, padLng = dLng * padF
      const toX = (lng: number) => ((lng - minLng + padLng) / (dLng + 2 * padLng)) * SW
      const toY = (lat: number) => SH - ((lat - minLat + padLat) / (dLat + 2 * padLat)) * SH

      // Background
      ctx.fillStyle = '#f5f5f5'
      ctx.fillRect(0, 0, SW, SH)

      // Grid
      ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 0.5
      for (let i = 0; i <= 8; i++) {
        const x = i * SW / 8; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SH); ctx.stroke()
      }
      for (let i = 0; i <= 5; i++) {
        const yy = i * SH / 5; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(SW, yy); ctx.stroke()
      }

      // Draw polygons
      const izqIds = new Set(entriesIzq.map(e => e.id))
      ;[...entriesIzq, ...entriesDer].forEach(e => {
        if (!e.pts?.length) return
        const isIzq = izqIds.has(e.id)
        const fillCol   = isIzq ? 'rgba(76,175,80,0.35)'  : 'rgba(33,150,243,0.35)'
        const strokeCol = isIzq ? '#2e7d32' : '#1565c0'

        ctx.beginPath()
        e.pts.forEach(([lat, lng], i) => {
          const px = toX(lng), py = toY(lat)
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
        })
        ctx.closePath()
        ctx.fillStyle = fillCol; ctx.fill()
        ctx.strokeStyle = strokeCol; ctx.lineWidth = 1.5; ctx.stroke()

        // Area label at centroid
        const cLat = e.pts.reduce((s, p) => s + p[0], 0) / e.pts.length
        const cLng = e.pts.reduce((s, p) => s + p[1], 0) / e.pts.length
        ctx.fillStyle = strokeCol
        ctx.font = 'bold 12px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(`${e.ha.toFixed(2)} ha`, toX(cLng), toY(cLat))
        ctx.font = '10px monospace'
        ctx.fillStyle = '#555'
        ctx.fillText(`(${isIzq ? 'Izq' : 'Der'} · ${MONTE[e.monte].label})`, toX(cLng), toY(cLat) + 14)
      })

      // Legend
      const leg = [
        { col: '#4caf50', label: 'Lado izquierdo' },
        { col: '#2196f3', label: 'Lado derecho'   },
      ]
      ctx.font = '11px monospace'
      leg.forEach(({ col, label }, i) => {
        ctx.fillStyle = col
        ctx.fillRect(8, SH - 28 + i * 14, 12, 10)
        ctx.fillStyle = '#333'
        ctx.textAlign = 'left'
        ctx.fillText(label, 24, SH - 20 + i * 14)
      })

      // North arrow (simple)
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(SW - 18, SH - 40); ctx.lineTo(SW - 18, SH - 20); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(SW - 22, SH - 36); ctx.lineTo(SW - 18, SH - 44); ctx.lineTo(SW - 14, SH - 36); ctx.stroke()
      ctx.fillStyle = '#333'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'
      ctx.fillText('N', SW - 18, SH - 10)

      const imgData = canvas.toDataURL('image/png')
      const imgH    = (CW * SH) / SW
      if (y + imgH + 5 > 280) { doc.addPage(); y = 15 }
      doc.addImage(imgData, 'PNG', M, y, CW, imgH)
    }

    doc.save(`informe-desbosque-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

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
  const TH: React.CSSProperties = { padding: '4px 6px', fontSize: 11, color: '#666', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #222', fontWeight: 500, whiteSpace: 'nowrap' }
  const TD: React.CSSProperties = { padding: '2px 4px' }
  const TDr: React.CSSProperties = { padding: '2px 4px', textAlign: 'right' as const }
  const cellInp = (w: number): React.CSSProperties => ({ width: w, background: '#080808', border: '1px solid #1e1e1e', color: '#ccc', fontFamily: 'monospace', fontSize: 11, padding: '2px 4px', outline: 'none', textAlign: 'right' as const, boxSizing: 'border-box' as const })
  const labelInp: React.CSSProperties = { width: '100%', background: 'transparent', border: 'none', color: '#888', fontFamily: 'monospace', fontSize: 11, outline: 'none', padding: '2px 0' }
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
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666', fontFamily: 'monospace', marginTop: 3, marginBottom: 3, borderTop: '1px solid #1a1a1a', paddingTop: 4 }}>
          <span>Subtotal {side === 'izq' ? 'Izq.' : 'Der.'}</span>
          <span style={{ color: subtotal > 0 ? color : '#333', fontWeight: subtotal > 0 ? 700 : 400 }}>{subtotal.toFixed(3)} ha</span>
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
              style={{ padding: '3px 12px', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
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
        <button
          onClick={() => void generatePdf()}
          disabled={Sup_ha === 0}
          title={Sup_ha === 0 ? 'Dibujá al menos un polígono para generar el informe' : 'Generar informe PDF'}
          style={{
            padding: '4px 12px', fontSize: 10, fontFamily: 'monospace', cursor: Sup_ha > 0 ? 'pointer' : 'not-allowed',
            border: `1px solid ${Sup_ha > 0 ? color + '88' : '#222'}`,
            background: Sup_ha > 0 ? `${color}18` : '#0a0a0a',
            color: Sup_ha > 0 ? color : '#333', borderRadius: 3, letterSpacing: 0.5,
            marginLeft: 6, opacity: Sup_ha > 0 ? 1 : 0.5,
          }}>
          ↓ Informe PDF
        </button>
        {presTotal > 0 && onGuardarObra && (
          <button
            onClick={() => onGuardarObra({
              tipo: 'limpieza',
              cantidad: Sup_ha,
              unidad: 'ha',
              presupuesto_total: presTotal,
              aporte_dvp: aporteDVP,
              aporte_ccc: aporteCC,
              precio_unitario: Sup_ha > 0 ? presTotal / Sup_ha : 0,
              datos_calculadora: {
                calculadora: 'desbosque',
                // ── Inputs ──────────────────────────────────────────────
                inputs: {
                  entriesIzq, entriesDer,
                  ggPct, benPct, gfPct, ivaPct,
                  moRows, eqRows,
                  amortCoef, repCoef,
                  consumoLHpH, hsDiaComb, precioLitro, coefLubri,
                  materiales, transpInt,
                  presRows, dvpPct,
                },
                // ── Cómputo ─────────────────────────────────────────────
                computo: {
                  Sup_ha, Sup_ha_izq, Sup_ha_der, Sup_m2,
                  haByType, VolArb, diasTrab,
                  entriesIzq, entriesDer,
                  allEntries,
                },
                // ── Análisis de Precios (Ae-7) ───────────────────────────
                analisis_precio: {
                  eqRows, moRows,
                  totalCap, totalHP,
                  amortCoef, repCoef,
                  amortD, repD,
                  consumoLHpH, hsDiaComb, precioLitro, coefLubri,
                  combPerHpD, combD,
                  cEquipos, cMO,
                  materiales, transpInt,
                  costoDiario,
                  ggPct, benPct, gfPct, ivaPct, CR,
                  precioHaPorTipo,
                  costoByType,
                  CostoTotal,
                  precioHa,
                },
                // ── Presupuesto ──────────────────────────────────────────
                presupuesto: {
                  presRows,
                  presTotal,
                  dvpPct,
                  aporteDVP,
                  aporteCC,
                  Sup_ha,
                  precioHaPromedio: Sup_ha > 0 ? presTotal / Sup_ha : 0,
                },
              },
            })}
            style={{ padding: '4px 14px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
              letterSpacing: 0.8, cursor: 'pointer', border: '1px solid #F5C300',
              background: '#F5C30022', color: '#F5C300', borderRadius: 3, marginLeft: 6 }}
          >
            💾 Guardar obra
          </button>
        )}
      </div>

      {/* Jornales ── siempre montado, oculto con display:none para preservar estado del mapa */}
        <div style={{ flex: 1, minHeight: 0, display: view === 'jornales' ? 'flex' : 'none', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
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
                      <td style={TDr}>
                        <input type="number" min={0} step={1000000} value={r.capUnit}
                          onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setEqNum(r.id,'capUnit',v) }}
                          style={cellInp(96)} />
                        <div style={{ fontSize: 10, color: '#888', fontFamily: 'monospace', textAlign: 'right' }}>${fmt(r.capUnit)}</div>
                      </td>
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
                  <span style={{ fontSize: 9, color: '#555', fontFamily: 'monospace' }}>= 8/10000 + tasa·8/(2·hs/año)</span>
                </label>
                <label style={{ display: 'block' }}>
                  <span style={lbl}>Repuestos coef/día</span>
                  <input type="number" min={0} step={0.00001} value={repCoef}
                    onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setRepCoef(v) }}
                    style={{ ...inpStyle, fontSize: 12 }} />
                  <span style={{ fontSize: 9, color: '#555', fontFamily: 'monospace' }}>= amort_dep × 70%</span>
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
              <div style={{ marginTop: 10, background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 3, padding: '7px 10px', fontSize: 10, fontFamily: 'monospace', lineHeight: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#666' }}>Comb/HP·día</span>
                  <span style={{ color: '#999' }}>${fmt(Math.round(combPerHpD))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#666' }}>Amortización</span>
                  <span style={{ color: '#999' }}>${fmt(Math.round(amortD))}/día</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#666' }}>Repuestos</span>
                  <span style={{ color: '#999' }}>${fmt(Math.round(repD))}/día</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#666' }}>Combustibles</span>
                  <span style={{ color: '#999' }}>${fmt(Math.round(combD))}/día</span>
                </div>
                <div style={{ borderTop: '1px solid #1a1a1a', marginTop: 4, paddingTop: 5, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Subtotal equipos</span>
                  <span style={{ color: color, fontWeight: 700, fontSize: 12 }}>${fmt(Math.round(cEquipos))}/día</span>
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* ═══ RESUMEN (Ae-9) ═══════════════════════════════ */}
          <div style={{ background: '#0e0e0e', border: '1px solid #1e1e1e', borderRadius: 6, padding: '10px 14px', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: '#777', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'monospace', marginBottom: 8 }}>Resumen — Ae-9</div>
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
                    <tr key={k} style={{ opacity: ha > 0 ? 1 : 0.5 }}>
                      <td style={{ ...TD, fontFamily: 'monospace', fontSize: 10, color: ha > 0 ? '#ccc' : '#777' }}>{v.label}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: ha > 0 ? '#ddd' : '#666' }}>{ha.toFixed(4)}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: '#888' }}>{v.rendimientoDia}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: '#999' }}>${fmt(Math.round(ejecHa))}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: '#777' }}>${fmt(Math.round(materiales + transpInt))}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: '#777' }}>×{CR.toFixed(2)}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: ha > 0 ? color : '#555' }}>${fmt(Math.round(pHa))}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 10, color: ha > 0 ? '#ccc' : '#555' }}>{ha > 0 ? fmtM(ha * pHa) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...TH, borderTop: '1px solid #1a1a1a', paddingTop: 5 }}>Total</td>
                  <td style={{ ...TH, textAlign: 'right', borderTop: '1px solid #1a1a1a', paddingTop: 5, color: '#aaa' }}>{Sup_ha.toFixed(4)}</td>
                  <td colSpan={5} style={{ borderTop: '1px solid #1a1a1a' }}></td>
                  <td style={{ ...TH, textAlign: 'right', borderTop: '1px solid #1a1a1a', paddingTop: 5, color: color, fontSize: 12 }}>{fmtM(CostoTotal)}</td>
                </tr>
              </tfoot>
            </table>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: '5px 14px', fontFamily: 'monospace', fontSize: 11, marginBottom: 10 }}>
              <span style={{ color: '#888' }}>II) Materiales</span>
              <input type="number" min={0} step={1000} value={materiales}
                onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setMateriales(v) }}
                style={{ background: '#0a0a0a', border: '1px solid #222', color: '#e0e0e0', fontFamily: 'monospace', fontSize: 11, padding: '2px 6px', textAlign: 'right' as const, outline: 'none', width: 120 }} />
              <span style={{ color: '#666', fontSize: 9 }}>/Ha</span>
              <span style={{ color: '#888' }}>III) Transp. Interno</span>
              <input type="number" min={0} step={1000} value={transpInt}
                onChange={e => { const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=0) setTranspInt(v) }}
                style={{ background: '#0a0a0a', border: '1px solid #222', color: '#e0e0e0', fontFamily: 'monospace', fontSize: 11, padding: '2px 6px', textAlign: 'right' as const, outline: 'none', width: 120 }} />
              <span style={{ color: '#666', fontSize: 9 }}>/Ha</span>
            </div>
            <div style={{ padding: '8px 14px', background: `${color}15`, border: `1px solid ${color}55`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, color: color, fontFamily: 'monospace', textTransform: 'uppercase' as const, letterSpacing: 1 }}>Costo Total Adoptado</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: color, fontFamily: 'monospace' }}>{fmtM(CostoTotal)}</span>
            </div>
          </div>
        </div>

      {/* Presupuesto ── siempre montado */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: view === 'presupuesto' ? 'flex' : 'none', flexDirection: 'column', gap: 10 }}>

          {/* Precios de referencia por tipo */}
          <div style={{ ...panel, flexShrink: 0 }}>
            <SectionTitle>Precios de Referencia por Tipo de Monte</SectionTitle>
            <div style={{ fontSize: 10, color: '#444', fontFamily: 'monospace', marginBottom: 6 }}>incluye ejec. + mat. + transp.int. × CR</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
              {Object.entries(MONTE).map(([k, v]) => (
                <div key={k} style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 3, padding: '6px 12px', minWidth: 130 }}>
                  <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase' as const, fontFamily: 'monospace' }}>{v.label} — {v.desc}</div>
                  <div style={{ color: color, fontWeight: 700, fontFamily: 'monospace', fontSize: 15, marginTop: 3 }}>${fmt(Math.round(precioHaPorTipo[k]))}/Ha</div>
                  <div style={{ fontSize: 10, color: '#444', fontFamily: 'monospace' }}>{v.rendimientoDia} Ha/día · {(haByType[k]??0).toFixed(2)} Ha total</div>
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

      {/* Cómputo ── siempre montado (contiene InlineMapDraw — no desmontar) */}
        <div style={{ flex: 1, minHeight: 0, display: view === 'computo' ? 'grid' : 'none', gridTemplateColumns: '210px 1fr 160px', gap: 10 }}>

          {/* ── Panel izquierdo: entradas por lado y tipo ── */}
          <div style={{ ...panel, overflowY: 'auto' }}>
            <SectionTitle>Superficie por lado y tipo</SectionTitle>
            {renderSide('izq', entriesIzq)}
            {renderSide('der', entriesDer)}

          </div>

          {/* ── Panel central: mapa siempre visible ── */}
          <div style={{ ...panel, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            {/* Mapa Leaflet */}
            <InlineMapDraw
              color={color}
              onConfirm={(id, side, monteKey, area_ha, pts) => {
                const ne: MonteEntry = { id, ha: area_ha, monte: monteKey, fromMap: true, pts }
                if (side === 'izq') setEntriesIzq(prev => [...prev, ne])
                else               setEntriesDer(prev => [...prev, ne])
              }}
              onDelete={(id) => {
                setEntriesIzq(prev => prev.filter(e => e.id !== id))
                setEntriesDer(prev => prev.filter(e => e.id !== id))
              }}
              onUpdate={(id, area_ha, pts) => {
                setEntriesIzq(prev => prev.map(e => e.id === id ? { ...e, ha: area_ha, pts } : e))
                setEntriesDer(prev => prev.map(e => e.id === id ? { ...e, ha: area_ha, pts } : e))
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
    </div>
  )
}

// ── LIMPIEZA VIAL (Desmalezado + Desbosque, selector unificado) ───────────────
function CalcLimpiezaVial({ paramsRef, onGuardarObra, initialData }: { paramsRef?: React.MutableRefObject<Params>; onGuardarObra?: (d: GuardarObraData) => void; initialData?: Record<string, unknown> }) {
  const calcType = initialData?.calculadora as 'desmalezado' | 'desbosque' | undefined
  const [tipo, setTipo] = useState<'desmalezado' | 'desbosque'>(calcType ?? 'desmalezado')
  const colorDesm = '#66BB6A'
  const colorDesb = '#795548'
  const activeColor = tipo === 'desmalezado' ? colorDesm : colorDesb

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Selector de tipo */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, flexShrink: 0, alignSelf: 'flex-start' }}>
        {([
          { id: 'desmalezado' as const, label: '≈  Desmalezado de Banquinas',       c: colorDesm },
          { id: 'desbosque'   as const, label: '※  Desbosque · Destronque · Limpieza', c: colorDesb },
        ]).map((t, i) => (
          <button key={t.id} onClick={() => setTipo(t.id)}
            style={{
              padding: '7px 18px', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
              border: `1px solid ${tipo === t.id ? t.c : '#1e1e1e'}`,
              borderLeft: i === 1 ? 'none' : undefined,
              background: tipo === t.id ? `${t.c}1a` : '#080808',
              color: tipo === t.id ? t.c : '#444',
              fontWeight: tipo === t.id ? 700 : 400,
              letterSpacing: 0.5, transition: 'all 0.15s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, minHeight: 0, borderLeft: `2px solid ${activeColor}33`, paddingLeft: 14 }}>
        {tipo === 'desmalezado' && <CalcDesmalezado key={initialData ? 'edit-desm' : 'new-desm'} paramsRef={paramsRef} onGuardarObra={onGuardarObra} initialData={initialData?.inputs as Record<string, unknown> | undefined} />}
        {tipo === 'desbosque'   && <CalcDesbosque   key={initialData ? 'edit-desb' : 'new-desb'} paramsRef={paramsRef} onGuardarObra={onGuardarObra} initialData={initialData?.inputs as Record<string, unknown> | undefined} />}
      </div>
    </div>
  )
}

// ── PÁGINA PRINCIPAL ──────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'terraplen',  label: 'Terraplén',     icon: '▲' },
  { id: 'excavacion', label: 'Excavación',    icon: '▼' },
  { id: 'ripio',      label: 'Ripio',         icon: '≡' },
  { id: 'canal',      label: 'Canal',         icon: '⌣' },
  { id: 'limpieza',   label: 'Limpieza Vial', icon: '≈' },
]

export default function CalculadorasPage() {
  const searchParams  = useSearchParams()
  const editId        = searchParams.get('edit') ?? undefined

  const [tab, setTab] = useState<Tab>(() => (consumeReturnTab() as Tab) || 'terraplen')
  const [precio, setPrecio] = useState(0)
  const paramsRef = useRef<Params>({})
  const router    = useRouter()
  const color     = CLR[tab]

  // ── Edición desde lista de obras ──────────────────────────────────────────
  const [editDC,      setEditDC]      = useState<Record<string, unknown> | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  useEffect(() => {
    if (!editId) return
    setEditLoading(true)
    fetch(`/api/obras?id=${editId}`)
      .then(r => r.json())
      .then(obra => {
        const dc = obra.datos_calculadora as Record<string, unknown> | null
        if (!dc) return
        setEditDC(dc)
        // Navegar al tab correcto
        if (dc.calculadora === 'desmalezado' || dc.calculadora === 'desbosque') {
          setTab('limpieza')
        }
        // Para otras calculadoras agregar aquí cuando sea necesario
      })
      .finally(() => setEditLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId])

  // ── Guardar Obra ──────────────────────────────────────────────────────────
  const [guardarOpen, setGuardarOpen] = useState(false)
  const [guardarData, setGuardarData] = useState<GuardarObraData | null>(null)

  const handleGuardarObra = () => {
    const W_t = Number(paramsRef.current.W_t ?? 0)
    const L_m = Number(paramsRef.current.L_m ?? 0)
    if (W_t <= 0 && tab !== 'limpieza') {
      alert('Completá los datos de la calculadora primero.')
      return
    }
    const total = W_t * precio
    setGuardarData({
      tipo:              tab as ObraTipo,
      cantidad:          tab === 'ripio' ? L_m / 1000 : W_t,   // ripio en km, resto en t
      unidad:            tab === 'ripio' ? 'km' : 't',
      presupuesto_total: total,
      aporte_dvp:        total * 0.5,   // el modal puede ajustarse en Fase 2
      aporte_ccc:        total * 0.5,
      precio_unitario:   precio,
    })
    setGuardarOpen(true)
  }

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

      {/* Barra precio + botón Dibujar — oculto para Limpieza (usa mapa inline propio) */}
      {tab !== 'limpieza' && (
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

        <button
          onClick={handleGuardarObra}
          style={{
            padding: '7px 18px', fontSize: 11, fontFamily: 'monospace',
            fontWeight: 700, letterSpacing: 0.8, cursor: 'pointer',
            border: '1px solid #F5C300', background: '#F5C30022',
            color: '#F5C300', transition: 'background 0.15s',
          }}
        >
          💾 Guardar obra
        </button>
      </div>
      )}

      {/* Calculadora activa */}
      <div style={{
        flex: 1, minHeight: 0, marginTop: 10,
        ...(tab !== 'limpieza' ? { borderLeft: `2px solid ${color}44`, paddingLeft: 14 } : {}),
      }}>
        {tab === 'terraplen'  && <CalcTerraplen  paramsRef={paramsRef} />}
        {tab === 'excavacion' && <CalcExcavacion paramsRef={paramsRef} />}
        {tab === 'ripio'      && <CalcRipio      paramsRef={paramsRef} />}
        {tab === 'canal'      && <CalcCanal      paramsRef={paramsRef} />}
        {tab === 'limpieza'   && !editLoading && <CalcLimpiezaVial key={editId ?? 'new'} paramsRef={paramsRef} onGuardarObra={(d) => { setGuardarData(d); setGuardarOpen(true) }} initialData={editDC ?? undefined} />}
        {tab === 'limpieza'   && editLoading  && <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 12, padding: 20 }}>Cargando obra...</div>}
      </div>

      <GuardarObraModal
        open={guardarOpen}
        data={guardarData}
        onClose={() => setGuardarOpen(false)}
        onSaved={() => setGuardarOpen(false)}
        editId={editId}
      />
    </div>
  )
}
