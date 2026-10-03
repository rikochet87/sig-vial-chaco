'use client'
/**
 * Relevamiento de gabinete: el mismo formulario que la app de campo, cargado
 * desde la computadora.
 *
 * Sirve para lo que se puede relevar sin ir: una alcantarilla que se ve en el
 * satélite, un tramo nuevo que se dibuja sobre la imagen, una obra que alguien
 * informó por teléfono con su ubicación. **Queda marcado como de gabinete**
 * (`datos_especificos.origen`), porque no es lo mismo que una medición en el
 * lugar, y la ficha y la lista lo dicen.
 *
 * **El mapa es la pantalla y el formulario es un panel de propiedades**, como
 * en un programa de CAD. La primera versión era al revés —un formulario largo
 * de cajas con el mapa al costado— y para cargar una alcantarilla había que
 * bajar hasta el fondo a buscar el botón.
 *
 * Lo que en la app sale del GPS acá sale del mapa:
 *
 * - la **zona y el consorcio** del más cercano, por distancia euclidiana a la
 *   sede, la misma regla que la app (`realData.ts` allá, `sedesConsorcios.ts`
 *   acá — son las mismas 103 sedes);
 * - la **ruta o tramo**, del camino de la red vial que pasa por el punto, con
 *   el mismo formato que arma la app cuando el técnico toca un camino.
 *
 * Se muestran como datos, no como campos vacíos, y se pueden corregir; una vez
 * tocados dejan de seguir al mapa.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SEDES_CONSORCIOS } from '@/data/sedesConsorcios'
import { cargarRedFondo, type TramoInfo } from '@/lib/redFondo'
import {
  ZONAS, ESTADOS, field, label, input, select, textarea, grid2, sectionCard, sectionTitle, Segmentado,
  EditLineal, EditPuente, EditAlcantarilla, EditTubos, EditOtro, INICIAL,
} from '@/components/relevamiento/editores'
import { distanciaM, type Punto } from '@/components/relevamiento/MapaGabinete'

const MapaGabinete = dynamic(() => import('@/components/relevamiento/MapaGabinete'), { ssr: false })

const TIPOS = ['Puente', 'Alcantarilla', 'Tubos', 'Lineal', 'Otro'] as const
type Tipo = (typeof TIPOS)[number]
const MAX_FOTOS = 10
/** Lado mayor de una foto al subirla: alcanza para ver la obra y pasa el tope de Vercel */
const LADO_MAX_PX = 2000
/** A qué distancia del punto se busca el camino, en km */
const TOLERANCIA_RUTA_KM = 0.15

const MONO = 'ui-monospace, "Roboto Mono", monospace'

const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** La sede más cercana — euclidiana en grados, como la app */
function consorcioCercano(p: Punto) {
  let mejor = SEDES_CONSORCIOS[0], d = Infinity
  for (const s of SEDES_CONSORCIOS) {
    const dd = (s.lat - p.lat) ** 2 + (s.lng - p.lng) ** 2
    if (dd < d) { d = dd; mejor = s }
  }
  return mejor
}

/** El texto de Ruta / Tramo, con el mismo criterio que la app */
function rutaDe(t: TramoInfo): string {
  if (/^R[PN]\b/.test(t.designacion)) return t.designacion
  if (t.codigo) return t.codigo
  if (t.cc !== null) return `CC N°${t.cc} - ${t.designacion}`
  return t.designacion
}

/** Achica la imagen en el navegador antes de subirla: JPG de lado ≤ LADO_MAX_PX */
async function achicar(f: File): Promise<Blob> {
  const bmp = await createImageBitmap(f)
  const k = Math.min(1, LADO_MAX_PX / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return new Promise((ok, mal) => c.toBlob(b => (b ? ok(b) : mal(new Error('No se pudo leer la imagen'))), 'image/jpeg', 0.85))
}

const fLargo = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2).replace('.', ',')} km` : `${Math.round(m)} m`)

export default function NuevoRelevamientoPage() {
  const router = useRouter()
  // El id con el formato de la app; se fija una vez para que las fotos y la
  // fila vayan a la misma carpeta aunque se reintente.
  const [id] = useState(() => Date.now().toString())

  const [tipo, setTipo] = useState<Tipo>('Alcantarilla')
  const [datos, setDatos] = useState<Record<Tipo, Record<string, unknown>>>(() => ({
    Puente: { ...INICIAL.Puente }, Alcantarilla: { ...INICIAL.Alcantarilla }, Tubos: { ...INICIAL.Tubos },
    Lineal: { ...INICIAL.Lineal }, Otro: { ...INICIAL.Otro },
  }))
  const [punto, setPunto] = useState<Punto | null>(null)
  const [linea, setLinea] = useState<Punto[]>([])

  const [fecha, setFecha] = useState(hoy)
  const [estado, setEstado] = useState('')
  const [ruta, setRuta] = useState('')
  const [zona, setZona] = useState('')
  const [consorcio, setConsorcio] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [fotos, setFotos] = useState<{ archivo: File; vista: string }[]>([])

  // Si se tocaron a mano, dejan de seguir al mapa
  const manual = useRef({ ruta: false, zona: false, consorcio: false })
  const [editando, setEditando] = useState<'ruta' | 'zona' | 'consorcio' | null>(null)

  const [guardando, setGuardando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const esLineal = tipo === 'Lineal'
  const ancla = esLineal ? linea[0] ?? null : punto
  const largoM = useMemo(() => linea.reduce((s, p, i) => (i ? s + distanciaM(linea[i - 1], p) : 0), 0), [linea])

  // ── Lo que sale del mapa ──
  useEffect(() => {
    if (!ancla) return
    const sede = consorcioCercano(ancla)
    if (!manual.current.zona) setZona(sede.zona)
    if (!manual.current.consorcio) setConsorcio(sede.nombre)

    let vivo = true
    // En un tramo, el camino se busca a mitad del dibujo y no en su arranque
    const ref = esLineal && linea.length > 1 ? linea[Math.floor(linea.length / 2)] : ancla
    cargarRedFondo().then(red => {
      if (!vivo) return
      const t = red.tramoEn(ref, TOLERANCIA_RUTA_KM)
      if (t && !manual.current.ruta) setRuta(rutaDe(t))
    }).catch(() => { /* sin la red se carga a mano */ })
    return () => { vivo = false }
  }, [ancla, esLineal, linea])

  // Las vistas previas son URLs de objeto: se sueltan al desmontar
  const fotosRef = useRef(fotos)
  useEffect(() => { fotosRef.current = fotos }, [fotos])
  useEffect(() => () => fotosRef.current.forEach(f => URL.revokeObjectURL(f.vista)), [])

  const agregarFotos = (lista: FileList | null) => {
    if (!lista) return
    const nuevas = [...lista].filter(f => f.type.startsWith('image/'))
      .slice(0, MAX_FOTOS - fotos.length)
      .map(archivo => ({ archivo, vista: URL.createObjectURL(archivo) }))
    setFotos(prev => [...prev, ...nuevas])
  }
  const quitarFoto = (i: number) => setFotos(prev => {
    URL.revokeObjectURL(prev[i].vista)
    return prev.filter((_, k) => k !== i)
  })

  const falta = esLineal
    ? (linea.length < 2 ? 'Dibujá el tramo en el mapa: al menos dos puntos.' : null)
    : (!punto ? 'Marcá la ubicación en el mapa.' : null)

  async function guardar() {
    if (falta) { setError(falta); return }
    setError(null)
    try {
      // Las fotos primero: la fila sólo lleva las que llegaron al servidor,
      // el mismo criterio que la app.
      const urls: string[] = []
      for (let i = 0; i < fotos.length; i++) {
        setGuardando(`Subiendo foto ${i + 1} de ${fotos.length}…`)
        const fd = new FormData()
        fd.append('id', id)
        fd.append('foto', new File([await achicar(fotos[i].archivo)], `foto-${i + 1}.jpg`, { type: 'image/jpeg' }))
        const r = await fetch('/api/relevamientos/fotos', { method: 'POST', body: fd })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error ?? `No se pudo subir la foto ${i + 1}`)
        urls.push(j.url)
      }

      setGuardando('Guardando…')
      let acumulado = 0
      const r = await fetch('/api/relevamientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id, tipo, fecha,
          estado_calzada: estado || null,
          coords_lat: punto?.lat, coords_lng: punto?.lng,
          coords_linea: esLineal
            ? linea.map((p, i) => {
                if (i) acumulado += distanciaM(linea[i - 1], p)
                return { lat: p.lat, lng: p.lng, prog: Math.round(acumulado * 10) / 10 }
              })
            : null,
          ruta_tramo: ruta, zona: zona || null, cc_asociado: consorcio || null,
          observaciones, fotos: urls, datos: datos[tipo],
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? 'No se pudo guardar el relevamiento')
      router.push(`/dashboard/relevamientos/${id}`)
    } catch (e) {
      setError((e as Error).message)
      setGuardando(null)
    }
  }

  const setDato = (d: Record<string, unknown>) => setDatos(prev => ({ ...prev, [tipo]: d }))
  const editar = (k: 'ruta' | 'zona' | 'consorcio') => { manual.current[k] = true; setEditando(k) }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px',
      height: 'calc(100vh - 92px)', border: '1px solid #1e1e1e', fontFamily: MONO,
    }}>
      {/* ── El mapa ── */}
      <div style={{ minWidth: 0, minHeight: 0 }}>
        <MapaGabinete modo={esLineal ? 'linea' : 'punto'} punto={punto} linea={linea}
          onPunto={setPunto} onLinea={setLinea} />
      </div>

      {/* ── El panel de propiedades ── */}
      <aside style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: '#141414', borderLeft: '1px solid #222' }}>
        <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #222' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/dashboard/relevamientos" title="Volver a la lista" style={{ color: '#8f8f8f', textDecoration: 'none', fontSize: 13 }}>◀</Link>
            <span style={{ color: '#e0e0e0', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>Nuevo relevamiento</span>
            <span style={{
              color: '#8fd0ff', border: '1px solid #8fd0ff66', borderRadius: 2, padding: '1px 6px',
              fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase',
            }}>Gabinete</span>
          </div>
          <div style={{ color: '#8f8f8f', fontSize: 11, marginTop: 4 }}>
            Desde la computadora, sin ir al lugar. Queda marcado así en la lista y en la ficha.
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 14px' }}>
          <div style={{ ...sectionCard, borderTop: 'none' }}>
            <h3 style={sectionTitle}>Tipo</h3>
            <Segmentado opciones={TIPOS} valor={tipo} onChange={setTipo} />
          </div>

          <div style={sectionCard}>
            <h3 style={sectionTitle}>Ubicación</h3>
            <Ubicacion esLineal={esLineal} punto={punto} linea={linea} largoM={largoM} onLinea={setLinea} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              <Propiedad titulo="Zona" valor={zona} editando={editando === 'zona'} onEditar={() => editar('zona')} onListo={() => setEditando(null)}>
                <select style={select} value={zona} autoFocus onChange={e => setZona(e.target.value)} onBlur={() => setEditando(null)}>
                  <option value="">—</option>
                  {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </Propiedad>
              <Propiedad titulo="Consorcio" valor={consorcio.match(/"([^"]+)"/)?.[1] ?? consorcio} editando={editando === 'consorcio'}
                onEditar={() => editar('consorcio')} onListo={() => setEditando(null)}>
                <input style={input} value={consorcio} autoFocus onChange={e => setConsorcio(e.target.value)} onBlur={() => setEditando(null)} />
              </Propiedad>
              <Propiedad titulo="Ruta / tramo" valor={ruta} editando={editando === 'ruta'} onEditar={() => editar('ruta')} onListo={() => setEditando(null)}>
                <input style={input} value={ruta} autoFocus onChange={e => setRuta(e.target.value)} onBlur={() => setEditando(null)} />
              </Propiedad>
            </div>
          </div>

          <div style={sectionCard}>
            <h3 style={sectionTitle}>General</h3>
            <div style={grid2}>
              <div style={field}>
                <span style={label}>Fecha</span>
                <input style={{ ...input, colorScheme: 'dark' }} type="date" value={fecha} max={hoy()} onChange={e => setFecha(e.target.value)} />
              </div>
              <div style={field}>
                <span style={label}>Estado calzada</span>
                <select style={select} value={estado} onChange={e => setEstado(e.target.value)}>
                  <option value="">—</option>
                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
          </div>

          {tipo === 'Lineal' && <EditLineal data={datos.Lineal} onChange={setDato} longitudM={largoM} />}
          {tipo === 'Puente' && <EditPuente data={datos.Puente} onChange={setDato} />}
          {tipo === 'Alcantarilla' && <EditAlcantarilla data={datos.Alcantarilla} onChange={setDato} />}
          {tipo === 'Tubos' && <EditTubos data={datos.Tubos} onChange={setDato} />}
          {tipo === 'Otro' && <EditOtro data={datos.Otro} onChange={setDato} />}

          <div style={sectionCard}>
            <h3 style={sectionTitle}>Observaciones</h3>
            <textarea style={textarea} value={observaciones} onChange={e => setObservaciones(e.target.value)}
              placeholder="De dónde sale el dato: imagen satelital, informe del consorcio, plano…" />
          </div>

          <div style={sectionCard}>
            <h3 style={sectionTitle}>Fotos <span style={{ color: '#8f8f8f' }}>{fotos.length}/{MAX_FOTOS}</span></h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {fotos.map((f, i) => (
                <div key={f.vista} style={{ position: 'relative', width: 70, height: 52, border: '1px solid #2a2a2a' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.vista} alt={`Foto ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button type="button" onClick={() => quitarFoto(i)} title="Quitar" style={{
                    position: 'absolute', top: 1, right: 1, background: '#000c', border: 'none',
                    color: '#fff', fontSize: 11, width: 16, height: 16, cursor: 'pointer', padding: 0, lineHeight: '16px',
                  }}>✕</button>
                </div>
              ))}
              {fotos.length < MAX_FOTOS && (
                <label title={`Se achican a ${LADO_MAX_PX} px de lado antes de subirlas`} style={{
                  width: 70, height: 52, border: '1px dashed #3a3a3a', color: '#8f8f8f', fontSize: 11,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}>
                  + Agregar
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                    onChange={e => { agregarFotos(e.target.files); e.target.value = '' }} />
                </label>
              )}
            </div>
          </div>
        </div>

        {/* ── Guardar, siempre a la vista ── */}
        <div style={{ borderTop: '1px solid #222', padding: '10px 14px', background: '#111' }}>
          <div style={{ fontSize: 11, minHeight: 15, marginBottom: 6, color: error ? '#E57373' : '#8f8f8f' }}>
            {error ?? guardando ?? falta ?? 'Listo para guardar.'}
          </div>
          <button type="button" onClick={guardar} disabled={!!guardando} style={{
            width: '100%', background: falta ? 'transparent' : '#F5C300', color: falta ? '#8f8f8f' : '#111',
            border: `1px solid ${falta ? '#2a2a2a' : '#F5C300'}`, borderRadius: 2, padding: '8px 0',
            fontFamily: MONO, fontWeight: 700, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase',
            cursor: guardando ? 'wait' : 'pointer', opacity: guardando ? 0.6 : 1,
          }}>{guardando ? 'Guardando…' : 'Guardar relevamiento'}</button>
        </div>
      </aside>
    </div>
  )
}

/** Qué hacer en el mapa y lo que ya se marcó */
function Ubicacion({ esLineal, punto, linea, largoM, onLinea }: {
  esLineal: boolean; punto: Punto | null; linea: Punto[]; largoM: number; onLinea: (l: Punto[]) => void
}) {
  const chico: React.CSSProperties = {
    fontFamily: MONO, fontSize: 11, padding: '2px 7px', background: 'transparent',
    border: '1px solid #2a2a2a', color: '#ccc', cursor: 'pointer', borderRadius: 2,
  }
  if (!esLineal) {
    return punto
      ? <div style={{ fontSize: 12, color: '#e0e0e0' }}>{punto.lat.toFixed(6)}, {punto.lng.toFixed(6)}
          <div style={{ fontSize: 11, color: '#8f8f8f' }}>Clic en el mapa para moverla.</div></div>
      : <div style={{ fontSize: 12, color: '#F5C300' }}>Hacé clic en el mapa para marcar la obra.</div>
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {linea.length < 2
        ? <span style={{ fontSize: 12, color: '#F5C300' }}>Clic en el mapa, punto por punto a lo largo del tramo.</span>
        : <span style={{ fontSize: 12, color: '#e0e0e0' }}><b style={{ color: '#F5C300' }}>{fLargo(largoM)}</b> · {linea.length} vértices</span>}
      {linea.length > 0 && (<>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => onLinea(linea.slice(0, -1))} style={chico}>Deshacer</button>
        <button type="button" onClick={() => onLinea([])} style={{ ...chico, color: '#E57373', borderColor: '#4a2a2a' }}>Borrar</button>
      </>)}
    </div>
  )
}

/**
 * Un dato que sale del mapa: se muestra como valor, no como campo vacío, y se
 * edita a pedido. Antes de marcar dice qué va a pasar, en vez de un «—
 * seleccionar —» que invita a cargarlo a mano.
 */
function Propiedad({ titulo, valor, editando, onEditar, onListo, children }: {
  titulo: string; valor: string; editando: boolean
  onEditar: () => void; onListo: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr auto', gap: 8, alignItems: 'center', minHeight: 28 }}>
      <span style={label}>{titulo}</span>
      {editando
        ? <div onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') onListo() }}>{children}</div>
        : <span style={{ fontSize: 12, color: valor ? '#e0e0e0' : '#8f8f8f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={valor}>
            {valor || 'se completa al marcar'}
          </span>}
      {!editando && (
        <button type="button" onClick={onEditar} title={`Corregir ${titulo.toLowerCase()} a mano`} style={{
          background: 'none', border: 'none', color: '#8f8f8f', fontSize: 11, cursor: 'pointer', fontFamily: MONO, padding: 0,
        }}>editar</button>
      )}
    </div>
  )
}
