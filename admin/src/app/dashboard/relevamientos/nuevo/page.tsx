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
 * Lo que en la app sale del GPS acá sale del mapa:
 *
 * - la **zona y el consorcio** del más cercano, por distancia euclidiana a la
 *   sede, la misma regla que la app (`realData.ts` allá, `sedesConsorcios.ts`
 *   acá — son las mismas 103 sedes);
 * - la **ruta o tramo**, del camino de la red vial que pasa por el punto, con
 *   el mismo formato que arma la app cuando el técnico toca un camino.
 *
 * Los dos se pueden corregir a mano, y una vez tocados dejan de seguir al mapa.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SEDES_CONSORCIOS } from '@/data/sedesConsorcios'
import { cargarRedFondo, type TramoInfo } from '@/lib/redFondo'
import {
  ZONAS, ESTADOS, field, label, input, select, textarea, grid2, sectionCard, sectionTitle,
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
  const [rutaAuto, setRutaAuto] = useState<string | null>(null)

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
      const r = t ? rutaDe(t) : null
      setRutaAuto(r)
      if (r && !manual.current.ruta) setRuta(r)
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

      setGuardando('Guardando el relevamiento…')
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 6 }}>
        <Link href="/dashboard/relevamientos" style={{ color: '#F5C300', textDecoration: 'none', fontSize: 14 }}>← Volver</Link>
        <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>Nuevo relevamiento de gabinete</h1>
      </div>
      <div style={{ color: '#a0a0a0', fontSize: 13, marginBottom: 14, maxWidth: 820, lineHeight: 1.5 }}>
        Cargado desde la computadora, sin ir al lugar. Queda marcado como <b style={{ color: '#ccc' }}>gabinete</b> en
        la lista y en la ficha, para que no se confunda con una medición en campo.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 520px) 1fr', gap: 14, flex: 1, minHeight: 0 }}>
        {/* ── El formulario ── */}
        <div style={{ overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
          <div style={sectionCard}>
            <h3 style={sectionTitle}>Tipo</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TIPOS.map(t => (
                <button key={t} type="button" onClick={() => setTipo(t)} style={{
                  background: tipo === t ? '#F5C30022' : 'transparent',
                  border: `1px solid ${tipo === t ? '#F5C300' : '#2a2a2a'}`,
                  color: tipo === t ? '#F5C300' : '#9E9E9E',
                  padding: '7px 14px', fontSize: 12, fontFamily: 'monospace', letterSpacing: 0.8,
                  textTransform: 'uppercase', cursor: 'pointer', borderRadius: 2,
                }}>{t}</button>
              ))}
            </div>
            <div style={{ color: '#8f8f8f', fontSize: 12, marginTop: 10 }}>
              {esLineal ? 'Un tramo: se dibuja vértice por vértice en el mapa.' : 'Una obra puntual: se marca con un clic en el mapa.'}
            </div>
          </div>

          <div style={sectionCard}>
            <h3 style={sectionTitle}>Información general</h3>
            <div style={grid2}>
              <div style={field}>
                <span style={label}>Fecha</span>
                <input style={input} type="date" value={fecha} max={hoy()} onChange={e => setFecha(e.target.value)} />
              </div>
              <div style={field}>
                <span style={label}>Estado calzada</span>
                <select style={select} value={estado} onChange={e => setEstado(e.target.value)}>
                  <option value="">— seleccionar —</option>
                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div style={field}>
                <span style={label}>Zona</span>
                <select style={select} value={zona} onChange={e => { manual.current.zona = true; setZona(e.target.value) }}>
                  <option value="">— seleccionar —</option>
                  {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div style={{ ...field, gridColumn: '1 / -1' }}>
                <span style={label}>Ruta / Tramo</span>
                <input style={input} value={ruta} placeholder="Se completa al marcar sobre un camino"
                  onChange={e => { manual.current.ruta = true; setRuta(e.target.value) }} />
                {rutaAuto && ruta !== rutaAuto && (
                  <button type="button" onClick={() => { manual.current.ruta = false; setRuta(rutaAuto) }} style={sugerencia}>
                    Usar el camino del mapa: {rutaAuto}
                  </button>
                )}
              </div>
              <div style={{ ...field, gridColumn: '1 / -1' }}>
                <span style={label}>Consorcio</span>
                <input style={input} value={consorcio} placeholder="El más cercano al punto"
                  onChange={e => { manual.current.consorcio = true; setConsorcio(e.target.value) }} />
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
            <h3 style={sectionTitle}>Fotos ({fotos.length} de {MAX_FOTOS})</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {fotos.map((f, i) => (
                <div key={f.vista} style={{ position: 'relative', width: 96, height: 72, border: '1px solid #252525' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.vista} alt={`Foto ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button type="button" onClick={() => quitarFoto(i)} title="Quitar" style={{
                    position: 'absolute', top: 2, right: 2, background: '#000c', border: 'none',
                    color: '#fff', fontSize: 11, width: 18, height: 18, cursor: 'pointer', padding: 0,
                  }}>✕</button>
                </div>
              ))}
              {fotos.length < MAX_FOTOS && (
                <label style={{
                  width: 96, height: 72, border: '1px dashed #3a3a3a', color: '#8f8f8f', fontSize: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  fontFamily: 'monospace', textAlign: 'center',
                }}>
                  + Agregar
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                    onChange={e => { agregarFotos(e.target.files); e.target.value = '' }} />
                </label>
              )}
            </div>
            <div style={{ color: '#8f8f8f', fontSize: 12, marginTop: 8 }}>
              Se achican a {LADO_MAX_PX} px de lado antes de subirlas.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 20px', flexWrap: 'wrap' }}>
            <button type="button" onClick={guardar} disabled={!!guardando} className="glow-y" style={{
              background: '#F5C300', color: '#111', border: 'none', padding: '10px 22px',
              fontWeight: 700, fontSize: 13, letterSpacing: 1, cursor: guardando ? 'wait' : 'pointer',
              opacity: guardando ? 0.6 : 1,
            }}>{guardando ? 'GUARDANDO…' : 'GUARDAR RELEVAMIENTO'}</button>
            {guardando && <span style={{ color: '#a0a0a0', fontSize: 13 }}>{guardando}</span>}
            {!guardando && falta && !error && <span style={{ color: '#8f8f8f', fontSize: 13 }}>{falta}</span>}
            {error && <span style={{ color: '#E57373', fontSize: 13 }}>{error}</span>}
          </div>
        </div>

        {/* ── El mapa ── */}
        <div style={{ border: '1px solid #1e1e1e', minHeight: 420 }}>
          <MapaGabinete modo={esLineal ? 'linea' : 'punto'} punto={punto} linea={linea}
            onPunto={setPunto} onLinea={setLinea} />
        </div>
      </div>
    </div>
  )
}

const sugerencia: React.CSSProperties = {
  background: 'none', border: 'none', color: '#F5C300', fontSize: 11, cursor: 'pointer',
  padding: '2px 0', textAlign: 'left', fontFamily: 'monospace',
}
