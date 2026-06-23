// ── Relevamiento types ────────────────────────────────────────────────────────

export type EstadoCalzada = 'Bueno' | 'Regular' | 'Malo';

export type TipoInfraestructura = 'Puente' | 'Alcantarilla' | 'Tubos' | 'Otro';

export const ESTADO_COLORS: Record<EstadoCalzada, string> = {
  Bueno:   '#27ae60',
  Regular: '#f39c12',
  Malo:    '#e67e22',
};

// ── Sub-formularios ───────────────────────────────────────────────────────────

export type TipoEstructuraPuente = 'Madera' | 'Viga Metálica' | 'Viga Madera';

export interface DatosPuente {
  longitudTotal: string;        // L(m) longitud total
  cantidadPalizadas: number;    // 1–10
  lucesPalizadas: string[];     // N-1 vanos, cada uno en metros
  h: string;                    // H(m) altura libre
  j: string;                    // J(m) ancho de camino
  tipoEstructura: TipoEstructuraPuente;
  guarniruedas: boolean;
  barandas: boolean;
  hBarandas: string;            // solo si barandas = true
  estadoEstructural: EstadoCalzada;
}

export interface DatosAlcantarilla {
  longitudTotal: string;
  cantidadLuces: string;
  longitudLuces: string;
  anchoTotal: string;
  anchoCalzada: string;
  h: string;
  materialesAlas: string;
  longitudAlas: string;
  estadoEstructural: EstadoCalzada;
  situacionHidraulica: string;
}

export interface DatosTubos {
  jAncho: string;
  d: string;
  cabezales: string;
  tapada: string;
  cantidad: number;
}

export interface DatosOtro {
  descripcion: string;
}

// ── Auto-deteccion ───────────────────────────────────────────────────────────

export interface AutoDeteccion {
  zona: string;
  ccNumero: string | number;
  ccNombre: string;
  redKm: number;
}

// ── Relevamiento ─────────────────────────────────────────────────────────────

export interface Relevamiento {
  id: string;
  fecha: string;
  coords: { lat: number; lng: number };
  autoDeteccion?: AutoDeteccion;
  rutaTramo: string;
  estadoCalzada: EstadoCalzada;
  tipo: TipoInfraestructura;
  datosPuente?: DatosPuente;
  datosAlcantarilla?: DatosAlcantarilla;
  datosTubos?: DatosTubos;
  datosOtro?: DatosOtro;
  observaciones: string;
  tecnico: string;
  fotos: string[];
  // legacy
  ccAsociado?: string;
  tiposProblema?: string[];
  estructura?: string;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_PUENTE: DatosPuente = {
  longitudTotal: '',
  cantidadPalizadas: 2,
  lucesPalizadas: [''],   // 2 palizadas → 1 vano
  h: '',
  j: '',
  tipoEstructura: 'Madera',
  guarniruedas: false,
  barandas: false,
  hBarandas: '',
  estadoEstructural: 'Regular',
};

export const DEFAULT_ALCANTARILLA: DatosAlcantarilla = {
  longitudTotal: '', cantidadLuces: '', longitudLuces: '', anchoTotal: '',
  anchoCalzada: '', h: '', materialesAlas: '', longitudAlas: '',
  estadoEstructural: 'Regular', situacionHidraulica: '',
};

export const DEFAULT_TUBOS: DatosTubos = {
  jAncho: '', d: '', cabezales: '', tapada: '', cantidad: 1,
};
