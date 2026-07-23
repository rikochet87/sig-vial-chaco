// ── Relevamiento types ────────────────────────────────────────────────────────

export type EstadoCalzada = 'Bueno' | 'Regular' | 'Malo';

export type TipoInfraestructura = 'Puente' | 'Alcantarilla' | 'Tubos' | 'Otro' | 'Lineal';

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

export type MaterialTablero = 'Madera' | 'Hº Aº' | '';
export type SituacionHidraulica = 'Estiaje' | 'Inundación' | '';

export interface DatosAlcantarilla {
  longitudTotal: string;
  cantidadLuces: string;
  longitudLuces: string;
  anchoTotal: string;
  anchoCalzada: string;
  h: string;
  materialesAlas: string;
  longitudAlas: string;
  // Materiales - Tablero
  tableroMaterial: MaterialTablero;
  tableroEstado: EstadoCalzada;
  // Estado
  estadoEstructural: EstadoCalzada;     // Estado General Estructural
  losaFondoEstado: EstadoCalzada;       // Losa de Fondo
  situacionHidraulica: SituacionHidraulica;
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

export type SubtipoLineal = 'Ripio' | 'Tramo' | 'Canal';

export interface DatosLineal {
  subtipo?: SubtipoLineal;   // default 'Ripio' para compatibilidad con datos existentes
  // ── Ripio ─────────────────────────────────────────────────────────────────
  ancho?: string;            // m — ancho de la calzada
  longitud?: string;         // m — longitud del tramo
  espesor?: string;          // m — espesor del material colocado
  empresa?: string;          // empresa ejecutora
  fechaEjecucion?: string;   // DD/MM/AAAA
  // ── Tramo ─────────────────────────────────────────────────────────────────
  esNuevo?: boolean;         // true = tramo nuevo a incorporar al SIG
  zonaTramo?: string;        // ZI | ZII | ZIII | ZIV | ZV
  ccNumeroTramo?: string;    // número de CC
  numTramo?: string;         // número de tramo (se usa para nomenclatura)
  nomenclatura?: string;     // auto-generada: Z5C099002
  // ── Canal ─────────────────────────────────────────────────────────────────
  anchoCanal?: string;       // m
  profundidad?: string;      // m
  longitudCanal?: string;    // m (auto desde track GPS)
  estadoLimpieza?: 'Limpio' | 'Parcialmente obstruido' | 'Obstruido';
  tiposObstruccion?: string[]; // vegetación | sedimento | residuos
}

// ── Auto-deteccion ───────────────────────────────────────────────────────────

export interface AutoDeteccion {
  zona: string;
  ccNumero: string | number;
  ccNombre: string;
  redKm: number;
}

// ── Relevamiento ─────────────────────────────────────────────────────────────

// ── Punto topográfico enriquecido ─────────────────────────────────────────────
export interface PuntoTrack {
  lat:   number;
  lng:   number;
  alt?:  number;   // altitud (m snm)
  acc?:  number;   // precisión GPS (m)
  ts?:   number;   // timestamp Unix ms
  prog?: number;   // progresiva desde PK 0+000 (m)
}

export interface Relevamiento {
  id: string;
  fecha: string;
  syncStatus?: 'pendiente' | 'sincronizado' | 'error';
  coords: { lat: number; lng: number };
  coordsLinea?: PuntoTrack[]; // para features lineales (Lineal)
  autoDeteccion?: AutoDeteccion;
  /** Zona del técnico logueado — tiene prioridad sobre autoDeteccion.zona al sincronizar */
  tecnicoZona?: string;
  rutaTramo: string;
  estadoCalzada: EstadoCalzada;
  tipo: TipoInfraestructura;
  datosPuente?: DatosPuente;
  datosAlcantarilla?: DatosAlcantarilla;
  datosTubos?: DatosTubos;
  datosOtro?: DatosOtro;
  datosLineal?: DatosLineal;
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
  tableroMaterial: '', tableroEstado: 'Regular',
  estadoEstructural: 'Regular', losaFondoEstado: 'Regular',
  situacionHidraulica: '',
};

export const DEFAULT_TUBOS: DatosTubos = {
  jAncho: '', d: '', cabezales: '', tapada: '', cantidad: 1,
};

export const DEFAULT_LINEAL: DatosLineal = {
  ancho: '',
  longitud: '',
  espesor: '',
  empresa: '',
  fechaEjecucion: '',
};

export const DEFAULT_OTRO: DatosOtro = {
  descripcion: '',
};
