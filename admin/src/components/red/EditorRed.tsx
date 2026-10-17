'use client'
/**
 * Herramientas → «Editar red»: agregar, editar y quitar tramos de consorcio y
 * rutas provinciales sobre el mapa, y asignarlos a un consorcio o a la DVP.
 *
 * El mapa es la pantalla y esto es un panel de propiedades a la derecha, como
 * en los relevamientos de gabinete. Se elige un tramo con un clic (o se dibuja
 * uno nuevo), se corrigen sus datos y su trazado, y al guardar:
 *
 * - el cambio queda en `red_vial_cambios` y todas las pantallas lo ven encima
 *   del archivo de QGIS (`lib/redVialCarga.ts`);
 * - los km de la ficha del consorcio se mueven por lo que el cambio sumó o
 *   restó, en la misma transacción (`ajusteNeto`, docs/sql/18).
 *
 * Los caminos del mapa de fondo no reciben clics mientras el editor está
 * abierto (clase `sv-editando`, ver `globals.css`): un clic sobre un camino
 * abría su popup en vez de elegirlo. La selección se resuelve por afuera de
 * Leaflet, con un índice propio, igual que la lectura de la red de fondo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { createClient } from '@/lib/supabase/client'
import { CELDA_GRADOS, distanciaAlSegmentoKm, toleranciaKm } from '@/lib/redFondo'
import { avisarCambio, type RedCargada } from '@/lib/redVialCarga'
import {
  ajusteNeto, cambiosGeoJSON, designacion, fmtKm, JERARQUIAS, leerTramo, longitudKm,
  MATERIALES_CC, MATERIALES_RP, origenCompleto, partes, quienGestiona, restarAjustes, ZONAS,
  type Ajuste, type Cambio, type Feature, type Jerarquia, type Origen, type TipoRed,
  type Tramo, type Zona,
} from '@/lib/redVial'

// ── Estilo: el de los paneles flotantes del mapa ─────────────────────────────

const ACENTO = '#4fc3f7'
const AMARILLO = '#F5C300'
const COLOR_OP = { alta: '#66bb6a', edicion: ACENTO, baja: '#ef5350' } as const
const ROTULO_OP = { alta: 'Nuevo', edicion: 'Editado', baja: 'Quitado' } as const

const CAJA: React.CSSProperties = {
  position: 'absolute', top: 10, right: 10, zIndex: 1002, width: 340,
  maxHeight: 'calc(100% - 20px)', display: 'flex', flexDirection: 'column',
  background: '#0e0e0e', border: '1px solid #222', borderRadius: 2,
  boxShadow: '0 4px 20px rgba(0,0,0,.8)', fontFamily: 'monospace', color: '#ccc',
}
const CABECERA: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '0 9px', borderBottom: '1px solid #222', borderLeft: `3px solid ${ACENTO}`,
  background: '#0a0a0a', flexShrink: 0, height: 30,
}
const TITULO: React.CSSProperties = { fontSize: 12, color: '#999', letterSpacing: 1.4, textTransform: 'uppercase' }
const SECCION: React.CSSProperties = {
  fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1.2,
  margin: '12px 0 6px', paddingBottom: 3, borderBottom: '1px solid #1e1e1e',
}
const ROTULO: React.CSSProperties = { fontSize: 11, color: '#666', letterSpacing: 0.5, marginBottom: 3 }
const CAMPO: React.CSSProperties = {
  width: '100%', height: 28, background: '#050505', border: '1px solid #262626', borderRadius: 2,
  color: '#e0e0e0', fontSize: 12, fontFamily: 'monospace', padding: '0 7px', outline: 'none',
  boxSizing: 'border-box',
}
const BOTON: React.CSSProperties = {
  background: '#0a0a0a', border: '1px solid #262626', color: '#999', borderRadius: 2,
  padding: '6px 8px', fontSize: 12, fontFamily: 'monospace', cursor: 'pointer',
}
const botonAcento = (c: string, lleno = false): React.CSSProperties => ({
  ...BOTON, border: `1px solid ${c}${lleno ? '' : '66'}`, color: lleno ? '#0a0a0a' : c,
  background: lleno ? c : `${c}10`, fontWeight: lleno ? 700 : 400,
})

function Segmentado<T extends string>({ valor, opciones, onCambio }: {
  valor: T | null
  opciones: { v: T; rotulo: string }[]
  onCambio: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', border: '1px solid #262626', borderRadius: 2 }}>
      {opciones.map((o, i) => (
        <button key={o.v} type="button" onClick={() => onCambio(o.v)}
          style={{
            flex: 1, height: 28, border: 'none', borderLeft: i ? '1px solid #262626' : 'none',
            background: valor === o.v ? `${ACENTO}22` : '#050505', color: valor === o.v ? ACENTO : '#777',
            fontSize: 12, fontFamily: 'monospace', cursor: 'pointer',
          }}>
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

// ── Índice para elegir un tramo con el cursor ────────────────────────────────

interface Entrada { feature: Feature; origen: Origen }
interface Seg { e: number; aLat: number; aLng: number; bLat: number; bLng: number }

class Indice {
  private celdas = new Map<string, Seg[]>()
  readonly entradas: Entrada[] = []

  constructor(redes: (RedCargada | null)[]) {
    for (const r of redes) {
      if (!r) continue
      for (const col of Object.values(r.red)) {
        for (const f of col?.features ?? []) {
          const o = r.origen.get(f)
          if (!o) continue
          const e = this.entradas.push({ feature: f, origen: o }) - 1
          for (const p of partes(f.geometry)) {
            for (let i = 0; i + 1 < p.length; i++) {
              const s: Seg = { e, aLng: p[i][0], aLat: p[i][1], bLng: p[i + 1][0], bLat: p[i + 1][1] }
              const ka = this.clave(s.aLat, s.aLng), kb = this.clave(s.bLat, s.bLng)
              this.push(ka, s)
              if (kb !== ka) this.push(kb, s)
            }
          }
        }
      }
    }
  }

  private clave(lat: number, lng: number) {
    return `${Math.floor(lat / CELDA_GRADOS)}|${Math.floor(lng / CELDA_GRADOS)}`
  }
  private push(k: string, s: Seg) {
    const l = this.celdas.get(k)
    if (l) l.push(s); else this.celdas.set(k, [s])
  }

  private cerca(p: { lat: number; lng: number }): Seg[] {
    const fLat = Math.floor(p.lat / CELDA_GRADOS), fLng = Math.floor(p.lng / CELDA_GRADOS)
    const salida = new Set<Seg>()
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const s of this.celdas.get(`${fLat + a}|${fLng + b}`) ?? []) salida.add(s)
    }
    return [...salida]
  }

  /** El tramo más cercano al punto, dentro de la tolerancia */
  tramoEn(p: { lat: number; lng: number }, tolKm: number): Entrada | null {
    let mejor: { e: number; d: number } | null = null
    for (const s of this.cerca(p)) {
      const d = distanciaAlSegmentoKm(p, s.aLat, s.aLng, s.bLat, s.bLng)
      if (d <= tolKm && (!mejor || d < mejor.d)) mejor = { e: s.e, d }
    }
    return mejor ? this.entradas[mejor.e] : null
  }

  /** El vértice de la red más cercano, para pegar el dibujo a un camino existente */
  verticeEn(p: { lat: number; lng: number }, tolKm: number): [number, number] | null {
    const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180)
    let mejor: { c: [number, number]; d: number } | null = null
    for (const s of this.cerca(p)) {
      for (const [lat, lng] of [[s.aLat, s.aLng], [s.bLat, s.bLng]]) {
        const d = Math.hypot((lng - p.lng) * kx, (lat - p.lat) * 111.32)
        if (d <= tolKm && (!mejor || d < mejor.d)) mejor = { c: [lng, lat], d }
      }
    }
    return mejor?.c ?? null
  }
}

// ── Estado del borrador ──────────────────────────────────────────────────────

interface ConsorcioOpcion { numero: number; nombre: string; zona: Zona | null }

interface Borrador {
  /** De dónde sale: null es un tramo nuevo */
  origen: Origen | null
  tramo: Tramo
  partes: number[][][]
  /** Cómo era al abrirlo, para saber si hay algo sin guardar */
  inicial: string
  /** Tramo y km del archivo, para calcular cuánto mueve el cambio */
  original: { tramo: Tramo; km: number } | null
}

const firmar = (t: Tramo, p: number[][][]) => JSON.stringify([t, p])

function tramoVacio(red: TipoRed): Tramo {
  return {
    red, gestion: 'consorcio', consorcio: null, zona: 'ZI',
    jerarquia: red === 'cc' ? 'TERCIARIA' : 'PRIMARIA', material: 'TIERRA',
    tramo: null, ruta: null, enObra: false,
  }
}

function borradorDe(entrada: Entrada): Borrador {
  const o = origenCompleto(entrada.origen, entrada.feature)
  const capa = o.tipo === 'archivo' ? o.capa : o.cambio.capa
  const tramo = leerTramo(o.red, capa, entrada.feature.properties)
  const p = partes(entrada.feature.geometry).map(x => x.map(c => [c[0], c[1]]))
  let original: Borrador['original'] = null
  if (o.tipo === 'archivo') original = { tramo, km: longitudKm(entrada.feature.geometry) }
  else if (o.cambio.original && o.cambio.base_capa) {
    original = {
      tramo: leerTramo(o.red, o.cambio.base_capa, o.cambio.original.propiedades),
      km: longitudKm(o.cambio.original.geometria),
    }
  }
  return { origen: o, tramo, partes: p, inicial: firmar(tramo, p), original }
}

function borradorDeCambio(c: Cambio): Borrador {
  return borradorDe({ feature: { properties: c.propiedades, geometry: c.geometria }, origen: { tipo: 'cambio', red: c.red, cambio: c } })
}

const descripcionAjuste = (a: Ajuste) => {
  const signo = (x: number) => `${x > 0 ? '+' : '−'}${fmtKm(Math.abs(x))}`
  const redes = ([['primaria', a.primaria], ['secundaria', a.secundaria], ['terciaria', a.terciaria]] as const)
    .filter(([, v]) => v !== 0).map(([n, v]) => `${n} ${signo(v)}`)
  return `CC ${a.numero} · red ${signo(a.total)} km${redes.length ? ` (${redes.join(', ')})` : ''}`
}

// ── Componente ───────────────────────────────────────────────────────────────

export default function EditorRed({ mapaRef, listo, redCC, redRP, onCerrar }: {
  /** La ref del mapa, no el mapa: se lee adentro de los efectos */
  mapaRef: { current: L.Map | null }
  listo: boolean
  redCC: RedCargada | null
  redRP: RedCargada | null
  onCerrar: () => void
}) {
  const [consorcios, setConsorcios] = useState<ConsorcioOpcion[]>([])
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [historia, setHistoria] = useState<number[][][][]>([])
  const [trazando, setTrazando] = useState(false)
  const [vertices, setVertices] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<null | 'quitar' | 'restaurar'>(null)
  const [hover, setHover] = useState<{ x: number; y: number; texto: string } | null>(null)
  const [verCambios, setVerCambios] = useState(true)
  const [listaAbierta, setListaAbierta] = useState(false)

  const indice = useMemo(() => new Indice([redCC, redRP]), [redCC, redRP])
  // Las dos redes traen la misma lista de cambios (son de las dos)
  const cambios = useMemo(
    () => [...(redCC?.cambios ?? redRP?.cambios ?? [])].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')),
    [redCC, redRP],
  )
  const huerfanos = useMemo(() => [...(redCC?.huerfanos ?? []), ...(redRP?.huerfanos ?? [])], [redCC, redRP])
  const errorCambios = redCC?.errorCambios ?? redRP?.errorCambios ?? null
  const sinTabla = !!errorCambios

  const sucio = !!borrador && firmar(borrador.tramo, borrador.partes) !== borrador.inicial
  const kmNuevo = borrador ? longitudKm({ type: 'MultiLineString', coordinates: borrador.partes }) : 0
  const trazadoValido = !!borrador && borrador.partes.some(p => p.length >= 2) && kmNuevo > 0.001
  const consorcioSel = borrador?.tramo.consorcio != null
    ? consorcios.find(c => c.numero === borrador.tramo.consorcio) ?? null
    : null
  const esBaja = borrador?.origen?.tipo === 'cambio' && borrador.origen.cambio.operacion === 'baja'

  // Lo que ya movió este tramo, si tiene un cambio guardado
  const yaMovido = useMemo(
    () => (borrador?.origen?.tipo === 'cambio' ? borrador.origen.cambio.ajuste : []),
    [borrador],
  )

  // Lo que guardar va a mover en la ficha **desde como está ahora**: el ajuste
  // nuevo menos el que ya estaba aplicado. Medido contra el archivo, reeditar
  // un tramo ya editado anunciaba movimientos que ya se habían hecho.
  const impacto = useMemo<Ajuste[]>(() => {
    if (!borrador || esBaja) return []
    return restarAjustes(ajusteNeto(borrador.original, { tramo: borrador.tramo, km: kmNuevo }), yaMovido)
  }, [borrador, kmNuevo, esBaja, yaMovido])

  // Y lo que movería quitarlo: un alta devuelve lo que sumó; un tramo del
  // archivo resta su original, menos lo que ya se le había movido
  const impactoQuitar = useMemo<Ajuste[]>(() => {
    if (!borrador?.origen) return []
    const o = borrador.origen
    if (o.tipo === 'cambio' && o.cambio.operacion === 'alta') return restarAjustes([], o.cambio.ajuste)
    return restarAjustes(ajusteNeto(borrador.original, null), yaMovido)
  }, [borrador, yaMovido])

  // Refs para los manejadores del mapa, que se registran una vez
  const estado = useRef({ borrador, trazando, sucio, indice, historia })
  useEffect(() => { estado.current = { borrador, trazando, sucio, indice, historia } })

  // ── Consorcios para el selector ──
  useEffect(() => {
    createClient().from('consorcios').select('numero, nombre, zona').order('numero')
      .then(({ data }) => setConsorcios((data ?? []).map(c => ({
        numero: Number(c.numero), nombre: String(c.nombre ?? ''),
        zona: (ZONAS as string[]).includes(String(c.zona ?? '').trim().toUpperCase())
          ? (String(c.zona).trim().toUpperCase() as Zona) : null,
      }))))
  }, [])

  // ── Los caminos del fondo no reciben clics mientras se edita ──
  useEffect(() => {
    const map = listo ? mapaRef.current : null
    if (!map) return
    const c = map.getContainer()
    c.classList.add('sv-editando')
    map.closePopup()
    return () => { c.classList.remove('sv-editando'); c.style.cursor = '' }
  }, [listo, mapaRef])

  // ── Clic y movimiento sobre el mapa ──
  const cambiarPartes = useCallback((fn: (p: number[][][]) => number[][][]) => {
    const b = estado.current.borrador
    if (!b) return
    const nuevas = fn(b.partes)
    if (JSON.stringify(nuevas) === JSON.stringify(b.partes)) return
    const siguiente = { ...b, partes: nuevas }
    // El estado se adelanta en la ref: dos clics seguidos no pueden partir del mismo borrador
    estado.current = { ...estado.current, borrador: siguiente, historia: [...estado.current.historia.slice(-49), b.partes] }
    setHistoria(estado.current.historia)
    setBorrador(siguiente)
  }, [])

  useEffect(() => {
    const map = listo ? mapaRef.current : null
    if (!map) return

    const tol = (px: number) => toleranciaKm(map, px)

    const alClic = (e: L.LeafletMouseEvent) => {
      const { borrador: b, trazando: t, sucio: s, indice: idx } = estado.current
      const p = { lat: e.latlng.lat, lng: e.latlng.lng }
      if (b && t) {
        // Alt suelta el punto donde cae, sin pegarlo a un camino
        const pegado = e.originalEvent.altKey ? null : idx.verticeEn(p, tol(10))
        const c = pegado ?? [Math.round(p.lng * 1e7) / 1e7, Math.round(p.lat * 1e7) / 1e7]
        cambiarPartes(ps => {
          const n = ps.map(x => [...x])
          if (n.length === 0) n.push([])
          const ult = n[n.length - 1]
          // El doble clic que termina el trazado son dos clics en el mismo lugar
          const previo = ult[ult.length - 1]
          if (previo && Math.abs(previo[0] - c[0]) < 1e-6 && Math.abs(previo[1] - c[1]) < 1e-6) return ps
          ult.push(c)
          return n
        })
        return
      }
      const hit = idx.tramoEn(p, tol(8))
      if (!hit) return
      if (s) { setAviso('Hay cambios sin guardar: guardalos o cancelalos antes de elegir otro tramo'); return }
      setAviso(null); setError(null); setConfirmar(null)
      setBorrador(borradorDe(hit)); setHistoria([]); setVertices(false); setTrazando(false)
    }

    let pendiente = 0
    const alMover = (e: L.LeafletMouseEvent) => {
      if (pendiente) return
      pendiente = requestAnimationFrame(() => {
        pendiente = 0
        const { trazando: t, indice: idx } = estado.current
        if (t) { setHover(null); return }
        const hit = idx.tramoEn({ lat: e.latlng.lat, lng: e.latlng.lng }, tol(8))
        if (!hit) { setHover(null); map.getContainer().style.cursor = ''; return }
        map.getContainer().style.cursor = 'pointer'
        const o = hit.origen
        const capa = o.tipo === 'archivo' ? o.capa : o.cambio.capa
        const t2 = leerTramo(o.red, capa, hit.feature.properties)
        const estadoTxt = o.tipo === 'cambio' ? ` · ${ROTULO_OP[o.cambio.operacion].toLowerCase()}` : ''
        setHover({
          x: e.containerPoint.x, y: e.containerPoint.y,
          texto: `${designacion(t2)} · ${quienGestiona(t2)} · ${fmtKm(longitudKm(hit.feature.geometry))} km${estadoTxt}`,
        })
      })
    }
    const alSalir = () => setHover(null)
    const alDobleClic = () => { if (estado.current.trazando) setTrazando(false) }

    map.on('click', alClic)
    map.on('dblclick', alDobleClic)
    map.on('mousemove', alMover)
    map.on('mouseout', alSalir)
    return () => {
      cancelAnimationFrame(pendiente)
      map.off('click', alClic)
      map.off('dblclick', alDobleClic)
      map.off('mousemove', alMover)
      map.off('mouseout', alSalir)
    }
  }, [listo, mapaRef, cambiarPartes])

  // Mientras se traza, el doble clic no acerca el mapa y el cursor es una cruz
  useEffect(() => {
    const map = listo ? mapaRef.current : null
    if (!map) return
    if (trazando) {
      map.doubleClickZoom.disable()
      map.getContainer().style.cursor = 'crosshair'
    }
    return () => {
      map.doubleClickZoom.enable()
      map.getContainer().style.cursor = ''
    }
  }, [trazando, listo, mapaRef])

  // ── Teclado: Esc termina o cancela; Ctrl+Z deshace un punto ──
  const deshacer = useCallback(() => {
    const { borrador: b, historia: h } = estado.current
    if (!b || !h.length) return
    const siguiente = { ...b, partes: h[h.length - 1] }
    estado.current = { ...estado.current, borrador: siguiente, historia: h.slice(0, -1) }
    setHistoria(estado.current.historia)
    setBorrador(siguiente)
  }, [])

  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      const enCampo = (e.target as HTMLElement)?.closest('input, select, textarea')
      if (e.key === 'Escape' && !enCampo) {
        if (estado.current.trazando) setTrazando(false)
        else if (!estado.current.sucio) setBorrador(null)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !enCampo) {
        e.preventDefault()
        deshacer()
      }
    }
    window.addEventListener('keydown', alTecla)
    return () => window.removeEventListener('keydown', alTecla)
  }, [deshacer])

  // ── Marcas de los cambios cargados: nuevos, editados y quitados ──
  useEffect(() => {
    const map = listo ? mapaRef.current : null
    if (!map || !verCambios) return
    const g = L.layerGroup().addTo(map)
    for (const c of [...(redCC?.cambios ?? [])]) {
      const ll = partes(c.geometria).map(p => p.map(x => [x[1], x[0]] as [number, number]))
      L.polyline(ll, {
        color: COLOR_OP[c.operacion], weight: c.operacion === 'baja' ? 3 : 5, opacity: 0.55,
        dashArray: c.operacion === 'baja' ? '6 6' : undefined, interactive: false,
      }).addTo(g)
    }
    return () => { g.remove() }
  }, [listo, mapaRef, redCC, verCambios])

  // ── El borrador sobre el mapa: la línea, sus vértices y los puntos medios ──
  useEffect(() => {
    const map = listo ? mapaRef.current : null
    if (!map || !borrador) return
    const g = L.layerGroup().addTo(map)
    const ps = borrador.partes.map(p => p.map(c => [c[1], c[0]] as [number, number]))

    L.polyline(ps, { color: '#000', weight: 9, opacity: 0.55, interactive: false }).addTo(g)
    const linea = L.polyline(ps, {
      color: esBaja ? COLOR_OP.baja : AMARILLO, weight: 4, opacity: 1, interactive: false,
      dashArray: esBaja ? '6 6' : undefined,
    }).addTo(g)

    if (vertices || trazando) {
      const icono = (extremo: boolean) => L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;background:${extremo ? AMARILLO : '#e0e0e0'};border:2px solid #111;cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,.7)"></div>`,
        iconSize: [16, 16], iconAnchor: [8, 8],
      })
      const medio = L.divIcon({
        className: '',
        html: `<div style="width:9px;height:9px;border-radius:50%;background:${ACENTO};border:1px solid #111;opacity:.75;cursor:copy"></div>`,
        iconSize: [11, 11], iconAnchor: [5.5, 5.5],
      })
      const vivos = ps.map(p => p.map(x => [...x] as [number, number]))
      borrador.partes.forEach((p, ip) => {
        p.forEach((c, iv) => {
          const m = L.marker([c[1], c[0]], {
            icon: icono(iv === 0 || iv === p.length - 1), draggable: true, zIndexOffset: 800,
            title: 'Arrastrá para mover · doble clic para borrar',
          }).addTo(g)
          m.on('drag', () => {
            const ll = m.getLatLng()
            vivos[ip][iv] = [ll.lat, ll.lng]
            linea.setLatLngs(vivos)
          })
          m.on('dragend', () => {
            const ll = m.getLatLng()
            cambiarPartes(x => x.map((q, a) => a !== ip ? q : q.map((v, b) => b !== iv ? v
              : [Math.round(ll.lng * 1e7) / 1e7, Math.round(ll.lat * 1e7) / 1e7])))
          })
          const borrar = (e: L.LeafletEvent) => {
            L.DomEvent.stop(e as unknown as Event)
            // Trazando, el doble clic termina — y suele caer sobre el último
            // punto recién puesto, que no hay que borrar
            if (estado.current.trazando && e.type === 'dblclick') { setTrazando(false); return }
            cambiarPartes(x => {
              const n = x.map(q => [...q])
              n[ip].splice(iv, 1)
              // Una parte con un solo punto ya no es línea: se va, salvo que sea la única
              return n.filter((q, a) => q.length >= 2 || (n.length === 1 && a === 0))
            })
          }
          m.on('dblclick', borrar)
          m.on('contextmenu', borrar)
        })
        // Un clic en el punto medio de un segmento le agrega un vértice ahí
        for (let iv = 0; iv + 1 < p.length; iv++) {
          const a = p[iv], b = p[iv + 1]
          const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
          const m = L.marker([c[1], c[0]], { icon: medio, zIndexOffset: 700, title: 'Clic para agregar un vértice' }).addTo(g)
          m.on('click', e => {
            L.DomEvent.stop(e as unknown as Event)
            cambiarPartes(x => x.map((q, k) => k !== ip ? q : [...q.slice(0, iv + 1), c, ...q.slice(iv + 1)]))
          })
        }
      })
    }
    return () => { g.remove() }
  }, [listo, mapaRef, borrador, vertices, trazando, esBaja, cambiarPartes])

  // ── Acciones ──

  const elegirCambio = (c: Cambio) => {
    if (sucio) { setAviso('Hay cambios sin guardar: guardalos o cancelalos antes de elegir otro tramo'); return }
    setAviso(null); setError(null); setConfirmar(null)
    setBorrador(borradorDeCambio(c)); setHistoria([]); setVertices(false); setTrazando(false)
    const map = mapaRef.current
    if (map) {
      const b = L.latLngBounds(partes(c.geometria).flat().map(x => [x[1], x[0]] as [number, number]))
      if (b.isValid()) map.fitBounds(b, { padding: [60, 60], maxZoom: 15 })
    }
  }

  const nuevo = (red: TipoRed) => {
    if (sucio) { setAviso('Hay cambios sin guardar: guardalos o cancelalos antes de empezar otro tramo'); return }
    const t = tramoVacio(red)
    setAviso(null); setError(null); setConfirmar(null)
    setBorrador({ origen: null, tramo: t, partes: [[]], inicial: firmar(t, [[]]), original: null })
    setHistoria([]); setTrazando(true); setVertices(true)
  }

  const cancelar = () => {
    setBorrador(null); setHistoria([]); setTrazando(false); setVertices(false)
    setError(null); setAviso(null); setConfirmar(null)
  }

  const setTramo = (cambios: Partial<Tramo>) =>
    setBorrador(b => (b ? { ...b, tramo: { ...b.tramo, ...cambios } } : b))

  const elegirConsorcio = (valor: string) => {
    const v = valor.trim()
    if (!v) { setTramo({ consorcio: null }); return }
    const n = Number(v.split('·')[0].trim())
    const c = consorcios.find(x => x.numero === n)
      ?? consorcios.find(x => x.nombre.toLowerCase() === v.toLowerCase())
    if (c) setTramo({ consorcio: c.numero, zona: c.zona ?? borrador?.tramo.zona ?? 'ZI' })
    else setTramo({ consorcio: null })
  }

  const pedir = async (url: string, metodo: string, cuerpo?: unknown) => {
    const r = await fetch(url, {
      method: metodo,
      headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error((j as { error?: string }).error ?? `El servidor respondió ${r.status}`)
    return j as { cambio?: Cambio }
  }

  const terminar = (mensaje: string) => {
    setBorrador(null); setHistoria([]); setTrazando(false); setVertices(false); setConfirmar(null)
    setAviso(mensaje)
    avisarCambio()
  }

  const resumenImpacto = (a: Ajuste[]) => a.length ? ` · ${a.map(descripcionAjuste).join(' · ')}` : ''

  const guardar = async () => {
    if (!borrador || guardando) return
    setGuardando(true); setError(null)
    const tramo = { ...borrador.tramo, zona: borrador.tramo.gestion === 'consorcio' ? (consorcioSel?.zona ?? borrador.tramo.zona) : borrador.tramo.zona }
    const geometria = { type: 'MultiLineString', coordinates: borrador.partes.filter(p => p.length >= 2) }
    const o = borrador.origen
    try {
      if (!o) await pedir('/api/red-vial', 'POST', { red: tramo.red, operacion: 'alta', tramo, geometria })
      else if (o.tipo === 'archivo') {
        await pedir('/api/red-vial', 'POST', {
          red: o.red, operacion: 'edicion', base: { capa: o.capa, indice: o.indice, huella: o.huella }, tramo, geometria,
        })
      } else await pedir(`/api/red-vial/${o.cambio.id}`, 'PATCH', { tramo, geometria })
      terminar(`Guardado: ${designacion(tramo)}${resumenImpacto(impacto)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  const quitar = async () => {
    if (!borrador?.origen || guardando) return
    setGuardando(true); setError(null)
    const o = borrador.origen
    const quita = impactoQuitar
    try {
      if (o.tipo === 'archivo') {
        await pedir('/api/red-vial', 'POST', { red: o.red, operacion: 'baja', base: { capa: o.capa, indice: o.indice, huella: o.huella } })
      } else if (o.cambio.operacion === 'alta') {
        await pedir(`/api/red-vial/${o.cambio.id}`, 'DELETE')
      } else {
        await pedir(`/api/red-vial/${o.cambio.id}`, 'PATCH', { operacion: 'baja' })
      }
      terminar(`Quitado: ${designacion(borrador.tramo)}${resumenImpacto(quita)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar')
    } finally {
      setGuardando(false)
    }
  }

  const restaurar = async (c: Cambio) => {
    if (guardando) return
    setGuardando(true); setError(null)
    try {
      await pedir(`/api/red-vial/${c.id}`, 'DELETE')
      const t = leerTramo(c.red, c.capa, c.propiedades)
      const mov = resumenImpacto(restarAjustes([], c.ajuste))
      terminar(c.operacion === 'alta' ? `Descartado: ${designacion(t)}${mov}` : `Vuelto al original: ${designacion(t)}${mov}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo deshacer')
    } finally {
      setGuardando(false)
    }
  }

  const exportar = () => {
    const blob = new Blob([JSON.stringify(cambiosGeoJSON(cambios))], { type: 'application/geo+json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `red-vial-cambios-${new Date().toISOString().slice(0, 10)}.geojson`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  // ── Panel ──

  const t = borrador?.tramo
  const ccOpcion = (c: ConsorcioOpcion) => `${c.numero} · ${c.nombre}`
  const materiales: readonly string[] = t?.red === 'rp' ? MATERIALES_RP : MATERIALES_CC
  const jerarquias = (t?.red === 'rp' ? JERARQUIAS.filter(j => j !== 'TERCIARIA') : JERARQUIAS)
  const faltaConsorcio = t?.gestion === 'consorcio' && !consorcioSel
  const faltaJerarquia = t?.gestion === 'consorcio' && !t.jerarquia
  const faltaRuta = t?.red === 'rp' && !t.ruta
  const puedeGuardar = !!borrador && !esBaja && !sinTabla && trazadoValido && !faltaConsorcio && !faltaJerarquia && !faltaRuta
    && (sucio || !borrador.origen)

  const estadoTramo = !borrador ? null
    : !borrador.origen ? { rotulo: 'Nuevo', color: COLOR_OP.alta }
    : borrador.origen.tipo === 'archivo' ? { rotulo: 'Del archivo', color: '#777' }
    : { rotulo: ROTULO_OP[borrador.origen.cambio.operacion], color: COLOR_OP[borrador.origen.cambio.operacion] }

  return (
    <>
      {hover && !borrador?.origen && !trazando && (
        <div style={{
          position: 'absolute', left: hover.x + 14, top: hover.y + 14, zIndex: 1003, pointerEvents: 'none',
          background: '#111', border: '1px solid #2a2a2a', padding: '4px 8px', fontFamily: 'monospace',
          fontSize: 12, color: '#e0e0e0', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,.6)',
        }}>
          {hover.texto}
          <div style={{ fontSize: 10, color: '#666', marginTop: 1 }}>CLIC PARA EDITAR</div>
        </div>
      )}

      <div style={CAJA} onMouseDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}>
        <div style={CABECERA}>
          <span style={TITULO}>⌇ Editar red</span>
          <button onClick={() => { if (!sucio || confirm('Hay cambios sin guardar. ¿Cerrar igual?')) onCerrar() }}
            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13, fontFamily: 'monospace' }}
            title="Cerrar el editor">✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '4px 12px 12px' }}>
          {sinTabla && (
            <div style={{ margin: '8px 0', padding: '7px 9px', border: '1px solid #5d4037', background: '#1a1210', color: '#ffab91', fontSize: 12, lineHeight: 1.45 }}>
              No se pueden leer ni guardar cambios: {errorCambios}
            </div>
          )}
          {aviso && (
            <div style={{ margin: '8px 0', padding: '7px 9px', border: `1px solid ${ACENTO}44`, background: `${ACENTO}0d`, color: '#b3e5fc', fontSize: 12, lineHeight: 1.45, display: 'flex', gap: 8 }}>
              <span style={{ flex: 1 }}>{aviso}</span>
              <button onClick={() => setAviso(null)} style={{ background: 'none', border: 'none', color: '#4fc3f7aa', cursor: 'pointer', padding: 0 }}>✕</button>
            </div>
          )}

          {!borrador && (
            <>
              <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5, margin: '10px 0 10px' }}>
                Pasá el cursor por un camino y hacé clic para editarlo, o dibujá uno nuevo.
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button disabled={sinTabla} onClick={() => nuevo('cc')} style={{ ...botonAcento(ACENTO), flex: 1, opacity: sinTabla ? 0.4 : 1 }}>
                  + Tramo de consorcio
                </button>
                <button disabled={sinTabla} onClick={() => nuevo('rp')} style={{ ...botonAcento(ACENTO), flex: 1, opacity: sinTabla ? 0.4 : 1 }}>
                  + Ruta provincial
                </button>
              </div>
            </>
          )}

          {borrador && t && (
            <>
              {/* Encabezado del tramo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 2px' }}>
                <span style={{ fontSize: 10, padding: '2px 5px', border: `1px solid ${estadoTramo!.color}`, color: estadoTramo!.color, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  {estadoTramo!.rotulo}
                </span>
                <span style={{ fontSize: 14, color: '#e8e8e8', fontWeight: 700 }}>
                  {designacion(t)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#777' }}>
                {t.red === 'cc' ? 'Camino de consorcio' : 'Ruta provincial'} · {quienGestiona(t)}
              </div>
              {borrador.origen?.tipo === 'cambio' && (
                <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                  {borrador.origen.cambio.actualizado_por_nombre ?? borrador.origen.cambio.creado_por_nombre ?? '—'}
                  {borrador.origen.cambio.updated_at ? ` · ${new Date(borrador.origen.cambio.updated_at).toLocaleDateString('es-AR')}` : ''}
                </div>
              )}

              {esBaja ? (
                <div style={{ margin: '12px 0', fontSize: 12, color: '#bbb', lineHeight: 1.5 }}>
                  Este tramo está quitado de la red. Restaurarlo lo vuelve a poner como está en el archivo
                  {borrador.origen?.tipo === 'cambio' && borrador.origen.cambio.ajuste.length > 0 && ' y le devuelve los km a su consorcio'}.
                </div>
              ) : (
                <>
                  {/* Asignación */}
                  <div style={SECCION}>Asignación</div>
                  <Segmentado<'consorcio' | 'dvp'> valor={t.gestion}
                    opciones={[{ v: 'consorcio', rotulo: 'Consorcio' }, { v: 'dvp', rotulo: 'Gestión DVP' }]}
                    onCambio={v => setTramo(v === 'dvp' ? { gestion: 'dvp', consorcio: null } : { gestion: 'consorcio' })} />
                  {t.gestion === 'consorcio' ? (
                    <div style={{ marginTop: 8 }}>
                      <div style={ROTULO}>Consorcio caminero</div>
                      <input list="sv-red-consorcios" style={{ ...CAMPO, borderColor: faltaConsorcio ? '#5d4037' : '#262626' }}
                        placeholder="Número o nombre…"
                        key={`cc-${t.consorcio ?? 'x'}-${consorcios.length}`}
                        defaultValue={consorcioSel ? ccOpcion(consorcioSel) : t.consorcio ? String(t.consorcio) : ''}
                        onChange={e => {
                          // Elegido de la lista: «12 · Nombre». Tipeando se espera al blur,
                          // si no «1» elegiría el CC 1 antes de llegar a escribir «12»
                          if (e.target.value.includes('·')) elegirConsorcio(e.target.value)
                        }}
                        onBlur={e => elegirConsorcio(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') elegirConsorcio((e.target as HTMLInputElement).value) }} />
                      <datalist id="sv-red-consorcios">
                        {consorcios.map(c => <option key={c.numero} value={ccOpcion(c)} />)}
                      </datalist>
                      <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                        {consorcioSel
                          ? `Zona ${consorcioSel.zona?.slice(1) ?? '—'} · el tramo se suma a la red de este consorcio`
                          : 'Elegí de la lista'}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <div style={ROTULO}>Zona</div>
                      <Segmentado<Zona> valor={t.zona} opciones={ZONAS.map(z => ({ v: z, rotulo: z.slice(1) }))}
                        onCambio={z => setTramo({ zona: z })} />
                      <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>No se cuenta en la red de ningún consorcio</div>
                    </div>
                  )}

                  {/* Designación */}
                  <div style={SECCION}>Designación</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {t.red === 'cc' && (
                      <div style={{ flex: 1 }}>
                        <div style={ROTULO}>N° de tramo</div>
                        <input style={CAMPO} inputMode="numeric" value={t.tramo ?? ''} placeholder="047"
                          onChange={e => setTramo({ tramo: e.target.value.replace(/\D/g, '').slice(0, 4) || null })} />
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={ROTULO}>{t.red === 'cc' ? 'Ruta prov. (si es)' : 'N° de ruta provincial'}</div>
                      <input style={{ ...CAMPO, borderColor: faltaRuta ? '#5d4037' : '#262626' }} inputMode="numeric" value={t.ruta ?? ''} placeholder="049"
                        onChange={e => setTramo({ ruta: e.target.value.replace(/\D/g, '').slice(0, 4) || null })} />
                    </div>
                  </div>

                  {/* Características */}
                  <div style={SECCION}>Características</div>
                  <div style={ROTULO}>Jerarquía{t.gestion === 'consorcio' && ' — define en qué red del consorcio se cuenta'}</div>
                  <Segmentado<Jerarquia> valor={t.jerarquia}
                    opciones={jerarquias.map(j => ({ v: j, rotulo: j[0] + j.slice(1).toLowerCase() }))}
                    onCambio={j => setTramo({ jerarquia: j })} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <div style={ROTULO}>Calzada</div>
                      <select style={CAMPO} value={t.material ?? ''} onChange={e => setTramo({ material: e.target.value || null })}>
                        <option value="">—</option>
                        {materiales.map(m => <option key={m} value={m}>{m[0] + m.slice(1).toLowerCase()}</option>)}
                      </select>
                    </div>
                    {t.red === 'rp' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#aaa', height: 28, cursor: 'pointer' }}>
                        <input type="checkbox" checked={t.enObra} onChange={e => setTramo({ enObra: e.target.checked })} />
                        En obra
                      </label>
                    )}
                  </div>

                  {/* Trazado */}
                  <div style={SECCION}>Trazado</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: trazadoValido ? AMARILLO : '#444' }}>
                      {trazadoValido ? `${fmtKm(kmNuevo)} km` : '—'}
                    </span>
                    {borrador.original && Math.abs(borrador.original.km - kmNuevo) > 0.0005 && (
                      <span style={{ fontSize: 12, color: '#666' }}>antes {fmtKm(borrador.original.km)} km</span>
                    )}
                  </div>
                  {trazando ? (
                    <div style={{ fontSize: 12, color: '#81d4fa', lineHeight: 1.5, margin: '6px 0' }}>
                      Clic en el mapa para agregar puntos. Se pegan a los caminos cercanos (Alt para no pegar).
                      Doble clic o Esc para terminar.
                    </div>
                  ) : vertices ? (
                    <div style={{ fontSize: 12, color: '#777', lineHeight: 1.5, margin: '6px 0' }}>
                      Arrastrá los vértices · clic en un punto celeste para agregar uno · doble clic en un vértice para borrarlo
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {!trazando && (
                      <button onClick={() => setVertices(v => !v)} style={vertices ? botonAcento(ACENTO) : BOTON}>
                        ◇ {vertices ? 'Ocultar vértices' : 'Editar vértices'}
                      </button>
                    )}
                    <button onClick={() => { setTrazando(v => !v); setVertices(true) }} style={trazando ? botonAcento(ACENTO) : BOTON}>
                      {trazando ? '✓ Terminar trazado' : '+ Agregar puntos'}
                    </button>
                    <button onClick={deshacer} disabled={!historia.length} style={{ ...BOTON, opacity: historia.length ? 1 : 0.35 }}>
                      ↩ Deshacer
                    </button>
                  </div>

                  {/* Impacto en los km del consorcio */}
                  {impacto.length > 0 && (
                    <div style={{ marginTop: 12, padding: '7px 9px', border: '1px solid #1f2a1f', background: '#0b120b', fontSize: 12, lineHeight: 1.55, color: '#a5d6a7' }}>
                      <div style={{ fontSize: 10, color: '#5a7a5a', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
                        Al guardar, en la ficha del consorcio
                      </div>
                      {impacto.map(a => <div key={a.numero}>{descripcionAjuste(a)}</div>)}
                    </div>
                  )}
                </>
              )}

              {error && (
                <div style={{ marginTop: 10, padding: '7px 9px', border: '1px solid #5d2a2a', background: '#1a0e0e', color: '#ef9a9a', fontSize: 12, lineHeight: 1.45 }}>
                  {error}
                </div>
              )}

              {/* Acciones: fijas abajo, para no tener que bajar hasta el fondo a guardar */}
              <div style={{
                display: 'flex', gap: 6, marginTop: 12, position: 'sticky', bottom: -12, zIndex: 2,
                background: '#0e0e0e', padding: '10px 0 12px', borderTop: '1px solid #1e1e1e',
              }}>
                {esBaja ? (
                  <button disabled={guardando || sinTabla} onClick={() => borrador.origen?.tipo === 'cambio' && restaurar(borrador.origen.cambio)}
                    style={{ ...botonAcento(COLOR_OP.alta, true), flex: 1, opacity: guardando ? 0.5 : 1 }}>
                    {guardando ? 'Restaurando…' : '↺ Restaurar tramo'}
                  </button>
                ) : (
                  <button disabled={!puedeGuardar || guardando} onClick={guardar}
                    style={{ ...botonAcento(AMARILLO, true), flex: 1, opacity: !puedeGuardar || guardando ? 0.35 : 1, cursor: puedeGuardar ? 'pointer' : 'default' }}
                    title={!trazadoValido ? 'El tramo necesita al menos dos puntos' : faltaConsorcio ? 'Falta elegir el consorcio' : faltaJerarquia ? 'Falta la jerarquía' : faltaRuta ? 'Falta el número de ruta' : undefined}>
                    {guardando ? 'Guardando…' : '✓ Guardar'}
                  </button>
                )}
                <button onClick={cancelar} style={{ ...BOTON, flex: 1 }}>{sucio ? 'Cancelar' : 'Cerrar'}</button>
              </div>

              {borrador.origen && !esBaja && (
                confirmar === 'quitar' ? (
                  <div style={{ marginTop: 8, padding: '7px 9px', border: '1px solid #5d2a2a', fontSize: 12, color: '#ddd', lineHeight: 1.5 }}>
                    {borrador.origen.tipo === 'cambio' && borrador.origen.cambio.operacion === 'alta'
                      ? '¿Quitar este tramo nuevo? Se descarta y no queda en la red.'
                      : '¿Quitar este tramo de la red? Queda marcado como quitado y se puede restaurar.'}
                    {impactoQuitar.map(a => <div key={a.numero} style={{ color: '#ef9a9a' }}>{descripcionAjuste(a)}</div>)}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button onClick={quitar} disabled={guardando} style={{ ...botonAcento(COLOR_OP.baja, true), flex: 1 }}>
                        {guardando ? 'Quitando…' : 'Sí, quitar'}
                      </button>
                      <button onClick={() => setConfirmar(null)} style={{ ...BOTON, flex: 1 }}>No</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button disabled={sinTabla} onClick={() => setConfirmar('quitar')} style={{ ...botonAcento(COLOR_OP.baja), flex: 1, opacity: sinTabla ? 0.4 : 1 }}>
                      ✕ Quitar tramo
                    </button>
                    {borrador.origen.tipo === 'cambio' && borrador.origen.cambio.operacion === 'edicion' && (
                      confirmar === 'restaurar' ? (
                        <button onClick={() => borrador.origen?.tipo === 'cambio' && restaurar(borrador.origen.cambio)} disabled={guardando}
                          style={{ ...botonAcento('#ffb74d', true), flex: 1 }}>
                          {guardando ? '…' : '¿Seguro? Volver'}
                        </button>
                      ) : (
                        <button onClick={() => setConfirmar('restaurar')} style={{ ...botonAcento('#ffb74d'), flex: 1 }}
                          title="Descarta la edición y deja el tramo como está en el archivo">
                          ↺ Volver al original
                        </button>
                      )
                    )}
                  </div>
                )
              )}
            </>
          )}

          {/* Cambios cargados */}
          <div style={{ ...SECCION, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 16 }}
            onClick={() => setListaAbierta(v => !v)}>
            <span style={{ flex: 1 }}>{listaAbierta ? '▾' : '▸'} Cambios cargados ({cambios.length})</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, textTransform: 'none', letterSpacing: 0, color: '#666' }}
              onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={verCambios} onChange={e => setVerCambios(e.target.checked)} />
              marcar en el mapa
            </label>
          </div>
          {verCambios && cambios.length > 0 && (
            <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#666', marginBottom: 4 }}>
              {(['alta', 'edicion', 'baja'] as const).map(op => (
                <span key={op} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 14, height: 3, background: COLOR_OP[op], opacity: 0.8 }} />{ROTULO_OP[op]}
                </span>
              ))}
            </div>
          )}
          {huerfanos.length > 0 && (
            <div style={{ fontSize: 11, color: '#ffab91', lineHeight: 1.45, marginBottom: 6 }}>
              {huerfanos.length} cambio(s) apuntan a tramos que ya no están en el archivo y no se muestran. Pasa si
              el archivo se regeneró desde QGIS: revisalos en la exportación.
            </div>
          )}
          {listaAbierta && (
            <>
              {cambios.length === 0 && <div style={{ fontSize: 12, color: '#555' }}>Todavía no hay cambios.</div>}
              {cambios.map(c => {
                const tc = leerTramo(c.red, c.capa, c.propiedades)
                const activo = borrador?.origen?.tipo === 'cambio' && borrador.origen.cambio.id === c.id
                return (
                  <div key={c.id} onClick={() => elegirCambio(c)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '5px 6px', cursor: 'pointer',
                      borderLeft: `2px solid ${COLOR_OP[c.operacion]}`, marginBottom: 3,
                      background: activo ? '#1a1a1a' : '#0a0a0a',
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {designacion(tc)} · {quienGestiona(tc)}
                      </div>
                      <div style={{ fontSize: 11, color: '#555' }}>
                        {ROTULO_OP[c.operacion]} · {fmtKm(c.km)} km{c.actualizado_por_nombre ? ` · ${c.actualizado_por_nombre}` : ''}
                      </div>
                    </div>
                  </div>
                )
              })}
              {cambios.length > 0 && (
                <button onClick={exportar} style={{ ...BOTON, width: '100%', marginTop: 6 }}
                  title="Para volcar los cambios a QGIS mientras la red original siga allá">
                  ↓ Exportar GeoJSON para QGIS
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
