/**
 * Forma del documento de análisis que se guarda en `proyectos_ripio.analisis`.
 *
 * Todo lo que hace falta para reconstruir el presupuesto vive acá adentro,
 * incluidos los precios. Eso es a propósito: los precios son del proyecto, no
 * globales. Cada obra se cotiza en un momento y se aprueba con esos números;
 * si fueran compartidos, actualizar el dólar cambiaría retroactivamente todos
 * los presupuestos ya presentados.
 */

import {
  PRECIOS_BASE_DEFAULT, COEF_DEFAULT, MDEO_DEFAULT,
  type PreciosBase, type ParametrosCoef, type ParametrosMdeO,
  type ParametrosAPU, type EquipoAPU, type MaterialAPU, type HerramientaAPU,
} from './ripioCalculo'

/** Los cuatro análisis, en el orden en que se muestran */
export const CLAVES_APU = ['material', 'transNoPav', 'transPav', 'construccion'] as const
export type ClaveAPU = typeof CLAVES_APU[number]

/**
 * Los cuatro análisis comparten estructura (es el formato estándar de obra
 * pública), así que se distinguen por color, título y unidad. Sin eso es fácil
 * perder de vista en cuál se está trabajando.
 */
export const ETIQUETAS_APU: Record<ClaveAPU, {
  titulo: string; corto: string; unidad: string; color: string; nota: string
}> = {
  material: {
    titulo: 'Provisión de material', corto: 'Material', unidad: '$/tn',
    color: '#C0A080',
    nota: 'El costo del ripio en cantera va en la sección 2 — Materiales.',
  },
  transNoPav: {
    titulo: 'Transporte — calzada no pavimentada', corto: 'Transp. no pav.', unidad: '$/tn·km',
    color: '#C9A227',
    nota: 'El combustible se cobra por kilómetro: ida vacío + vuelta cargado. El rendimiento es carga × recorrido diario.',
  },
  transPav: {
    titulo: 'Transporte — calzada pavimentada', corto: 'Transp. pav.', unidad: '$/tn·km',
    color: '#7E9BB5',
    nota: 'Mismo criterio que el no pavimentado. Si la obra no tiene tramos pavimentados, queda en cero.',
  },
  construccion: {
    titulo: 'Construcción de enripiado', corto: 'Construcción', unidad: '$/m',
    color: '#89B078',
    nota: 'El combustible se cobra por HP de las máquinas afectadas. El rendimiento es en metros por día.',
  },
}

/** ¿Este análisis tiene algo cargado? Para marcarlo en las pestañas. */
export function apuTieneDatos(cfg: ConfigAPU): boolean {
  const n = cfg.nomina
  return cfg.equipos.length > 0
    || cfg.materiales.length > 0
    || cfg.herramientas.length > 0
    || n.oficialEsp > 0 || n.oficial > 0 || n.medioOficial > 0 || n.ayudante > 0
}

/** Datos de identificación de la obra */
export type DatosObra = {
  actuacion: string
  obra: string
  tramo: string
  objeto: string
  origen: string
  destino: string
  distanciaPavKm: number
  distanciaNoPavKm: number
  material: string
  tipoMaterial: string
  fecha: string
}

export const DATOS_OBRA_DEFAULT: DatosObra = {
  actuacion: '',
  obra: '',
  tramo: '',
  objeto: '',
  origen: '',
  destino: '',
  distanciaPavKm: 0,
  distanciaNoPavKm: 0,
  material: 'Pétreo',
  tipoMaterial: 'Estabilizado granular (0/32)',
  fecha: '',
}

/**
 * Valor calculado con posibilidad de adoptar otro a mano.
 * `null` significa "todavía no se tocó, usar el calculado".
 */
export type ValorAdoptado = { valor: number | null }
export const SIN_ADOPTAR: ValorAdoptado = { valor: null }

/** Configuración editable de un análisis de precio */
export type ConfigAPU = {
  equipos: EquipoAPU[]
  nomina: { oficialEsp: number; oficial: number; medioOficial: number; ayudante: number; hsDia: number }
  materiales: MaterialAPU[]
  herramientas: HerramientaAPU[]
  cargaTn: number
  rendimiento: number
  /** Precio adoptado — el que alimenta el presupuesto */
  precioAdoptado: ValorAdoptado
}

function apuVacio(rendimiento: number, cargaTn = 0): ConfigAPU {
  return {
    equipos: [],
    nomina: { oficialEsp: 0, oficial: 0, medioOficial: 0, ayudante: 0, hsDia: 8 },
    materiales: [],
    herramientas: [],
    cargaTn,
    rendimiento,
    precioAdoptado: { ...SIN_ADOPTAR },
  }
}

export type AnalisisRipio = {
  version: 1
  datos: DatosObra
  precios: PreciosBase
  coeficientes: ParametrosCoef
  manoObra: ParametrosMdeO
  apu: Record<ClaveAPU, ConfigAPU>
  /** Tonelaje adoptado — alimenta los ítems de provisión Y de transporte */
  toneladasAdoptadas: ValorAdoptado
  /** Metros adoptados — alimenta el ítem de ejecución */
  metrosAdoptados: ValorAdoptado
  movilizacion: number
}

export function analisisVacio(): AnalisisRipio {
  return {
    version: 1,
    datos: { ...DATOS_OBRA_DEFAULT },
    precios: { ...PRECIOS_BASE_DEFAULT },
    coeficientes: { ...COEF_DEFAULT },
    manoObra: structuredClone(MDEO_DEFAULT),
    apu: {
      // Los rendimientos por defecto salen de la planilla de referencia:
      // 30 tn por viaje, 37,5 km/h × 8 h de recorrido, 400 m/día de construcción.
      material:     apuVacio(0, 30),
      transNoPav:   apuVacio(37.5 * 8, 30),
      transPav:     apuVacio(37.5 * 8, 30),
      construccion: apuVacio(400),
    },
    toneladasAdoptadas: { ...SIN_ADOPTAR },
    metrosAdoptados:    { ...SIN_ADOPTAR },
    movilizacion: 0,
  }
}

/**
 * Normaliza un documento leído de la base.
 *
 * Los proyectos existentes tienen `analisis` en null, y los que se guardaron con
 * versiones anteriores pueden no tener campos nuevos. En vez de romper, se
 * completan con los defaults.
 */
export function normalizarAnalisis(crudo: unknown): AnalisisRipio {
  const base = analisisVacio()
  if (!crudo || typeof crudo !== 'object') return base
  const a = crudo as Partial<AnalisisRipio>

  const apu = { ...base.apu }
  for (const k of CLAVES_APU) {
    const guardado = a.apu?.[k]
    if (guardado) {
      apu[k] = {
        ...base.apu[k],
        ...guardado,
        equipos:      Array.isArray(guardado.equipos)      ? guardado.equipos      : [],
        materiales:   Array.isArray(guardado.materiales)   ? guardado.materiales   : [],
        herramientas: Array.isArray(guardado.herramientas) ? guardado.herramientas : [],
        nomina:       { ...base.apu[k].nomina, ...(guardado.nomina ?? {}) },
        precioAdoptado: guardado.precioAdoptado ?? { ...SIN_ADOPTAR },
      }
    }
  }

  return {
    version: 1,
    datos:        { ...base.datos, ...(a.datos ?? {}) },
    precios:      { ...base.precios, ...(a.precios ?? {}) },
    coeficientes: { ...base.coeficientes, ...(a.coeficientes ?? {}) },
    manoObra:     { ...base.manoObra, ...(a.manoObra ?? {}) },
    apu,
    toneladasAdoptadas: a.toneladasAdoptadas ?? { ...SIN_ADOPTAR },
    metrosAdoptados:    a.metrosAdoptados    ?? { ...SIN_ADOPTAR },
    movilizacion:       a.movilizacion       ?? 0,
  }
}

/** Arma los parámetros que espera el motor a partir de la configuración guardada */
export function paramsAPU(clave: ClaveAPU, cfg: ConfigAPU): ParametrosAPU {
  const meta = ETIQUETAS_APU[clave]
  const esTransporte = clave === 'transNoPav' || clave === 'transPav'
  return {
    titulo: meta.titulo,
    unidad: meta.unidad,
    // En transporte el combustible se cobra por km recorrido (ida vacío +
    // vuelta cargado); en obra, por HP de las máquinas afectadas.
    modoCombustible: esTransporte ? 'transporte' : 'equipos',
    equipos: cfg.equipos,
    nomina: cfg.nomina,
    materiales: cfg.materiales,
    herramientas: cfg.herramientas,
    cargaTn: cfg.cargaTn,
    rendimiento: cfg.rendimiento,
    // El transporte rinde en tn·km/día: carga por viaje × recorrido diario
    rendimientoPorCarga: esTransporte,
  }
}
