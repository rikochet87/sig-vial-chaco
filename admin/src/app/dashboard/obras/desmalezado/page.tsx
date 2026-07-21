'use client'
import { useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TramoInput {
  ruta: string
  margen: 'izquierdo' | 'derecho' | 'ambos'
  prog_inicio_km: string
  prog_fin_km: string
  ancho_banquina_m: string
}

interface Tramo {
  id: string
  ruta: string
  margen: string
  prog_inicio_km: number
  prog_fin_km: number
  ancho_banquina_m: number
  superficie_ha: number
}

interface Certificado {
  id: string
  numero_certificado: number
  mes: number
  anio: number
  fecha_medicion: string | null
  superficie_ha_certificada: number
  precio_unitario_ha: number
  monto_total: number
  monto_dvp: number
  monto_cc: number
  estado: 'pendiente' | 'aprobado' | 'pagado'
  fecha_aprobacion: string | null
  fecha_pago: string | null
  observaciones: string | null
}

interface ObraDesmalezado {
  id: string
  numero_actuacion: string | null
  consorcio_id: number
  consorcio_nombre: string
  delegacion_zona: string
  fecha_inicio: string
  fecha_fin: string
  plazo_meses: number
  altura_max_corte_m: number
  precio_unitario_ha: number
  rendimiento_ha_dia: number
  total_superficie_ha: number
  presupuesto_total: number
  aporte_dvp_pct: number
  aporte_cc_pct: number
  estado: 'borrador' | 'aprobado' | 'en_ejecucion' | 'finalizado' | 'rescindido'
  observaciones: string | null
  created_at: string
  tramos: Tramo[]
  certificados: Certificado[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const ESTADO_CLR: Record<string, string> = {
  borrador:      '#555',
  aprobado:      '#1976D2',
  en_ejecucion:  '#66BB6A',
  finalizado:    '#F5C300',
  rescindido:    '#EF5350',
}
const ESTADO_LABEL: Record<string, string> = {
  borrador:      'Borrador',
  aprobado:      'Aprobado',
  en_ejecucion:  'En ejecución',
  finalizado:    'Finalizado',
  rescindido:    'Rescindido',
}
const CERT_CLR: Record<string, string> = {
  pendiente: '#555',
  aprobado:  '#1976D2',
  pagado:    '#66BB6A',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2) }

function calcSupHa(prog_inicio: number, prog_fin: number, ancho: number) {
  return Math.abs(prog_fin - prog_inicio) * 1000 * ancho / 10000
}

function fmtARS(n: number) {
  return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtHa(n: number) { return n.toFixed(2) + ' ha' }

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

// ─── Nueva Obra Form ──────────────────────────────────────────────────────────

const FORM0 = {
  numero_actuacion: '',
  consorcio_id: '',
  consorcio_nombre: '',
  delegacion_zona: '',
  fecha_inicio: '',
  fecha_fin: '',
  plazo_meses: '6',
  altura_max_corte_m: '0.15',
  precio_unitario_ha: '',
  rendimiento_ha_dia: '18.00',
  aporte_dvp_pct: '80',
  aporte_cc_pct: '20',
  observaciones: '',
}

const TRAMO0: TramoInput = {
  ruta: 'RP',
  margen: 'izquierdo',
  prog_inicio_km: '0.000',
  prog_fin_km: '',
  ancho_banquina_m: '15.00',
}

function NuevaObraForm({ onCreated }: { onCreated: (obra: ObraDesmalezado) => void }) {
  const [form, setForm] = useState(FORM0)
  const [tramos, setTramos] = useState<TramoInput[]>([{ ...TRAMO0 }])
  const [err, setErr] = useState<string | null>(null)

  const set = (k: keyof typeof FORM0, v: string) => setForm(f => ({ ...f, [k]: v }))

  const totalHa = tramos.reduce((s, t) => {
    const pi = parseFloat(t.prog_inicio_km) || 0
    const pf = parseFloat(t.prog_fin_km) || 0
    const aw = parseFloat(t.ancho_banquina_m) || 15
    return s + calcSupHa(pi, pf, aw)
  }, 0)

  const precioUH        = parseFloat(form.precio_unitario_ha) || 0
  const plazoM          = parseInt(form.plazo_meses) || 6
  const dvpPct          = parseFloat(form.aporte_dvp_pct) || 80
  const ccPct           = parseFloat(form.aporte_cc_pct) || 20
  const presupuestoTotal = totalHa * precioUH * plazoM
  const montoDVP        = presupuestoTotal * dvpPct / 100
  const montoCC         = presupuestoTotal * ccPct / 100

  const addTramo    = () => setTramos(t => [...t, { ...TRAMO0 }])
  const removeTramo = (i: number) => setTramos(t => t.filter((_, j) => j !== i))
  const setTramo    = (i: number, k: keyof TramoInput, v: string) =>
    setTramos(t => t.map((tr, j) => j === i ? { ...tr, [k]: v } : tr))

  function submit() {
    if (!form.consorcio_nombre || !form.fecha_inicio || !form.fecha_fin || !form.precio_unitario_ha) {
      setErr('Completar: consorcio, fechas y precio unitario'); return
    }
    if (tramos.some(t => !t.prog_fin_km || !t.ruta)) {
      setErr('Todos los tramos deben tener ruta y progresiva final'); return
    }
    setErr(null)

    const tramoObjs: Tramo[] = tramos.map(t => ({
      id:               uid(),
      ruta:             t.ruta,
      margen:           t.margen,
      prog_inicio_km:   parseFloat(t.prog_inicio_km),
      prog_fin_km:      parseFloat(t.prog_fin_km),
      ancho_banquina_m: parseFloat(t.ancho_banquina_m) || 15,
      superficie_ha:    calcSupHa(parseFloat(t.prog_inicio_km)||0, parseFloat(t.prog_fin_km)||0, parseFloat(t.ancho_banquina_m)||15),
    }))

    const obra: ObraDesmalezado = {
      id:                 uid(),
      numero_actuacion:   form.numero_actuacion || null,
      consorcio_id:       parseInt(form.consorcio_id) || 0,
      consorcio_nombre:   form.consorcio_nombre,
      delegacion_zona:    form.delegacion_zona,
      fecha_inicio:       form.fecha_inicio,
      fecha_fin:          form.fecha_fin,
      plazo_meses:        plazoM,
      altura_max_corte_m: parseFloat(form.altura_max_corte_m) || 0.15,
      precio_unitario_ha: precioUH,
      rendimiento_ha_dia: parseFloat(form.rendimiento_ha_dia) || 18,
      total_superficie_ha: totalHa,
      presupuesto_total:  presupuestoTotal,
      aporte_dvp_pct:     dvpPct,
      aporte_cc_pct:      ccPct,
      estado:             'borrador',
      observaciones:      form.observaciones || null,
      created_at:         new Date().toISOString(),
      tramos:             tramoObjs,
      certificados:       [],
    }
    onCreated(obra)
  }

  const inp: React.CSSProperties = {
    background: '#0a0a0a', border: '1px solid #2a2a2a', color: '#ccc',
    padding: '6px 8px', fontSize: 12, fontFamily: 'monospace',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  }
  const label: React.CSSProperties = {
    fontSize: 10, color: '#444', letterSpacing: 1, fontFamily: 'monospace',
    textTransform: 'uppercase', marginBottom: 4, display: 'block',
  }
  const row: React.CSSProperties = { display: 'flex', gap: 8, marginBottom: 10 }
  const col = (flex = 1): React.CSSProperties => ({ flex, display: 'flex', flexDirection: 'column' })

  return (
    <div style={{ padding: 20, overflowY: 'auto', maxHeight: 'calc(100vh - 80px)' }}>
      <div style={{ fontSize: 10, color: '#444', letterSpacing: 2, fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 16, borderBottom: '1px solid #1e1e1e', paddingBottom: 8 }}>
        Nueva obra · Desmalezado de banquinas
      </div>

      <div style={row}>
        <div style={col(2)}>
          <span style={label}>N° Actuación (SGT)</span>
          <input style={inp} value={form.numero_actuacion} onChange={e => set('numero_actuacion', e.target.value)} placeholder="E13-04/03/2026-4.388-Ae" />
        </div>
        <div style={col(1)}>
          <span style={label}>N° Consorcio</span>
          <input style={inp} type="number" value={form.consorcio_id} onChange={e => set('consorcio_id', e.target.value)} placeholder="66" />
        </div>
      </div>
      <div style={row}>
        <div style={col(2)}>
          <span style={label}>Consorcio Caminero</span>
          <input style={inp} value={form.consorcio_nombre} onChange={e => set('consorcio_nombre', e.target.value)} placeholder="Gral. Vedia" />
        </div>
        <div style={col(2)}>
          <span style={label}>Delegación Zona</span>
          <input style={inp} value={form.delegacion_zona} onChange={e => set('delegacion_zona', e.target.value)} placeholder="Zona V - Gral. San Martín" />
        </div>
      </div>

      <div style={row}>
        <div style={col()}>
          <span style={label}>Fecha inicio</span>
          <input style={inp} type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} />
        </div>
        <div style={col()}>
          <span style={label}>Fecha fin</span>
          <input style={inp} type="date" value={form.fecha_fin} onChange={e => set('fecha_fin', e.target.value)} />
        </div>
        <div style={col(0.6)}>
          <span style={label}>Plazo (meses)</span>
          <input style={inp} type="number" value={form.plazo_meses} onChange={e => set('plazo_meses', e.target.value)} />
        </div>
      </div>

      <div style={row}>
        <div style={col()}>
          <span style={label}>Precio unitario ($/ha)</span>
          <input style={inp} type="number" value={form.precio_unitario_ha} onChange={e => set('precio_unitario_ha', e.target.value)} placeholder="37848.00" />
        </div>
        <div style={col()}>
          <span style={label}>Rendimiento (ha/día)</span>
          <input style={inp} type="number" value={form.rendimiento_ha_dia} onChange={e => set('rendimiento_ha_dia', e.target.value)} />
        </div>
        <div style={col(0.6)}>
          <span style={label}>Corte máx. (m)</span>
          <input style={inp} type="number" step="0.01" value={form.altura_max_corte_m} onChange={e => set('altura_max_corte_m', e.target.value)} />
        </div>
      </div>

      <div style={row}>
        <div style={col()}>
          <span style={label}>Aporte DVP (%)</span>
          <input style={inp} type="number" value={form.aporte_dvp_pct} onChange={e => set('aporte_dvp_pct', e.target.value)} />
        </div>
        <div style={col()}>
          <span style={label}>Aporte CC (%)</span>
          <input style={inp} type="number" value={form.aporte_cc_pct} onChange={e => set('aporte_cc_pct', e.target.value)} />
        </div>
      </div>

      {/* Tramos */}
      <div style={{ marginBottom: 10, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: '#444', letterSpacing: 2, fontFamily: 'monospace', textTransform: 'uppercase' }}>Tramos / cómputos métricos</span>
          <button onClick={addTramo} style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#888', padding: '3px 10px', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
            + Agregar tramo
          </button>
        </div>

        {tramos.map((t, i) => {
          const pi = parseFloat(t.prog_inicio_km) || 0
          const pf = parseFloat(t.prog_fin_km) || 0
          const aw = parseFloat(t.ancho_banquina_m) || 15
          const ha = calcSupHa(pi, pf, aw)
          return (
            <div key={i} style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderLeft: '3px solid #66BB6A', padding: '10px 12px', marginBottom: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={col(1.2)}>
                  <span style={label}>Ruta</span>
                  <input style={inp} value={t.ruta} onChange={e => setTramo(i,'ruta',e.target.value)} placeholder="RP1" />
                </div>
                <div style={col(1.2)}>
                  <span style={label}>Margen</span>
                  <select style={inp} value={t.margen} onChange={e => setTramo(i,'margen',e.target.value as TramoInput['margen'])}>
                    <option value="izquierdo">Izquierdo</option>
                    <option value="derecho">Derecho</option>
                    <option value="ambos">Ambos</option>
                  </select>
                </div>
                <div style={col()}>
                  <span style={label}>Prog. inicio (km)</span>
                  <input style={inp} type="number" step="0.001" value={t.prog_inicio_km} onChange={e => setTramo(i,'prog_inicio_km',e.target.value)} />
                </div>
                <div style={col()}>
                  <span style={label}>Prog. fin (km)</span>
                  <input style={inp} type="number" step="0.001" value={t.prog_fin_km} onChange={e => setTramo(i,'prog_fin_km',e.target.value)} placeholder="12.600" />
                </div>
                <div style={col(0.8)}>
                  <span style={label}>Ancho (m)</span>
                  <input style={inp} type="number" step="0.01" value={t.ancho_banquina_m} onChange={e => setTramo(i,'ancho_banquina_m',e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minWidth: 70 }}>
                  <span style={{ ...label, color: '#66BB6A' }}>= ha</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#66BB6A', padding: '6px 0' }}>
                    {ha > 0 ? ha.toFixed(2) : '—'}
                  </span>
                </div>
                {tramos.length > 1 && (
                  <button onClick={() => removeTramo(i)} style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#555', padding: '6px 8px', fontFamily: 'monospace', fontSize: 11, cursor: 'pointer', alignSelf: 'flex-end' }}>✕</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Resumen automático */}
      {totalHa > 0 && (
        <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', padding: '12px 14px', marginBottom: 12, fontFamily: 'monospace', fontSize: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            {[
              { label: 'Total superficie', val: fmtHa(totalHa),          clr: '#66BB6A' },
              { label: 'Presupuesto total', val: precioUH > 0 ? fmtARS(presupuestoTotal) : '—', clr: '#F5C300' },
              { label: `Aporte DVP (${dvpPct}%)`, val: precioUH > 0 ? fmtARS(montoDVP) : '—', clr: '#ccc' },
              { label: `Aporte CC (${ccPct}%)`,   val: precioUH > 0 ? fmtARS(montoCC)  : '—', clr: '#ccc' },
            ].map(k => (
              <div key={k.label}>
                <div style={{ fontSize: 9, color: '#444', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{k.label}</div>
                <div style={{ color: k.clr }}>{k.val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <span style={label}>Observaciones</span>
        <textarea style={{ ...inp, resize: 'vertical', minHeight: 50 }} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} />
      </div>

      {err && <div style={{ color: '#EF5350', fontSize: 11, fontFamily: 'monospace', marginBottom: 8 }}>{err}</div>}

      <button
        onClick={submit}
        style={{ background: '#F5C300', color: '#111', border: 'none', padding: '9px 20px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, letterSpacing: 1, cursor: 'pointer', width: '100%' }}
      >
        CREAR OBRA
      </button>
    </div>
  )
}

// ─── Detalle Obra ─────────────────────────────────────────────────────────────

type Tab = 'resumen' | 'tramos' | 'certificados'

function ObraDetail({
  obra, onClose, onChangeEstado, onAddCert, onChangeCertEstado,
}: {
  obra: ObraDesmalezado
  onClose: () => void
  onChangeEstado: (estado: ObraDesmalezado['estado']) => void
  onAddCert: (cert: Certificado) => void
  onChangeCertEstado: (certId: string, estado: Certificado['estado']) => void
}) {
  const [tab, setTab] = useState<Tab>('resumen')
  const [showCertForm, setShowCertForm] = useState(false)
  const [certForm, setCertForm] = useState({
    numero: String(obra.certificados.length + 1),
    mes: String(new Date().getMonth() + 1),
    anio: String(new Date().getFullYear()),
    fecha_medicion: '',
    superficie_ha: '',
    observaciones: '',
  })
  const [certErr, setCertErr] = useState<string | null>(null)

  const totalCertificado = obra.certificados.reduce((s, c) => s + c.superficie_ha_certificada, 0)
  const totalPagado      = obra.certificados.filter(c => c.estado === 'pagado').reduce((s, c) => s + c.monto_total, 0)
  const pctAvance        = obra.total_superficie_ha > 0 ? (totalCertificado / obra.total_superficie_ha) * 100 : 0

  function submitCert() {
    if (!certForm.numero || !certForm.mes || !certForm.superficie_ha) {
      setCertErr('Completar número, mes y superficie'); return
    }
    setCertErr(null)
    const supHa  = parseFloat(certForm.superficie_ha)
    const precio = obra.precio_unitario_ha
    const total  = supHa * precio
    const cert: Certificado = {
      id:                       uid(),
      numero_certificado:       parseInt(certForm.numero),
      mes:                      parseInt(certForm.mes),
      anio:                     parseInt(certForm.anio),
      fecha_medicion:           certForm.fecha_medicion || null,
      superficie_ha_certificada: supHa,
      precio_unitario_ha:       precio,
      monto_total:              total,
      monto_dvp:                total * obra.aporte_dvp_pct / 100,
      monto_cc:                 total * obra.aporte_cc_pct / 100,
      estado:                   'pendiente',
      fecha_aprobacion:         null,
      fecha_pago:               null,
      observaciones:            certForm.observaciones || null,
    }
    onAddCert(cert)
    setShowCertForm(false)
    setCertForm(f => ({ ...f, numero: String(parseInt(f.numero) + 1), superficie_ha: '' }))
  }

  const inpS: React.CSSProperties = { background: '#0a0a0a', border: '1px solid #2a2a2a', color: '#ccc', padding: '6px 8px', fontSize: 12, fontFamily: 'monospace', outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lblS: React.CSSProperties = { fontSize: 10, color: '#444', letterSpacing: 1, fontFamily: 'monospace', textTransform: 'uppercase' as const, marginBottom: 3, display: 'block' }
  const thS: React.CSSProperties  = { padding: '6px 10px', fontSize: 9, color: '#444', fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'left', fontWeight: 400, borderBottom: '1px solid #1e1e1e' }
  const tdS: React.CSSProperties  = { padding: '7px 10px', fontSize: 11, color: '#999', fontFamily: 'monospace', borderBottom: '1px solid #111' }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#F5C300', fontWeight: 700 }}>
              CC N° {obra.consorcio_id} — {obra.consorcio_nombre}
            </span>
            <span style={{ background: ESTADO_CLR[obra.estado]+'22', color: ESTADO_CLR[obra.estado], border: `1px solid ${ESTADO_CLR[obra.estado]}44`, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1, padding: '2px 7px', textTransform: 'uppercase' }}>
              {ESTADO_LABEL[obra.estado]}
            </span>
          </div>
          {obra.numero_actuacion && <div style={{ fontSize: 11, color: '#555', fontFamily: 'monospace', marginBottom: 2 }}>{obra.numero_actuacion}</div>}
          <div style={{ fontSize: 10, color: '#444', fontFamily: 'monospace' }}>
            {obra.delegacion_zona} · {obra.fecha_inicio && fmtDate(obra.fecha_inicio)} → {obra.fecha_fin && fmtDate(obra.fecha_fin)} · {obra.plazo_meses} meses
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {obra.estado === 'borrador'     && <EstadoBtn label="Aprobar"   onClick={() => onChangeEstado('aprobado')}     clr="#1976D2" />}
          {obra.estado === 'aprobado'     && <EstadoBtn label="Iniciar"   onClick={() => onChangeEstado('en_ejecucion')} clr="#66BB6A" />}
          {obra.estado === 'en_ejecucion' && <EstadoBtn label="Finalizar" onClick={() => onChangeEstado('finalizado')}   clr="#F5C300" />}
          {obra.estado === 'en_ejecucion' && <EstadoBtn label="Rescindir" onClick={() => onChangeEstado('rescindido')}   clr="#EF5350" />}
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#555', padding: '5px 10px', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>✕</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        {[
          { label: 'Sup. total',  val: fmtHa(obra.total_superficie_ha),  clr: '#66BB6A' },
          { label: 'Precio/ha',   val: fmtARS(obra.precio_unitario_ha),   clr: '#ccc'    },
          { label: 'Presupuesto', val: fmtARS(obra.presupuesto_total),    clr: '#F5C300' },
          { label: `DVP (${obra.aporte_dvp_pct}%)`, val: fmtARS(obra.presupuesto_total * obra.aporte_dvp_pct / 100), clr: '#1976D2' },
          { label: 'Avance',      val: `${pctAvance.toFixed(0)}% · ${fmtHa(totalCertificado)}`, clr: pctAvance >= 100 ? '#66BB6A' : '#888' },
        ].map(k => (
          <div key={k.label} style={{ padding: '10px 14px', borderRight: '1px solid #1e1e1e' }}>
            <div style={{ fontSize: 9, color: '#444', letterSpacing: 1, fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 12, fontFamily: 'monospace', color: k.clr }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Barra avance */}
      <div style={{ height: 3, background: '#111', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${Math.min(pctAvance, 100)}%`, background: '#66BB6A', transition: 'width 0.3s' }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        {(['resumen','tramos','certificados'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '9px 18px', fontSize: 11, fontFamily: 'monospace', color: tab === t ? '#F5C300' : '#444', borderBottom: tab === t ? '2px solid #F5C300' : '2px solid transparent', letterSpacing: 0.5 }}>
            {t === 'resumen' ? 'Resumen' : t === 'tramos' ? `Tramos (${obra.tramos.length})` : `Certificados (${obra.certificados.length})`}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

        {tab === 'resumen' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Section title="Especificaciones técnicas">
                <Row label="Altura máx. corte"  val={`${obra.altura_max_corte_m} m`} />
                <Row label="Rendimiento equipo" val={`${obra.rendimiento_ha_dia} ha/día`} />
                <Row label="Precio unitario"    val={fmtARS(obra.precio_unitario_ha) + '/ha'} />
              </Section>
              <Section title="Financiamiento">
                <Row label="Presupuesto total"      val={fmtARS(obra.presupuesto_total)} hi />
                <Row label={`DVP (${obra.aporte_dvp_pct}%)`} val={fmtARS(obra.presupuesto_total * obra.aporte_dvp_pct / 100)} />
                <Row label={`CC (${obra.aporte_cc_pct}%)`}   val={fmtARS(obra.presupuesto_total * obra.aporte_cc_pct / 100)} />
                <div style={{ borderTop: '1px solid #1e1e1e', marginTop: 8, paddingTop: 8 }}>
                  <Row label="Total pagado" val={fmtARS(totalPagado)} />
                </div>
              </Section>
              <Section title="Plazo de ejecución">
                <Row label="Inicio" val={obra.fecha_inicio ? fmtDate(obra.fecha_inicio) : '—'} />
                <Row label="Fin"    val={obra.fecha_fin ? fmtDate(obra.fecha_fin) : '—'} />
                <Row label="Plazo"  val={`${obra.plazo_meses} meses`} />
              </Section>
              <Section title="Certificaciones">
                <Row label="Emitidos"        val={`${obra.certificados.length} / ${obra.plazo_meses}`} />
                <Row label="Pagados"         val={`${obra.certificados.filter(c=>c.estado==='pagado').length}`} />
                <Row label="Total facturado" val={fmtARS(obra.certificados.reduce((s,c)=>s+c.monto_total,0))} />
              </Section>
            </div>
            {obra.observaciones && (
              <div style={{ marginTop: 16, background: '#0a0a0a', border: '1px solid #1e1e1e', padding: '10px 14px' }}>
                <div style={{ fontSize: 9, color: '#444', letterSpacing: 1, fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 6 }}>Observaciones</div>
                <div style={{ fontSize: 12, color: '#777', fontFamily: 'monospace', lineHeight: 1.6 }}>{obra.observaciones}</div>
              </div>
            )}
          </div>
        )}

        {tab === 'tramos' && (
          obra.tramos.length === 0 ? (
            <div style={{ color: '#333', fontFamily: 'monospace', fontSize: 12 }}>Sin tramos</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#0a0a0a', border: '1px solid #1e1e1e' }}>
              <thead>
                <tr>{['Ruta','Margen','Prog. inicio','Prog. fin','Longitud','Ancho','Superficie'].map(h=><th key={h} style={thS}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {obra.tramos.map(t => (
                  <tr key={t.id}>
                    <td style={{ ...tdS, color: '#F5C300' }}>{t.ruta}</td>
                    <td style={tdS}>{t.margen}</td>
                    <td style={tdS}>{t.prog_inicio_km.toFixed(3)} km</td>
                    <td style={tdS}>{t.prog_fin_km.toFixed(3)} km</td>
                    <td style={tdS}>{((t.prog_fin_km - t.prog_inicio_km) * 1000).toFixed(0)} m</td>
                    <td style={tdS}>{t.ancho_banquina_m.toFixed(2)} m</td>
                    <td style={{ ...tdS, color: '#66BB6A' }}>{t.superficie_ha.toFixed(2)} ha</td>
                  </tr>
                ))}
                <tr style={{ background: '#111' }}>
                  <td colSpan={6} style={{ ...tdS, color: '#555', textAlign: 'right' }}>TOTAL</td>
                  <td style={{ ...tdS, color: '#66BB6A', fontWeight: 700 }}>{obra.tramos.reduce((s,t)=>s+t.superficie_ha,0).toFixed(2)} ha</td>
                </tr>
              </tbody>
            </table>
          )
        )}

        {tab === 'certificados' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 10, color: '#444', letterSpacing: 1, fontFamily: 'monospace', textTransform: 'uppercase' }}>
                Medición entre días 20–30 del mes · Art. 6°
              </span>
              <button onClick={() => setShowCertForm(v => !v)} style={{ background: showCertForm ? '#1e1e1e' : 'transparent', border: '1px solid #2a2a2a', color: '#888', padding: '5px 12px', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
                {showCertForm ? 'Cancelar' : '+ Certificado'}
              </button>
            </div>

            {showCertForm && (
              <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderLeft: '3px solid #F5C300', padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {[
                    { label: 'N°', key: 'numero', type: 'number', width: 60, placeholder: '' },
                  ].map(f => (
                    <div key={f.key} style={{ display: 'flex', flexDirection: 'column', width: f.width }}>
                      <span style={lblS}>{f.label}</span>
                      <input style={{ ...inpS, width: f.width }} type={f.type} value={certForm[f.key as keyof typeof certForm]} onChange={e => setCertForm(fc => ({ ...fc, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                    </div>
                  ))}
                  <div style={{ display: 'flex', flexDirection: 'column', width: 100 }}>
                    <span style={lblS}>Mes</span>
                    <select style={{ ...inpS, width: 100 }} value={certForm.mes} onChange={e => setCertForm(f => ({ ...f, mes: e.target.value }))}>
                      {MESES.map((m,i) => <option key={i+1} value={String(i+1)}>{m}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', width: 70 }}>
                    <span style={lblS}>Año</span>
                    <input style={{ ...inpS, width: 70 }} type="number" value={certForm.anio} onChange={e => setCertForm(f => ({ ...f, anio: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', width: 140 }}>
                    <span style={lblS}>Fecha medición</span>
                    <input style={{ ...inpS, width: 140 }} type="date" value={certForm.fecha_medicion} onChange={e => setCertForm(f => ({ ...f, fecha_medicion: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', width: 90 }}>
                    <span style={lblS}>Sup. (ha)</span>
                    <input style={{ ...inpS, width: 90 }} type="number" step="0.01" value={certForm.superficie_ha} onChange={e => setCertForm(f => ({ ...f, superficie_ha: e.target.value }))} placeholder={obra.total_superficie_ha.toFixed(2)} />
                  </div>
                  {certForm.superficie_ha && (
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <span style={{ ...lblS, color: '#F5C300' }}>= monto</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#F5C300', padding: '6px 0' }}>
                        {fmtARS(parseFloat(certForm.superficie_ha || '0') * obra.precio_unitario_ha)}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 100 }}>
                    <span style={lblS}>Observaciones</span>
                    <input style={inpS} value={certForm.observaciones} onChange={e => setCertForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="Opcional" />
                  </div>
                  <button onClick={submitCert} style={{ background: '#F5C300', color: '#111', border: 'none', padding: '7px 14px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-end', flexShrink: 0 }}>
                    Guardar
                  </button>
                </div>
                {certErr && <div style={{ color: '#EF5350', fontSize: 11, fontFamily: 'monospace', marginTop: 6 }}>{certErr}</div>}
              </div>
            )}

            {obra.certificados.length === 0 ? (
              <div style={{ color: '#333', fontFamily: 'monospace', fontSize: 12 }}>Sin certificados aún</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', background: '#0a0a0a', border: '1px solid #1e1e1e' }}>
                <thead>
                  <tr>{['N°','Período','Medición','Sup. ha','Monto total','DVP','CC','Estado',''].map(h=><th key={h} style={thS}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {obra.certificados.map(c => (
                    <tr key={c.id}>
                      <td style={{ ...tdS, color: '#F5C300' }}>{c.numero_certificado}</td>
                      <td style={tdS}>{MESES[c.mes-1]} {c.anio}</td>
                      <td style={tdS}>{c.fecha_medicion ? fmtDate(c.fecha_medicion) : '—'}</td>
                      <td style={{ ...tdS, color: '#66BB6A' }}>{c.superficie_ha_certificada.toFixed(2)}</td>
                      <td style={tdS}>{fmtARS(c.monto_total)}</td>
                      <td style={tdS}>{fmtARS(c.monto_dvp)}</td>
                      <td style={tdS}>{fmtARS(c.monto_cc)}</td>
                      <td style={tdS}>
                        <span style={{ background: CERT_CLR[c.estado]+'22', color: CERT_CLR[c.estado], border: `1px solid ${CERT_CLR[c.estado]}44`, fontSize: 9, fontFamily: 'monospace', padding: '2px 6px', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                          {c.estado}
                        </span>
                      </td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                        {c.estado === 'pendiente' && (
                          <button onClick={() => onChangeCertEstado(c.id, 'aprobado')} style={{ background: 'transparent', border: '1px solid #1976D244', color: '#1976D2', fontSize: 9, fontFamily: 'monospace', padding: '2px 6px', cursor: 'pointer', marginRight: 4 }}>Aprobar</button>
                        )}
                        {c.estado === 'aprobado' && (
                          <button onClick={() => onChangeCertEstado(c.id, 'pagado')} style={{ background: 'transparent', border: '1px solid #66BB6A44', color: '#66BB6A', fontSize: 9, fontFamily: 'monospace', padding: '2px 6px', cursor: 'pointer' }}>Pagar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EstadoBtn({ label, onClick, clr }: { label: string; onClick: () => void; clr: string }) {
  return (
    <button onClick={onClick} style={{ background: clr+'18', border: `1px solid ${clr}44`, color: clr, padding: '5px 12px', fontSize: 10, fontFamily: 'monospace', letterSpacing: 0.5, cursor: 'pointer', textTransform: 'uppercase' }}>
      {label}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', padding: '12px 14px' }}>
      <div style={{ fontSize: 9, color: '#444', letterSpacing: 1.5, fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 10, borderBottom: '1px solid #1e1e1e', paddingBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, val, hi }: { label: string; val: string; hi?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
      <span style={{ fontSize: 11, color: '#555', fontFamily: 'monospace' }}>{label}</span>
      <span style={{ fontSize: 11, color: hi ? '#F5C300' : '#999', fontFamily: 'monospace' }}>{val}</span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DesmalezadoPage() {
  const [obras, setObras]       = useState<ObraDesmalezado[]>([])
  const [selected, setSelected] = useState<ObraDesmalezado | null>(null)
  const [showNew, setShowNew]   = useState(false)
  const [filterEstado, setFilterEstado] = useState<string>('todos')

  const filtered = filterEstado === 'todos' ? obras : obras.filter(o => o.estado === filterEstado)

  function onCreated(obra: ObraDesmalezado) {
    setObras(prev => [obra, ...prev])
    setSelected(obra)
    setShowNew(false)
  }

  const updateObra = useCallback((updater: (o: ObraDesmalezado) => ObraDesmalezado) => {
    setObras(prev => prev.map(o => o.id === selected?.id ? updater(o) : o))
    setSelected(prev => prev ? updater(prev) : prev)
  }, [selected?.id])

  function onChangeEstado(estado: ObraDesmalezado['estado']) {
    updateObra(o => ({ ...o, estado }))
  }

  function onAddCert(cert: Certificado) {
    updateObra(o => ({ ...o, certificados: [...o.certificados, cert] }))
  }

  function onChangeCertEstado(certId: string, estado: Certificado['estado']) {
    updateObra(o => ({
      ...o,
      certificados: o.certificados.map(c => c.id === certId ? {
        ...c,
        estado,
        fecha_aprobacion: estado === 'aprobado' ? new Date().toISOString().split('T')[0] : c.fecha_aprobacion,
        fecha_pago:       estado === 'pagado'   ? new Date().toISOString().split('T')[0] : c.fecha_pago,
      } : c),
    }))
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 32px)', overflow: 'hidden', background: '#0d0d0d' }}>

      {/* Panel izquierdo: lista */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 10, color: '#444', letterSpacing: 2, fontFamily: 'monospace', textTransform: 'uppercase' }}>Desmalezado</span>
            <button
              onClick={() => { setShowNew(v => !v); setSelected(null) }}
              style={{ background: showNew ? '#F5C300' : 'transparent', border: '1px solid '+(showNew?'#F5C300':'#2a2a2a'), color: showNew?'#111':'#888', padding: '4px 10px', fontSize: 10, fontFamily: 'monospace', cursor: 'pointer' }}
            >
              {showNew ? '✕ Cerrar' : '+ Nueva obra'}
            </button>
          </div>
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={{ width: '100%', background: '#0a0a0a', border: '1px solid #1e1e1e', color: '#666', padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', outline: 'none' }}>
            <option value="todos">Todos los estados</option>
            {Object.entries(ESTADO_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 20, color: '#333', fontFamily: 'monospace', fontSize: 12 }}>
              {obras.length === 0 ? 'Sin obras. Crear la primera.' : 'Sin resultados.'}
            </div>
          ) : filtered.map(o => {
            const isActive = selected?.id === o.id
            return (
              <button key={o.id} onClick={() => { setSelected(o); setShowNew(false) }}
                style={{ width: '100%', background: isActive ? 'rgba(245,195,0,0.06)' : 'transparent', border: 'none', borderLeft: isActive ? '2px solid #F5C300' : '2px solid transparent', borderBottom: '1px solid #1e1e1e', padding: '11px 14px', textAlign: 'left', cursor: 'pointer' }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background='rgba(255,255,255,0.02)' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background='transparent' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: isActive ? '#F5C300' : '#999', lineHeight: 1.3 }}>
                    CC N° {o.consorcio_id} — {o.consorcio_nombre}
                  </div>
                  <span style={{ fontSize: 8, fontFamily: 'monospace', letterSpacing: 0.5, padding: '2px 5px', background: ESTADO_CLR[o.estado]+'22', color: ESTADO_CLR[o.estado], border: `1px solid ${ESTADO_CLR[o.estado]}33`, textTransform: 'uppercase', flexShrink: 0 }}>
                    {ESTADO_LABEL[o.estado]}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', marginTop: 4, display: 'flex', gap: 8 }}>
                  <span>{o.total_superficie_ha.toFixed(0)} ha</span>
                  <span>·</span>
                  <span>{o.plazo_meses} meses</span>
                  {o.fecha_inicio && <><span>·</span><span>{o.fecha_inicio.substring(0,7).replace('-','/')}</span></>}
                </div>
                {o.numero_actuacion && <div style={{ fontSize: 9, color: '#333', fontFamily: 'monospace', marginTop: 2 }}>{o.numero_actuacion}</div>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Panel derecho */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {showNew ? (
          <NuevaObraForm onCreated={onCreated} />
        ) : selected ? (
          <ObraDetail
            key={selected.id}
            obra={selected}
            onClose={() => setSelected(null)}
            onChangeEstado={onChangeEstado}
            onAddCert={onAddCert}
            onChangeCertEstado={onChangeCertEstado}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 10, color: '#2a2a2a', letterSpacing: 3, fontFamily: 'monospace', textTransform: 'uppercase' }}>Desmalezado de banquinas</div>
            <div style={{ fontSize: 11, color: '#333', fontFamily: 'monospace' }}>Seleccionar una obra o crear nueva</div>
          </div>
        )}
      </div>
    </div>
  )
}
