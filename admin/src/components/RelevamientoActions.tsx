'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Relevamiento } from '@/types'

// ── helpers ──────────────────────────────────────────────────────────────────

function buildGeoJSON(rel: Relevamiento): object | null {
  const props = {
    tipo: rel.tipo,
    fecha: rel.fecha?.split('T')[0] ?? null,
    estado_cal: rel.estado_calzada,
    consorcio: rel.cc_asociado,
    zona: rel.zona,
    tramo: rel.ruta_tramo,
    observacion: rel.observaciones,
  }
  if (rel.tipo === 'Lineal' && rel.coords_linea?.length) {
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: rel.coords_linea.map(p => [p.lng, p.lat]) },
        properties: props,
      }],
    }
  }
  if (rel.coords_lat != null && rel.coords_lng != null) {
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [rel.coords_lng, rel.coords_lat] },
        properties: props,
      }],
    }
  }
  return null
}

function toKML(rel: Relevamiento): string {
  const geom = rel.tipo === 'Lineal' && rel.coords_linea?.length
    ? `<LineString><coordinates>${rel.coords_linea.map(p => `${p.lng},${p.lat},0`).join(' ')}</coordinates></LineString>`
    : rel.coords_lat != null && rel.coords_lng != null
      ? `<Point><coordinates>${rel.coords_lng},${rel.coords_lat},0</coordinates></Point>`
      : ''
  const desc = [
    ['Tipo', rel.tipo], ['Fecha', rel.fecha?.split('T')[0]], ['Estado calzada', rel.estado_calzada],
    ['Consorcio', rel.cc_asociado], ['Zona', rel.zona], ['Tramo', rel.ruta_tramo],
    ['Observaciones', rel.observaciones],
  ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('&#10;')

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Relevamiento ${rel.tipo} - ${rel.fecha?.split('T')[0] ?? ''}</name>
    <Placemark>
      <name>${rel.tipo}${rel.cc_asociado ? ' - ' + rel.cc_asociado : ''}</name>
      <description>${desc}</description>
      ${geom}
    </Placemark>
  </Document>
</kml>`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function baseName(rel: Relevamiento) {
  return `relevamiento_${rel.tipo}_${rel.fecha?.split('T')[0] ?? rel.id}`
}

// ── componente ────────────────────────────────────────────────────────────────

const GHOST: React.CSSProperties = {
  background: 'transparent', border: '1px solid #252525', color: '#555',
  padding: '7px 14px', fontSize: 11, fontWeight: 600,
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, letterSpacing: 0.5,
}

export default function RelevamientoActions({ rel }: { rel: Relevamiento }) {
  const router = useRouter()

  // ── Eliminar ──
  const handleDelete = async () => {
    if (!confirm('¿Eliminar este relevamiento? Esta acción no se puede deshacer.')) return
    const supabase = createClient()
    const { error } = await supabase.from('relevamientos').delete().eq('id', rel.id)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    router.push('/dashboard/relevamientos')
    router.refresh()
  }

  // ── Export KML ──
  const handleKML = () => {
    const kml = toKML(rel)
    downloadBlob(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), baseName(rel) + '.kml')
  }

  // ── Export SHP ──
  const handleSHP = async () => {
    const geo = buildGeoJSON(rel)
    if (!geo) { alert('Este relevamiento no tiene geometría exportable.'); return }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shpwrite = await import('@mapbox/shp-write') as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b64 = await shpwrite.zip(geo) as string
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      downloadBlob(new Blob([bytes], { type: 'application/zip' }), baseName(rel) + '_shp.zip')
    } catch (e) {
      alert('Error generando SHP: ' + String(e))
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
      <button onClick={handleKML} className="glow-g" style={GHOST}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3a3a3a'; (e.currentTarget as HTMLButtonElement).style.color = '#aaa' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
      >⬇ KML</button>
      <button onClick={handleSHP} className="glow-g" style={GHOST}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3a3a3a'; (e.currentTarget as HTMLButtonElement).style.color = '#aaa' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
      >⬇ SHP</button>
      <div style={{ flex: 1 }} />
      <button onClick={handleDelete} className="glow-r" style={{ ...GHOST, border: '1px solid #252525', color: '#444' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#f44336'; (e.currentTarget as HTMLButtonElement).style.color = '#f44336' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#444' }}
      >✕ Eliminar</button>
    </div>
  )
}
