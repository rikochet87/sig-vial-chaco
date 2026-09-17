/**
 * Verifica el Excel del legajo de ripio: lo genera, lo vuelve a leer y compara
 * las celdas clave contra el motor de cálculo.
 *
 *   npx tsx scripts/verificar-excel-ripio.ts
 */

import ExcelJS from 'exceljs'
import { construirLibroRipio } from '../src/lib/ripioExcel'
import { analisisVacio, paramsAPU } from '../src/lib/ripioAnalisis'
import {
  calcularCoeficientes, calcularMdeO, calcularAPU, calcularComputo,
  calcularPresupuesto, valorEfectivo, type TramoComputo,
} from '../src/lib/ripioCalculo'

const a = analisisVacio()
a.datos = {
  ...a.datos,
  actuacion: 'E-123/2026', obra: 'Enripiado ruta vecinal',
  tramo: 'Prog. 0,00 a 12,50', objeto: 'Mejora de calzada',
  origen: 'Cantera La Escondida', destino: 'Km 12',
  distanciaNoPavKm: 42, distanciaPavKm: 18,
  fecha: '2026-09-01',
}
a.precios = { ...a.precios, ripio: 18000, dolar: 1500 }

// Un equipo y una nómina en cada análisis, para que los números no sean cero
for (const k of ['material', 'transNoPav', 'transPav', 'construccion'] as const) {
  a.apu[k].equipos = [
    { equipoId: 'e1', nombre: 'Camión volcador', hp: 300, costoUsd: 120000, cantidad: 1 },
    { equipoId: 'e2', nombre: 'Motoniveladora', hp: 180, costoUsd: 250000, cantidad: 0.5 },
  ]
  a.apu[k].nomina = { oficialEsp: 1, oficial: 1, medioOficial: 0, ayudante: 2, hsDia: 8 }
  a.apu[k].herramientas = [{ designacion: 'Herramientas menores', cantidad: 1, valor: 120 }]
}
a.apu.material.materiales = [
  { designacion: 'Ripio en cantera', unidad: 'tn', cantidad: 1, costoOrigen: 18000 },
]
a.apu.material.rendimiento = 500
a.movilizacion = 4_500_000

const tramos: TramoComputo[] = [
  { id: 't1', nombre: 'Tramo 1', largoM: 7500, anchoM: 6,   espesorM: 0.15, densidad: 2.1 },
  { id: 't2', nombre: 'Tramo 2', largoM: 5076, anchoM: 5.5, espesorM: 0.12, densidad: 2.0 },
]

// Valores adoptados: redondeos a mano, como en la planilla
const computo = calcularComputo(tramos)
a.toneladasAdoptadas = { valor: Math.round(computo.toneladasCalculado / 10) * 10 }
a.metrosAdoptados    = { valor: 12570 }
a.apu.construccion.precioAdoptado = { valor: 16900 }

// ── Esperados, del motor ─────────────────────────────────────────────────────
const coef = calcularCoeficientes(a.coeficientes, a.precios)
const mdo  = calcularMdeO(a.precios, a.manoObra)
const res  = Object.fromEntries((['material', 'transNoPav', 'transPav', 'construccion'] as const)
  .map(k => [k, calcularAPU(paramsAPU(k, a.apu[k]), coef, mdo, a.precios.dolar)]))
const precioDe = (k: 'material' | 'transNoPav' | 'transPav' | 'construccion') =>
  valorEfectivo(res[k].precioCalculado, a.apu[k].precioAdoptado)

const toneladas = valorEfectivo(computo.toneladasCalculado, a.toneladasAdoptadas)
const metros    = valorEfectivo(computo.largoTotalM,        a.metrosAdoptados)
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

// ── Generar y releer ─────────────────────────────────────────────────────────
async function main() {
  const wb = await construirLibroRipio(a, tramos)
  const buf = await wb.xlsx.writeBuffer()

  const leido = new ExcelJS.Workbook()
  await leido.xlsx.load(buf as ArrayBuffer)

  const hojas = leido.worksheets.map(h => h.name)
  console.log('Hojas:', hojas.join(' · '))

  let fallos = 0
  const ok = (etiqueta: string, real: unknown, esperado: number, tol = 0.01) => {
    const v = typeof real === 'number' ? real : NaN
    const bien = Number.isFinite(v) && Math.abs(v - esperado) <= tol
    if (!bien) fallos++
    console.log(`${bien ? '  ok  ' : ' FALLA'} ${etiqueta.padEnd(42)} ${String(real).padStart(16)}  esperado ${esperado}`)
  }

  /** Busca una fila por su primera columna y devuelve la celda pedida */
  const buscar = (hoja: string, etiqueta: string, col: number): unknown => {
    const h = leido.getWorksheet(hoja)
    if (!h) return NaN
    let out: unknown = NaN
    h.eachRow(r => {
      const c = r.getCell(1).value
      if (typeof c === 'string' && c.trim().toLowerCase().startsWith(etiqueta.toLowerCase()))
        out = r.getCell(col).value
    })
    return out
  }

  console.log('\n— Coeficientes —')
  ok('Coeficiente resumen', buscar('Coeficientes', 'COEFICIENTE RESUMEN', 2), coef.coeficienteResumen, 0.001)
  ok('Amortización e intereses', buscar('Coeficientes', 'Amortización e intereses', 2), coef.amortMasInt, 1e-6)
  ok('Cámaras y cubiertas', buscar('Coeficientes', 'Cámaras y cubiertas', 2), coef.cubiertas, 1e-4)

  console.log('\n— Mano de obra —')
  ok('Costo horario · of. especializado', buscar('Mano de obra', 'COSTO HORARIO', 2), mdo.oficialEsp.costoHora)
  ok('Costo horario · ayudante',          buscar('Mano de obra', 'COSTO HORARIO', 5), mdo.ayudante.costoHora)

  console.log('\n— Cómputo —')
  ok('Toneladas adoptadas', buscar('Cómputo', 'III', 8) /* ejecución = metros */, metros)
  {
    const h = leido.getWorksheet('Cómputo')!
    const filasTotal: unknown[] = []
    h.eachRow(r => { if (r.getCell(7).value === 'Total adoptado') filasTotal.push(r.getCell(8).value) })
    ok('Total adoptado · toneladas', filasTotal[0], toneladas)
    ok('Total adoptado · metros',    filasTotal[1], metros)
  }

  console.log('\n— Análisis —')
  for (const [k, hoja] of [
    ['material', 'Material'], ['transNoPav', 'Transp. no pav.'],
    ['transPav', 'Transp. pav.'], ['construccion', 'Construcción'],
  ] as const) {
    ok(`${hoja} · precio calculado`, buscar(hoja, 'PRECIO CALCULADO', 2), res[k].precioCalculado)
    ok(`${hoja} · costo-costo`,      buscar(hoja, 'COSTO — COSTO', 2),    res[k].costoCosto)
  }
  ok('Construcción · precio adoptado', buscar('Construcción', 'PRECIO ADOPTADO', 2), 16900)

  console.log('\n— Presupuesto —')
  {
    const h = leido.getWorksheet('Presupuesto')!
    const parciales: number[] = []
    let total = NaN
    h.eachRow(r => {
      const v7 = r.getCell(7).value
      if (r.getCell(6).value === 'T O T A L') total = Number(v7)
      else if (typeof v7 === 'number' && typeof r.getCell(5).value === 'number') parciales.push(v7)
    })
    pres.items.forEach((it, i) =>
      ok(`Ítem ${it.numero} — ${it.designacion}`.slice(0, 42), parciales[i], it.parcial))
    ok('TOTAL', total, pres.total)
    ok('Suma de parciales = total', parciales.reduce((s, v) => s + v, 0), pres.total, 0.05)
  }

  console.log(fallos === 0 ? '\n✓ Todo coincide con el motor.' : `\n✗ ${fallos} diferencia(s).`)
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
