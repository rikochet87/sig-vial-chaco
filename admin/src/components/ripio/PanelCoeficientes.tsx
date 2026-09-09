'use client'
/**
 * Coeficientes del proyecto.
 *
 * Todo editable. Los valores que trae por defecto son los de la planilla de
 * referencia, pero cada obra puede tener su propio criterio: distinta vida útil
 * de equipos, otro porcentaje de gastos generales, otro beneficio.
 *
 * El coeficiente resumen se arma en cascada y no es una simple suma — los
 * gastos financieros se aplican sobre el subtotal, y los impuestos sobre el
 * resultado de eso. Por eso se muestra el desglose paso a paso: para que se vea
 * de dónde sale el número final y no haya que confiar a ciegas.
 */

import { useState } from 'react'
import type { Coeficientes, ParametrosCoef } from '@/lib/ripioCalculo'

const MONO = { fontFamily: 'monospace' } as const

const inp: React.CSSProperties = {
  background: '#080808', border: '1px solid #1e1e1e', color: '#e0e0e0',
  fontFamily: 'monospace', fontSize: 13, padding: '4px 8px',
  outline: 'none', boxSizing: 'border-box', width: '100%',
}
const lbl: React.CSSProperties = {
  fontSize: 11, color: '#555', textTransform: 'uppercase',
  letterSpacing: 0.8, display: 'block', marginBottom: 2, ...MONO,
}

const money = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Campo de porcentaje: se edita en % pero se guarda como fracción */
function CampoPct({ label, valor, onChange, paso = 0.1 }: {
  label: string; valor: number; onChange: (v: number) => void; paso?: number
}) {
  return (
    <label>
      <span style={lbl}>{label}</span>
      <div style={{ position: 'relative' }}>
        <input type="number" step={paso} min={0}
          value={+(valor * 100).toFixed(4)}
          onChange={e => onChange((parseFloat(e.target.value) || 0) / 100)}
          style={{ ...inp, paddingRight: 24 }} />
        <span style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          fontSize: 12, color: '#555', pointerEvents: 'none', ...MONO,
        }}>%</span>
      </div>
    </label>
  )
}

function Campo({ label, valor, onChange, paso = 1, unidad }: {
  label: string; valor: number; onChange: (v: number) => void; paso?: number; unidad?: string
}) {
  return (
    <label>
      <span style={lbl}>{label}{unidad ? ` (${unidad})` : ''}</span>
      <input type="number" step={paso} min={0} value={valor}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={inp} />
    </label>
  )
}

const grid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10,
}

const subtitulo: React.CSSProperties = {
  fontSize: 12, color: '#777', textTransform: 'uppercase', letterSpacing: 0.8,
  margin: '14px 0 6px', paddingBottom: 3, borderBottom: '1px solid #161616', ...MONO,
}

export default function PanelCoeficientes({
  params, onChange, coef, color = '#90A4AE',
}: {
  params: ParametrosCoef
  onChange: (p: ParametrosCoef) => void
  coef: Coeficientes
  color?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const set = (patch: Partial<ParametrosCoef>) => onChange({ ...params, ...patch })

  return (
    <div style={{ background: '#0c0c0c', border: '1px solid #1e1e1e', marginBottom: 14 }}>

      {/* Cabecera plegable: el resumen siempre visible */}
      <button
        onClick={() => setAbierto(a => !a)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          fontSize: 12, color, letterSpacing: 1, textTransform: 'uppercase', ...MONO,
        }}>
          Coeficientes
        </span>
        <span style={{ fontSize: 12, color: '#666', ...MONO }}>
          Coeficiente resumen{' '}
          <b style={{ color, fontSize: 15 }}>{coef.coeficienteResumen}</b>
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 11, color: '#555',
          transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .15s', ...MONO,
        }}>▶</span>
      </button>

      {abierto && (
        <div style={{ padding: '0 14px 14px' }}>

          <div style={subtitulo}>Amortización, intereses y reparación</div>
          <div style={grid}>
            <Campo label="Trabajo diario" unidad="hs/día" valor={params.hsDia}
              onChange={v => set({ hsDia: v })} />
            <Campo label="Vida útil" unidad="hs" valor={params.vidaUtilHs} paso={500}
              onChange={v => set({ vidaUtilHs: v })} />
            <CampoPct label="Interés anual" valor={params.interesAnual}
              onChange={v => set({ interesAnual: v })} />
            <Campo label="Años de interés" valor={params.aniosInteres}
              onChange={v => set({ aniosInteres: v })} />
            <Campo label="Horas por año" unidad="hs/año" valor={params.hsAnio} paso={100}
              onChange={v => set({ hsAnio: v })} />
            <CampoPct label="Reparación (s/amort.)" valor={params.factorReparacion} paso={1}
              onChange={v => set({ factorReparacion: v })} />
          </div>

          <div style={subtitulo}>Combustibles y lubricantes</div>
          <div style={grid}>
            <Campo label="Consumo cargado" unidad="lts/km" valor={params.consumoCargado} paso={0.05}
              onChange={v => set({ consumoCargado: v })} />
            <Campo label="Consumo vacío" unidad="lts/km" valor={params.consumoVacio} paso={0.05}
              onChange={v => set({ consumoVacio: v })} />
            <Campo label="Consumo equipos" unidad="lts/HP·h" valor={params.consumoEquipos} paso={0.01}
              onChange={v => set({ consumoEquipos: v })} />
            <Campo label="Factor lubricantes" valor={params.factorLubricante} paso={0.05}
              onChange={v => set({ factorLubricante: v })} />
          </div>
          <div style={{ fontSize: 12, color: '#555', marginTop: 5, ...MONO, lineHeight: 1.4 }}>
            El gasoil entra sin IVA (precio ÷ 1,21): el impuesto se suma recién en el
            coeficiente resumen. Actual: {money(coef.combustibleCargado)} $/km cargado ·{' '}
            {money(coef.combustibleVacio)} $/km vacío.
          </div>

          <div style={subtitulo}>Cubiertas, seguros y patentes</div>
          <div style={grid}>
            <Campo label="Cubiertas por equipo" valor={params.cubiertasPorEquipo}
              onChange={v => set({ cubiertasPorEquipo: v })} />
            <Campo label="Vida de cubiertas" unidad="km" valor={params.vidaCubiertasKm} paso={5000}
              onChange={v => set({ vidaCubiertasKm: v })} />
            <CampoPct label="Seguros y patentes" valor={params.segurosAnual}
              onChange={v => set({ segurosAnual: v })} />
          </div>

          {/* ── Coeficiente resumen ── */}
          <div style={subtitulo}>Coeficiente resumen</div>
          <div style={grid}>
            <CampoPct label="Gastos generales"   valor={params.gastosGenerales}
              onChange={v => set({ gastosGenerales: v })} />
            <CampoPct label="Beneficio"          valor={params.beneficio}
              onChange={v => set({ beneficio: v })} />
            <CampoPct label="Gastos financieros" valor={params.gastosFinancieros}
              onChange={v => set({ gastosFinancieros: v })} />
            <CampoPct label="IVA e Ing. Brutos"  valor={params.ivaIngBrutos}
              onChange={v => set({ ivaIngBrutos: v })} />
          </div>

          {/* Desglose en cascada — no es una suma simple */}
          <div style={{
            marginTop: 10, padding: '10px 12px',
            background: '#080808', border: '1px solid #161616',
          }}>
            {([
              ['Costo', 1, false],
              [`+ Gastos generales  ${(params.gastosGenerales * 100).toFixed(1)} %`, params.gastosGenerales, false],
              [`+ Beneficio  ${(params.beneficio * 100).toFixed(1)} %`, params.beneficio, false],
              ['Subtotal', coef.subtotalCostoGGBeneficio, true],
              [`+ Gastos financieros  ${(params.gastosFinancieros * 100).toFixed(1)} % s/subtotal`,
                coef.conGastosFinancieros - coef.subtotalCostoGGBeneficio, false],
              ['Subtotal', coef.conGastosFinancieros, true],
              [`+ IVA e Ing. Brutos  ${(params.ivaIngBrutos * 100).toFixed(1)} % s/subtotal`,
                coef.montoIvaIngBrutos, false],
            ] as const).map(([etiqueta, valor, fuerte], i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '3px 0',
                borderTop: fuerte ? '1px solid #1a1a1a' : 'none',
              }}>
                <span style={{ fontSize: 12, color: fuerte ? '#999' : '#666', ...MONO }}>{etiqueta}</span>
                <span style={{
                  fontSize: 13, color: fuerte ? '#ccc' : '#888',
                  fontWeight: fuerte ? 700 : 400, ...MONO,
                }}>
                  {valor.toFixed(4)}
                </span>
              </div>
            ))}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              marginTop: 6, paddingTop: 6, borderTop: `1px solid ${color}44`,
            }}>
              <span style={{ fontSize: 12, color, letterSpacing: 0.8, textTransform: 'uppercase', ...MONO }}>
                Coeficiente resumen
              </span>
              <span style={{ fontSize: 18, color, fontWeight: 700, ...MONO }}>
                {coef.coeficienteResumen}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
