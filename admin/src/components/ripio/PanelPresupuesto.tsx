'use client'
/**
 * Presupuesto oficial.
 *
 * Replica el formato de la planilla: ítems I a IV con sus sub-renglones,
 * columnas de cantidad y precio unitario/parcial, total y monto en letras.
 *
 * Una diferencia deliberada con la planilla original: ahí el ítem I usaba el
 * tonelaje redondeado (12.570) pero el ítem II tomaba el sin redondear (12.576),
 * porque la fórmula apuntaba al valor previo. Se compraba material para 12.570 y
 * se pagaba flete por 12.576. Acá las dos partidas usan el valor adoptado.
 */

import { useMemo } from 'react'
import {
  calcularAPU, calcularComputo, calcularPresupuesto, montoEnLetras,
  valorEfectivo, adoptadoDesactualizado,
  type Coeficientes, type CostosMdeO, type TramoComputo,
} from '@/lib/ripioCalculo'
import { paramsAPU, type AnalisisRipio } from '@/lib/ripioAnalisis'

const MONO = { fontFamily: 'monospace' } as const

const money = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const inp: React.CSSProperties = {
  background: '#080808', border: '1px solid #1e1e1e', color: '#e0e0e0',
  fontFamily: 'monospace', fontSize: 13, padding: '3px 7px',
  outline: 'none', boxSizing: 'border-box',
}

/** Celda de la tabla impresa — bordes finos como la planilla */
const cel: React.CSSProperties = {
  border: '1px solid #2a2a2a', padding: '4px 7px', fontSize: 13,
  color: '#ccc', verticalAlign: 'middle', ...MONO,
}
const celNum: React.CSSProperties = { ...cel, textAlign: 'right', whiteSpace: 'nowrap' }
const celHead: React.CSSProperties = {
  ...cel, background: '#141414', color: '#888', fontSize: 12,
  textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5,
}

/** Campo calculado / adoptado, con aviso si quedó viejo */
function Adoptado({ label, calculado, adoptado, onChange, unidad, decimales = 2 }: {
  label: string
  calculado: number
  adoptado: { valor: number | null }
  onChange: (v: number | null) => void
  unidad: string
  decimales?: number
}) {
  const efectivo = valorEfectivo(calculado, adoptado)
  const viejo    = adoptadoDesactualizado(calculado, adoptado)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, ...MONO }}>
          {label} — calculado
        </div>
        <div style={{ fontSize: 14, color: '#888', ...MONO, padding: '4px 0' }}>
          {calculado.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}
          <span style={{ fontSize: 11, color: '#444', marginLeft: 4 }}>{unidad}</span>
        </div>
      </div>
      <div style={{ fontSize: 16, color: '#333', paddingBottom: 6 }}>→</div>
      <div>
        <div style={{ fontSize: 11, color: '#F5C300', textTransform: 'uppercase', letterSpacing: 0.8, ...MONO }}>
          Adoptado
        </div>
        <input
          type="number" step="any"
          value={adoptado.valor ?? ''}
          placeholder={String(+calculado.toFixed(decimales))}
          onChange={e => {
            const v = e.target.value.trim()
            onChange(v === '' ? null : parseFloat(v))
          }}
          style={{ ...inp, width: 150, fontSize: 15, color: '#F5C300', fontWeight: 700 }} />
      </div>
      {adoptado.valor != null && (
        <button onClick={() => onChange(null)}
          style={{
            background: 'transparent', border: '1px solid #2a2a2a', color: '#777',
            fontSize: 12, padding: '4px 9px', cursor: 'pointer', marginBottom: 1, ...MONO,
          }}
          title="Volver a usar el calculado">↺</button>
      )}
      {viejo && (
        <span style={{ fontSize: 12, color: '#F5C300', paddingBottom: 6, ...MONO }}>
          ⚠ el cálculo cambió a {calculado.toLocaleString('es-AR', { maximumFractionDigits: decimales })}
        </span>
      )}
      <span style={{ fontSize: 12, color: '#555', paddingBottom: 6, ...MONO }}>
        se usa: <b style={{ color: '#ccc' }}>{efectivo.toLocaleString('es-AR', { maximumFractionDigits: decimales })}</b> {unidad}
      </span>
    </div>
  )
}

export default function PanelPresupuesto({
  analisis, onChange, tramos, coef, mdo, color = '#90A4AE',
}: {
  analisis: AnalisisRipio
  onChange: (a: AnalisisRipio) => void
  tramos: TramoComputo[]
  coef: Coeficientes
  mdo: CostosMdeO
  color?: string
}) {
  const dolar = analisis.precios.dolar

  // Cómputo desde los tramos dibujados en el mapa
  const computo = useMemo(() => calcularComputo(tramos), [tramos])

  // Precio de cada análisis, ya con el adoptado aplicado
  const precios = useMemo(() => {
    const p = (k: keyof typeof analisis.apu) => {
      const cfg = analisis.apu[k]
      const r = calcularAPU(paramsAPU(k, cfg), coef, mdo, dolar)
      return valorEfectivo(r.precioCalculado, cfg.precioAdoptado)
    }
    return {
      material:     p('material'),
      transNoPav:   p('transNoPav'),
      transPav:     p('transPav'),
      construccion: p('construccion'),
    }
  }, [analisis.apu, coef, mdo, dolar])

  const toneladas = valorEfectivo(computo.toneladasCalculado, analisis.toneladasAdoptadas)
  const metros    = valorEfectivo(computo.largoTotalM,        analisis.metrosAdoptados)

  const pres = useMemo(() => calcularPresupuesto({
    toneladas, metros,
    distanciaNoPavKm: analisis.datos.distanciaNoPavKm,
    distanciaPavKm:   analisis.datos.distanciaPavKm,
    precioMaterial:   precios.material,
    precioTransNoPav: precios.transNoPav,
    precioTransPav:   precios.transPav,
    precioEjecucion:  precios.construccion,
    movilizacion:     analisis.movilizacion,
    tipoMaterial:     analisis.datos.tipoMaterial,
    tramo:            analisis.datos.tramo,
  }), [toneladas, metros, analisis.datos, analisis.movilizacion, precios])

  const set = (patch: Partial<AnalisisRipio>) => onChange({ ...analisis, ...patch })
  const setDato = (k: keyof AnalisisRipio['datos'], v: string | number) =>
    onChange({ ...analisis, datos: { ...analisis.datos, [k]: v } })

  const d = analisis.datos
  const lbl: React.CSSProperties = {
    fontSize: 11, color: '#555', textTransform: 'uppercase',
    letterSpacing: 0.8, display: 'block', marginBottom: 2, ...MONO,
  }

  return (
    <div>
      {/* ═══ Controles (no se imprimen) ═══ */}
      <div className="no-print">

        {/* Cantidades adoptadas */}
        <div style={{ background: '#0c0c0c', border: '1px solid #1e1e1e', padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, ...MONO }}>
            Cantidades
          </div>
          <div style={{ fontSize: 12, color: '#555', marginBottom: 10, ...MONO, lineHeight: 1.4 }}>
            Salen de los tramos dibujados en el mapa. El valor adoptado es el que va al
            presupuesto — tanto en provisión como en transporte.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Adoptado
              label="Provisión" unidad="tn" decimales={2}
              calculado={computo.toneladasCalculado}
              adoptado={analisis.toneladasAdoptadas}
              onChange={v => set({ toneladasAdoptadas: { valor: v } })} />
            <Adoptado
              label="Ejecución" unidad="m" decimales={2}
              calculado={computo.largoTotalM}
              adoptado={analisis.metrosAdoptados}
              onChange={v => set({ metrosAdoptados: { valor: v } })} />
          </div>
          {tramos.length === 0 && (
            <div style={{ fontSize: 12, color: '#7a4b00', marginTop: 8, ...MONO }}>
              No hay tramos cargados: dibujá el trazado en la pestaña Cómputo o cargá los
              valores a mano en Adoptado.
            </div>
          )}
        </div>

        {/* Datos de la obra */}
        <div style={{ background: '#0c0c0c', border: '1px solid #1e1e1e', padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, ...MONO }}>
            Datos de la obra
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <label><span style={lbl}>Tramo</span>
              <input value={d.tramo} onChange={e => setDato('tramo', e.target.value)}
                placeholder="T058 y T008" style={{ ...inp, width: '100%' }} /></label>
            <label><span style={lbl}>Material</span>
              <input value={d.material} onChange={e => setDato('material', e.target.value)}
                style={{ ...inp, width: '100%' }} /></label>
            <label><span style={lbl}>Tipo</span>
              <input value={d.tipoMaterial} onChange={e => setDato('tipoMaterial', e.target.value)}
                style={{ ...inp, width: '100%' }} /></label>
            <label><span style={lbl}>Origen (cantera)</span>
              <input value={d.origen} onChange={e => setDato('origen', e.target.value)}
                style={{ ...inp, width: '100%' }} /></label>
            <label><span style={lbl}>Distancia no pavimentada (km)</span>
              <input type="number" min={0} step="any" value={d.distanciaNoPavKm}
                onChange={e => setDato('distanciaNoPavKm', parseFloat(e.target.value) || 0)}
                style={{ ...inp, width: '100%' }} /></label>
            <label><span style={lbl}>Distancia pavimentada (km)</span>
              <input type="number" min={0} step="any" value={d.distanciaPavKm}
                onChange={e => setDato('distanciaPavKm', parseFloat(e.target.value) || 0)}
                style={{ ...inp, width: '100%' }} /></label>
            <label><span style={lbl}>Movilización de obra ($)</span>
              <input type="number" min={0} step="any" value={analisis.movilizacion}
                onChange={e => set({ movilizacion: parseFloat(e.target.value) || 0 })}
                style={{ ...inp, width: '100%' }} /></label>
          </div>
        </div>

        <button
          onClick={() => window.print()}
          style={{
            background: '#F5C300', border: 'none', color: '#111', fontWeight: 700,
            fontSize: 13, padding: '8px 18px', cursor: 'pointer', letterSpacing: 0.8,
            marginBottom: 14, ...MONO,
          }}>
          🖨 Imprimir presupuesto
        </button>
      </div>

      {/* ═══ Planilla imprimible ═══ */}
      <div className="print-area" style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', padding: 18 }}>

        <div style={{
          textAlign: 'center', fontSize: 15, fontWeight: 700, letterSpacing: 1.5,
          color: '#e0e0e0', marginBottom: 14, ...MONO,
        }}>
          PRESUPUESTO OFICIAL
        </div>

        {(d.obra || d.tramo) && (
          <div style={{ fontSize: 12, color: '#777', marginBottom: 10, ...MONO, lineHeight: 1.5 }}>
            {d.obra   && <div><b style={{ color: '#999' }}>Obra:</b> {d.obra}</div>}
            {d.tramo  && <div><b style={{ color: '#999' }}>Tramo:</b> {d.tramo}</div>}
            {d.origen && <div><b style={{ color: '#999' }}>Origen:</b> {d.origen}</div>}
          </div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...celHead, width: 60 }} rowSpan={2}>Nº de ítem</th>
              <th style={celHead} rowSpan={2}>Designación de obra</th>
              <th style={{ ...celHead, width: 48 }} rowSpan={2}>Un.</th>
              <th style={{ ...celHead, width: 100 }} rowSpan={2}>Cantidad</th>
              <th style={celHead} colSpan={2}>Precio</th>
            </tr>
            <tr>
              <th style={{ ...celHead, width: 130 }}>Unitario</th>
              <th style={{ ...celHead, width: 160 }}>Parcial</th>
            </tr>
          </thead>
          <tbody>
            {pres.items.map((it, i) => {
              const primeroDelGrupo = i === 0 || pres.items[i - 1].numero !== it.numero
              return (
                <tr key={i}>
                  <td style={{ ...cel, textAlign: 'center', fontWeight: 700, color: '#999' }}>
                    {primeroDelGrupo ? it.numero : ''}
                  </td>
                  <td style={cel}>
                    {primeroDelGrupo && (
                      <div style={{ fontWeight: 700, color: '#e0e0e0' }}>{it.designacion}</div>
                    )}
                    {it.detalle && (
                      <div style={{ color: '#888', paddingLeft: primeroDelGrupo ? 12 : 0 }}>
                        {it.detalle}
                      </div>
                    )}
                  </td>
                  <td style={{ ...cel, textAlign: 'center', color: '#888' }}>{it.unidad}</td>
                  <td style={celNum}>{money(it.cantidad)}</td>
                  <td style={celNum}>
                    {money(it.precioUnitario)}
                    <span style={{ color: '#555', marginLeft: 4, fontSize: 11 }}>$/{it.unidad}</span>
                  </td>
                  <td style={{ ...celNum, color: it.parcial > 0 ? '#e0e0e0' : '#555' }}>
                    {it.parcial > 0 ? `$ ${money(it.parcial)}` : '$  —'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{
                ...cel, textAlign: 'right', fontWeight: 700, letterSpacing: 2,
                color: '#999', border: 'none',
              }}>
                T O T A L
              </td>
              <td style={{
                ...celNum, fontWeight: 700, fontSize: 15, color: '#F5C300',
                background: '#111',
              }}>
                $ {money(pres.total)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div style={{
          marginTop: 14, padding: '10px 12px', border: '1px solid #2a2a2a',
          fontSize: 13, color: '#bbb', lineHeight: 1.5, ...MONO,
        }}>
          El presupuesto oficial asciende a la suma de{' '}
          <b style={{ color: '#e0e0e0' }}>{montoEnLetras(pres.total)}</b>{' '}
          <b style={{ color: '#e0e0e0' }}>($ {money(pres.total)}).</b>
        </div>
      </div>

      {/* CSS de impresión: A4 vertical, solo la planilla */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area {
            position: absolute !important; top: 0 !important; left: 0 !important;
            width: 100% !important; background: #fff !important;
            border: none !important; padding: 0 !important; color: #000 !important;
          }
          .print-area * { color: #000 !important; background: transparent !important; }
          .print-area th, .print-area td { border-color: #000 !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  )
}
