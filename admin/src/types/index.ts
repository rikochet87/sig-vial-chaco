export interface Relevamiento {
  id: string
  fecha: string
  tipo: string
  tecnico_id: string | null
  estado_calzada: string | null
  // Coords: se almacenan como columnas separadas en la tabla
  coords_lat: number | null
  coords_lng: number | null
  coords_linea: Array<{ lat: number; lng: number }> | null
  cc_asociado: string | null
  zona: string | null
  ruta_tramo: string | null
  observaciones: string | null
  fotos: string[] | null
  // Todos los datos específicos en un solo JSON
  datos_especificos: {
    puente?:       Record<string, unknown> | null
    alcantarilla?: Record<string, unknown> | null
    tubos?:        Record<string, unknown> | null
    ripio?:        Record<string, unknown> | null
    otro?:         Record<string, unknown> | null
  } | null
  sincronizado_en: string | null
  created_at?: string
}

export interface Profile {
  id: string
  email: string
  nombre: string
  zona: string
  rol: 'tecnico' | 'admin'
}

export interface Consorcio {
  id: number
  numero: number
  nombre: string
  localidad: string
  zona: string
  color: string
  latitude: number
  longitude: number
  red_km: number
  red_primaria: number
  red_secundaria: number
  red_terciaria: number
  presidente: string
  vicepresidente: string
  secretario: string
  tesorero: string
  updated_at: string
}
