'use client'
/**
 * Mano de obra: del jornal de convenio al costo horario real.
 *
 * Muestra la cadena completa porque el resultado no es intuitivo — el costo
 * real casi duplica el jornal (incidencia ~1,97). Sin ver el desglose, ese
 * número parece arbitrario.
 *
 *   180 hs × jornal + presentismo        = BRUTO
 *   − retenciones al trabajador           = NETO
 *   + cargas sociales (~75 %)             = COSTO TOTAL LABORAL
 *   ÷ horas                               = costo real $/hs
 *   + suma no remunerativa prorrateada    = COSTO HORARIO  ← el que usan los APU
 *
 * La suma no remunerativa es editable y puede ser cero: no todos los acuerdos
 * paritarios la contemplan.
 */

import { useState } from 'react'
import type { CostosMdeO, ParametrosMdeO, PreciosBase } from '@/lib/ripioCalculo'
import { desgloseCargas } from '@/lib/ripioCalculo'

const MONO = { fontFamily: 'monospace' } as const

const money = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const inp: React.CSSProperties = {
  background: '#080808', border: '1px solid #1e1e1e', color: '#e0e0e0',
  fontFamily: 'monospace', fontSize: 13, padding: '3px 6px',
  outline: 'none', boxSizing: 'border-box', width: '100%', textAlign: 'right',
}
const th: React.CSSProperties = {
  fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 0.6,
  padding: '5px 6px', borderBottom: '1px solid #1e1e1e', textAlign: 'right', ...MONO,
}
const td: React.CSSProperties = {
  fontSize: 13, color: '#999', padding: '3px 6px',
  borderBottom: '1px solid #111', textAlign: 'right', ...MONO,
}
const tdLbl: React.CSSProperties = { ...td, textAlign: 'left', color: '#777' }

const CATS = [
  { k: 'oficialEsp'   as const, label: 'Of. especializado', precio: 'jornalOficialEsp'   as const },
  { k: 'oficial'      as const, label: 'Oficial',           precio: 'jornalOficial'      as const },
  { k: 'medioOficial' as const, label: 'Medio oficial',     precio: 'jornalMedioOficial' as const },
  { k: 'ayudante'     as const, label: 'Ayudante',          precio: 'jornalAyudante'     as const },
]

export default function PanelManoObra({
  params, onChange, precios, mdo, color = '#90A4AE',
}: {
  params: ParametrosMdeO
  onChange: (p: ParametrosMdeO) => void
  precios: PreciosBase
  mdo: CostosMdeO
  color?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const set = (patch: Partial<ParametrosMdeO>) => onChange({ ...params, ...patch })
  const cargas = desgloseCargas(params)

  const setNoRem = (k: typeof CATS[number]['k'], v: number) =>
    set({ noRemunerativo: { ...params.noRemunerativo, [k]: v } })

  const hayNoRem = CATS.some(c => params.noRemunerativo[c.k] > 0)

  return (
    <div style={{ background: '#0c0c0c', border: '1px solid #1e1e1e', marginBottom: 14 }}>

      <button
        onClick={() => setAbierto(a => !a)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, color, letterSpacing: 1, textTransform: 'uppercase', ...MONO }}>
          Mano de obra
        </span>
        <span style={{ fontSize: 12, color: '#666', ...MONO }}>
          Cargas sociales <b style={{ color: '#999' }}>{(cargas.total * 100).toFixed(2)} %</b>
          {' · '}incidencia <b style={{ color: '#999' }}>{mdo.oficialEsp.incidencia}×</b>
        </span>
        <span style={{
          fontSize: 12, ...MONO,
          color: hayNoRem ? color : '#444',
        }}>
          {hayNoRem ? 'con suma no remunerativa' : 'sin suma no remunerativa'}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 11, color: '#555',
          transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .15s', ...MONO,
        }}>▶</span>
      </button>

      {abierto && (
        <div style={{ padding: '0 14px 14px', overflowX: 'auto' }}>

          {/* Parámetros generales */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
            <label>
              <span style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 2, ...MONO }}>
                Horas por mes
              </span>
              <input type="number" min={1} step={1} value={params.hsMes}
                onChange={e => set({ hsMes: parseFloat(e.target.value) || 0 })}
                style={{ ...inp, width: 110 }} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 2, ...MONO }}>
                Presentismo (%)
              </span>
              <input type="number" min={0} step={1} value={+(params.presentismo * 100).toFixed(2)}
                onChange={e => set({ presentismo: (parseFloat(e.target.value) || 0) / 100 })}
                style={{ ...inp, width: 110 }} />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 2, ...MONO }}>
                Hs. prorrateo no rem.
              </span>
              <input type="number" min={0} step={1} value={params.hsProrrateoNoRem}
                onChange={e => set({ hsProrrateoNoRem: parseFloat(e.target.value) || 0 })}
                style={{ ...inp, width: 140 }} />
            </label>
          </div>

          {/* Cadena completa por categoría */}
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Concepto</th>
                {CATS.map(c => <th key={c.k} style={th}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdLbl}>Jornal de convenio ($/hs)</td>
                {CATS.map(c => (
                  <td key={c.k} style={{ ...td, color: '#bbb' }}>{money(precios[c.precio])}</td>
                ))}
              </tr>
              <tr>
                <td style={tdLbl}>Bruto ({params.hsMes} hs + presentismo)</td>
                {CATS.map(c => <td key={c.k} style={td}>{money(mdo[c.k].bruto)}</td>)}
              </tr>
              <tr>
                <td style={tdLbl}>− Retenciones ({(mdo.pctRetenciones * 100).toFixed(1)} %)</td>
                {CATS.map(c => (
                  <td key={c.k} style={{ ...td, color: '#a77' }}>−{money(mdo[c.k].retenciones)}</td>
                ))}
              </tr>
              <tr>
                <td style={tdLbl}>Neto</td>
                {CATS.map(c => <td key={c.k} style={td}>{money(mdo[c.k].neto)}</td>)}
              </tr>
              <tr>
                <td style={tdLbl}>+ Cargas sociales ({(cargas.total * 100).toFixed(2)} %)</td>
                {CATS.map(c => (
                  <td key={c.k} style={{ ...td, color: '#7a9' }}>+{money(mdo[c.k].cargasSociales)}</td>
                ))}
              </tr>
              <tr>
                <td style={{ ...tdLbl, color: '#999' }}>Costo total laboral</td>
                {CATS.map(c => (
                  <td key={c.k} style={{ ...td, color: '#ccc', fontWeight: 700 }}>
                    {money(mdo[c.k].costoTotalLaboral)}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={tdLbl}>Costo real ($/hs)</td>
                {CATS.map(c => <td key={c.k} style={td}>{money(mdo[c.k].costoRealHora)}</td>)}
              </tr>

              {/* ── Suma no remunerativa — editable ── */}
              <tr style={{ background: '#101010' }}>
                <td style={{ ...tdLbl, color, paddingTop: 7, paddingBottom: 3 }}>
                  Suma no remunerativa ($/mes)
                </td>
                {CATS.map(c => (
                  <td key={c.k} style={{ ...td, paddingTop: 7, paddingBottom: 3 }}>
                    <input type="number" min={0} step="any" value={params.noRemunerativo[c.k]}
                      onChange={e => setNoRem(c.k, parseFloat(e.target.value) || 0)}
                      style={{ ...inp, color, fontWeight: 700 }} />
                  </td>
                ))}
              </tr>
              <tr style={{ background: '#101010' }}>
                <td style={{ ...tdLbl, fontSize: 12, color: '#555', paddingBottom: 7 }}>
                  prorrateada ÷ {params.hsProrrateoNoRem} hs
                </td>
                {CATS.map(c => (
                  <td key={c.k} style={{ ...td, fontSize: 12, color: '#777', paddingBottom: 7 }}>
                    + {money(mdo[c.k].noRemunerativo)} $/hs
                  </td>
                ))}
              </tr>

              <tr>
                <td style={{ ...tdLbl, color, fontWeight: 700, borderTop: `1px solid ${color}44` }}>
                  Costo horario
                </td>
                {CATS.map(c => (
                  <td key={c.k} style={{
                    ...td, color, fontWeight: 700, fontSize: 15,
                    borderTop: `1px solid ${color}44`,
                  }}>
                    {money(mdo[c.k].costoHora)}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ ...tdLbl, fontSize: 12, color: '#555' }}>Incidencia sobre el jornal</td>
                {CATS.map(c => (
                  <td key={c.k} style={{ ...td, fontSize: 12, color: '#666' }}>
                    {mdo[c.k].incidencia}×
                  </td>
                ))}
              </tr>
            </tbody>
          </table>

          <div style={{ fontSize: 12, color: '#555', marginTop: 8, ...MONO, lineHeight: 1.5 }}>
            El <b style={{ color: '#888' }}>costo horario</b> es el que usan los cuatro análisis
            de precio. Si el acuerdo no contempla suma no remunerativa, poné cero en las cuatro
            categorías y el cálculo la ignora.
          </div>

          {/* Porcentajes de retenciones y cargas */}
          <details style={{ marginTop: 12 }}>
            <summary style={{
              fontSize: 12, color: '#666', cursor: 'pointer', ...MONO,
              textTransform: 'uppercase', letterSpacing: 0.8,
            }}>
              Retenciones y cargas sociales — detalle
            </summary>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: 6, marginTop: 10,
            }}>
              {params.retenciones.map((r, i) => (
                <FilaPct key={`r${i}`} nombre={r.nombre} pct={r.pct} signo="−"
                  onChange={v => set({
                    retenciones: params.retenciones.map((x, j) => j === i ? { ...x, pct: v } : x),
                  })} />
              ))}
              {params.contribuciones.map((c, i) => (
                <FilaPct key={`c${i}`} nombre={c.nombre} pct={c.pct} signo="+"
                  onChange={v => set({
                    contribuciones: params.contribuciones.map((x, j) => j === i ? { ...x, pct: v } : x),
                  })} />
              ))}
              {params.adicionales.map((c, i) => (
                <FilaPct key={`a${i}`} nombre={c.nombre} pct={c.pct} signo="+"
                  onChange={v => set({
                    adicionales: params.adicionales.map((x, j) => j === i ? { ...x, pct: v } : x),
                  })} />
              ))}
              <FilaPct nombre="Vacaciones 14 días" pct={params.vacaciones} signo="+"
                onChange={v => set({ vacaciones: v })} />
              <FilaPct nombre="SAC" pct={params.sac} signo="+"
                onChange={v => set({ sac: v })} />
            </div>
            <div style={{
              fontSize: 12, color: '#555', marginTop: 10, padding: '7px 10px',
              background: '#080808', border: '1px solid #161616', ...MONO, lineHeight: 1.5,
            }}>
              Dos porcentajes son <b style={{ color: '#888' }}>derivados</b>, no se cargan a mano:
              <br />
              C. Soc. s/vacaciones = vacaciones × subtotal contribuciones ={' '}
              <b style={{ color: '#999' }}>{(cargas.cSocSobreVacaciones * 100).toFixed(4)} %</b>
              <br />
              C. Soc. s/SAC = SAC × {(params.factorCargasSobreSAC * 100).toFixed(2)} % ={' '}
              <b style={{ color: '#999' }}>{(cargas.cSocSobreSAC * 100).toFixed(4)} %</b>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

function FilaPct({ nombre, pct, signo, onChange }: {
  nombre: string; pct: number; signo: '+' | '−'; onChange: (v: number) => void
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12, color: '#666', flex: 1, ...MONO }}>
        <span style={{ color: signo === '−' ? '#a77' : '#7a9', marginRight: 3 }}>{signo}</span>
        {nombre}
      </span>
      <input type="number" min={0} step={0.01} value={+(pct * 100).toFixed(4)}
        onChange={e => onChange((parseFloat(e.target.value) || 0) / 100)}
        style={{ ...inp, width: 78 }} />
      <span style={{ fontSize: 12, color: '#444', ...MONO }}>%</span>
    </label>
  )
}
