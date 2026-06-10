// ── Zona ─────────────────────────────────────────────────────────────────────
export interface Zona {
  id: 'ZI' | 'ZII' | 'ZIII' | 'ZIV' | 'ZV';
  label: string;
  color: string;
}

// ── ConsorcioDato (datos base del mapa/listado) ───────────────────────────────
export interface ConsorcioDato {
  numero: number | string;
  nombre: string;
  localidad: string;
  zona: 'ZI' | 'ZII' | 'ZIII' | 'ZIV' | 'ZV';
  color: string;
  latitude: number;
  longitude: number;
  redKm: number;
  redPrimaria: number;
  redSecundaria: number;
  redTerciaria: number;
  presidente: string;
  vicepresidente: string;
  secretario: string;
  tesorero: string;
}

// ── Tramo (segmento de red vial) ──────────────────────────────────────────────
export interface Tramo {
  id: string;
  tipo: 'primaria' | 'secundaria' | 'terciaria';
  nombre: string;
  longitud: number;
  estado: 'bueno' | 'regular' | 'malo';
}

// ── Reporte ───────────────────────────────────────────────────────────────────
export interface Reporte {
  id: string;
  consorcioId: string;
  tipo: 'mensual' | 'trimestral' | 'anual' | 'incidente';
  titulo: string;
  descripcion: string;
  fecha: string;
  monto?: number;
}

// ── Gasto ─────────────────────────────────────────────────────────────────────
export interface Gasto {
  id: string;
  consorcioId: string;
  concepto: string;
  monto: number;
  fecha: string;
  categoria: 'combustible' | 'maquinaria' | 'personal' | 'materiales' | 'otros';
}
