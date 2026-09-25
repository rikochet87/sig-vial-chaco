/**
 * Congela las salidas del motor de cálculo de ripio.
 *
 * ── Qué es y qué NO es ────────────────────────────────────────────────────────
 *
 * Es un test de **regresión**, no de validación. Afirma que el motor sigue dando
 * los mismos números que daba, no que esos números sean los correctos. La
 * diferencia importa y conviene no confundirla: si un coeficiente estaba mal
 * desde el principio, este test lo defiende con la misma firmeza que si
 * estuviera bien.
 *
 * Existe igual porque tapa un agujero concreto. El único test que tocaba el
 * motor era `verificar-excel-ripio.ts`, que compara **el Excel contra el motor**:
 * si alguien cambia una fórmula, los dos lados se mueven juntos y el test pasa
 * igual. Este, en cambio, no se mueve solo.
 *
 * ── Cómo usarlo ───────────────────────────────────────────────────────────────
 *
 *   npx tsx scripts/verificar-ripio-motor.ts              compara
 *   npx tsx scripts/verificar-ripio-motor.ts --actualizar regraba el congelado
 *
 * Los valores viven en `ripio-motor-congelado.json`, aparte a propósito: cuando
 * alguien cambia el motor **a propósito**, corre `--actualizar` y el diff de git
 * muestra exactamente qué números se movieron y cuánto. Eso es lo que hay que
 * mirar en la revisión — un cambio de coeficiente que mueve el presupuesto un
 * 20 % se ve de una.
 *
 * **Si `--actualizar` cambia números que no esperabas mover, ese es el hallazgo.**
 * No lo commitees sin entender cuál fue la causa.
 *
 * Lo que falta y sería mejor: anclar contra la planilla de obra pública con la
 * que se verificó el motor en su momento. Cuando aparezca, este archivo se
 * reemplaza por uno que afirme los valores oficiales.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { analisisVacio, paramsAPU } from '../src/lib/ripioAnalisis'
import {
  calcularCoeficientes, calcularMdeO, calcularAPU, calcularComputo,
  calcularPresupuesto, valorEfectivo, montoEnLetras, type TramoComputo,
} from '../src/lib/ripioCalculo'

const CONGELADO = join(__dirname, 'ripio-motor-congelado.json')
const ANALISIS = ['material', 'transNoPav', 'transPav', 'construccion'] as const

/**
 * El escenario.
 *
 * Números elegidos para que ninguna rama quede en cero: dos equipos con
 * cantidades distintas —una fraccionaria—, nómina con las cuatro categorías,
 * materiales, herramientas, dos tramos con densidades distintas y los tres
 * valores adoptados con redondeo manual. Si esto cambia, hay que regrabar el
 * congelado, y por eso va acá adentro y no en un archivo suelto.
 */
function escenario() {
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

  for (const k of ANALISIS) {
    a.apu[k].equipos = [
      { equipoId: 'e1', nombre: 'Camión volcador', hp: 300, costoUsd: 120000, cantidad: 1 },
      { equipoId: 'e2', nombre: 'Motoniveladora', hp: 180, costoUsd: 250000, cantidad: 0.5 },
    ]
    a.apu[k].nomina = { oficialEsp: 1, oficial: 1, medioOficial: 1, ayudante: 2, hsDia: 8 }
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

  const computo = calcularComputo(tramos)
  a.toneladasAdoptadas = { valor: Math.round(computo.toneladasCalculado / 10) * 10 }
  a.metrosAdoptados = { valor: 12570 }
  a.apu.construccion.precioAdoptado = { valor: 16900 }

  return { a, tramos, computo }
}

/** Corre toda la cadena y aplana el resultado a pares clave → número */
function calcular(): Record<string, number | string> {
  const { a, computo } = escenario()

  const coef = calcularCoeficientes(a.coeficientes, a.precios)
  const mdo = calcularMdeO(a.precios, a.manoObra)
  const apu = Object.fromEntries(
    ANALISIS.map(k => [k, calcularAPU(paramsAPU(k, a.apu[k]), coef, mdo, a.precios.dolar)]),
  ) as Record<typeof ANALISIS[number], ReturnType<typeof calcularAPU>>

  const precioDe = (k: typeof ANALISIS[number]) =>
    valorEfectivo(apu[k].precioCalculado, a.apu[k].precioAdoptado)

  const toneladas = valorEfectivo(computo.toneladasCalculado, a.toneladasAdoptadas)
  const metros = valorEfectivo(computo.largoTotalM, a.metrosAdoptados)

  const pres = calcularPresupuesto({
    toneladas, metros,
    distanciaNoPavKm: a.datos.distanciaNoPavKm,
    distanciaPavKm: a.datos.distanciaPavKm,
    precioMaterial: precioDe('material'),
    precioTransNoPav: precioDe('transNoPav'),
    precioTransPav: precioDe('transPav'),
    precioEjecucion: precioDe('construccion'),
    movilizacion: a.movilizacion,
    tipoMaterial: a.datos.tipoMaterial,
    tramo: a.datos.tramo,
  })

  const out: Record<string, number | string> = {}

  // Coeficientes — todos, incluido el desglose del resumen en cascada
  for (const [k, v] of Object.entries(coef)) out[`coef.${k}`] = v as number

  // Mano de obra — las cuatro categorías completas
  for (const cat of ['oficialEsp', 'oficial', 'medioOficial', 'ayudante'] as const) {
    for (const [k, v] of Object.entries(mdo[cat])) out[`mdo.${cat}.${k}`] = v as number
  }
  out['mdo.pctRetenciones'] = mdo.pctRetenciones
  out['mdo.pctCargasSociales'] = mdo.pctCargasSociales

  // Los cuatro análisis, con todo su desglose
  for (const k of ANALISIS) {
    for (const [campo, v] of Object.entries(apu[k])) out[`apu.${k}.${campo}`] = v as number
  }

  // Cómputo
  out['computo.volumenM3'] = computo.volumenM3
  out['computo.toneladasCalculado'] = computo.toneladasCalculado
  out['computo.largoTotalM'] = computo.largoTotalM
  computo.porTramo.forEach((t, i) => {
    out[`computo.tramo${i}.volumenM3`] = t.volumenM3
    out[`computo.tramo${i}.toneladas`] = t.toneladas
  })

  // Valores adoptados que alimentan el presupuesto
  out['adoptado.toneladas'] = toneladas
  out['adoptado.metros'] = metros

  // Presupuesto — cada ítem y el total
  pres.items.forEach((it, i) => {
    out[`pres.${i}.numero`] = it.numero
    out[`pres.${i}.cantidad`] = it.cantidad
    out[`pres.${i}.precioUnitario`] = it.precioUnitario
    out[`pres.${i}.parcial`] = it.parcial
  })
  out['pres.total'] = pres.total
  // El monto en letras es parte del legajo: una coma de más se lee en el papel
  out['pres.totalEnLetras'] = montoEnLetras(pres.total)

  return out
}

// ── Comparar o regrabar ──────────────────────────────────────────────────────

const actual = calcular()

if (process.argv.includes('--actualizar')) {
  writeFileSync(CONGELADO, JSON.stringify(actual, null, 2) + '\n', 'utf-8')
  console.log(`Congelado regrabado: ${Object.keys(actual).length} valores.`)
  console.log('Mirá el diff de git antes de commitearlo.')
  process.exit(0)
}

let esperado: Record<string, number | string>
try {
  esperado = JSON.parse(readFileSync(CONGELADO, 'utf-8'))
} catch {
  console.error(`No existe ${CONGELADO}.`)
  console.error('Crealo con:  npx tsx scripts/verificar-ripio-motor.ts --actualizar')
  process.exit(1)
}

/**
 * Tolerancia relativa, no absoluta.
 *
 * El presupuesto ronda los cientos de millones y los coeficientes son del orden
 * de 1e-5: un mismo epsilon absoluto sería ciego para uno y ruidoso para el
 * otro. Con relativo, "cambió un 0,0001 %" significa lo mismo en toda la escala.
 */
const TOLERANCIA = 1e-9

let fallos = 0
const claves = [...new Set([...Object.keys(esperado), ...Object.keys(actual)])].sort()

for (const k of claves) {
  const e = esperado[k]
  const a = actual[k]

  if (e === undefined) { fallos++; console.log(`  NUEVO  ${k.padEnd(42)} ${a}`); continue }
  if (a === undefined) { fallos++; console.log(`  FALTA  ${k.padEnd(42)} esperaba ${e}`); continue }

  if (typeof e === 'string' || typeof a === 'string') {
    if (e !== a) { fallos++; console.log(`  FALLA  ${k.padEnd(42)} ${a}\n         esperado ${e}`) }
    continue
  }
  const dif = Math.abs(a - e)
  const rel = Math.abs(e) > 1e-12 ? dif / Math.abs(e) : dif
  if (rel > TOLERANCIA) {
    fallos++
    const pct = Math.abs(e) > 1e-12 ? ` (${(rel * 100).toFixed(4)} %)` : ''
    console.log(`  FALLA  ${k.padEnd(42)} ${a}\n         esperado ${e}${pct}`)
  }
}

console.log(`\n${claves.length} valores comparados.`)
if (fallos === 0) {
  console.log('✓ El motor da lo mismo que cuando se congeló.\n')
} else {
  console.log(`✗ ${fallos} diferencia(s).`)
  console.log('  Si el cambio es intencional:  npx tsx scripts/verificar-ripio-motor.ts --actualizar')
  console.log('  Si no, acabás de encontrar algo.\n')
}
process.exit(fallos === 0 ? 0 : 1)
