'use client'
/**
 * Análisis de precio unitario — componente genérico.
 *
 * Los cuatro análisis (material, transporte no pavimentado, transporte
 * pavimentado, construcción) comparten exactamente la misma estructura, así que
 * va uno solo parametrizado. Lo único que cambia entre ellos es la unidad, cómo
 * se computa el combustible y cómo se divide el rendimiento — y eso ya lo
 * resuelve `paramsAPU`.
 *
 *   1. EJECUCIÓN     equipos + mano de obra → costo diario ÷ rendimiento
 *   2. MATERIALES
 *   3. HERRAMIENTAS MENORES Y TRANSPORTE INTERNO
 *   ─────────────────────────────────────────────
 *   COSTO-COSTO × coeficiente resumen = PRECIO
 *   PRECIO ADOPTADO (redondeo a mano) ← el que alimenta el presupuesto
 */

import { useMemo } from 'react'
import {
  calcularAPU, adoptadoDesactualizado, valorEfectivo,
  type Coeficientes, type CostosMdeO, type EquipoCatalogo, type EquipoAPU,
} from '@/lib/ripioCalculo'
import {
  paramsAPU, ETIQUETAS_APU, type ClaveAPU, type ConfigAPU,
} from '@/lib/ripioAnalisis'

const MONO = { fontFamily: 'monospace' } as const

const money = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (n: number, d = 2) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: d })

const inp: React.CSSProperties = {
  background: '#080808', border: '1px solid #1e1e1e', color: '#e0e0e0',
  fontFamily: 'monospace', fontSize: 13, padding: '4px 8px',
  outline: 'none', boxSizing: 'border-box', width: '100%',
}
const th: React.CSSProperties = {
  fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8,
  textAlign: 'left', padding: '5px 6px', borderBottom: '1px solid #1e1e1e', ...MONO,
}
const td: React.CSSProperties = {
  fontSize: 13, color: '#bbb', padding: '4px 6px', borderBottom: '1px solid #111', ...MONO,
}
const btnMini: React.CSSProperties = {
  background: 'transparent', border: '1px solid #2a2a2a', color: '#777',
  fontSize: 12, padding: '3px 9px', cursor: 'pointer', ...MONO,
}

function Seccion({ n, titulo, children }: { n: string; titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 12, color: '#F5C300', letterSpacing: 1, textTransform: 'uppercase',
        marginBottom: 6, paddingBottom: 3, borderBottom: '1px solid #1e1e1e', ...MONO,
      }}>
        {n}. {titulo}
      </div>
      {children}
    </div>
  )
}

function FilaResumen({ label, valor, unidad, destacado }: {
  label: string; valor: string; unidad?: string; destacado?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '5px 0', borderBottom: '1px solid #111',
    }}>
      <span style={{ fontSize: 13, color: destacado ? '#ccc' : '#666', ...MONO }}>{label}</span>
      <span style={{
        fontSize: destacado ? 15 : 13, color: destacado ? '#F5C300' : '#999',
        fontWeight: destacado ? 700 : 400, ...MONO,
      }}>
        {valor}{unidad ? <span style={{ fontSize: 11, color: '#555', marginLeft: 4 }}>{unidad}</span> : null}
      </span>
    </div>
  )
}

export default function PanelAPU({
  clave, cfg, onChange, coef, mdo, dolar, catalogo, distanciaKm,
}: {
  clave: ClaveAPU
  cfg: ConfigAPU
  onChange: (c: ConfigAPU) => void
  coef: Coeficientes
  mdo: CostosMdeO
  dolar: number
  catalogo: EquipoCatalogo[]
  /** Para transporte: km del tramo, para mostrar el precio por tonelada */
  distanciaKm?: number
}) {
  const meta = ETIQUETAS_APU[clave]
  const esTransporte = clave === 'transNoPav' || clave === 'transPav'

  const r = useMemo(
    () => calcularAPU(paramsAPU(clave, cfg), coef, mdo, dolar),
    [clave, cfg, coef, mdo, dolar],
  )

  const set = (patch: Partial<ConfigAPU>) => onChange({ ...cfg, ...patch })

  // ── Equipos ────────────────────────────────────────────────────────────────
  const agregarEquipo = (equipoId: string) => {
    const e = catalogo.find(c => c.id === equipoId)
    if (!e) return
    const nuevo: EquipoAPU = {
      equipoId: e.id, nombre: e.nombre, hp: e.hp, costoUsd: e.costoUsd, cantidad: 1,
    }
    set({ equipos: [...cfg.equipos, nuevo] })
  }
  const editarEquipo = (i: number, patch: Partial<EquipoAPU>) =>
    set({ equipos: cfg.equipos.map((e, j) => j === i ? { ...e, ...patch } : e) })
  const quitarEquipo = (i: number) =>
    set({ equipos: cfg.equipos.filter((_, j) => j !== i) })

  const precioEfectivo = valorEfectivo(r.precioCalculado, cfg.precioAdoptado)
  const desactualizado = adoptadoDesactualizado(r.precioCalculado, cfg.precioAdoptado)

  return (
    <div style={{ padding: '4px 2px' }}>

      {/* ── 1. EJECUCIÓN ───────────────────────────────────────────────── */}
      <Seccion n="1" titulo="Ejecución">

        {/* 1.a Equipos — todo editable: el catálogo es un punto de partida, no
            una jaula. Cada análisis puede tener su propia potencia o su propio
            valor de equipo sin tener que tocar el catálogo compartido. */}
        <div style={{ fontSize: 12, color: '#777', marginBottom: 5, ...MONO }}>1.a — Equipos</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
          <thead>
            <tr>
              <th style={th}>Equipo</th>
              <th style={{ ...th, width: 80, textAlign: 'right' }}>HP</th>
              <th style={{ ...th, width: 130, textAlign: 'right' }}>Costo (U$S)</th>
              <th style={{ ...th, width: 80, textAlign: 'right' }}>Cant.</th>
              <th style={{ ...th, width: 150, textAlign: 'right' }}>Costo ($)</th>
              <th style={{ ...th, width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {cfg.equipos.map((e, i) => (
              <tr key={i}>
                <td style={td}>
                  <input type="text" value={e.nombre}
                    onChange={ev => editarEquipo(i, { nombre: ev.target.value })}
                    style={{ ...inp, padding: '2px 5px' }} />
                </td>
                <td style={td}>
                  <input type="number" min={0} step={1} value={e.hp}
                    onChange={ev => editarEquipo(i, { hp: parseFloat(ev.target.value) || 0 })}
                    style={{ ...inp, textAlign: 'right', padding: '2px 5px' }} />
                </td>
                <td style={td}>
                  <input type="number" min={0} step="any" value={e.costoUsd}
                    onChange={ev => editarEquipo(i, { costoUsd: parseFloat(ev.target.value) || 0 })}
                    style={{ ...inp, textAlign: 'right', padding: '2px 5px' }} />
                </td>
                <td style={td}>
                  {/* Paso de 0,10: la afectación de un equipo a la tarea rara vez
                      cae en medios exactos. 0,5 obligaba a redondear de más. */}
                  <input type="number" step={0.1} min={0} value={e.cantidad}
                    onChange={ev => editarEquipo(i, { cantidad: parseFloat(ev.target.value) || 0 })}
                    style={{ ...inp, textAlign: 'right', padding: '2px 5px' }} />
                </td>
                <td style={{ ...td, textAlign: 'right', color: '#999' }}>
                  {money(e.costoUsd * dolar * e.cantidad)}
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <button onClick={() => quitarEquipo(i)} title="Quitar equipo"
                    style={{ ...btnMini, padding: '1px 7px', color: '#a44' }}>×</button>
                </td>
              </tr>
            ))}
            {cfg.equipos.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, color: '#444', textAlign: 'center', padding: 10 }}>
                Sin equipos — elegí uno del catálogo o cargalo a mano
              </td></tr>
            )}
          </tbody>
          {cfg.equipos.length > 0 && (
            <tfoot>
              <tr>
                <td style={{ ...td, color: '#777' }}>Total</td>
                <td style={{ ...td, textAlign: 'right', color: '#999' }}>{num(r.hpTotal, 0)}</td>
                <td style={td} />
                <td style={td} />
                <td style={{ ...td, textAlign: 'right', color: '#ccc', fontWeight: 700 }}>
                  {money(r.costoEquiposTotal)}
                </td>
                <td style={td} />
              </tr>
            </tfoot>
          )}
        </table>

        {/* Agregar: del catálogo o en blanco */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'stretch' }}>
          <select
            /* key fuerza el remount tras agregar, así el desplegable vuelve
               a mostrar el rótulo en vez de quedar con el último elegido */
            key={cfg.equipos.length}
            defaultValue=""
            onChange={e => { if (e.target.value) agregarEquipo(e.target.value) }}
            style={{ ...inp, flex: 1, cursor: 'pointer' }}
          >
            <option value="">+ Agregar equipo del catálogo…</option>
            {catalogo.map(c => (
              <option key={c.id} value={c.id}>
                {c.nombre}{c.modelo ? ` ${c.modelo}` : ''}{c.marca ? ` · ${c.marca}` : ''}
                {c.hp ? ` — ${c.hp} HP` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={() => set({ equipos: [...cfg.equipos, {
              equipoId: '', nombre: '', hp: 0, costoUsd: 0, cantidad: 1,
            }] })}
            style={{ ...btnMini, whiteSpace: 'nowrap', padding: '4px 12px' }}
            title="Cargar un equipo que no está en el catálogo"
          >
            + En blanco
          </button>
        </div>

        {/* Coeficientes aplicados */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={th}>Designación</th>
              <th style={{ ...th, width: 130, textAlign: 'right' }}>Coef.</th>
              <th style={{ ...th, width: 160, textAlign: 'right' }}>Parcial ($/día)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}>Amortización e intereses</td>
              <td style={{ ...td, textAlign: 'right', color: '#666' }}>{coef.amortMasInt} 1/día</td>
              <td style={{ ...td, textAlign: 'right' }}>{money(r.amortizacionInt)}</td>
            </tr>
            <tr>
              <td style={td}>Reparación y repuestos</td>
              <td style={{ ...td, textAlign: 'right', color: '#666' }}>{num(coef.reparacion, 5)} 1/día</td>
              <td style={{ ...td, textAlign: 'right' }}>{money(r.reparacion)}</td>
            </tr>
            <tr>
              <td style={td}>
                {esTransporte ? 'Combustible y lubricantes (vuelta cargado)' : 'Combustible y lubricantes'}
              </td>
              <td style={{ ...td, textAlign: 'right', color: '#666' }}>
                {esTransporte ? `${money(coef.combustibleCargado)} $/km` : `${money(coef.combustibleEquipos)} $/HP`}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>{money(r.combustible)}</td>
            </tr>
            {esTransporte && (
              <tr>
                <td style={td}>Combustible (ida vacío)</td>
                <td style={{ ...td, textAlign: 'right', color: '#666' }}>{money(coef.combustibleVacio)} $/km</td>
                <td style={{ ...td, textAlign: 'right' }}>{money(r.combustibleVacio)}</td>
              </tr>
            )}
            <tr>
              <td style={td}>Cámaras y cubiertas</td>
              <td style={{ ...td, textAlign: 'right', color: '#666' }}>{money(coef.cubiertas)} $/km</td>
              <td style={{ ...td, textAlign: 'right' }}>{money(r.cubiertas)}</td>
            </tr>
            <tr>
              <td style={td}>Seguros y patentes</td>
              <td style={{ ...td, textAlign: 'right', color: '#666' }}>{num(coef.seguros, 5)} 1/día</td>
              <td style={{ ...td, textAlign: 'right' }}>{money(r.seguros)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} style={{ ...td, color: '#777', textAlign: 'right' }}>
                Subtotal 1.a — Equipos
              </td>
              <td style={{ ...td, textAlign: 'right', color: '#ccc', fontWeight: 700 }}>
                {money(r.subtotalEquipos)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* 1.b Mano de obra */}
        <div style={{ fontSize: 12, color: '#777', marginBottom: 5, ...MONO }}>1.b — Mano de obra</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Nómina</th>
              <th style={{ ...th, width: 90, textAlign: 'right' }}>Cant.</th>
              <th style={{ ...th, width: 90, textAlign: 'right' }}>hs/día</th>
              <th style={{ ...th, width: 130, textAlign: 'right' }}>$/hs</th>
              <th style={{ ...th, width: 150, textAlign: 'right' }}>Parcial ($/día)</th>
            </tr>
          </thead>
          <tbody>
            {([
              ['Oficial especializado', 'oficialEsp',   mdo.oficialEsp.costoHora],
              ['Oficial',               'oficial',      mdo.oficial.costoHora],
              ['Medio oficial',         'medioOficial', mdo.medioOficial.costoHora],
              ['Ayudante',              'ayudante',     mdo.ayudante.costoHora],
            ] as const).map(([label, key, costoHora]) => (
              <tr key={key}>
                <td style={td}>{label}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <input type="number" min={0} step={1} value={cfg.nomina[key]}
                    onChange={e => set({ nomina: { ...cfg.nomina, [key]: parseFloat(e.target.value) || 0 } })}
                    style={{ ...inp, textAlign: 'right', padding: '2px 5px' }} />
                </td>
                <td style={{ ...td, textAlign: 'right', color: '#666' }}>{cfg.nomina.hsDia}</td>
                <td style={{ ...td, textAlign: 'right', color: '#666' }}>{money(costoHora)}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {money(cfg.nomina[key] * cfg.nomina.hsDia * costoHora)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} style={{ ...td, color: '#777', textAlign: 'right' }}>
                Subtotal 1.b — Mano de obra
              </td>
              <td style={{ ...td, textAlign: 'right', color: '#ccc', fontWeight: 700 }}>
                {money(r.subtotalManoObra)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Rendimiento */}
        <div style={{
          display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap',
          marginTop: 12, padding: '10px 12px', background: '#0c0c0c', border: '1px solid #1a1a1a',
        }}>
          <FilaResumenInline label="Costo diario de ejecución" valor={`$ ${money(r.costoDiario)}`} />
          {esTransporte && (
            <label style={{ display: 'block' }}>
              <span style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, ...MONO }}>
                Carga (tn)
              </span>
              <input type="number" min={0} step={1} value={cfg.cargaTn}
                onChange={e => set({ cargaTn: parseFloat(e.target.value) || 0 })}
                style={{ ...inp, width: 90 }} />
            </label>
          )}
          <label style={{ display: 'block' }}>
            <span style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, ...MONO }}>
              {esTransporte ? 'Recorrido (km/día)' : 'Rendimiento (m/día)'}
            </span>
            <input type="number" min={0} step={1} value={cfg.rendimiento}
              onChange={e => set({ rendimiento: parseFloat(e.target.value) || 0 })}
              style={{ ...inp, width: 130 }} />
          </label>
          <FilaResumenInline
            label={`Costo unitario de ejecución (${meta.unidad})`}
            valor={money(r.costoUnitarioEjecucion)}
          />
        </div>
      </Seccion>

      {/* ── 2. MATERIALES ──────────────────────────────────────────────── */}
      <Seccion n="2" titulo="Materiales">
        <ListaEditable
          filas={cfg.materiales}
          columnas={[
            { k: 'designacion', label: 'Designación', tipo: 'texto',  ancho: undefined },
            { k: 'unidad',      label: 'Unidad',      tipo: 'texto',  ancho: 100 },
            { k: 'cantidad',    label: 'Cantidad',    tipo: 'numero', ancho: 110 },
            { k: 'costoOrigen', label: 'Costo origen', tipo: 'numero', ancho: 150 },
          ]}
          nuevo={{ designacion: '', unidad: meta.unidad.replace('$/', ''), cantidad: 1, costoOrigen: 0 }}
          onChange={materiales => set({ materiales })}
          total={r.costoUnitarioMateriales}
          etiquetaTotal={`Costo unitario de materiales (${meta.unidad})`}
        />
      </Seccion>

      {/* ── 3. HERRAMIENTAS ────────────────────────────────────────────── */}
      <Seccion n="3" titulo="Herramientas menores y transporte interno">
        <ListaEditable
          filas={cfg.herramientas}
          columnas={[
            { k: 'designacion', label: 'Designación', tipo: 'texto',  ancho: undefined },
            { k: 'cantidad',    label: 'Cantidad',    tipo: 'numero', ancho: 110 },
            { k: 'valor',       label: 'Valor',       tipo: 'numero', ancho: 150 },
          ]}
          nuevo={{ designacion: '', cantidad: 1, valor: 0 }}
          onChange={herramientas => set({ herramientas })}
          total={r.costoUnitarioHerramientas}
          etiquetaTotal={`Costo unitario de herramientas (${meta.unidad})`}
        />
      </Seccion>

      {/* ── RESUMEN ────────────────────────────────────────────────────── */}
      <div style={{ background: '#0c0c0c', border: '1px solid #1e1e1e', padding: '12px 14px' }}>
        <div style={{
          fontSize: 12, color: '#F5C300', letterSpacing: 1, textTransform: 'uppercase',
          marginBottom: 8, ...MONO,
        }}>
          Resumen
        </div>
        <FilaResumen label="1. Ejecución"    valor={money(r.costoUnitarioEjecucion)}  unidad={meta.unidad} />
        <FilaResumen label="2. Materiales"   valor={money(r.costoUnitarioMateriales)} unidad={meta.unidad} />
        <FilaResumen label="3. Herramientas" valor={money(r.costoUnitarioHerramientas)} unidad={meta.unidad} />
        <FilaResumen label="Costo — costo"   valor={money(r.costoCosto)} unidad={meta.unidad} destacado />
        <FilaResumen label="Coeficiente resumen" valor={String(coef.coeficienteResumen)} />
        <FilaResumen label="Precio calculado" valor={money(r.precioCalculado)} unidad={meta.unidad} destacado />

        {/* Precio adoptado — el que alimenta el presupuesto */}
        <div style={{
          marginTop: 10, paddingTop: 10, borderTop: '1px solid #1e1e1e',
          display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap',
        }}>
          <label style={{ display: 'block' }}>
            <span style={{ fontSize: 11, color: '#F5C300', textTransform: 'uppercase', letterSpacing: 0.8, ...MONO }}>
              Precio adoptado ({meta.unidad})
            </span>
            <input
              type="number" step={0.01}
              value={cfg.precioAdoptado.valor ?? ''}
              placeholder={String(r.precioCalculado)}
              onChange={e => {
                const v = e.target.value.trim()
                set({ precioAdoptado: { valor: v === '' ? null : parseFloat(v) } })
              }}
              style={{ ...inp, width: 180, fontSize: 15, color: '#F5C300', fontWeight: 700 }} />
          </label>
          {cfg.precioAdoptado.valor != null && (
            <button
              onClick={() => set({ precioAdoptado: { valor: null } })}
              style={{ ...btnMini, padding: '5px 10px' }}
              title="Volver a usar el precio calculado"
            >
              ↺ Usar calculado
            </button>
          )}
          {esTransporte && distanciaKm != null && distanciaKm > 0 && (
            <div style={{ fontSize: 13, color: '#888', ...MONO }}>
              × {num(distanciaKm, 2)} km ={' '}
              <span style={{ color: '#F5C300', fontWeight: 700 }}>
                $ {money(precioEfectivo * distanciaKm)}
              </span>
              <span style={{ fontSize: 11, color: '#555', marginLeft: 4 }}>$/tn</span>
            </div>
          )}
        </div>

        {desactualizado && (
          <div style={{
            marginTop: 10, padding: '7px 10px',
            background: '#2a1a00', border: '1px solid #7a4b00',
          }}>
            <div style={{ fontSize: 12, color: '#F5C300', fontWeight: 700, ...MONO }}>
              ⚠ El precio adoptado quedó desactualizado
            </div>
            <div style={{ fontSize: 12, color: '#a89880', marginTop: 3, lineHeight: 1.4, ...MONO }}>
              Cambiaron los insumos y el cálculo dio {money(r.precioCalculado)}, pero seguís
              presupuestando con {money(precioEfectivo)}. Revisalo antes de presentar.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FilaResumenInline({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, ...MONO }}>
        {label}
      </div>
      <div style={{ fontSize: 15, color: '#F5C300', fontWeight: 700, ...MONO }}>{valor}</div>
    </div>
  )
}

/** Tabla editable genérica para materiales y herramientas */
function ListaEditable<T extends Record<string, unknown>>({
  filas, columnas, nuevo, onChange, total, etiquetaTotal,
}: {
  filas: T[]
  columnas: { k: keyof T & string; label: string; tipo: 'texto' | 'numero'; ancho?: number }[]
  nuevo: T
  onChange: (f: T[]) => void
  total: number
  etiquetaTotal: string
}) {
  const editar = (i: number, k: string, v: unknown) =>
    onChange(filas.map((f, j) => j === i ? { ...f, [k]: v } : f))

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columnas.map(c => (
              <th key={c.k} style={{ ...th, width: c.ancho, textAlign: c.tipo === 'numero' ? 'right' : 'left' }}>
                {c.label}
              </th>
            ))}
            <th style={{ ...th, width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              {columnas.map(c => (
                <td key={c.k} style={td}>
                  <input
                    type={c.tipo === 'numero' ? 'number' : 'text'}
                    step={c.tipo === 'numero' ? 'any' : undefined}
                    value={String(f[c.k] ?? '')}
                    onChange={e => editar(i, c.k,
                      c.tipo === 'numero' ? (parseFloat(e.target.value) || 0) : e.target.value)}
                    style={{ ...inp, textAlign: c.tipo === 'numero' ? 'right' : 'left', padding: '2px 5px' }} />
                </td>
              ))}
              <td style={{ ...td, textAlign: 'center' }}>
                <button onClick={() => onChange(filas.filter((_, j) => j !== i))}
                  style={{ ...btnMini, padding: '1px 7px', color: '#a44' }}>×</button>
              </td>
            </tr>
          ))}
          {filas.length === 0 && (
            <tr><td colSpan={columnas.length + 1} style={{ ...td, color: '#444', textAlign: 'center', padding: 8 }}>
              Sin ítems
            </td></tr>
          )}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <button onClick={() => onChange([...filas, { ...nuevo }])} style={btnMini}>+ Agregar</button>
        <span style={{ fontSize: 12, color: '#777', ...MONO }}>
          {etiquetaTotal}:{' '}
          <span style={{ color: '#ccc', fontWeight: 700, fontSize: 13 }}>{money(total)}</span>
        </span>
      </div>
    </>
  )
}
