/**
 * Motor de cálculo de cómputos y presupuesto de ripio.
 *
 * Codifica la cadena completa de las planillas de cálculo:
 *
 *   precios base ──► coeficientes ──┬──► análisis de precio (material)      $/tn
 *        │                          ├──► análisis de precio (transporte) $/tn·km
 *        └──► equipos, mano de obra ┴──► análisis de precio (ejecución)     $/m
 *                                          └──► presupuesto oficial
 *
 * Todo son funciones puras: sin React, sin fetch, sin estado. Así se puede
 * verificar contra los números de la planilla original y se recalcula entero en
 * cada tecla sin costo.
 *
 * Convención de redondeo: donde la planilla redondea a mano, acá se devuelve el
 * valor calculado y el llamador decide el adoptado. El motor nunca redondea por
 * su cuenta salvo donde la planilla lo hace explícitamente (ROUND/TRUNC).
 */

// ── Utilidades ────────────────────────────────────────────────────────────────

/** Trunca a n decimales, como TRUNC() de Excel (no redondea: corta). */
export function truncar(v: number, dec = 2): number {
  const f = 10 ** dec
  return Math.trunc(v * f) / f
}

/** Redondea a n decimales, como ROUND() de Excel. */
export function redondear(v: number, dec = 2): number {
  const f = 10 ** dec
  return Math.round(v * f) / f
}

/** IVA argentino: los insumos entran al análisis sin IVA porque se agrega al final. */
export const IVA = 1.21
export const sinIVA = (precioConIVA: number) => precioConIVA / IVA

// ── 1. Precios base ───────────────────────────────────────────────────────────

export type PreciosBase = {
  /** Fecha de vigencia — permite recalcular una obra vieja con los precios de su momento */
  fecha: string
  gasoil: number          // $/lt (con IVA, como se compra)
  neumatico: number       // $/unidad (con IVA)
  dolar: number           // $
  jornalOficialEsp: number // $/hs
  jornalOficial: number    // $/hs
  jornalMedioOficial: number // $/hs
  jornalAyudante: number   // $/hs
  ripio: number           // $/tn en cantera
}

export const PRECIOS_BASE_DEFAULT: PreciosBase = {
  fecha: '',
  gasoil: 2500,
  neumatico: 600000,
  dolar: 1500,
  jornalOficialEsp: 6011,
  jornalOficial: 5142,
  jornalMedioOficial: 4752,
  jornalAyudante: 4374,
  ripio: 0,
}

// ── 2. Coeficientes ───────────────────────────────────────────────────────────

export type ParametrosCoef = {
  hsDia: number          // hs/día de trabajo
  vidaUtilHs: number     // hs de vida útil del equipo
  interesAnual: number   // fracción (0.15 = 15 %)
  aniosInteres: number
  hsAnio: number
  /** Reparación y repuestos como fracción de la amortización */
  factorReparacion: number
  consumoCargado: number  // lts/km
  consumoVacio: number    // lts/km
  consumoEquipos: number  // lts/HP·hora
  /** Recargo por lubricantes sobre el combustible */
  factorLubricante: number
  cubiertasPorEquipo: number
  vidaCubiertasKm: number
  segurosAnual: number    // fracción/año
  // Coeficiente resumen
  gastosGenerales: number // 0.20
  beneficio: number       // 0.13
  gastosFinancieros: number // 0.02
  ivaIngBrutos: number    // 0.239
}

export const COEF_DEFAULT: ParametrosCoef = {
  hsDia: 8,
  vidaUtilHs: 10000,
  interesAnual: 0.15,
  aniosInteres: 2,
  hsAnio: 2000,
  factorReparacion: 0.75,
  consumoCargado: 0.45,
  consumoVacio: 0.30,
  consumoEquipos: 0.15,
  factorLubricante: 1.3,
  cubiertasPorEquipo: 18,
  vidaCubiertasKm: 70000,
  segurosAnual: 0.10,
  gastosGenerales: 0.20,
  beneficio: 0.13,
  gastosFinancieros: 0.02,
  ivaIngBrutos: 0.239,
}

export type Coeficientes = {
  amortizacion: number      // 1/día
  intereses: number         // 1/día
  amortMasInt: number       // 1/día — el que se usa
  reparacion: number        // 1/día
  combustibleCargado: number // $/km
  combustibleVacio: number   // $/km
  combustibleEquipos: number // $/(HP·día)
  cubiertas: number          // $/km
  seguros: number            // 1/día
  // Desglose del coeficiente resumen
  subtotalCostoGGBeneficio: number
  conGastosFinancieros: number
  montoIvaIngBrutos: number
  coeficienteResumen: number
}

export function calcularCoeficientes(p: ParametrosCoef, pb: PreciosBase): Coeficientes {
  const amortizacion = p.hsDia / p.vidaUtilHs
  const intereses    = (p.interesAnual * p.hsDia) / (p.aniosInteres * p.hsAnio)
  const amortMasInt  = redondear(amortizacion + intereses, 5)

  const reparacion = p.factorReparacion * amortizacion

  // El gasoil entra sin IVA: el IVA se suma recién en el coeficiente resumen
  const gasoilNeto = sinIVA(pb.gasoil)
  const combustibleCargado = p.consumoCargado * gasoilNeto * p.factorLubricante
  const combustibleVacio   = p.consumoVacio * gasoilNeto
  const combustibleEquipos = p.consumoEquipos * p.hsDia * gasoilNeto * p.factorLubricante

  const cubiertas = redondear(
    (p.cubiertasPorEquipo * sinIVA(pb.neumatico)) / p.vidaCubiertasKm, 3
  )

  const seguros = redondear((p.segurosAnual * p.hsDia) / p.hsAnio, 5)

  // Coeficiente resumen: costo + GG + beneficio, luego financieros, luego impuestos
  const subtotalCostoGGBeneficio = 1 + p.gastosGenerales + p.beneficio
  const montoFinancieros  = subtotalCostoGGBeneficio * p.gastosFinancieros
  const conGastosFinancieros = subtotalCostoGGBeneficio + montoFinancieros
  const montoIvaIngBrutos = conGastosFinancieros * p.ivaIngBrutos
  const coeficienteResumen = redondear(conGastosFinancieros + montoIvaIngBrutos, 2)

  return {
    amortizacion, intereses, amortMasInt, reparacion,
    combustibleCargado, combustibleVacio, combustibleEquipos,
    cubiertas, seguros,
    subtotalCostoGGBeneficio, conGastosFinancieros, montoIvaIngBrutos,
    coeficienteResumen,
  }
}

// ── 3. Mano de obra ───────────────────────────────────────────────────────────

export type ParametrosMdeO = {
  hsMes: number            // 180
  presentismo: number      // 0.20
  /** Retenciones al trabajador (se descuentan del bruto) */
  retenciones: { nombre: string; pct: number }[]
  /** Contribuciones patronales — primer subtotal */
  contribuciones: { nombre: string; pct: number }[]
  /** Segundo bloque: costos laborales adicionales */
  adicionales: { nombre: string; pct: number }[]
  /**
   * Dos porcentajes del segundo bloque son derivados, no constantes:
   *   C. Soc. s/vacaciones = vacaciones × subtotal de contribuciones
   *   C. Soc. s/SAC        = SAC × factorCargasSobreSAC
   * Tomarlos como los valores redondeados que muestra la planilla desvía
   * el costo horario en ~$0,07, que se propaga hasta el presupuesto.
   */
  vacaciones: number
  sac: number
  factorCargasSobreSAC: number  // (53,55 − 12) %
  /**
   * Sumas no remunerativas MENSUALES por categoría.
   *
   * Se prorratean sobre `hsProrrateoNoRem` y se suman al costo horario. No
   * siempre existen: cuando el acuerdo paritario no las contempla van en cero.
   */
  noRemunerativo: { oficialEsp: number; oficial: number; medioOficial: number; ayudante: number }
  /** Horas para prorratear la suma no remunerativa (44 hs/semana × 4 = 176) */
  hsProrrateoNoRem: number
}

export const MDEO_DEFAULT: ParametrosMdeO = {
  hsMes: 180,
  presentismo: 0.20,
  retenciones: [
    { nombre: 'SIPA',                 pct: 0.11  },
    { nombre: 'Ley 19032 (INSSJP)',   pct: 0.03  },
    { nombre: 'Obra social UOCRA',    pct: 0.03  },
    { nombre: 'Aporte sindical UOCRA', pct: 0.018 },
    { nombre: 'ISTIC',                pct: 0.005 },
  ],
  contribuciones: [
    { nombre: 'SIPA',                        pct: 0.17    },
    { nombre: 'Ley 26940 — Adicional SIPA',  pct: 0.05    },
    { nombre: 'Obra social UOCRA',           pct: 0.06    },
    { nombre: 'A.R.T.',                      pct: 0.10    },
    { nombre: 'Fondo salud pública',         pct: 0.0075  },
    { nombre: 'Fondo cese laboral',          pct: 0.12    },
    { nombre: 'Contribución UOCRA',          pct: 0.023   },
    { nombre: 'FODECO — IERIC',              pct: 0.0024  },
    { nombre: 'Contribución ISTIC',          pct: 0.005   },
  ],
  adicionales: [
    { nombre: 'Registro ind. construcción',  pct: 0.0048  },
    { nombre: 'Vestimenta — 2 equipos',      pct: 0.02    },
    { nombre: 'Contribución acuerdo',        pct: 0.00753 },
  ],
  vacaciones: 0.0435,
  sac: 0.0833,
  factorCargasSobreSAC: 0.4155,
  noRemunerativo: { oficialEsp: 99800, oficial: 91000, medioOficial: 83500, ayudante: 78400 },
  hsProrrateoNoRem: 44 * 4,
}

/** Desglose de las cargas sociales, con los dos porcentajes derivados calculados. */
export function desgloseCargas(p: ParametrosMdeO) {
  const subtotalContribuciones = p.contribuciones.reduce((s, c) => s + c.pct, 0)
  const cSocSobreVacaciones = p.vacaciones * subtotalContribuciones
  const cSocSobreSAC        = p.sac * p.factorCargasSobreSAC
  const subtotalAdicionales =
    p.adicionales.reduce((s, c) => s + c.pct, 0) +
    p.vacaciones + p.sac + cSocSobreVacaciones + cSocSobreSAC
  return {
    subtotalContribuciones,
    cSocSobreVacaciones,
    cSocSobreSAC,
    subtotalAdicionales,
    total: subtotalContribuciones + subtotalAdicionales,
  }
}

export type CostoCategoria = {
  jornal: number        // $/hs de convenio
  bruto: number         // mensual
  retenciones: number
  neto: number
  cargasSociales: number
  costoTotalLaboral: number
  costoRealHora: number // sin la suma no remunerativa
  noRemunerativo: number
  /** El valor que se usa en los análisis de precio */
  costoHora: number
  incidencia: number    // costoHora / jornal
}

export type CostosMdeO = {
  oficialEsp: CostoCategoria
  oficial: CostoCategoria
  medioOficial: CostoCategoria
  ayudante: CostoCategoria
  pctRetenciones: number
  pctCargasSociales: number
}

function costoCategoria(
  jornal: number, noRem: number, p: ParametrosMdeO, truncarCosto: boolean,
): CostoCategoria {
  const basico = p.hsMes * jornal
  const bruto  = basico + basico * p.presentismo

  const pctRet = p.retenciones.reduce((s, r) => s + r.pct, 0)
  const retenciones = bruto * pctRet
  const neto = bruto - retenciones

  const pctCargas = desgloseCargas(p).total
  const cargasSociales = bruto * pctCargas

  const costoTotalLaboral = neto + cargasSociales
  // La planilla usa TRUNC para Of. Especializado y ROUND para el resto
  const costoRealHora = truncarCosto
    ? truncar(costoTotalLaboral / p.hsMes, 2)
    : redondear(costoTotalLaboral / p.hsMes, 2)

  // La suma no remunerativa es mensual: se prorratea a horas antes de sumarla.
  // Puede ser cero — no todos los acuerdos la contemplan.
  const noRemunerativo = p.hsProrrateoNoRem > 0 ? noRem / p.hsProrrateoNoRem : 0
  const costoHora = noRemunerativo + costoRealHora

  return {
    jornal, bruto, retenciones, neto, cargasSociales, costoTotalLaboral,
    costoRealHora, noRemunerativo, costoHora,
    incidencia: redondear(costoHora / jornal, 2),
  }
}

export function calcularMdeO(pb: PreciosBase, p: ParametrosMdeO = MDEO_DEFAULT): CostosMdeO {
  return {
    oficialEsp:   costoCategoria(pb.jornalOficialEsp,   p.noRemunerativo.oficialEsp,   p, true),
    oficial:      costoCategoria(pb.jornalOficial,      p.noRemunerativo.oficial,      p, false),
    medioOficial: costoCategoria(pb.jornalMedioOficial, p.noRemunerativo.medioOficial, p, false),
    ayudante:     costoCategoria(pb.jornalAyudante,     p.noRemunerativo.ayudante,     p, false),
    pctRetenciones:    p.retenciones.reduce((s, r) => s + r.pct, 0),
    pctCargasSociales: desgloseCargas(p).total,
  }
}

// ── 4. Análisis de precio unitario ────────────────────────────────────────────

export type EquipoCatalogo = {
  id: string
  nombre: string
  modelo: string | null
  marca: string | null
  hp: number
  costoUsd: number
}

/** Equipo elegido dentro de un análisis */
export type EquipoAPU = {
  equipoId: string
  nombre: string
  hp: number
  costoUsd: number
  cantidad: number   // puede ser fraccionario (0.5 = medio equipo afectado)
}

export type NominaAPU = {
  oficialEsp: number
  oficial: number
  medioOficial: number
  ayudante: number
  hsDia: number
}

export type MaterialAPU = { designacion: string; unidad: string; cantidad: number; costoOrigen: number }
export type HerramientaAPU = { designacion: string; cantidad: number; valor: number }

/**
 * Qué costos de combustible aplican, según el tipo de tarea:
 *  - 'transporte': camión que va vacío y vuelve cargado, se cobra por km recorrido
 *  - 'equipos'   : máquinas trabajando en obra, se cobra por HP·día
 */
export type ModoCombustible = 'transporte' | 'equipos'

export type ParametrosAPU = {
  titulo: string
  unidad: string          // '$/tn', '$/tn·km', '$/m'
  modoCombustible: ModoCombustible
  equipos: EquipoAPU[]
  nomina: NominaAPU
  materiales: MaterialAPU[]
  herramientas: HerramientaAPU[]
  /** Carga por viaje, en tn — solo para transporte */
  cargaTn: number
  /** Recorrido km/día (transporte) o rendimiento m/día, tn/día (ejecución) */
  rendimiento: number
  /** true = el rendimiento se combina con la carga (transporte: tn·km/día) */
  rendimientoPorCarga: boolean
}

export type ResultadoAPU = {
  costoEquiposTotal: number     // $ — valor de los equipos afectados
  hpTotal: number
  // Desglose diario
  amortizacionInt: number
  reparacion: number
  combustible: number
  combustibleVacio: number
  cubiertas: number
  seguros: number
  subtotalEquipos: number       // $/día
  subtotalManoObra: number      // $/día
  costoDiario: number           // $/día
  divisorRendimiento: number
  costoUnitarioEjecucion: number
  costoUnitarioMateriales: number
  costoUnitarioHerramientas: number
  costoCosto: number
  coeficienteResumen: number
  /** Precio calculado, antes del redondeo manual */
  precioCalculado: number
}

export function calcularAPU(
  a: ParametrosAPU, coef: Coeficientes, mdo: CostosMdeO, dolar: number,
): ResultadoAPU {
  // 1.a — Equipos
  const costoEquiposTotal = a.equipos.reduce((s, e) => s + e.costoUsd * dolar * e.cantidad, 0)
  const hpTotal = a.equipos.reduce((s, e) => s + e.hp * (e.cantidad < 1 ? e.cantidad : 1), 0)

  const amortizacionInt = costoEquiposTotal * coef.amortMasInt
  const reparacion      = costoEquiposTotal * coef.reparacion
  const seguros         = redondear(costoEquiposTotal * coef.seguros, 2)

  // El combustible se computa distinto según la tarea
  let combustible = 0
  let combustibleVacio = 0
  let cubiertas = 0
  if (a.modoCombustible === 'transporte') {
    // Por kilómetro recorrido: ida vacío + vuelta cargado
    combustible      = redondear(coef.combustibleCargado * a.rendimiento, 2)
    combustibleVacio = redondear(coef.combustibleVacio * a.rendimiento, 2)
    cubiertas        = redondear(coef.cubiertas * a.rendimiento, 2)
  } else {
    // Máquinas en obra: por HP afectado
    combustible = coef.combustibleEquipos * hpTotal
    cubiertas   = redondear(coef.cubiertas * a.rendimiento, 2)
  }

  const subtotalEquipos =
    amortizacionInt + reparacion + combustible + combustibleVacio + cubiertas + seguros

  // 1.b — Mano de obra
  const n = a.nomina
  const subtotalManoObra =
    redondear(n.oficialEsp   * n.hsDia * mdo.oficialEsp.costoHora,   2) +
    redondear(n.oficial      * n.hsDia * mdo.oficial.costoHora,      2) +
    redondear(n.medioOficial * n.hsDia * mdo.medioOficial.costoHora, 2) +
    redondear(n.ayudante     * n.hsDia * mdo.ayudante.costoHora,     2)

  const costoDiario = subtotalEquipos + subtotalManoObra

  // Rendimiento: en transporte el divisor es carga × recorrido (tn·km/día)
  const divisorRendimiento = a.rendimientoPorCarga
    ? a.cargaTn * a.rendimiento
    : a.rendimiento
  const costoUnitarioEjecucion = divisorRendimiento > 0 ? costoDiario / divisorRendimiento : 0

  // 2 — Materiales
  const costoUnitarioMateriales = truncar(
    a.materiales.reduce((s, m) => s + m.costoOrigen * m.cantidad, 0), 2
  )

  // 3 — Herramientas menores y transporte interno
  const costoUnitarioHerramientas = a.herramientas.reduce((s, h) => s + h.valor, 0)

  const costoCosto = costoUnitarioEjecucion + costoUnitarioMateriales + costoUnitarioHerramientas
  const precioCalculado = truncar(costoCosto * coef.coeficienteResumen, 2)

  return {
    costoEquiposTotal, hpTotal,
    amortizacionInt, reparacion, combustible, combustibleVacio, cubiertas, seguros,
    subtotalEquipos, subtotalManoObra, costoDiario,
    divisorRendimiento, costoUnitarioEjecucion,
    costoUnitarioMateriales, costoUnitarioHerramientas,
    costoCosto, coeficienteResumen: coef.coeficienteResumen, precioCalculado,
  }
}

// ── 5. Cómputo métrico ────────────────────────────────────────────────────────

export type TramoComputo = {
  id: string
  nombre: string
  largoM: number
  anchoM: number
  espesorM: number
  densidad: number   // t/m³ — editable por tramo, sin default impuesto
}

export type Computo = {
  volumenM3: number
  toneladasCalculado: number
  largoTotalM: number
  porTramo: { id: string; nombre: string; volumenM3: number; toneladas: number; largoM: number }[]
}

export function calcularComputo(tramos: TramoComputo[]): Computo {
  const porTramo = tramos.map(t => {
    const volumenM3 = t.largoM * t.anchoM * t.espesorM
    return {
      id: t.id, nombre: t.nombre, largoM: t.largoM,
      volumenM3, toneladas: volumenM3 * t.densidad,
    }
  })
  return {
    volumenM3: porTramo.reduce((s, t) => s + t.volumenM3, 0),
    toneladasCalculado: porTramo.reduce((s, t) => s + t.toneladas, 0),
    largoTotalM: porTramo.reduce((s, t) => s + t.largoM, 0),
    porTramo,
  }
}

// ── 6. Valor adoptado ─────────────────────────────────────────────────────────

/**
 * Par calculado / adoptado.
 *
 * El proyectista redondea a mano (12.576 → 12.570 tn, 16.923,48 → 16.900 $/m) y
 * **el adoptado es el que alimenta el paso siguiente**. No es corregir un error:
 * es una decisión profesional que queda registrada.
 */
export type Adoptado = {
  /** null = todavía no se tocó, se usa el calculado */
  valor: number | null
}

export const valorEfectivo = (calculado: number, ad: Adoptado | undefined): number =>
  ad?.valor ?? calculado

/** ¿El adoptado quedó viejo respecto del calculado? Para avisar en pantalla. */
export function adoptadoDesactualizado(
  calculado: number, ad: Adoptado | undefined, tolerancia = 0.005,
): boolean {
  if (ad?.valor == null) return false
  if (calculado === 0) return ad.valor !== 0
  return Math.abs(ad.valor - calculado) / Math.abs(calculado) > tolerancia
}

// ── 7. Presupuesto ────────────────────────────────────────────────────────────

export type ItemPresupuesto = {
  numero: string
  designacion: string
  detalle?: string
  unidad: string
  cantidad: number
  precioUnitario: number
  parcial: number
}

export type Presupuesto = {
  items: ItemPresupuesto[]
  total: number
}

export type EntradaPresupuesto = {
  toneladas: number         // adoptado
  metros: number            // adoptado
  distanciaNoPavKm: number
  distanciaPavKm: number
  precioMaterial: number    // $/tn adoptado
  precioTransNoPav: number  // $/tn·km adoptado
  precioTransPav: number    // $/tn·km adoptado
  precioEjecucion: number   // $/m adoptado
  movilizacion: number      // global
  tipoMaterial?: string
  tramo?: string
}

export function calcularPresupuesto(e: EntradaPresupuesto): Presupuesto {
  const items: ItemPresupuesto[] = []

  items.push({
    numero: 'I', designacion: 'Provisión',
    detalle: e.tipoMaterial ?? 'Adquisición de material en cantera',
    unidad: 'tn', cantidad: e.toneladas, precioUnitario: e.precioMaterial,
    parcial: truncar(e.toneladas * e.precioMaterial, 2),
  })

  const precioNoPavPorTn = e.precioTransNoPav * e.distanciaNoPavKm
  items.push({
    numero: 'II', designacion: 'Transporte y descarga',
    detalle: `Calzada no pavimentada — ${e.distanciaNoPavKm} km`,
    unidad: 'tn', cantidad: e.toneladas, precioUnitario: precioNoPavPorTn,
    parcial: truncar(e.toneladas * precioNoPavPorTn, 2),
  })

  if (e.distanciaPavKm > 0) {
    const precioPavPorTn = e.precioTransPav * e.distanciaPavKm
    items.push({
      numero: 'II', designacion: 'Transporte y descarga',
      detalle: `Calzada pavimentada — ${e.distanciaPavKm} km`,
      unidad: 'tn', cantidad: e.toneladas, precioUnitario: precioPavPorTn,
      parcial: truncar(e.toneladas * precioPavPorTn, 2),
    })
  }

  items.push({
    numero: 'III', designacion: 'Ejecución',
    detalle: e.tramo ? `Construcción de calzada consolidada — ${e.tramo}` : 'Construcción de calzada consolidada',
    unidad: 'm', cantidad: e.metros, precioUnitario: e.precioEjecucion,
    parcial: truncar(e.metros * e.precioEjecucion, 2),
  })

  if (e.movilizacion > 0) {
    items.push({
      numero: 'IV', designacion: 'Movilización de obra',
      detalle: 'Acarreo de equipos a pie de obra',
      unidad: 'gl', cantidad: 1, precioUnitario: e.movilizacion,
      parcial: truncar(e.movilizacion, 2),
    })
  }

  return { items, total: items.reduce((s, i) => s + i.parcial, 0) }
}

// ── 8. Monto en letras ────────────────────────────────────────────────────────

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE',
  'DIECIOCHO', 'DIECINUEVE', 'VEINTE']
const DECENAS = ['', '', 'VEINTI', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA',
  'SETENTA', 'OCHENTA', 'NOVENTA']
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

function menorAMil(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'CIEN'
  const c = Math.floor(n / 100), r = n % 100
  const partes: string[] = []
  if (c > 0) partes.push(CENTENAS[c])
  if (r > 0) {
    if (r <= 20) partes.push(UNIDADES[r])
    else {
      const d = Math.floor(r / 10), u = r % 10
      if (d === 2) partes.push(u > 0 ? `VEINTI${UNIDADES[u]}` : 'VEINTE')
      else partes.push(u > 0 ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d])
    }
  }
  return partes.join(' ')
}

/** Monto en letras, como lo exige el cierre del presupuesto oficial. */
export function montoEnLetras(monto: number): string {
  const entero = Math.floor(monto)
  const centavos = Math.round((monto - entero) * 100)

  if (entero === 0) return `PESOS CERO CON ${String(centavos).padStart(2, '0')}/100`

  const millones = Math.floor(entero / 1_000_000)
  const miles    = Math.floor((entero % 1_000_000) / 1000)
  const resto    = entero % 1000

  const partes: string[] = []
  if (millones > 0) {
    partes.push(millones === 1 ? 'UN MILLÓN' : `${menorAMil(millones)} MILLONES`)
  }
  if (miles > 0) {
    partes.push(miles === 1 ? 'MIL' : `${menorAMil(miles)} MIL`)
  }
  if (resto > 0) partes.push(menorAMil(resto))

  return `PESOS ${partes.join(' ')} CON ${String(centavos).padStart(2, '0')}/100`
}
