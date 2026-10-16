'use client'
/**
 * «Maquinaria vial» en la ficha de un consorcio: qué equipos tiene y en qué
 * condición están. Arriba el resumen, después la lista agrupada por categoría,
 * y el formulario de carga y edición se abre encima de la lista.
 *
 * El catálogo, las condiciones y las reglas están en `lib/maquinaria.ts`; la
 * ruta valida con la misma función, así que el formulario no puede pedir algo
 * que el servidor rechace por otro motivo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CATEGORIAS, TIPOS, CONDICIONES, OPERATIVAS, COLOR_CONDICION, ANIO_MIN, AVISO_POLIZA_DIAS,
  tipoPorId, esOperativa, estadoPoliza, resumir, hoyLocal,
  type Maquina, type Condicion,
} from '@/lib/maquinaria'
import { field, label, input, select, textarea, sectionTitle } from '@/components/relevamiento/editores'

const MONO = 'ui-monospace, "Roboto Mono", monospace'
const AVISO = '#ff9800'
const ERROR = '#e53935'

type Form = Record<'tipo_id' | 'marca' | 'modelo' | 'anio' | 'dominio' | 'n_chasis' | 'n_motor'
  | 'poliza_numero' | 'poliza_vencimiento' | 'observaciones', string> & { condicion: Condicion }

const VACIO: Form = {
  tipo_id: '', marca: '', modelo: '', anio: '', dominio: '', n_chasis: '', n_motor: '',
  condicion: 'Bueno', poliza_numero: '', poliza_vencimiento: '', observaciones: '',
}

function formDe(m: Maquina): Form {
  const s = (v: unknown) => (v == null ? '' : String(v))
  return {
    tipo_id: String(m.tipo_id), marca: s(m.marca), modelo: s(m.modelo), anio: s(m.anio),
    dominio: s(m.dominio), n_chasis: s(m.n_chasis), n_motor: s(m.n_motor), condicion: m.condicion,
    poliza_numero: s(m.poliza_numero), poliza_vencimiento: s(m.poliza_vencimiento),
    observaciones: s(m.observaciones),
  }
}

const fechaAR = (iso: string) => iso.split('-').reverse().join('/')

/** Fecha y hora local de un instante: «16/10/2026 14:05» */
function momentoAR(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** ¿La modificaron después de cargarla? Un minuto de margen por el mismo guardado */
const modificada = (m: Maquina) =>
  Date.parse(m.updated_at) - Date.parse(m.created_at) > 60_000

type Respuesta = {
  maquinas: Maquina[]
  puede: { cargar: boolean; borrar: boolean }
  zona: string | null
}

type Filtro = 'todas' | 'operativas' | 'no_operativas'

export default function Maquinaria({ numero, nombre }: { numero: number; nombre: string }) {
  const [maquinas, setMaquinas] = useState<Maquina[] | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | 'nueva' | null>(null)
  const [form, setForm] = useState<Form>(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [confirmarBorrar, setConfirmarBorrar] = useState<string | null>(null)
  const [borrando, setBorrando] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busqueda, setBusqueda] = useState('')
  // Hasta que contesta la ruta no se ofrece nada: un dato ausente no da permisos
  const [puede, setPuede] = useState<Respuesta['puede']>({ cargar: false, borrar: false })
  const [zona, setZona] = useState<string | null>(null)
  // La fecha de hoy se toma una vez, no en cada render
  const [hoy] = useState(() => hoyLocal())

  const base = `/api/consorcios/${numero}/maquinaria`

  // El estado se toca recién cuando contesta la ruta, nunca en el cuerpo del efecto
  const pedir = useCallback(async (): Promise<Respuesta> => {
    const r = await fetch(base)
    const b = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(b.error ?? `Error ${r.status}`)
    return b as Respuesta
  }, [base])

  const aplicar = useCallback((p: Promise<Respuesta>, vigente: () => boolean = () => true) => {
    p.then(b => {
      if (!vigente()) return
      setMaquinas(b.maquinas)
      setPuede(b.puede)
      setZona(b.zona)
    }).catch(e => { if (vigente()) setErrorCarga(e instanceof Error ? e.message : String(e)) })
  }, [])

  useEffect(() => {
    let vigente = true
    aplicar(pedir(), () => vigente)
    return () => { vigente = false }
  }, [pedir, aplicar])

  function cargar() {
    setErrorCarga(null)
    aplicar(pedir())
  }

  const resumen = useMemo(() => resumir(maquinas ?? [], hoy), [maquinas, hoy])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return (maquinas ?? []).filter(m => {
      if (filtro === 'operativas' && !esOperativa(m.condicion)) return false
      if (filtro === 'no_operativas' && esOperativa(m.condicion)) return false
      if (!q) return true
      const tipo = tipoPorId(m.tipo_id)?.nombre ?? ''
      return `${tipo} ${m.marca ?? ''} ${m.modelo ?? ''} ${m.dominio ?? ''}`.toLowerCase().includes(q)
    })
  }, [maquinas, filtro, busqueda])

  const porCategoria = useMemo(() => CATEGORIAS.map(c => ({
    categoria: c,
    lista: visibles.filter(m => tipoPorId(m.tipo_id)?.categoria === c.id),
  })).filter(g => g.lista.length > 0), [visibles])

  // Un tipo que no está en el catálogo no debería existir, pero si existe se muestra
  const sinCategoria = visibles.filter(m => !tipoPorId(m.tipo_id))

  function abrirNueva() {
    setForm(VACIO); setErrorForm(null); setEditando('nueva'); setConfirmarBorrar(null)
  }
  function abrirEdicion(m: Maquina) {
    setForm(formDe(m)); setErrorForm(null); setEditando(m.id); setConfirmarBorrar(null)
  }
  function cerrar() { setEditando(null); setErrorForm(null) }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.tipo_id) { setErrorForm('Elegí el tipo de equipo.'); return }
    setGuardando(true); setErrorForm(null)
    try {
      const nueva = editando === 'nueva'
      const r = await fetch(nueva ? base : `${base}/${editando}`, {
        method: nueva ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.error ?? `Error ${r.status}`)
      const m = b.maquina as Maquina
      setMaquinas(prev => nueva ? [...(prev ?? []), m] : (prev ?? []).map(x => x.id === m.id ? m : x))
      setEditando(null)
    } catch (err) {
      setErrorForm(err instanceof Error ? err.message : String(err))
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(id: string) {
    setBorrando(id)
    try {
      const r = await fetch(`${base}/${id}`, { method: 'DELETE' })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.error ?? `Error ${r.status}`)
      setMaquinas(prev => (prev ?? []).filter(x => x.id !== id))
      if (editando === id) setEditando(null)
    } catch (err) {
      setErrorCarga(`No se pudo borrar: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBorrando(null); setConfirmarBorrar(null)
    }
  }

  function exportarCSV() {
    const enc = ['Categoría', 'Tipo', 'Marca', 'Modelo', 'Año', 'Dominio', 'N° chasis', 'N° motor',
      'Condición', 'Póliza N°', 'Póliza vto.', 'Observaciones',
      'Cargado por', 'Cargado el', 'Modificado por', 'Modificado el']
    const filas = visibles.map(m => {
      const tipo = tipoPorId(m.tipo_id)
      return [
        CATEGORIAS.find(c => c.id === tipo?.categoria)?.nombre ?? '', tipo?.nombre ?? `Tipo ${m.tipo_id}`,
        m.marca, m.modelo, m.anio, m.dominio, m.n_chasis, m.n_motor, m.condicion,
        m.poliza_numero, m.poliza_vencimiento, m.observaciones,
        m.creado_por_nombre, momentoAR(m.created_at),
        m.actualizado_por_nombre, momentoAR(m.updated_at),
      ]
    })
    const csv = [enc, ...filas]
      .map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `maquinaria_cc${numero}_${hoy}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section style={{ background: '#141414', border: '1px solid #1e1e1e', padding: '14px 18px', marginBottom: 20, fontFamily: MONO }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 style={{ ...sectionTitle, margin: 0, fontSize: 12 }}>Maquinaria vial</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {maquinas && maquinas.length > 0 && (
            <button type="button" onClick={exportarCSV} style={botonSec}>↓ CSV</button>
          )}
          {puede.cargar && (
            <button type="button" onClick={abrirNueva} disabled={editando === 'nueva'} style={botonPri}>+ Agregar equipo</button>
          )}
        </div>
      </div>

      {maquinas != null && !puede.cargar && (
        <div style={{ color: '#8f8f8f', fontSize: 11, margin: '-4px 0 10px' }}>
          Sólo lectura. Cargan y editan la maquinaria los técnicos de la zona {zona ?? 'del consorcio'} y el administrador.
        </div>
      )}

      {errorCarga && (
        <div style={{ ...caja, borderLeftColor: ERROR, color: '#e0e0e0', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{errorCarga}</span>
          <button type="button" onClick={() => void cargar()} style={botonSec}>Reintentar</button>
        </div>
      )}

      {maquinas == null && !errorCarga && (
        <div style={{ color: '#8f8f8f', fontSize: 12, padding: '16px 0' }}>Cargando...</div>
      )}

      {maquinas != null && (
        <>
          <Resumen r={resumen} />

          {editando && (
            <Formulario
              form={form} setForm={setForm} nueva={editando === 'nueva'} hoy={hoy}
              maquina={editando !== 'nueva' ? maquinas.find(m => m.id === editando) : undefined}
              guardando={guardando} error={errorForm} onGuardar={guardar} onCancelar={cerrar}
              tipoActual={editando !== 'nueva' ? maquinas.find(m => m.id === editando)?.tipo_id : undefined}
            />
          )}

          {maquinas.length === 0 ? (
            !editando && (
              <div style={{ color: '#a0a0a0', fontSize: 12, padding: '14px 0' }}>
                El consorcio {nombre} no tiene equipos cargados.
              </div>
            )
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 8px' }}>
                <div style={{ display: 'flex', border: '1px solid #2a2a2a', borderRadius: 2 }}>
                  {([['todas', 'Todas'], ['operativas', 'Operativas'], ['no_operativas', 'No operativas']] as const).map(([k, t]) => (
                    <button key={k} type="button" onClick={() => setFiltro(k)} style={{
                      background: filtro === k ? '#F5C3001a' : 'transparent', border: 'none',
                      borderBottom: `2px solid ${filtro === k ? '#F5C300' : 'transparent'}`,
                      color: filtro === k ? '#F5C300' : '#a0a0a0', padding: '5px 10px', fontSize: 11,
                      fontFamily: MONO, letterSpacing: 0.8, textTransform: 'uppercase', cursor: 'pointer',
                    }}>{t}</button>
                  ))}
                </div>
                <input
                  type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar tipo, marca, dominio..." style={{ ...input, width: 240 }}
                />
                <span style={{ color: '#8f8f8f', fontSize: 11 }}>{visibles.length} de {maquinas.length}</span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
                  <thead>
                    <tr>
                      {['Tipo', 'Marca / modelo', 'Año', 'Dominio', 'Condición', 'Póliza', 'Cargado', ''].map(h => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {porCategoria.map(({ categoria, lista }) => (
                      <Grupo key={categoria.id} titulo={categoria.nombre} lista={lista} hoy={hoy} puede={puede}
                        editando={editando} confirmar={confirmarBorrar} borrando={borrando}
                        onEditar={abrirEdicion} onConfirmar={setConfirmarBorrar} onBorrar={borrar} />
                    ))}
                    {sinCategoria.length > 0 && (
                      <Grupo titulo="Tipo fuera del catálogo" lista={sinCategoria} hoy={hoy} puede={puede}
                        editando={editando} confirmar={confirmarBorrar} borrando={borrando}
                        onEditar={abrirEdicion} onConfirmar={setConfirmarBorrar} onBorrar={borrar} />
                    )}
                    {visibles.length === 0 && (
                      <tr><td colSpan={8} style={{ ...td, color: '#a0a0a0', textAlign: 'center', padding: 20 }}>Ningún equipo con ese filtro</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}

// ── Resumen ───────────────────────────────────────────────────────────────

function Resumen({ r }: { r: ReturnType<typeof resumir> }) {
  if (r.total === 0) return null
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
      <Cifra titulo="Equipos" valor={r.total} />
      <Cifra titulo="Operativos" valor={r.operativas} color="#4caf50" />
      <Cifra titulo="No operativos" valor={r.noOperativas} color={r.noOperativas ? AVISO : undefined} />
      <div style={{ ...caja, margin: 0, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', flex: 1, minWidth: 260 }}>
        {CONDICIONES.filter(c => r.porCondicion[c] > 0).map(c => (
          <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, background: COLOR_CONDICION[c], display: 'inline-block' }} />
            <span style={{ color: '#a0a0a0' }}>{c}</span>
            <span style={{ color: '#e0e0e0', fontWeight: 600 }}>{r.porCondicion[c]}</span>
          </span>
        ))}
      </div>
      {(r.polizasVencidas > 0 || r.polizasPorVencer > 0) && (
        <div style={{ ...caja, margin: 0, borderLeftColor: r.polizasVencidas ? ERROR : AVISO, fontSize: 12, color: '#e0e0e0', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
          {r.polizasVencidas > 0 && <span style={{ color: ERROR }}>{r.polizasVencidas} póliza{r.polizasVencidas > 1 ? 's' : ''} vencida{r.polizasVencidas > 1 ? 's' : ''}</span>}
          {r.polizasPorVencer > 0 && <span style={{ color: AVISO }}>{r.polizasPorVencer} vence{r.polizasPorVencer > 1 ? 'n' : ''} en {AVISO_POLIZA_DIAS} días o menos</span>}
        </div>
      )}
    </div>
  )
}

function Cifra({ titulo, valor, color }: { titulo: string; valor: number; color?: string }) {
  return (
    <div style={{ ...caja, margin: 0, minWidth: 110, borderLeftColor: color ?? '#2a2a2a' }}>
      <div style={{ color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{titulo}</div>
      <div style={{ color: color ?? '#e0e0e0', fontSize: 20, fontWeight: 700 }}>{valor}</div>
    </div>
  )
}

// ── Lista ─────────────────────────────────────────────────────────────────

function Grupo({ titulo, lista, hoy, puede, editando, confirmar, borrando, onEditar, onConfirmar, onBorrar }: {
  titulo: string; lista: Maquina[]; hoy: string; puede: Respuesta['puede']
  editando: string | null; confirmar: string | null; borrando: string | null
  onEditar: (m: Maquina) => void; onConfirmar: (id: string | null) => void; onBorrar: (id: string) => void
}) {
  return (
    <>
      <tr>
        <td colSpan={8} style={{ padding: '10px 8px 4px', color: '#c8c8c8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, borderBottom: '1px solid #2a2a2a' }}>
          {titulo} <span style={{ color: '#8f8f8f' }}>· {lista.length}</span>
        </td>
      </tr>
      {lista.map(m => {
        const tipo = tipoPorId(m.tipo_id)
        const activa = editando === m.id
        return (
          <tr key={m.id} style={{ background: activa ? '#F5C3000d' : undefined, opacity: borrando === m.id ? 0.4 : 1 }}>
            <td style={{ ...td, color: '#e0e0e0', borderLeft: `3px solid ${activa ? '#F5C300' : 'transparent'}` }}>
              {tipo?.nombre ?? `Tipo ${m.tipo_id}`}
              {m.observaciones && <div style={{ color: '#8f8f8f', fontSize: 11, marginTop: 2, maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.observaciones}>{m.observaciones}</div>}
            </td>
            <td style={td}>{[m.marca, m.modelo].filter(Boolean).join(' ') || '—'}</td>
            <td style={td}>{m.anio ?? '—'}</td>
            <td style={{ ...td, letterSpacing: 0.6 }}>{m.dominio ?? '—'}</td>
            <td style={td}><CondicionChip c={m.condicion} /></td>
            <td style={td}><Poliza m={m} hoy={hoy} /></td>
            <td style={td}><Autor m={m} /></td>
            <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
              {!puede.cargar && !puede.borrar ? null : confirmar === m.id ? (
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: '#a0a0a0', fontSize: 11 }}>¿Borrar?</span>
                  <button type="button" onClick={() => onBorrar(m.id)} disabled={borrando === m.id} style={{ ...botonSec, color: ERROR, borderColor: ERROR }}>Sí, borrar</button>
                  <button type="button" onClick={() => onConfirmar(null)} style={botonSec}>No</button>
                </span>
              ) : (
                <span style={{ display: 'inline-flex', gap: 6 }}>
                  {puede.cargar && <button type="button" onClick={() => onEditar(m)} style={botonSec}>Editar</button>}
                  {puede.borrar && <button type="button" onClick={() => onConfirmar(m.id)} title="Borrar" style={{ ...botonSec, color: '#a0a0a0' }}>✕</button>}
                </span>
              )}
            </td>
          </tr>
        )
      })}
    </>
  )
}

/** Quién la cargó y cuándo; si después la modificó alguien, también */
function Autor({ m }: { m: Maquina }) {
  const quien = (n: string | null) => n || 'usuario sin nombre'
  return (
    <div style={{ fontSize: 11, lineHeight: 1.4, whiteSpace: 'nowrap' }}>
      <div style={{ color: '#c8c8c8' }}>{quien(m.creado_por_nombre)}</div>
      <div style={{ color: '#8f8f8f' }}>{momentoAR(m.created_at)}</div>
      {modificada(m) && (
        <div style={{ color: '#8f8f8f' }} title={`Modificado por ${quien(m.actualizado_por_nombre)} el ${momentoAR(m.updated_at)}`}>
          mod. {momentoAR(m.updated_at)}
        </div>
      )}
    </div>
  )
}

function CondicionChip({ c }: { c: Condicion }) {
  return (
    <span style={{
      display: 'inline-block', borderLeft: `3px solid ${COLOR_CONDICION[c]}`, padding: '1px 7px',
      background: '#1a1a1a', color: COLOR_CONDICION[c], fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6,
    }}>{c}</span>
  )
}

function Poliza({ m, hoy }: { m: Maquina; hoy: string }) {
  const p = estadoPoliza(m.poliza_vencimiento, hoy)
  if (p.estado === 'sin_poliza') return <span style={{ color: '#8f8f8f', fontSize: 11 }}>Sin póliza</span>
  // Una máquina dada de baja no necesita seguro: la fecha se muestra sin alarma
  const baja = m.condicion === 'Baja'
  const color = baja ? '#a0a0a0' : p.estado === 'vencida' ? ERROR : p.estado === 'por_vencer' ? AVISO : '#a0a0a0'
  const texto = p.estado === 'vencida'
    ? `Vencida hace ${-p.dias} día${p.dias === -1 ? '' : 's'}`
    : p.estado === 'por_vencer'
      ? (p.dias === 0 ? 'Vence hoy' : `Vence en ${p.dias} día${p.dias === 1 ? '' : 's'}`)
      : `Vigente al ${fechaAR(m.poliza_vencimiento!)}`
  return (
    <div style={{ fontSize: 11, lineHeight: 1.4 }}>
      {m.poliza_numero && <div style={{ color: '#8f8f8f' }}>N° {m.poliza_numero}</div>}
      <div style={{ color }}>{texto}</div>
    </div>
  )
}

// ── Formulario ────────────────────────────────────────────────────────────

function Formulario({ form, setForm, nueva, hoy, maquina, guardando, error, onGuardar, onCancelar, tipoActual }: {
  form: Form; setForm: React.Dispatch<React.SetStateAction<Form>>; nueva: boolean; hoy: string; maquina?: Maquina
  guardando: boolean; error: string | null
  onGuardar: (e: React.FormEvent) => void; onCancelar: () => void; tipoActual?: number
}) {
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))
  const tipo = form.tipo_id ? tipoPorId(Number(form.tipo_id)) : undefined
  const poliza = estadoPoliza(form.poliza_vencimiento || null, hoy)
  const polizaMal = form.condicion !== 'Baja' && poliza.estado === 'vencida'
  const anioMax = new Date().getFullYear() + 1

  return (
    <form onSubmit={onGuardar} style={{ border: '1px solid #2a2a2a', borderLeft: '3px solid #F5C300', background: '#111', padding: '12px 14px', margin: '12px 0' }}>
      <div style={{ color: '#F5C300', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>
        {nueva ? 'Nuevo equipo' : 'Editar equipo'}
      </div>
      {maquina && (
        <div style={{ color: '#8f8f8f', fontSize: 11, margin: '-4px 0 10px' }}>
          Cargado por {maquina.creado_por_nombre || 'usuario sin nombre'} el {momentoAR(maquina.created_at)}
          {modificada(maquina) && ` · modificado por ${maquina.actualizado_por_nombre || 'usuario sin nombre'} el ${momentoAR(maquina.updated_at)}`}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
        <div style={{ ...field, gridColumn: 'span 2' }}>
          <span style={label}>Tipo de equipo *</span>
          <select value={form.tipo_id} onChange={set('tipo_id')} style={select} required>
            <option value="">— Elegir —</option>
            {CATEGORIAS.map(c => (
              <optgroup key={c.id} label={c.nombre}>
                {TIPOS.filter(x => x.categoria === c.id && (x.activo || x.id === tipoActual)).map(x => (
                  <option key={x.id} value={x.id}>{x.nombre}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div style={field}>
          <span style={label}>Condición *</span>
          <select value={form.condicion} onChange={set('condicion')} style={{ ...select, color: COLOR_CONDICION[form.condicion] }} required>
            <optgroup label="Operativo">
              {OPERATIVAS.map(c => <option key={c} value={c}>{c}</option>)}
            </optgroup>
            <optgroup label="No operativo">
              {CONDICIONES.filter(c => !OPERATIVAS.includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
            </optgroup>
          </select>
        </div>
        <div style={field}>
          <span style={label}>Marca</span>
          <input value={form.marca} onChange={set('marca')} style={input} placeholder="John Deere" maxLength={60} />
        </div>
        <div style={field}>
          <span style={label}>Modelo</span>
          <input value={form.modelo} onChange={set('modelo')} style={input} placeholder="6120E" maxLength={60} />
        </div>
        <div style={field}>
          <span style={label}>Año</span>
          <input type="number" value={form.anio} onChange={set('anio')} style={input} min={ANIO_MIN} max={anioMax} placeholder="2020" />
        </div>
        <div style={field}>
          <span style={label}>Dominio / patente</span>
          <input value={form.dominio} onChange={e => setForm(f => ({ ...f, dominio: e.target.value.toUpperCase() }))} style={input} placeholder="AB123CD" maxLength={12} />
        </div>
        {tipo?.chasisMotor && (
          <>
            <div style={field}>
              <span style={label}>N° de chasis</span>
              <input value={form.n_chasis} onChange={set('n_chasis')} style={input} maxLength={40} />
            </div>
            <div style={field}>
              <span style={label}>N° de motor</span>
              <input value={form.n_motor} onChange={set('n_motor')} style={input} maxLength={40} />
            </div>
          </>
        )}
        <div style={field}>
          <span style={label}>Póliza de seguro N°</span>
          <input value={form.poliza_numero} onChange={set('poliza_numero')} style={input} placeholder="00012345" maxLength={40} />
        </div>
        <div style={field}>
          <span style={{ ...label, color: polizaMal ? ERROR : label.color }}>Vencimiento de la póliza</span>
          <input type="date" value={form.poliza_vencimiento} onChange={set('poliza_vencimiento')}
            style={{ ...input, borderColor: polizaMal ? ERROR : '#2a2a2a', colorScheme: 'dark' }} />
          {polizaMal && <span style={{ color: ERROR, fontSize: 11 }}>La póliza está vencida</span>}
        </div>
        <div style={{ ...field, gridColumn: '1 / -1' }}>
          <span style={label}>Observaciones</span>
          <textarea value={form.observaciones} onChange={set('observaciones')} style={textarea} rows={2}
            placeholder="Estado general, reparaciones pendientes, etc." maxLength={1000} />
        </div>
      </div>

      {error && <div style={{ ...caja, borderLeftColor: ERROR, color: '#e0e0e0', margin: '10px 0 0' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={onCancelar} style={botonSec}>Cancelar</button>
        <button type="submit" disabled={guardando} style={{ ...botonPri, opacity: guardando ? 0.6 : 1 }}>
          {guardando ? 'Guardando...' : nueva ? 'Registrar equipo' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: '6px 8px', color: '#8f8f8f', fontSize: 11, fontWeight: 400, textAlign: 'left',
  textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #2a2a2a', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '7px 8px', color: '#a0a0a0', fontSize: 12, borderBottom: '1px solid #1e1e1e', verticalAlign: 'top',
}
const caja: React.CSSProperties = {
  background: '#191919', border: '1px solid #2a2a2a', borderLeft: '3px solid #2a2a2a',
  padding: '8px 12px', margin: '0 0 10px', fontSize: 12,
}
const botonPri: React.CSSProperties = {
  background: '#F5C300', color: '#111', border: 'none', borderRadius: 2, padding: '6px 12px',
  fontSize: 11, fontWeight: 700, fontFamily: MONO, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer',
}
const botonSec: React.CSSProperties = {
  background: 'transparent', color: '#c8c8c8', border: '1px solid #2a2a2a', borderRadius: 2,
  padding: '4px 10px', fontSize: 11, fontFamily: MONO, letterSpacing: 0.8, cursor: 'pointer',
}
