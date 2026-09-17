/**
 * Exporta el legajo de ripio a un .xlsx con la estructura de la planilla
 * original: datos, cómputo, coeficientes, mano de obra, los cuatro análisis de
 * precio y el presupuesto.
 *
 * Escribe valores, no fórmulas. La alternativa —replicar las fórmulas con
 * referencias entre hojas— haría el archivo recalculable, pero un respaldo
 * tiene que ser fiel a lo que se presentó: una fórmula mal trasladada cambiaría
 * el número sin que nadie lo note. Para compensar, cada hoja muestra los pasos
 * intermedios, así el cálculo se puede seguir y verificar a mano.
 *
 * `exceljs` se carga con import dinámico: pesa alrededor de un mega y sólo hace
 * falta cuando alguien exporta.
 */

import {
  calcularCoeficientes, calcularMdeO, calcularAPU, calcularComputo,
  calcularPresupuesto, montoEnLetras, valorEfectivo, desgloseCargas,
  type TramoComputo,
} from './ripioCalculo'
import {
  paramsAPU, CLAVES_APU, ETIQUETAS_APU, type AnalisisRipio,
} from './ripioAnalisis'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Hoja = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Celda = any

const BORDE_FINO = {
  top:    { style: 'thin' as const, color: { argb: 'FF555555' } },
  left:   { style: 'thin' as const, color: { argb: 'FF555555' } },
  bottom: { style: 'thin' as const, color: { argb: 'FF555555' } },
  right:  { style: 'thin' as const, color: { argb: 'FF555555' } },
}
const RELLENO_TIT = {
  type: 'pattern' as const, pattern: 'solid' as const,
  fgColor: { argb: 'FFE8E8E8' },
}
const RELLENO_TOTAL = {
  type: 'pattern' as const, pattern: 'solid' as const,
  fgColor: { argb: 'FFF4F4F4' },
}

const FMT_N2  = '#,##0.00'
const FMT_N4  = '#,##0.0000'
const FMT_PES = '"$"#,##0.00'

/** Fila de encabezado de tabla */
function encabezado(hoja: Hoja, fila: number, cols: (string | number)[], anchos?: number[]) {
  const r = hoja.getRow(fila)
  cols.forEach((v, i) => {
    const c = r.getCell(i + 1)
    c.value = v
    c.font = { bold: true, size: 9 }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    c.fill = RELLENO_TIT
    c.border = BORDE_FINO
  })
  r.height = 26
  if (anchos) anchos.forEach((w, i) => { hoja.getColumn(i + 1).width = w })
  return fila + 1
}

/** Fila de datos con bordes */
function fila(hoja: Hoja, nro: number, valores: (string | number | null)[], opts?: {
  negrita?: boolean; formatos?: (string | null)[]; total?: boolean; sangria?: number
}) {
  const r = hoja.getRow(nro)
  valores.forEach((v, i) => {
    const c: Celda = r.getCell(i + 1)
    if (v !== null) c.value = v
    c.border = BORDE_FINO
    c.font = { size: 9, bold: !!opts?.negrita }
    if (opts?.total) c.fill = RELLENO_TOTAL
    const f = opts?.formatos?.[i]
    if (f) { c.numFmt = f; c.alignment = { horizontal: 'right' } }
    else if (typeof v === 'number') c.alignment = { horizontal: 'right' }
    if (i === 0 && opts?.sangria) c.alignment = { indent: opts.sangria }
  })
  return nro + 1
}

/** Título de sección, sin bordes */
function titulo(hoja: Hoja, nro: number, texto: string, tam = 11) {
  const c: Celda = hoja.getRow(nro).getCell(1)
  c.value = texto
  c.font = { bold: true, size: tam }
  return nro + 1
}

/** Cabecera común: identificación de la obra */
function cabeceraObra(hoja: Hoja, a: AnalisisRipio, tituloHoja: string) {
  let f = 1
  const datos: [string, string][] = ([
    ['Act. Nº', a.datos.actuacion],
    ['Obra',    a.datos.obra],
    ['Tramo',   a.datos.tramo],
    ['Objeto',  a.datos.objeto],
  ] as [string, string][]).filter(([, v]) => v)

  for (const [k, v] of datos) {
    const r = hoja.getRow(f)
    r.getCell(1).value = k
    r.getCell(1).font = { bold: true, size: 9 }
    r.getCell(2).value = v
    r.getCell(2).font = { size: 9 }
    f++
  }
  if (datos.length) f++

  const c: Celda = hoja.getRow(f).getCell(1)
  c.value = tituloHoja
  c.font = { bold: true, size: 12 }
  return f + 2
}

// ── Exportación ───────────────────────────────────────────────────────────────

/**
 * Arma el libro, sin descargarlo.
 *
 * Está separado de la descarga para poder verificarlo fuera del navegador:
 * `document` y `Blob` sólo existen en el cliente, el armado no los necesita.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function construirLibroRipio(
  a: AnalisisRipio,
  tramos: TramoComputo[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  // El paquete resuelve al build de navegador (`dist/exceljs.min.js`, UMD), así
  // que según el interop puede venir en la raíz o bajo `default`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('exceljs')
  const ExcelJS = mod.Workbook ? mod : mod.default
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wb: any = new ExcelJS.Workbook()
  wb.creator = 'SIG Vial'
  wb.created = new Date()

  const coef = calcularCoeficientes(a.coeficientes, a.precios)
  const mdo  = calcularMdeO(a.precios, a.manoObra)
  const cargas = desgloseCargas(a.manoObra)
  const computo = calcularComputo(tramos)
  const toneladas = valorEfectivo(computo.toneladasCalculado, a.toneladasAdoptadas)
  const metros    = valorEfectivo(computo.largoTotalM,        a.metrosAdoptados)

  const resultados = Object.fromEntries(
    CLAVES_APU.map(k => [k, calcularAPU(paramsAPU(k, a.apu[k]), coef, mdo, a.precios.dolar)]),
  ) as Record<typeof CLAVES_APU[number], ReturnType<typeof calcularAPU>>

  const precioDe = (k: typeof CLAVES_APU[number]) =>
    valorEfectivo(resultados[k].precioCalculado, a.apu[k].precioAdoptado)

  const pres = calcularPresupuesto({
    toneladas, metros,
    distanciaNoPavKm: a.datos.distanciaNoPavKm,
    distanciaPavKm:   a.datos.distanciaPavKm,
    precioMaterial:   precioDe('material'),
    precioTransNoPav: precioDe('transNoPav'),
    precioTransPav:   precioDe('transPav'),
    precioEjecucion:  precioDe('construccion'),
    movilizacion:     a.movilizacion,
    tipoMaterial:     a.datos.tipoMaterial,
    tramo:            a.datos.tramo,
  })

  // ── Datos ────────────────────────────────────────────────────────────────
  {
    const h = wb.addWorksheet('Datos')
    h.getColumn(1).width = 34
    h.getColumn(2).width = 46
    h.getColumn(3).width = 12

    let f = cabeceraObra(h, a, 'DATOS DE LA OBRA')

    f = fila(h, f, ['Origen (cantera)', a.datos.origen])
    f = fila(h, f, ['Destino',          a.datos.destino])
    f = fila(h, f, ['Material',         a.datos.material])
    f = fila(h, f, ['Tipo',             a.datos.tipoMaterial])
    f = fila(h, f, ['Fecha',            a.datos.fecha])
    f = fila(h, f, ['Distancia pavimentada',    a.datos.distanciaPavKm,   'km'], { formatos: [null, FMT_N2] })
    f = fila(h, f, ['Distancia no pavimentada', a.datos.distanciaNoPavKm, 'km'], { formatos: [null, FMT_N2] })
    f = fila(h, f, ['Distancia total',
      a.datos.distanciaPavKm + a.datos.distanciaNoPavKm, 'km'],
      { negrita: true, total: true, formatos: [null, FMT_N2] })
    f += 2

    f = titulo(h, f, 'PRECIOS DE ESTE PROYECTO')
    f = encabezado(h, f, ['Concepto', 'Valor', 'Unidad'])
    const precios: [string, number, string][] = [
      ['Gas oil',                a.precios.gasoil,             '$/lt'],
      ['Neumático',              a.precios.neumatico,          '$/un'],
      ['Dólar',                  a.precios.dolar,              '$'],
      ['Jornal oficial especializado', a.precios.jornalOficialEsp,   '$/hs'],
      ['Jornal oficial',         a.precios.jornalOficial,      '$/hs'],
      ['Jornal medio oficial',   a.precios.jornalMedioOficial, '$/hs'],
      ['Jornal ayudante',        a.precios.jornalAyudante,     '$/hs'],
      ['Ripio en cantera',       a.precios.ripio,              '$/tn'],
    ]
    for (const [k, v, u] of precios) f = fila(h, f, [k, v, u], { formatos: [null, FMT_N2] })
  }

  // ── Cómputo ──────────────────────────────────────────────────────────────
  {
    const h = wb.addWorksheet('Cómputo')
    let f = cabeceraObra(h, a, 'CÓMPUTOS MÉTRICOS')

    f = encabezado(h,
      f,
      ['Nº ítem', 'Designación', 'Largo (m)', 'Ancho (m)', 'Espesor (m)', 'Densidad (t/m³)', 'Unidad', 'Cantidad'],
      [9, 38, 13, 12, 13, 15, 9, 14],
    )

    f = fila(h, f, ['I', 'PROVISIÓN', null, null, null, null, 'tn', toneladas],
      { negrita: true, formatos: [null, null, null, null, null, null, null, FMT_N2] })
    f = fila(h, f, ['', `Material: ${a.datos.material} · Tipo: ${a.datos.tipoMaterial}`])

    for (const t of computo.porTramo) {
      const src = tramos.find(x => x.id === t.id)
      f = fila(h, f,
        ['', t.nombre, t.largoM, src?.anchoM ?? null, src?.espesorM ?? null, src?.densidad ?? null, 'tn', t.toneladas],
        { sangria: 1, formatos: [null, null, FMT_N2, FMT_N2, FMT_N2, FMT_N2, null, FMT_N2] })
    }

    f = fila(h, f, ['', '', null, null, null, null, 'Calculado', computo.toneladasCalculado],
      { formatos: [null, null, null, null, null, null, null, FMT_N2] })
    f = fila(h, f, ['', '', null, null, null, null, 'Redondeo', toneladas - computo.toneladasCalculado],
      { formatos: [null, null, null, null, null, null, null, FMT_N2] })
    f = fila(h, f, ['', '', null, null, null, null, 'Total adoptado', toneladas],
      { negrita: true, total: true, formatos: [null, null, null, null, null, null, null, FMT_N2] })
    f++

    f = fila(h, f, ['II', 'TRANSPORTE Y DESCARGA', null, null, null, null, 'tn', toneladas],
      { negrita: true, formatos: [null, null, null, null, null, null, null, FMT_N2] })
    f = fila(h, f, ['', `Origen: ${a.datos.origen} · Destino: ${a.datos.destino}`])
    f = fila(h, f, ['', 'Calzada no pavimentada', a.datos.distanciaNoPavKm, null, null, null, 'km', null],
      { sangria: 1, formatos: [null, null, FMT_N2] })
    f = fila(h, f, ['', 'Calzada pavimentada', a.datos.distanciaPavKm, null, null, null, 'km', null],
      { sangria: 1, formatos: [null, null, FMT_N2] })
    f = fila(h, f, ['', '', a.datos.distanciaNoPavKm + a.datos.distanciaPavKm, null, null, null, 'km', null],
      { negrita: true, total: true, formatos: [null, null, FMT_N2] })
    f++

    f = fila(h, f, ['III', 'EJECUCIÓN', null, null, null, null, 'm', metros],
      { negrita: true, formatos: [null, null, null, null, null, null, null, FMT_N2] })
    f = fila(h, f, ['', `Tramo: ${a.datos.tramo}`])
    f = fila(h, f, ['', '', null, null, null, null, 'Calculado', computo.largoTotalM],
      { formatos: [null, null, null, null, null, null, null, FMT_N2] })
    f = fila(h, f, ['', '', null, null, null, null, 'Redondeo', metros - computo.largoTotalM],
      { formatos: [null, null, null, null, null, null, null, FMT_N2] })
    f = fila(h, f, ['', '', null, null, null, null, 'Total adoptado', metros],
      { negrita: true, total: true, formatos: [null, null, null, null, null, null, null, FMT_N2] })
  }

  // ── Coeficientes ─────────────────────────────────────────────────────────
  {
    const h = wb.addWorksheet('Coeficientes')
    let f = cabeceraObra(h, a, 'COEFICIENTES')

    f = encabezado(h, f, ['Concepto', 'Valor', 'Unidad', 'Cómo se obtiene'], [34, 16, 12, 52])

    const p = a.coeficientes
    const filas: [string, number, string, string][] = [
      ['Amortización', coef.amortizacion, '1/día', `${p.hsDia} hs/día ÷ ${p.vidaUtilHs} hs de vida útil`],
      ['Intereses', coef.intereses, '1/día',
        `(${(p.interesAnual * 100).toFixed(1)}% × ${p.hsDia}) ÷ (${p.aniosInteres} años × ${p.hsAnio} hs/año)`],
      ['Amortización e intereses', coef.amortMasInt, '1/día', 'suma de los dos anteriores'],
      ['Reparación y repuestos', coef.reparacion, '1/día',
        `${(p.factorReparacion * 100).toFixed(0)}% de la amortización`],
      ['Combustible vuelta (cargado)', coef.combustibleCargado, '$/km',
        `${p.consumoCargado} lts/km × gasoil sin IVA × ${p.factorLubricante} (lubricantes)`],
      ['Combustible ida (vacío)', coef.combustibleVacio, '$/km',
        `${p.consumoVacio} lts/km × gasoil sin IVA`],
      ['Combustible equipos', coef.combustibleEquipos, '$/(HP·día)',
        `${p.consumoEquipos} lts/HP·h × ${p.hsDia} hs × gasoil sin IVA × ${p.factorLubricante}`],
      ['Cámaras y cubiertas', coef.cubiertas, '$/km',
        `${p.cubiertasPorEquipo} cubiertas × precio sin IVA ÷ ${p.vidaCubiertasKm} km`],
      ['Seguros y patentes', coef.seguros, '1/día',
        `${(p.segurosAnual * 100).toFixed(0)}%/año × ${p.hsDia} hs ÷ ${p.hsAnio} hs/año`],
    ]
    for (const [k, v, u, c] of filas) f = fila(h, f, [k, v, u, c], { formatos: [null, FMT_N4] })

    f += 2
    f = titulo(h, f, 'COEFICIENTE RESUMEN')
    f = fila(h, f, ['El gasoil y el neumático entran sin IVA (÷ 1,21): el impuesto se suma en este coeficiente.'])
    f++
    f = encabezado(h, f, ['Concepto', 'Valor'])
    f = fila(h, f, ['Costo', 1], { formatos: [null, FMT_N4] })
    f = fila(h, f, [`+ Gastos generales  ${(p.gastosGenerales * 100).toFixed(1)} %`, p.gastosGenerales], { formatos: [null, FMT_N4] })
    f = fila(h, f, [`+ Beneficio  ${(p.beneficio * 100).toFixed(1)} %`, p.beneficio], { formatos: [null, FMT_N4] })
    f = fila(h, f, ['Subtotal', coef.subtotalCostoGGBeneficio], { negrita: true, total: true, formatos: [null, FMT_N4] })
    f = fila(h, f, [`+ Gastos financieros  ${(p.gastosFinancieros * 100).toFixed(1)} % s/subtotal`,
      coef.conGastosFinancieros - coef.subtotalCostoGGBeneficio], { formatos: [null, FMT_N4] })
    f = fila(h, f, ['Subtotal', coef.conGastosFinancieros], { negrita: true, total: true, formatos: [null, FMT_N4] })
    f = fila(h, f, [`+ IVA e Ingresos Brutos  ${(p.ivaIngBrutos * 100).toFixed(1)} % s/subtotal`,
      coef.montoIvaIngBrutos], { formatos: [null, FMT_N4] })
    f = fila(h, f, ['COEFICIENTE RESUMEN', coef.coeficienteResumen],
      { negrita: true, total: true, formatos: [null, FMT_N2] })
  }

  // ── Mano de obra ─────────────────────────────────────────────────────────
  {
    const h = wb.addWorksheet('Mano de obra')
    let f = cabeceraObra(h, a, 'MANO DE OBRA')

    f = encabezado(h, f,
      ['Concepto', 'Of. especializado', 'Oficial', 'Medio oficial', 'Ayudante'],
      [40, 19, 19, 19, 19])

    const cats = [mdo.oficialEsp, mdo.oficial, mdo.medioOficial, mdo.ayudante]
    const nums = (sel: (c: typeof mdo.oficialEsp) => number) => cats.map(sel)
    const fmt5 = [null, FMT_N2, FMT_N2, FMT_N2, FMT_N2]

    f = fila(h, f, ['Jornal de convenio ($/hs)', ...nums(c => c.jornal)], { formatos: fmt5 })
    f = fila(h, f, [`Bruto (${a.manoObra.hsMes} hs + ${(a.manoObra.presentismo * 100).toFixed(0)}% presentismo)`,
      ...nums(c => c.bruto)], { formatos: fmt5 })
    f = fila(h, f, [`− Retenciones (${(mdo.pctRetenciones * 100).toFixed(2)} %)`,
      ...nums(c => -c.retenciones)], { formatos: fmt5 })
    f = fila(h, f, ['Neto', ...nums(c => c.neto)], { formatos: fmt5 })
    f = fila(h, f, [`+ Cargas sociales (${(cargas.total * 100).toFixed(2)} %)`,
      ...nums(c => c.cargasSociales)], { formatos: fmt5 })
    f = fila(h, f, ['Costo total laboral', ...nums(c => c.costoTotalLaboral)],
      { negrita: true, total: true, formatos: fmt5 })
    f = fila(h, f, [`Costo real ($/hs) — ÷ ${a.manoObra.hsMes} hs`, ...nums(c => c.costoRealHora)], { formatos: fmt5 })
    f = fila(h, f, ['Suma no remunerativa ($/mes)',
      a.manoObra.noRemunerativo.oficialEsp, a.manoObra.noRemunerativo.oficial,
      a.manoObra.noRemunerativo.medioOficial, a.manoObra.noRemunerativo.ayudante], { formatos: fmt5 })
    f = fila(h, f, [`Prorrateada ÷ ${a.manoObra.hsProrrateoNoRem} hs ($/hs)`,
      ...nums(c => c.noRemunerativo)], { formatos: fmt5 })
    f = fila(h, f, ['COSTO HORARIO ($/hs)', ...nums(c => c.costoHora)],
      { negrita: true, total: true, formatos: fmt5 })
    f = fila(h, f, ['Incidencia sobre el jornal', ...nums(c => c.incidencia)], { formatos: fmt5 })

    f += 2
    f = titulo(h, f, 'DETALLE DE RETENCIONES Y CARGAS', 10)
    f = encabezado(h, f, ['Concepto', 'Porcentaje', 'Tipo'])
    for (const r of a.manoObra.retenciones)
      f = fila(h, f, [r.nombre, r.pct, 'Retención'], { formatos: [null, '0.0000%'] })
    for (const c of a.manoObra.contribuciones)
      f = fila(h, f, [c.nombre, c.pct, 'Contribución'], { formatos: [null, '0.0000%'] })
    for (const c of a.manoObra.adicionales)
      f = fila(h, f, [c.nombre, c.pct, 'Adicional'], { formatos: [null, '0.0000%'] })
    f = fila(h, f, ['Vacaciones 14 días', a.manoObra.vacaciones, 'Adicional'], { formatos: [null, '0.0000%'] })
    f = fila(h, f, ['SAC', a.manoObra.sac, 'Adicional'], { formatos: [null, '0.0000%'] })
    f = fila(h, f, ['C. Soc. s/vacaciones (derivado)', cargas.cSocSobreVacaciones,
      'vacaciones × subtotal contribuciones'], { formatos: [null, '0.0000%'] })
    f = fila(h, f, ['C. Soc. s/SAC (derivado)', cargas.cSocSobreSAC,
      `SAC × ${(a.manoObra.factorCargasSobreSAC * 100).toFixed(2)} %`], { formatos: [null, '0.0000%'] })
  }

  // ── Análisis de precio (una hoja por cada uno) ────────────────────────────
  for (const clave of CLAVES_APU) {
    const meta = ETIQUETAS_APU[clave]
    const cfg  = a.apu[clave]
    const r    = resultados[clave]
    const esTransporte = clave === 'transNoPav' || clave === 'transPav'
    const u = meta.unidad

    // Los nombres de hoja no admiten más de 31 caracteres ni ciertos símbolos
    const h = wb.addWorksheet(meta.corto.replace(/[\\/?*[\]:]/g, '').slice(0, 31))
    let f = cabeceraObra(h, a, `ANÁLISIS DE PRECIO — ${meta.titulo.toUpperCase()}   (${u})`)

    f = titulo(h, f, '1. EJECUCIÓN', 10)
    f = titulo(h, f, '1.a. Equipos', 9)
    f = encabezado(h, f, ['Nº', 'Equipo', 'Cantidad', 'Pot. (HP)', 'Unitario ($)', 'Total ($)'],
      [6, 40, 12, 12, 17, 18])
    cfg.equipos.forEach((e, i) => {
      f = fila(h, f, [i + 1, e.nombre, e.cantidad, e.hp,
        e.costoUsd * a.precios.dolar, e.costoUsd * a.precios.dolar * e.cantidad],
        { formatos: [null, null, FMT_N2, FMT_N2, FMT_N2, FMT_N2] })
    })
    f = fila(h, f, ['', 'Total', null, r.hpTotal, null, r.costoEquiposTotal],
      { negrita: true, total: true, formatos: [null, null, null, FMT_N2, null, FMT_N2] })
    f++

    f = encabezado(h, f, ['Designación', 'Coeficiente', 'Unidad', 'Parcial ($/día)'])
    const coefs: [string, number, string, number][] = [
      ['Amortización e intereses', coef.amortMasInt, '1/día', r.amortizacionInt],
      ['Reparación y repuestos',   coef.reparacion,  '1/día', r.reparacion],
      esTransporte
        ? ['Combustible y lubricantes (vuelta cargado)', coef.combustibleCargado, '$/km', r.combustible]
        : ['Combustible y lubricantes', coef.combustibleEquipos, '$/(HP·día)', r.combustible],
      ...(esTransporte
        ? [['Combustible (ida vacío)', coef.combustibleVacio, '$/km', r.combustibleVacio] as [string, number, string, number]]
        : []),
      ['Cámaras y cubiertas', coef.cubiertas, '$/km',  r.cubiertas],
      ['Seguros y patentes',  coef.seguros,   '1/día', r.seguros],
    ]
    for (const [d, cv, un, parcial] of coefs)
      f = fila(h, f, [d, cv, un, parcial], { formatos: [null, FMT_N4, null, FMT_N2] })
    f = fila(h, f, ['Sub-total 1.a. Equipos', null, null, r.subtotalEquipos],
      { negrita: true, total: true, formatos: [null, null, null, FMT_N2] })
    f++

    f = titulo(h, f, '1.b. Mano de obra', 9)
    f = encabezado(h, f, ['Nómina', 'Cantidad', 'hs/día', 'Unitario ($/hs)', 'Parcial ($/día)'])
    const nomina: [string, number, number][] = [
      ['Oficial especializado', cfg.nomina.oficialEsp,   mdo.oficialEsp.costoHora],
      ['Oficial',               cfg.nomina.oficial,      mdo.oficial.costoHora],
      ['Medio oficial',         cfg.nomina.medioOficial, mdo.medioOficial.costoHora],
      ['Ayudante',              cfg.nomina.ayudante,     mdo.ayudante.costoHora],
    ]
    for (const [lbl, cant, costo] of nomina)
      f = fila(h, f, [lbl, cant, cfg.nomina.hsDia, costo, cant * cfg.nomina.hsDia * costo],
        { formatos: [null, FMT_N2, FMT_N2, FMT_N2, FMT_N2] })
    f = fila(h, f, ['Sub-total 1.b. Mano de obra', null, null, null, r.subtotalManoObra],
      { negrita: true, total: true, formatos: [null, null, null, null, FMT_N2] })
    f = fila(h, f, ['COSTO DIARIO DE EJECUCIÓN', null, null, null, r.costoDiario],
      { negrita: true, total: true, formatos: [null, null, null, null, FMT_N2] })
    f++

    f = titulo(h, f, 'Rendimiento', 9)
    if (esTransporte) {
      f = fila(h, f, ['Carga por viaje', cfg.cargaTn, 'tn'], { formatos: [null, FMT_N2] })
      f = fila(h, f, ['Recorrido diario', cfg.rendimiento, 'km/día'], { formatos: [null, FMT_N2] })
      f = fila(h, f, ['Divisor (carga × recorrido)', r.divisorRendimiento, 'tn·km/día'], { formatos: [null, FMT_N2] })
    } else {
      f = fila(h, f, ['Rendimiento', cfg.rendimiento, u === '$/m' ? 'm/día' : 'tn/día'], { formatos: [null, FMT_N2] })
    }
    f = fila(h, f, ['COSTO UNITARIO DE EJECUCIÓN', r.costoUnitarioEjecucion, u],
      { negrita: true, total: true, formatos: [null, FMT_N2] })
    f += 2

    f = titulo(h, f, '2. MATERIALES', 10)
    f = encabezado(h, f, ['Nº', 'Designación', 'Unidad', 'Cantidad', 'Costo en origen', 'Total'])
    cfg.materiales.forEach((m, i) => {
      f = fila(h, f, [i + 1, m.designacion, m.unidad, m.cantidad, m.costoOrigen, m.costoOrigen * m.cantidad],
        { formatos: [null, null, null, FMT_N2, FMT_N2, FMT_N2] })
    })
    f = fila(h, f, ['', 'Costo unitario de materiales', null, null, null, r.costoUnitarioMateriales],
      { negrita: true, total: true, formatos: [null, null, null, null, null, FMT_N2] })
    f += 2

    f = titulo(h, f, '3. HERRAMIENTAS MENORES Y TRANSPORTE INTERNO', 10)
    f = encabezado(h, f, ['Nº', 'Designación', 'Cantidad', 'Valor'])
    cfg.herramientas.forEach((t, i) => {
      f = fila(h, f, [i + 1, t.designacion, t.cantidad, t.valor], { formatos: [null, null, FMT_N2, FMT_N2] })
    })
    f = fila(h, f, ['', 'Costo unitario de herramientas', null, r.costoUnitarioHerramientas],
      { negrita: true, total: true, formatos: [null, null, null, FMT_N2] })
    f += 2

    f = titulo(h, f, 'RESUMEN', 10)
    f = encabezado(h, f, ['Concepto', 'Valor', 'Unidad'])
    f = fila(h, f, ['1. Ejecución',   r.costoUnitarioEjecucion,   u], { formatos: [null, FMT_N2] })
    f = fila(h, f, ['2. Materiales',  r.costoUnitarioMateriales,  u], { formatos: [null, FMT_N2] })
    f = fila(h, f, ['3. Herramientas menores y transporte interno', r.costoUnitarioHerramientas, u], { formatos: [null, FMT_N2] })
    f = fila(h, f, ['COSTO — COSTO', r.costoCosto, u], { negrita: true, total: true, formatos: [null, FMT_N2] })
    f = fila(h, f, ['Coeficiente resumen', coef.coeficienteResumen, ''], { formatos: [null, FMT_N2] })
    f = fila(h, f, ['PRECIO CALCULADO', r.precioCalculado, u], { negrita: true, formatos: [null, FMT_N2] })
    if (cfg.precioAdoptado.valor != null)
      f = fila(h, f, ['PRECIO ADOPTADO', cfg.precioAdoptado.valor, u],
        { negrita: true, total: true, formatos: [null, FMT_N2] })

    const dist = clave === 'transNoPav' ? a.datos.distanciaNoPavKm
               : clave === 'transPav'   ? a.datos.distanciaPavKm : 0
    if (esTransporte && dist > 0) {
      f = fila(h, f, ['Distancia', dist, 'km'], { formatos: [null, FMT_N2] })
      f = fila(h, f, ['PRECIO POR TONELADA', precioDe(clave) * dist, '$/tn'],
        { negrita: true, total: true, formatos: [null, FMT_N2] })
    }
  }

  // ── Presupuesto ──────────────────────────────────────────────────────────
  {
    const h = wb.addWorksheet('Presupuesto')
    let f = cabeceraObra(h, a, 'PRESUPUESTO OFICIAL')

    f = encabezado(h, f,
      ['Nº ítem', 'Designación de obra', 'Detalle', 'Un.', 'Cantidad', 'Precio unitario', 'Parcial'],
      [9, 30, 42, 8, 14, 18, 20])

    for (const it of pres.items) {
      f = fila(h, f,
        [it.numero, it.designacion, it.detalle ?? '', it.unidad, it.cantidad, it.precioUnitario, it.parcial],
        { formatos: [null, null, null, null, FMT_N2, FMT_N2, FMT_PES] })
    }
    f = fila(h, f, ['', '', '', '', '', 'T O T A L', pres.total],
      { negrita: true, total: true, formatos: [null, null, null, null, null, null, FMT_PES] })
    f += 2

    const c: Celda = h.getRow(f).getCell(1)
    c.value = `El presupuesto oficial asciende a la suma de ${montoEnLetras(pres.total)} `
            + `($ ${pres.total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).`
    c.font = { size: 9, bold: true }
    c.alignment = { wrapText: true, vertical: 'top' }
    h.mergeCells(f, 1, f + 2, 7)
  }

  return wb
}

export async function exportarLegajoRipio(
  a: AnalisisRipio,
  tramos: TramoComputo[],
  nombreArchivo = 'legajo-ripio',
): Promise<void> {
  const wb = await construirLibroRipio(a, tramos)

  const buf: ArrayBuffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${nombreArchivo.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_')}.xlsx`
  link.click()
  // Liberar el objeto después de que el navegador tome el blob
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
