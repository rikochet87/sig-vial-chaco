'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { RipioTramo, LatLng } from './RipioMapPanel'
import { PALETTE } from '@/lib/ripioPalette'
import type { GuardarObraData } from './GuardarObraModal'
import PanelAPU from './ripio/PanelAPU'
import PanelCoeficientes from './ripio/PanelCoeficientes'
import PanelPresupuesto from './ripio/PanelPresupuesto'
import PanelManoObra from './ripio/PanelManoObra'
import PlanillasImprimibles from './ripio/PlanillasImprimibles'
import MenuFila from './ripio/MenuFila'
import {
  calcularCoeficientes, calcularMdeO, calcularAPU, calcularComputo,
  calcularPresupuesto, valorEfectivo,
  type EquipoCatalogo,
} from '@/lib/ripioCalculo'
import {
  normalizarAnalisis, analisisVacio, paramsAPU, apuTieneDatos,
  CLAVES_APU, ETIQUETAS_APU,
  type AnalisisRipio, type ClaveAPU, type ConfigAPU,
} from '@/lib/ripioAnalisis'

const RipioMapPanel       = dynamic(() => import('./RipioMapPanel'),       { ssr: false })
const MapComposicionRipio = dynamic(() => import('./MapComposicionRipio'), { ssr: false })

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Proyecto {
  id: string
  nombre: string
  ripios: RipioTramo[]
  /** Documento de análisis; null en los proyectos creados antes de esta función */
  analisis?: unknown
  /** Nombre de quien lo creó; lo resuelve la API desde profiles */
  creador?: string | null
}

// ── Constantes ────────────────────────────────────────────────────────────────
const MONO: React.CSSProperties = { fontFamily: 'monospace' }
const COLOR = '#90A4AE'

const inpS: React.CSSProperties = {
  width: '100%', background: '#080808', border: '1px solid #1e1e1e',
  color: '#e0e0e0', fontFamily: 'monospace', fontSize: 13,
  padding: '4px 8px', outline: 'none', boxSizing: 'border-box',
}
const lblS: React.CSSProperties = {
  fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: 1,
  fontFamily: 'monospace', marginBottom: 2, display: 'block', marginTop: 8,
}

const fmt  = (n: number) => Math.round(n).toLocaleString('es-AR')
const fmtP = (n: number) =>
  n >= 1_000_000 ? `$${(n/1_000_000).toFixed(2)}M` : `$${Math.round(n).toLocaleString('es-AR')}`

function calcRipio(r: RipioTramo) {
  const V = r.l_m * r.an * r.e
  const W = V * r.rho
  return { V, W, presupuesto: W * r.precio_unitario, cam15: Math.ceil(W/15), cam30: Math.ceil(W/30) }
}

// ── Campo numérico ─────────────────────────────────────────────────────────────
function NInp({ label, value, onChange, step = 0.1, min = 0, unit }: {
  label: string; value: number; onChange: (v: number) => void
  step?: number; min?: number; unit?: string
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={lblS}>{label}{unit ? ` (${unit})` : ''}</span>
      <input type="number" step={step} min={min} value={value}
        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v) }}
        style={inpS} />
    </label>
  )
}

// ── Fila de resultado ─────────────────────────────────────────────────────────
function Res({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #0d0d0d' }}>
      <span style={{ fontSize: 13, color: '#666', ...MONO }}>{label}</span>
      <span style={{ fontSize: accent ? 13 : 11, color: accent ? COLOR : '#999', ...MONO, fontWeight: accent ? 700 : 400 }}>{value}</span>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CalcRipio({ onGuardarObra, focoObra }: {
  onGuardarObra?: (d: GuardarObraData) => void
  /** Al venir desde "editar" en la lista de obras: qué proyecto abrir y dónde encuadrar */
  focoObra?: { proyectoId?: string; coords?: LatLng[] } | null
}) {
  const [proyectos,    setProyectos]    = useState<Proyecto[]>([])
  const [activeProyId, setActiveProyId] = useState<string | null>(null)
  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [drawingId,    setDrawingId]    = useState<string | null>(null)
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [panel,        setPanel]        = useState<'form' | 'resumen'>('form')
  const [resumenSel,   setResumenSel]   = useState<Set<string>>(new Set())
  const [editingName,  setEditingName]  = useState<string | null>(null)   // id del ripio cuyo nombre se edita inline
  const [confirmState, setConfirmState] = useState<{ msg: string; action: () => void } | null>(null)
  const [hiddenProyIds, setHiddenProyIds] = useState<Set<string>>(new Set())  // proyectos ocultos en el mapa
  /**
   * Proyectos desplegados en el árbol.
   *
   * Va aparte de `activeProyId` a propósito: antes desplegar y seleccionar eran
   * lo mismo, así que no se podía tener el proyecto activo con sus tramos
   * plegados, ni mirar los de otro sin cambiar de proyecto.
   */
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  /**
   * Ancho del árbol, ajustable arrastrando el borde.
   *
   * Los nombres de obra reales son largos y variables ("Enripiado RP N°9 —
   * tramo Las Piedritas"), así que cualquier ancho fijo corta unos y desperdicia
   * espacio en otros. Se recuerda por navegador.
   */
  const [anchoArbol, setAnchoArbol] = useState(240)
  const redimRef = useRef<{ x0: number; w0: number } | null>(null)

  useEffect(() => {
    try {
      const g = localStorage.getItem('sig_vial_ancho_arbol_ripio')
      if (g) setAnchoArbol(Math.min(460, Math.max(180, parseInt(g, 10) || 240)))
    } catch (_) {}
  }, [])

  useEffect(() => {
    const mover = (e: MouseEvent) => {
      if (!redimRef.current) return
      const w = redimRef.current.w0 + (e.clientX - redimRef.current.x0)
      setAnchoArbol(Math.min(460, Math.max(180, w)))
    }
    const soltar = () => {
      if (!redimRef.current) return
      redimRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setAnchoArbol(w => { try { localStorage.setItem('sig_vial_ancho_arbol_ripio', String(w)) } catch (_) {} ; return w })
    }
    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
    return () => {
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('mouseup', soltar)
    }
  }, [])
  const [view,          setView]          = useState<'computo' | 'analisis' | 'presupuesto' | 'mapa' | 'legajo'>('computo')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Análisis de precios ───────────────────────────────────────────────────
  const [catalogo,  setCatalogo]  = useState<EquipoCatalogo[]>([])
  const [analisis,  setAnalisis]  = useState<AnalisisRipio>(analisisVacio())
  const [apuActivo, setApuActivo] = useState<ClaveAPU>('material')
  const analisisTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (analisisTimer.current) clearTimeout(analisisTimer.current) }, [])

  // Limpia el timer al desmontar para evitar setState en componente desmontado
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  // ── Carga ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ac = new AbortController()
    fetch('/api/proyectos-ripio', { signal: ac.signal })
      .then(r => r.json())
      .then((data: Proyecto[]) => {
        setProyectos(data)
        if (data.length > 0) {
          setActiveProyId(data[0].id)
          if (data[0].ripios.length > 0) setSelectedId(data[0].ripios[0].id)
        }
      })
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })
      .finally(() => setLoading(false))
    return () => ac.abort()
  }, [])

  /**
   * Al llegar desde "editar" en la lista de obras: abrir el proyecto de esa
   * obra y encuadrar el mapa sobre su trazado. Antes caía en la vista general
   * de la provincia y había que buscar el tramo a mano.
   */
  const focoAplicado = useRef(false)
  const [avisoRestaurar, setAvisoRestaurar] = useState<string | null>(null)

  useEffect(() => {
    if (focoAplicado.current || !focoObra || loading) return
    const id = focoObra.proyectoId
    if (!id) { focoAplicado.current = true; return }

    // Caso normal: el proyecto está en la lista
    if (proyectos.some(p => p.id === id)) {
      setActiveProyId(id)
      setExpandidos(prev => new Set(prev).add(id))
      const primero = proyectos.find(p => p.id === id)?.ripios[0]
      if (primero) { setSelectedId(primero.id); setPanel('form') }
      focoAplicado.current = true
      return
    }

    // No está: lo más probable es que lo hayan quitado del cómputo. Se restaura
    // para que editar la obra devuelva el dibujo y los cálculos, no una obra vacía.
    focoAplicado.current = true
    ;(async () => {
      try {
        const res = await fetch(`/api/proyectos-ripio/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurar: true }),
        })
        if (!res.ok) throw new Error(String(res.status))

        // Recargar para traerlo con sus tramos
        const lista: Proyecto[] = await fetch('/api/proyectos-ripio').then(r => r.json())
        if (!Array.isArray(lista)) return
        setProyectos(lista)
        const vuelto = lista.find(p => p.id === id)
        if (vuelto) {
          setActiveProyId(id)
          setExpandidos(prev => new Set(prev).add(id))
          if (vuelto.ripios[0]) { setSelectedId(vuelto.ripios[0].id); setPanel('form') }
          setAvisoRestaurar(
            `Se restauró "${vuelto.nombre}", que había sido quitado del cómputo.`
          )
        }
      } catch (_) {
        setAvisoRestaurar(
          'Esta obra fue guardada antes de que existiera el archivado, así que su ' +
          'proyecto ya no se puede recuperar. El presupuesto y el trazado guardados ' +
          'siguen disponibles desde Obras → Lista.'
        )
      }
    })()
  }, [focoObra, proyectos, loading])

  /**
   * Encuadre del mapa a demanda.
   *
   * El token se incrementa en cada pedido para que "llevame a este tramo"
   * funcione aunque ya estés encuadrado ahí: sin él, pedir dos veces lo mismo
   * no haría nada después de haber movido el mapa a mano.
   */
  const [encuadre, setEncuadre] = useState<{ coords: LatLng[]; token: number } | null>(null)
  const tokenEncuadre = useRef(0)

  const encuadrarEn = useCallback((coords: LatLng[] | null | undefined) => {
    if (!coords || coords.length === 0) return
    tokenEncuadre.current += 1
    setEncuadre({ coords, token: tokenEncuadre.current })
  }, [])

  /** Todas las coordenadas de un proyecto, para encuadrarlo entero */
  const coordsDeProyecto = useCallback((proyId: string): LatLng[] =>
    (proyectos.find(p => p.id === proyId)?.ripios ?? [])
      .flatMap(r => r.coords ?? []),
  [proyectos])

  // Al llegar desde "editar" en la lista de obras
  useEffect(() => {
    if (focoObra?.coords?.length) encuadrarEn(focoObra.coords)
  }, [focoObra, encuadrarEn])

  // Catálogo de equipos — se usa en los cuatro análisis de precio
  useEffect(() => {
    const ac = new AbortController()
    fetch('/api/equipos', { signal: ac.signal })
      .then(r => r.json())
      .then((rows: Record<string, unknown>[]) => {
        if (!Array.isArray(rows)) return
        setCatalogo(rows.map(e => ({
          id:       String(e.id),
          nombre:   String(e.nombre),
          modelo:   (e.modelo as string) ?? null,
          marca:    (e.marca as string) ?? null,
          hp:       Number(e.hp) || 0,
          costoUsd: Number(e.costo_usd) || 0,
        })))
      })
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })
    return () => ac.abort()
  }, [])

  // Al cambiar de proyecto, cargar su análisis (los viejos vienen en null y
  // normalizarAnalisis los completa con los defaults en vez de romper)
  useEffect(() => {
    const p = proyectos.find(x => x.id === activeProyId)
    setAnalisis(normalizarAnalisis(p?.analisis))
  }, [activeProyId, proyectos])

  /** Guarda el análisis con debounce, igual que los tramos */
  const guardarAnalisis = useCallback((next: AnalisisRipio) => {
    setAnalisis(next)
    const id = activeProyId
    if (!id) return
    // Mantener la copia local para no perderla al cambiar de proyecto y volver
    setProyectos(prev => prev.map(p => p.id === id ? { ...p, analisis: next } : p))
    if (analisisTimer.current) clearTimeout(analisisTimer.current)
    analisisTimer.current = setTimeout(() => {
      setSaving(true)
      fetch(`/api/proyectos-ripio/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analisis: next }),
      }).catch(console.error).finally(() => setSaving(false))
    }, 800)
  }, [activeProyId])

  const activeProy = proyectos.find(p => p.id === activeProyId) ?? null
  const ripios     = activeProy?.ripios ?? []
  const selected   = ripios.find(r => r.id === selectedId) ?? null
  // Ripios visibles de TODOS los proyectos (para el mapa)
  const mapRipios  = proyectos.filter(p => !hiddenProyIds.has(p.id)).flatMap(p => p.ripios)

  const toggleProyVisibility = (id: string) =>
    setHiddenProyIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleExpandido = (id: string) =>
    setExpandidos(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Al cambiar de proyecto activo, desplegarlo: seleccionar uno y que sus
  // tramos queden escondidos sería desconcertante.
  useEffect(() => {
    if (activeProyId) setExpandidos(prev => new Set(prev).add(activeProyId))
  }, [activeProyId])

  // ── Mutación local ────────────────────────────────────────────────────────
  const updateLocal = useCallback((id: string, patch: Partial<RipioTramo>) => {
    setProyectos(prev => prev.map(p => ({
      ...p, ripios: p.ripios.map(r => r.id === id ? { ...r, ...patch } : r),
    })))
  }, [])

  const saveRipio = useCallback((id: string, patch: Partial<RipioTramo>) => {
    updateLocal(id, patch)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaving(true)
      fetch(`/api/ripios/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).catch(console.error).finally(() => setSaving(false))
    }, 600)
  }, [updateLocal])

  // ── CRUD proyectos ────────────────────────────────────────────────────────
  const addProyecto = useCallback(async () => {
    const nombre = `Proyecto ${String(proyectos.length + 1).padStart(2, '0')}`
    const res  = await fetch('/api/proyectos-ripio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    })
    const data = await res.json()
    const nuevo: Proyecto = { ...data, ripios: [] }
    setProyectos(prev => [...prev, nuevo])
    setActiveProyId(nuevo.id)
    setSelectedId(null)
  }, [proyectos.length])

  const deleteProyecto = useCallback((id: string) => {
    setConfirmState({
      msg: '¿Quitar el proyecto y sus tramos de la calculadora?\n\n'
         + 'Si ya lo guardaste como obra, vas a seguir encontrándolo en Obras → Lista.',
      action: async () => {
        const res = await fetch(`/api/proyectos-ripio/${id}`, { method: 'DELETE' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          alert('Error al eliminar el proyecto: ' + (body.error ?? res.status))
          return
        }
        setProyectos(prev => {
          const next = prev.filter(p => p.id !== id)
          if (activeProyId === id) { setActiveProyId(next[0]?.id ?? null); setSelectedId(null) }
          return next
        })
      },
    })
  }, [activeProyId])

  // ── CRUD ripios ───────────────────────────────────────────────────────────
  /** Agrega un tramo. Recibe el proyecto porque el árbol permite desplegar uno
   *  sin activarlo, y el botón tiene que agregar al que está desplegado. */
  const addRipio = useCallback(async (proyId?: string) => {
    const destino = proyId ?? activeProyId
    if (!destino) return
    const proy = proyectos.find(p => p.id === destino)
    if (!proy) return
    const nombre = `Ripio ${String(proy.ripios.length + 1).padStart(2, '0')}`
    const res = await fetch(`/api/proyectos-ripio/${destino}/ripios`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    })
    const data: RipioTramo = await res.json()
    setProyectos(prev => prev.map(p =>
      p.id === destino ? { ...p, ripios: [...p.ripios, data] } : p
    ))
    setActiveProyId(destino)
    setSelectedId(data.id)
    setPanel('form')
  }, [activeProyId, proyectos])

  const deleteRipio = useCallback((id: string) => {
    setConfirmState({
      msg: '¿Quitar este tramo de la calculadora?\n\n'
         + 'Si el proyecto ya se guardó como obra, el tramo sigue en ese registro.',
      action: async () => {
        const res = await fetch(`/api/ripios/${id}`, { method: 'DELETE' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          alert('Error al eliminar el ripio: ' + (body.error ?? res.status))
          return
        }
        setProyectos(prev => prev.map(p => ({ ...p, ripios: p.ripios.filter(r => r.id !== id) })))
        if (selectedId === id) setSelectedId(ripios.find(r => r.id !== id)?.id ?? null)
      },
    })
  }, [selectedId, ripios])

  const handleLineDraw = useCallback((id: string, lengthM: number, coords: LatLng[]) => {
    saveRipio(id, { l_m: Math.round(lengthM), coords })
  }, [saveRipio])

  /** Edición de vértices: mismo guardado que el dibujo, así el tonelaje y el
   *  presupuesto se recalculan solos con el trazado corregido. */
  const handleLineEdit = useCallback((id: string, lengthM: number, coords: LatLng[]) => {
    saveRipio(id, { l_m: Math.round(lengthM), coords })
  }, [saveRipio])

  /**
   * Separa un tramo en dos: el original se queda con la primera parte y se crea
   * un ripio nuevo con la segunda, heredando ancho, espesor, densidad y precio.
   * Sirve para tratar por separado dos mitades con distinto criterio, o para
   * borrar una parte eliminando después el tramo que sobra.
   */
  const handleLineSplit = useCallback(async (
    id: string,
    a: { lengthM: number; coords: LatLng[] },
    b: { lengthM: number; coords: LatLng[] },
  ) => {
    const proy   = proyectos.find(p => p.ripios.some(r => r.id === id))
    const origen = proy?.ripios.find(r => r.id === id)
    if (!proy || !origen) return

    // 1) El original conserva la primera parte
    saveRipio(id, { l_m: Math.round(a.lengthM), coords: a.coords })

    // 2) La segunda parte pasa a un tramo nuevo con los mismos parámetros
    try {
      const res = await fetch(`/api/proyectos-ripio/${proy.id}/ripios`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:          `${origen.nombre} (2)`,
          an:              origen.an,
          e:               origen.e,
          rho:             origen.rho,
          precio_unitario: origen.precio_unitario,
          empresa:         origen.empresa,
          fecha_ejecucion: origen.fecha_ejecucion,
          l_m:             Math.round(b.lengthM),
          coords:          b.coords,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const nuevo: RipioTramo = await res.json()
      setProyectos(prev => prev.map(p =>
        p.id === proy.id ? { ...p, ripios: [...p.ripios, nuevo] } : p
      ))
      setEditingId(null)
      setSelectedId(nuevo.id)
      setPanel('form')
    } catch (e) {
      console.error('No se pudo separar el tramo:', e)
    }
  }, [proyectos, saveRipio])

  // ── Panel izquierdo: árbol ────────────────────────────────────────────────
  const renderTree = () => (
    <div style={{
      width: anchoArbol, flexShrink: 0, position: 'relative',
      borderRight: '1px solid #131313',
      display: 'flex', flexDirection: 'column', background: '#080808', overflow: 'hidden',
    }}>
      {/* Tirador para ajustar el ancho */}
      <div
        onMouseDown={e => {
          redimRef.current = { x0: e.clientX, w0: anchoArbol }
          document.body.style.cursor = 'col-resize'
          document.body.style.userSelect = 'none'
        }}
        title="Arrastrá para ajustar el ancho"
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 5,
          cursor: 'col-resize', zIndex: 10,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = `${COLOR}44` }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      />

      {/* Header */}
      <div style={{
        padding: '8px 10px', borderBottom: '1px solid #111',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, gap: 6,
      }}>
        <span style={{ fontSize: 11, color: '#666', ...MONO, textTransform: 'uppercase', letterSpacing: 1.2 }}>
          Proyectos
        </span>
        <button onClick={addProyecto} style={{
          fontSize: 12, ...MONO, cursor: 'pointer', whiteSpace: 'nowrap',
          background: 'transparent', border: '1px solid #333', color: '#aaa', padding: '2px 8px',
        }}>+ Nuevo</button>
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 12, fontSize: 13, color: '#555', ...MONO }}>Cargando…</div>}

        {proyectos.map(proy => {
          const isActive    = proy.id === activeProyId
          const isHidden    = hiddenProyIds.has(proy.id)
          const isExpandido = expandidos.has(proy.id)
          const totalPres   = proy.ripios.reduce((s, r) => s + calcRipio(r).presupuesto, 0)
          const totalM      = proy.ripios.reduce((s, r) => s + r.l_m, 0)

          // Metadatos en una línea: antes iban apilados en tres renglones
          const meta = [
            `${proy.ripios.length} tramo${proy.ripios.length === 1 ? '' : 's'}`,
            totalM > 0 ? `${fmt(totalM)} m` : null,
            totalPres > 0 ? fmtP(totalPres) : null,
            proy.creador || null,
          ].filter(Boolean).join(' · ')

          return (
            <div key={proy.id} style={{ borderBottom: '1px solid #0e0e0e' }}>

              {/* ── Proyecto ── */}
              <div
                onClick={() => {
                  setActiveProyId(proy.id)
                  setExpandidos(prev => new Set(prev).add(proy.id))
                  if (proy.ripios.length > 0) setSelectedId(proy.ripios[0].id)
                }}
                style={{
                  padding: '7px 8px 7px 6px', cursor: 'pointer',
                  background: isActive ? `${COLOR}0f` : 'transparent',
                  borderLeft: `2px solid ${isActive ? COLOR : 'transparent'}`,
                  opacity: isHidden ? 0.5 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <button
                    onClick={e => { e.stopPropagation(); toggleExpandido(proy.id) }}
                    title={isExpandido ? 'Contraer' : 'Desplegar'}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: isActive ? COLOR : '#555', fontSize: 10, lineHeight: 1,
                      padding: '3px 2px', flexShrink: 0, ...MONO,
                      transform: isExpandido ? 'rotate(90deg)' : 'none',
                      transition: 'transform .15s',
                    }}>▶</button>

                  <span style={{
                    flex: 1, minWidth: 0, fontSize: 13, ...MONO,
                    color: isActive ? COLOR : '#aaa',
                    fontWeight: isActive ? 700 : 400,
                    overflowWrap: 'anywhere', lineHeight: 1.3,
                  }}>
                    {proy.nombre}
                  </span>

                  {/* Visibilidad en el mapa: ojo explícito, antes era un punto
                      que parecía un estado */}
                  <button
                    onClick={e => { e.stopPropagation(); toggleProyVisibility(proy.id) }}
                    title={isHidden ? 'Mostrar en el mapa' : 'Ocultar del mapa'}
                    aria-label={isHidden ? 'Mostrar en el mapa' : 'Ocultar del mapa'}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: isHidden ? '#3a3a3a' : COLOR, fontSize: 13,
                      lineHeight: 1, padding: '2px 3px', flexShrink: 0,
                    }}>{isHidden ? '◌' : '◉'}</button>

                  <MenuFila
                    color={COLOR}
                    titulo="Acciones del proyecto"
                    acciones={[
                      { id: 'ir', label: 'Ir a la ubicación', icono: '⌖',
                        deshabilitada: coordsDeProyecto(proy.id).length === 0,
                        ayuda: coordsDeProyecto(proy.id).length === 0
                          ? 'Ningún tramo del proyecto está trazado todavía'
                          : 'Centra el mapa sobre todos los tramos del proyecto',
                        onClick: () => {
                          // Si está oculto no se vería nada al llegar
                          setHiddenProyIds(prev => { const n = new Set(prev); n.delete(proy.id); return n })
                          setActiveProyId(proy.id)
                          setExpandidos(prev => new Set(prev).add(proy.id))
                          encuadrarEn(coordsDeProyecto(proy.id))
                        } },
                      { id: 'tramo', label: 'Agregar tramo', icono: '+',
                        onClick: () => addRipio(proy.id) },
                      { id: 'ver', label: isHidden ? 'Mostrar en el mapa' : 'Ocultar del mapa',
                        icono: isHidden ? '◉' : '◌',
                        onClick: () => toggleProyVisibility(proy.id) },
                      { id: 'quitar', label: 'Quitar del cómputo', icono: '✕',
                        destructiva: true,
                        ayuda: 'Si ya lo guardaste como obra, seguís encontrándolo en Obras → Lista',
                        onClick: () => deleteProyecto(proy.id) },
                    ]}
                  />
                </div>

                {meta && (
                  <div style={{
                    fontSize: 11, color: '#5a5a5a', ...MONO, marginTop: 2,
                    paddingLeft: 17, overflowWrap: 'anywhere', lineHeight: 1.35,
                  }}>
                    {meta}
                  </div>
                )}
              </div>

              {/* ── Tramos ── */}
              {isExpandido && (
                <div>
                  {proy.ripios.map(r => {
                    const isSel     = r.id === selectedId
                    const isDrawing = r.id === drawingId
                    const isEditing = r.id === editingId
                    const trazado   = r.l_m > 0 && (r.coords?.length ?? 0) >= 2
                    const clr       = r.color ?? PALETTE[r.orden % PALETTE.length]

                    return (
                      <div key={r.id}
                        onClick={() => {
                          setActiveProyId(proy.id)
                          setSelectedId(r.id)
                          setPanel('form')
                        }}
                        style={{
                          display: 'flex', cursor: 'pointer',
                          background: isSel ? `${clr}18` : 'transparent',
                        }}
                        onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#101010' }}
                        onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
                      >
                        {/* Barra de color: identifica el tramo en el mapa y hace
                            de indentación. Llena = trazado, punteada = sin trazar. */}
                        <span
                          title={trazado ? 'Trazado en el mapa' : 'Sin trazar'}
                          style={{
                            width: 4, flexShrink: 0, marginLeft: 8,
                            background: trazado
                              ? clr
                              : `repeating-linear-gradient(180deg, ${clr} 0 3px, transparent 3px 7px)`,
                          }}
                        />

                        <div style={{ flex: 1, minWidth: 0, padding: '6px 4px 6px 9px' }}>
                          <div style={{
                            fontSize: 13, ...MONO, lineHeight: 1.3,
                            color: isSel ? '#e0e0e0' : '#aaa',
                            overflowWrap: 'anywhere',
                          }}>
                            {r.nombre}
                          </div>
                          <div style={{ fontSize: 11, ...MONO, color: trazado ? '#777' : '#4a4a4a', marginTop: 1 }}>
                            {trazado ? `${fmt(r.l_m)} m · ${r.an} m ancho` : 'sin trazar'}
                            {isDrawing && <span style={{ color: clr }}> · trazando</span>}
                            {isEditing && <span style={{ color: '#F5C300' }}> · editando</span>}
                          </div>
                        </div>

                        <div style={{ paddingTop: 5, paddingRight: 4 }}>
                          <MenuFila
                            color={clr}
                            titulo={`Acciones de ${r.nombre}`}
                            acciones={[
                              { id: 'ir', label: 'Ir a la ubicación', icono: '⌖',
                                deshabilitada: !trazado,
                                ayuda: trazado
                                  ? 'Centra el mapa sobre este tramo'
                                  : 'Todavía no está trazado',
                                onClick: () => {
                                  setHiddenProyIds(prev => { const n = new Set(prev); n.delete(proy.id); return n })
                                  setActiveProyId(proy.id)
                                  setSelectedId(r.id)
                                  setPanel('form')
                                  encuadrarEn(r.coords)
                                } },
                              { id: 'trazar',
                                label: isDrawing ? 'Cancelar trazado'
                                     : trazado   ? 'Volver a trazar' : 'Trazar en el mapa',
                                icono: '↔',
                                ayuda: trazado && !isDrawing ? 'Descarta el trazado actual y empieza de cero' : undefined,
                                onClick: () => {
                                  setActiveProyId(proy.id); setSelectedId(r.id); setPanel('form')
                                  setEditingId(null)
                                  setDrawingId(prev => prev === r.id ? null : r.id)
                                } },
                              { id: 'editar', label: isEditing ? 'Salir de edición' : 'Editar trazado',
                                icono: '✎', deshabilitada: !trazado,
                                ayuda: trazado ? 'Mover, agregar o quitar vértices' : 'Primero hay que trazarlo',
                                onClick: () => {
                                  setActiveProyId(proy.id); setSelectedId(r.id); setPanel('form')
                                  setDrawingId(null)
                                  setEditingId(prev => prev === r.id ? null : r.id)
                                } },
                              { id: 'quitar', label: 'Quitar del cómputo', icono: '✕',
                                destructiva: true,
                                ayuda: 'Si el proyecto ya se guardó como obra, el tramo sigue en ese registro',
                                onClick: () => deleteRipio(r.id) },
                            ]}
                          />
                        </div>
                      </div>
                    )
                  })}

                  <button onClick={() => addRipio(proy.id)} style={{
                    width: '100%', padding: '6px 10px 6px 21px', textAlign: 'left',
                    background: 'transparent', border: 'none', borderTop: '1px solid #141414',
                    fontSize: 11, color: '#666', ...MONO, cursor: 'pointer', letterSpacing: 0.3,
                  }}>+ Agregar tramo</button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Botón Guardar obra — primero, más visible */}
      {onGuardarObra && activeProy && activeProy.ripios.length > 0 && (() => {
        const totalPres = activeProy.ripios.reduce((s, r) => s + calcRipio(r).presupuesto, 0)
        const totalTon  = activeProy.ripios.reduce((s, r) => s + calcRipio(r).W, 0)
        const totalLm   = activeProy.ripios.reduce((s, r) => s + r.l_m, 0)
        if (totalTon <= 0) return null
        const precioPromedio = totalTon > 0 ? totalPres / totalTon : 0
        const allCoords = activeProy.ripios.flatMap(r => (r.coords ?? []).map(([lat, lng]) => ({ lat, lng })))
        return (
          <button
            onClick={() => onGuardarObra?.({
              tipo: 'ripio',
              cantidad: totalTon,
              unidad: 't',
              presupuesto_total: totalPres,
              aporte_dvp: 0,
              aporte_ccc: 0,
              precio_unitario: precioPromedio,
              descripcion: activeProy.nombre,
              coordsLinea: allCoords,
              datos_calculadora: {
                calculadora: 'ripio',
                proyecto: activeProy.nombre,
                inputs: {
                  proyectos: proyectos.map(p => ({
                    id: p.id, nombre: p.nombre,
                    ripios: p.ripios.map(r => ({
                      ...r,
                      ...calcRipio(r),
                    })),
                  })),
                  activeProyId,
                },
                computo: {
                  totalLm,
                  totalTon,
                  totalPres,
                  ripios: activeProy.ripios.map(r => ({ ...r, ...calcRipio(r) })),
                },
              },
            })}
            style={{
              padding: '10px 12px', width: '100%', textAlign: 'left', cursor: 'pointer',
              background: '#F5C30014', border: 'none', borderTop: '1px solid #222',
              borderLeft: '3px solid #F5C300',
              fontSize: 13, color: '#F5C300', ...MONO, fontWeight: 700,
            }}
          >
            💾 Guardar obra
          </button>
        )
      })()}

      {/* Botón resumen — debajo de guardar */}
      <button
        onClick={() => setPanel(p => p === 'resumen' ? 'form' : 'resumen')}
        style={{
          padding: '10px 12px', width: '100%', textAlign: 'left', cursor: 'pointer',
          background: panel === 'resumen' ? `${COLOR}0d` : 'transparent',
          border: 'none', borderTop: '1px solid #111',
          borderLeft: `3px solid ${panel === 'resumen' ? COLOR : 'transparent'}`,
          fontSize: 13, color: panel === 'resumen' ? COLOR : '#666', ...MONO,
          textTransform: 'uppercase', letterSpacing: 1,
        }}
      >Σ Resumen presupuesto</button>
    </div>
  )

  // ── Panel derecho: formulario ─────────────────────────────────────────────
  const renderForm = () => {
    if (!selected) return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#222', ...MONO, fontSize: 12, flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 20, color: '#1a1a1a' }}>↔</span>
        {ripios.length === 0 ? 'Agregá un ripio para comenzar' : 'Seleccioná un ripio'}
      </div>
    )
    const { V, W, presupuesto, cam15, cam30 } = calcRipio(selected)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Botón de dibujo — siempre arriba y visible */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #0e0e0e', flexShrink: 0 }}>
          <button
            onClick={() => {
              setEditingId(null)
              setDrawingId(prev => prev === selected.id ? null : selected.id)
            }}
            style={{
              width: '100%', padding: '9px 0', fontSize: 13, ...MONO,
              fontWeight: 700, letterSpacing: 0.8, cursor: 'pointer',
              border: `1px solid ${drawingId === selected.id ? COLOR : COLOR + '55'}`,
              background: drawingId === selected.id ? `${COLOR}22` : `${COLOR}0a`,
              color: COLOR,
            }}
          >
            {drawingId === selected.id
              ? '✕ Cancelar dibujo'
              : (selected.coords?.length ?? 0) >= 2
                ? `↔ Volver a trazar ${selected.nombre}`
                : `↔ Trazar ${selected.nombre} en mapa`}
          </button>

          {/* Editar el trazado existente sin rehacerlo */}
          {(selected.coords?.length ?? 0) >= 2 && (
            <button
              onClick={() => {
                setDrawingId(null)
                setEditingId(prev => prev === selected.id ? null : selected.id)
              }}
              style={{
                width: '100%', padding: '7px 0', marginTop: 6, fontSize: 13, ...MONO,
                fontWeight: 700, letterSpacing: 0.8, cursor: 'pointer',
                border: `1px solid ${editingId === selected.id ? '#F5C300' : '#2a2a2a'}`,
                background: editingId === selected.id ? '#F5C30022' : 'transparent',
                color: editingId === selected.id ? '#F5C300' : '#888',
              }}
            >
              {editingId === selected.id ? '✕ Salir de edición' : '✎ Editar trazado'}
            </button>
          )}
          {selected.l_m > 0 && (
            <div style={{ marginTop: 6, textAlign: 'center', fontSize: 12, color: '#555', ...MONO }}>
              Longitud actual: <span style={{ color: COLOR }}>{fmt(selected.l_m)} m</span>
              {selected.l_m >= 1000 && ` · ${(selected.l_m/1000).toFixed(3)} km`}
            </div>
          )}
        </div>

        {/* Formulario scrolleable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
          {/* Nombre + Color */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <label style={{ display: 'block', flex: 1 }}>
              <span style={lblS}>Nombre</span>
              <input value={selected.nombre} onChange={e => saveRipio(selected.id, { nombre: e.target.value })} style={inpS} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ ...lblS, marginBottom: 3 }}>Color</span>
              <input
                type="color"
                value={selected.color ?? PALETTE[selected.orden % PALETTE.length]}
                onChange={e => saveRipio(selected.id, { color: e.target.value })}
                style={{ width: 32, height: 28, padding: 2, background: '#0a0a0a', border: '1px solid #1e1e1e', cursor: 'pointer' }}
              />
            </label>
          </div>

          {/* Dimensiones */}
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #0e0e0e' }}>
            <span style={{ fontSize: 11, color: '#333', ...MONO, textTransform: 'uppercase', letterSpacing: 1 }}>Dimensiones</span>
          </div>
          <NInp label="Ancho"    unit="m"    value={selected.an}  onChange={v => saveRipio(selected.id, { an: v })}  step={0.5} />
          <NInp label="Espesor"  unit="m"    value={selected.e}   onChange={v => saveRipio(selected.id, { e: v })}   step={0.01} />
          <NInp label="Densidad" unit="t/m³" value={selected.rho} onChange={v => saveRipio(selected.id, { rho: v })} step={0.05} min={1} />

          {/* Resultados */}
          {selected.l_m > 0 && (
            <div style={{ marginTop: 10, padding: '8px', background: '#0a0a0a', border: '1px solid #111' }}>
              <Res label="Volumen"    value={`${fmt(V)} m³`} />
              <Res label="Toneladas"  value={`${fmt(W)} t`}  accent />
              <Res label="Cam. 15 t"  value={`~${cam15.toLocaleString('es-AR')}`} />
              <Res label="Cam. 30 t"  value={`~${cam30.toLocaleString('es-AR')}`} />
            </div>
          )}

          {/* Ejecución */}
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #0e0e0e' }}>
            <span style={{ fontSize: 12, color: '#555', ...MONO, textTransform: 'uppercase', letterSpacing: 1 }}>Ejecución</span>
          </div>
          <label style={{ display: 'block' }}>
            <span style={lblS}>Empresa</span>
            <input value={selected.empresa} onChange={e => saveRipio(selected.id, { empresa: e.target.value })} style={inpS} placeholder="Nombre de empresa" />
          </label>
          <label style={{ display: 'block' }}>
            <span style={lblS}>Fecha de ejecución</span>
            <input type="date" value={selected.fecha_ejecucion ?? ''} onChange={e => saveRipio(selected.id, { fecha_ejecucion: e.target.value || null })} style={inpS} />
          </label>

          {/* Precio */}
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #0e0e0e' }}>
            <span style={{ fontSize: 12, color: '#555', ...MONO, textTransform: 'uppercase', letterSpacing: 1 }}>Presupuesto</span>
          </div>
          <NInp label="Precio unitario" unit="$/t" value={selected.precio_unitario} onChange={v => saveRipio(selected.id, { precio_unitario: v })} step={100} />
          {presupuesto > 0 && (
            <div style={{ marginTop: 8, padding: '8px', background: `${COLOR}08`, border: `1px solid ${COLOR}22`, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#444', ...MONO, textTransform: 'uppercase', letterSpacing: 1 }}>Total</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: COLOR, ...MONO }}>{fmtP(presupuesto)}</div>
              <div style={{ fontSize: 11, color: '#333', ...MONO }}>{fmt(W)} t × ${fmt(selected.precio_unitario)}/t</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Panel derecho: resumen ────────────────────────────────────────────────
  const renderResumen = () => {
    const toggleP = (id: string) => setResumenSel(prev => {
      const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
    })
    const selProys = proyectos.filter(p => resumenSel.has(p.id))
    const totalSel = selProys.reduce((s, p) => s + p.ripios.reduce((ss, r) => ss + calcRipio(r).presupuesto, 0), 0)
    const totalTon = selProys.reduce((s, p) => s + p.ripios.reduce((ss, r) => ss + calcRipio(r).W, 0), 0)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid #0e0e0e', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#555', ...MONO, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Seleccionar proyectos</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setResumenSel(new Set(proyectos.map(p => p.id)))}
              style={{ fontSize: 11, ...MONO, cursor: 'pointer', background: 'transparent', border: '1px solid #1e1e1e', color: '#555', padding: '2px 8px' }}>Todos</button>
            <button onClick={() => setResumenSel(new Set())}
              style={{ fontSize: 11, ...MONO, cursor: 'pointer', background: 'transparent', border: '1px solid #1e1e1e', color: '#555', padding: '2px 8px' }}>Ninguno</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Total multi-proyecto */}
          {resumenSel.size > 0 && (
            <div style={{ padding: '10px 12px', background: `${COLOR}08`, borderBottom: '1px solid #0e0e0e' }}>
              <div style={{ fontSize: 11, color: '#555', ...MONO, textTransform: 'uppercase', letterSpacing: 1 }}>Total seleccionado</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: COLOR, ...MONO }}>{fmtP(totalSel)}</div>
              <div style={{ fontSize: 11, color: '#555', ...MONO }}>{fmt(totalTon)} t</div>
            </div>
          )}

          {/* Por proyecto */}
          {proyectos.map(proy => {
            const checked = resumenSel.has(proy.id)
            const pTotal  = proy.ripios.reduce((s, r) => s + calcRipio(r).presupuesto, 0)
            return (
              <div key={proy.id} style={{ borderBottom: '1px solid #0d0d0d' }}>
                {/* Proyecto checkbox */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleP(proy.id)}
                    style={{ accentColor: COLOR, width: 11, height: 11, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: checked ? '#ccc' : '#777', ...MONO, fontWeight: 600 }}>{proy.nombre}</div>
                    <div style={{ fontSize: 12, color: '#555', ...MONO }}>{fmtP(pTotal)}</div>
                  </div>
                </label>

                {/* Ripios del proyecto */}
                {proy.ripios.map(r => {
                  const { W, presupuesto } = calcRipio(r)
                  return (
                    <div key={r.id} style={{ padding: '3px 12px 3px 28px', display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 12, color: '#777', ...MONO }}>{r.nombre}</div>
                        <div style={{ fontSize: 12, color: '#555', ...MONO }}>
                          {fmt(r.l_m)} m · {fmt(W)} t{r.empresa ? ` · ${r.empresa}` : ''}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#666', ...MONO }}>{presupuesto > 0 ? fmtP(presupuesto) : '—'}</div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Modal de confirmación custom ─────────────────────────────────────────
  const renderConfirm = () => confirmState && (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={() => setConfirmState(null)}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0d0d0d', border: '1px solid #2a2a2a',
          padding: '22px 26px', minWidth: 270, maxWidth: 360,
          boxShadow: '0 6px 32px rgba(0,0,0,0.8)',
        }}
      >
        <div style={{ fontSize: 13, color: '#bbb', ...MONO, marginBottom: 20, lineHeight: 1.6 }}>
          {confirmState.msg}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setConfirmState(null)}
            style={{
              fontSize: 13, ...MONO, cursor: 'pointer', padding: '6px 16px',
              background: 'transparent', border: '1px solid #252525', color: '#555',
            }}
          >Cancelar</button>
          <button
            onClick={() => { confirmState.action(); setConfirmState(null) }}
            style={{
              fontSize: 13, ...MONO, cursor: 'pointer', padding: '6px 16px',
              background: '#250000', border: '1px solid #660000',
              color: '#ff5555', fontWeight: 700,
            }}
          >Eliminar</button>
        </div>
      </div>
    </div>
  )

  // ── Datos para composición (todos los proyectos visibles) ────────────────
  const allVisibleRipios = proyectos
    .filter(p => !hiddenProyIds.has(p.id))
    .flatMap(p => p.ripios)

  const ripiosComp = proyectos
    .filter(p => !hiddenProyIds.has(p.id))
    .flatMap(p => p.ripios.map(r => ({
      id:             r.id,
      nombre:         r.nombre,
      an:             r.an,
      // Espesor y densidad van para que la composición calcule el tonelaje de
      // cada tramo por su cuenta, en vez de prorratear un total global
      e:              r.e,
      rho:            r.rho,
      l_m:            r.l_m,
      coords:         r.coords ?? null,
      color:          r.color ?? PALETTE[r.orden % PALETTE.length],
      proyectoId:     p.id,
      proyectoNombre: p.nombre,
      empresa:        r.empresa || undefined,
    })))

  const visibleProyIds  = proyectos.filter(p => !hiddenProyIds.has(p.id)).map(p => p.id)
  const visiblePrjNames = proyectos.filter(p => !hiddenProyIds.has(p.id)).map(p => p.nombre)
  const compNombre = visiblePrjNames.length === 1
    ? visiblePrjNames[0]
    : visiblePrjNames.length > 1 ? `${visiblePrjNames.length} proyectos` : 'Sin proyectos'

  /**
   * Números de la obra, calculados una sola vez.
   *
   * Los usan las pestañas de Presupuesto, Legajo y Composición. Antes cada una
   * los sacaba por su cuenta y la composición terminaba mostrando el tonelaje
   * crudo del cómputo y el precio unitario viejo por tramo, en vez de los
   * valores adoptados y el presupuesto real.
   */
  const resumenObra = useMemo(() => {
    const coef = calcularCoeficientes(analisis.coeficientes, analisis.precios)
    const mdo  = calcularMdeO(analisis.precios, analisis.manoObra)

    const tramosComputo = ripios.map(r => ({
      id: r.id, nombre: r.nombre,
      largoM: r.l_m, anchoM: r.an, espesorM: r.e, densidad: r.rho,
    }))
    const computo   = calcularComputo(tramosComputo)
    const toneladas = valorEfectivo(computo.toneladasCalculado, analisis.toneladasAdoptadas)
    const metros    = valorEfectivo(computo.largoTotalM,        analisis.metrosAdoptados)

    const precioDe = (k: ClaveAPU) => {
      const cfg = analisis.apu[k]
      const r = calcularAPU(paramsAPU(k, cfg), coef, mdo, analisis.precios.dolar)
      return valorEfectivo(r.precioCalculado, cfg.precioAdoptado)
    }

    const pres = calcularPresupuesto({
      toneladas, metros,
      distanciaNoPavKm: analisis.datos.distanciaNoPavKm,
      distanciaPavKm:   analisis.datos.distanciaPavKm,
      precioMaterial:   precioDe('material'),
      precioTransNoPav: precioDe('transNoPav'),
      precioTransPav:   precioDe('transPav'),
      precioEjecucion:  precioDe('construccion'),
      movilizacion:     analisis.movilizacion,
      tipoMaterial:     analisis.datos.tipoMaterial,
      tramo:            analisis.datos.tramo,
    })

    return { coef, mdo, tramosComputo, computo, toneladas, metros, pres }
  }, [analisis, ripios])

  // Las referencias de la composición muestran lo mismo que el presupuesto:
  // tonelaje adoptado y total presupuestado, no el cómputo crudo.
  //
  // El análisis pertenece a un proyecto, así que si hay varios visibles en el
  // mapa esos números dejan de corresponder: ahí se cae al cómputo sumado, que
  // al menos describe lo que se está viendo.
  const soloProyectoActivo =
    visibleProyIds.length === 1 && visibleProyIds[0] === activeProyId

  /**
   * Totales de cada proyecto visible, con sus valores adoptados aplicados.
   *
   * Se calcula por proyecto y no sólo para el activo porque la composición
   * puede mostrar varios: cada uno tiene su propio análisis, sus cantidades
   * adoptadas y su presupuesto.
   */
  const resumenProyectos = useMemo(() =>
    proyectos
      .filter(p => !hiddenProyIds.has(p.id))
      .map(p => {
        const a    = normalizarAnalisis(p.analisis)
        const coef = calcularCoeficientes(a.coeficientes, a.precios)
        const mdo  = calcularMdeO(a.precios, a.manoObra)

        const computo = calcularComputo(p.ripios.map(r => ({
          id: r.id, nombre: r.nombre,
          largoM: r.l_m, anchoM: r.an, espesorM: r.e, densidad: r.rho,
        })))

        const precioDe = (k: ClaveAPU) => {
          const cfg = a.apu[k]
          const r = calcularAPU(paramsAPU(k, cfg), coef, mdo, a.precios.dolar)
          return valorEfectivo(r.precioCalculado, cfg.precioAdoptado)
        }

        const metros    = valorEfectivo(computo.largoTotalM,        a.metrosAdoptados)
        const toneladas = valorEfectivo(computo.toneladasCalculado, a.toneladasAdoptadas)

        const pres = calcularPresupuesto({
          toneladas, metros,
          distanciaNoPavKm: a.datos.distanciaNoPavKm,
          distanciaPavKm:   a.datos.distanciaPavKm,
          precioMaterial:   precioDe('material'),
          precioTransNoPav: precioDe('transNoPav'),
          precioTransPav:   precioDe('transPav'),
          precioEjecucion:  precioDe('construccion'),
          movilizacion:     a.movilizacion,
        })

        return { id: p.id, nombre: p.nombre, metros, toneladas, presupuesto: pres.total }
      })
      .filter(r => r.metros > 0 || r.toneladas > 0),
  [proyectos, hiddenProyIds])

  // ── Análisis de precios ───────────────────────────────────────────────────
  function renderAnalisis() {
    if (!activeProy) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#444', ...MONO, fontSize: 13 }}>
          Creá o seleccioná un proyecto para analizar precios
        </div>
      )
    }

    const coef = calcularCoeficientes(analisis.coeficientes, analisis.precios)
    const mdo  = calcularMdeO(analisis.precios, analisis.manoObra)

    const setPrecio = (k: keyof typeof analisis.precios, v: number) =>
      guardarAnalisis({ ...analisis, precios: { ...analisis.precios, [k]: v } })

    const setApu = (clave: ClaveAPU, cfg: ConfigAPU) =>
      guardarAnalisis({ ...analisis, apu: { ...analisis.apu, [clave]: cfg } })

    const distancia = apuActivo === 'transNoPav' ? analisis.datos.distanciaNoPavKm
                    : apuActivo === 'transPav'   ? analisis.datos.distanciaPavKm
                    : undefined

    const lblP: React.CSSProperties = {
      fontSize: 11, color: '#555', textTransform: 'uppercase',
      letterSpacing: 0.8, ...MONO, display: 'block', marginBottom: 2,
    }

    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px' }}>

        {/* ── Precios del proyecto ── */}
        <div style={{ background: '#0c0c0c', border: '1px solid #1e1e1e', padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: COLOR, letterSpacing: 1, textTransform: 'uppercase',
            marginBottom: 4, ...MONO }}>
            Precios de este proyecto
          </div>
          <div style={{ fontSize: 12, color: '#555', marginBottom: 10, ...MONO, lineHeight: 1.4 }}>
            Son propios de la obra. Cambiarlos acá no afecta a otros proyectos ya presupuestados.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            {([
              ['gasoil',             'Gasoil ($/lt)'],
              ['neumatico',          'Neumático ($/un)'],
              ['dolar',              'Dólar ($)'],
              ['jornalOficialEsp',   'Of. especializado ($/hs)'],
              ['jornalOficial',      'Oficial ($/hs)'],
              ['jornalMedioOficial', 'Medio oficial ($/hs)'],
              ['jornalAyudante',     'Ayudante ($/hs)'],
              ['ripio',              'Ripio en cantera ($/tn)'],
            ] as const).map(([k, label]) => (
              <label key={k}>
                <span style={lblP}>{label}</span>
                <input type="number" min={0} step="any" value={analisis.precios[k]}
                  onChange={e => setPrecio(k, parseFloat(e.target.value) || 0)}
                  style={{ ...inpS, fontSize: 13 }} />
              </label>
            ))}
          </div>
        </div>

        {/* ── Mano de obra — plegable, con la suma no remunerativa editable ── */}
        <PanelManoObra
          params={analisis.manoObra}
          onChange={p => guardarAnalisis({ ...analisis, manoObra: p })}
          precios={analisis.precios}
          mdo={mdo}
          color={COLOR}
        />

        {/* ── Coeficientes — plegable, todo editable ── */}
        <PanelCoeficientes
          params={analisis.coeficientes}
          onChange={p => guardarAnalisis({ ...analisis, coeficientes: p })}
          coef={coef}
          color={COLOR}
        />

        {/* ── Sub-pestañas ──
            Los cuatro análisis comparten estructura, así que sin señales fuertes
            es fácil perder de vista en cuál se está trabajando. Cada uno tiene
            color propio, y la pestaña muestra si ya tiene datos y cuánto da. */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {CLAVES_APU.map(k => {
            const activo = apuActivo === k
            const meta   = ETIQUETAS_APU[k]
            const cfg    = analisis.apu[k]
            const conDatos = apuTieneDatos(cfg)
            const precio = conDatos
              ? valorEfectivo(
                  calcularAPU(paramsAPU(k, cfg), coef, mdo, analisis.precios.dolar).precioCalculado,
                  cfg.precioAdoptado,
                )
              : null
            return (
              <button key={k} onClick={() => setApuActivo(k)} style={{
                ...MONO, cursor: 'pointer', padding: '8px 14px', textAlign: 'left',
                background: activo ? '#131313' : '#0a0a0a',
                border: `1px solid ${activo ? meta.color : '#1a1a1a'}`,
                borderTop: `2.5px solid ${activo ? meta.color : `${meta.color}44`}`,
                minWidth: 150, flex: '1 1 150px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: conDatos ? meta.color : 'transparent',
                    border: `1px solid ${conDatos ? meta.color : '#333'}`,
                  }} />
                  <span style={{
                    fontSize: 13, fontWeight: activo ? 700 : 400,
                    color: activo ? meta.color : conDatos ? '#999' : '#555',
                  }}>
                    {meta.corto}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                  {precio != null
                    ? <span style={{ color: activo ? '#ccc' : '#777' }}>
                        {precio.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span style={{ color: '#555', marginLeft: 3 }}>{meta.unidad}</span>
                      </span>
                    : <span style={{ color: '#3d3d3d' }}>sin cargar · {meta.unidad}</span>}
                </div>
              </button>
            )
          })}
        </div>

        {/* Cabecera del análisis activo */}
        <div style={{
          borderLeft: `3px solid ${ETIQUETAS_APU[apuActivo].color}`,
          paddingLeft: 12, marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 18, fontWeight: 700, color: ETIQUETAS_APU[apuActivo].color, ...MONO,
            }}>
              {ETIQUETAS_APU[apuActivo].titulo}
            </span>
            <span style={{
              fontSize: 13, color: '#666', padding: '2px 8px',
              border: '1px solid #222', ...MONO,
            }}>
              {ETIQUETAS_APU[apuActivo].unidad}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#555', marginTop: 4, ...MONO, lineHeight: 1.4 }}>
            {ETIQUETAS_APU[apuActivo].nota}
          </div>
        </div>

        <PanelAPU
          clave={apuActivo}
          cfg={analisis.apu[apuActivo]}
          onChange={cfg => setApu(apuActivo, cfg)}
          coef={coef}
          mdo={mdo}
          dolar={analisis.precios.dolar}
          catalogo={catalogo}
          distanciaKm={distancia}
        />
      </div>
    )
  }

  // ── Presupuesto oficial ───────────────────────────────────────────────────
  function renderPresupuesto() {
    if (!activeProy) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#444', ...MONO, fontSize: 13 }}>
          Creá o seleccioná un proyecto para armar el presupuesto
        </div>
      )
    }
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px' }}>
        <PanelPresupuesto
          analisis={analisis}
          onChange={guardarAnalisis}
          tramos={resumenObra.tramosComputo}
          coef={resumenObra.coef}
          mdo={resumenObra.mdo}
          color={COLOR}
        />
      </div>
    )
  }

  // ── Legajo imprimible ─────────────────────────────────────────────────────
  function renderLegajo() {
    if (!activeProy) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#444', ...MONO, fontSize: 13 }}>
          Creá o seleccioná un proyecto para armar el legajo
        </div>
      )
    }
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px', background: '#0a0a0a' }}>
        <PlanillasImprimibles
          analisis={analisis}
          tramos={resumenObra.tramosComputo}
          coef={resumenObra.coef}
          mdo={resumenObra.mdo}
          color={COLOR}
        />
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0, flexShrink: 0,
        borderBottom: '1px solid #0e0e0e', background: '#060606',
      }}>
        {(['computo', 'analisis', 'presupuesto', 'mapa', 'legajo'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
            padding: '6px 20px', border: 'none', borderRight: '1px solid #111',
            letterSpacing: 0.8, textTransform: 'uppercase',
            background: view === v ? '#0d0d0d' : 'transparent',
            color:      view === v ? COLOR      : '#444',
            borderBottom: view === v ? `1.5px solid ${COLOR}` : '1.5px solid transparent',
          }}>
            {v === 'computo'     ? 'Cómputo'
             : v === 'analisis'  ? 'Análisis de precios'
             : v === 'presupuesto' ? 'Presupuesto'
             : v === 'mapa'      ? 'Composición'
             : '🖨 Legajo'}
          </button>
        ))}
        {saving && <div style={{ marginLeft: 'auto', alignSelf: 'center', marginRight: 10, width: 6, height: 6, borderRadius: '50%', background: COLOR, opacity: 0.7 }}/>}
      </div>

      {/* Aviso al volver desde la edición de una obra */}
      {avisoRestaurar && (
        <div style={{
          flexShrink: 0, padding: '8px 14px', background: '#2a1a00',
          borderBottom: '1px solid #7a4b00', display: 'flex',
          alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 13, color: '#F5C300', ...MONO, flex: 1, lineHeight: 1.5 }}>
            {avisoRestaurar}
          </span>
          <button onClick={() => setAvisoRestaurar(null)}
            style={{
              background: 'transparent', border: '1px solid #7a4b00', color: '#a88',
              fontSize: 12, padding: '2px 9px', cursor: 'pointer', ...MONO, flexShrink: 0,
            }}>
            ✕
          </button>
        </div>
      )}

      {/* Contenido según tab */}
      {view === 'computo' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>

          {/* Columna 1: árbol */}
          {renderTree()}

          {/* Columna 2: mapa */}
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            {proyectos.length > 0 ? (
              <RipioMapPanel
                ripios={mapRipios}
                selectedId={selectedId}
                drawingId={drawingId}
                color={COLOR}
                editingId={editingId}
                onLineDraw={handleLineDraw}
                onDrawEnd={() => setDrawingId(null)}
                onLineEdit={handleLineEdit}
                onLineSplit={handleLineSplit}
                onEditEnd={() => setEditingId(null)}
                fitTo={encuadre}
                onSelectRipio={(id) => {
                  const owner = proyectos.find(p => p.ripios.some(r => r.id === id))
                  if (owner) setActiveProyId(owner.id)
                  setSelectedId(id)
                  setPanel('form')
                }}
                onDeleteRipio={deleteRipio}
              />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', ...MONO, fontSize: 13 }}>
                Creá un proyecto para comenzar
              </div>
            )}

            {/* Instrucción de dibujo flotante */}
            {drawingId && (
              <div style={{
                position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                zIndex: 1000, background: '#0a0a0aee', border: `1px solid ${COLOR}55`,
                padding: '5px 14px', ...MONO, fontSize: 12, color: `${COLOR}cc`,
                pointerEvents: 'none',
              }}>
                Clic para agregar puntos · Clic derecho para finalizar
              </div>
            )}
          </div>

          {/* Columna 3: form / resumen */}
          <div style={{
            width: 220, flexShrink: 0, borderLeft: '1px solid #131313',
            background: '#080808', display: 'flex', flexDirection: 'column',
          }}>
            {panel === 'form' ? renderForm() : renderResumen()}
          </div>
        </div>
      ) : view === 'analisis' ? (
        renderAnalisis()
      ) : view === 'presupuesto' ? (
        renderPresupuesto()
      ) : view === 'legajo' ? (
        renderLegajo()
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <MapComposicionRipio
            ripios={ripiosComp}
            proyectoNombre={compNombre}
            resumenProyectos={resumenProyectos}
            active={view === 'mapa'}
          />
        </div>
      )}

      {/* Modal de confirmación (fuera del tab para que siempre esté disponible) */}
      {renderConfirm()}
    </div>
  )
}
