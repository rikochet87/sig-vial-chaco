export interface Relevamiento {
  id: string
  fecha: string
  tipo: string
  tecnico: string
  estado_calzada: string
  coords: { lat: number; lng: number } | null
  coords_linea: Array<{ lat: number; lng: number }> | null
  auto_deteccion: { consorcio?: string; zona?: string } | null
  ruta_tramo: string
  sync_status: string
  user_id: string
  observaciones: string
  datos_puente: Record<string, unknown> | null
  datos_alcantarilla: Record<string, unknown> | null
  datos_tubos: Record<string, unknown> | null
  datos_ripio: Record<string, unknown> | null
  datos_otro: Record<string, unknown> | null
  fotos: string[] | null
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
