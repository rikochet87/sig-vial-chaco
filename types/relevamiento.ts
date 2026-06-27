// ── Relevamiento types ────────────────────────────────────────────────────────

export type EstadoCalzada = 'Bueno' | 'Regular' | 'Malo';

export type TipoInfraestructura = 'Puente' | 'Alcantarilla' | 'Tubos' | 'Otro' | 'Ripio';

export const ESTADO_COLORS: Record<EstadoCalzada, string> = {
  Bueno:   '#27ae60',
  Regular: '#f39c12',
  Malo:    '#e67e22',
};

// ── Sub-formularios ───────────────────────────────────────────────────────────

export interface DatosPuente {
  longitudTotal: string;        // L(m) longitud total
  cantidadPalizadas: number;    // 1–10
  lucesPalizadas: string[];     // N-1 vanos, cada uno en metros
  h: string;                    // H(m) altura libre
  j: string;                    // J(m) ancho de camino
  tipoEstructura: string;       // texto libre: Madera, Hormigón, etc.
  guiaRuedas: boolean;
  estadoGuiaRuedas: EstadoCalzada;  // solo si guiaRuedas = true
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

export interface DatosRipio {
  ancho: string;          // m — ancho de la calzada enripiada
  longitud: string;       // m — longitud del tramo
  espesor: string;        // m — espesor del ripio colocado
  empresa: string;        // empresa ejecutora
  fechaEjecucion: string; // DD/MM/AAAA — puede diferir de la fecha de relevamiento
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
  syncStatus?: 'pendiente' | 'sincronizado' | 'error';
  coords: { lat: number; lng: number };
  coordsLinea?: { lat: number; lng: number }[]; // para features lineales (Ripio)
  autoDeteccion?: AutoDeteccion;
  rutaTramo: string;
  estadoCalzada: EstadoCalzada;
  tipo: TipoInfraestructura;
  datosPuente?: DatosPuente;
  datosAlcantarilla?: DatosAlcantarilla;
  datosTubos?: DatosTubos;
  datosOtro?: DatosOtro;
  datosRipio?: DatosRipio;
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
  lucesPalizadas: [''],
  h: '',
  j: '',
  tipoEstructura: '',
  guiaRuedas: false,
  estadoGuiaRuedas: 'Regular',
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

export const DEFAULT_RIPIO: DatosRipio = {
  ancho: '',
  longitud: '',
  espesor: '',
  empresa: '',
  fechaEjecucion: '',
};

export const DEFAULT_OTRO: DatosOtro = {
  descripcion: '',
};
