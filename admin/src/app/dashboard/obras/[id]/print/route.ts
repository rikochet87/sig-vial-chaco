import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number)           { return Math.round(n).toLocaleString('es-AR') }
function fmtDec(n: number, d = 4) { return Number(n).toFixed(d).replace('.', ',') }
function fmtPesos(n: number)      { return `$ ${Math.round(n).toLocaleString('es-AR')}` }
function esc(s: unknown)          { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

const MONTE_LABELS: Record<string, string> = {
  ralo: 'Monte Ralo', semitupido: 'Monte Semi-tupido', tupido: 'Monte Tupido',
}
const TIPO_LABELS: Record<string, string> = {
  terraplen: 'Terraplén', excavacion: 'Excavación', ripio: 'Ripio',
  canal: 'Canal', limpieza: 'Limpieza Vial',
}
const ESTADO_LABELS: Record<string, string> = {
  planificada: 'Planificada', en_curso: 'En curso', ejecutada: 'Ejecutada',
}

// ── Sección Desmalezado — Cómputo ────────────────────────────────────────────
function desmComputo(c: Record<string, unknown>): string {
  const tramos = (c.tramos as Record<string, unknown>[]) ?? []
  const rows = tramos.map(t => {
    const lados = Number(t.lados ?? 1)
    const izqRow = `
      <tr>
        <td rowspan="${lados === 2 ? 2 : 1}">${esc(t.ruta)}</td>
        <td class="center" style="color:#2e7d32">IZQ</td>
        <td class="right">${fmt(Number(t.desdeIzq))}</td>
        <td class="right">${fmt(Number(t.hastaIzq))}</td>
        <td class="right">${fmt(Number(t.longIzq))}</td>
        <td class="right">${Number(t.anchoIzq).toFixed(1)}</td>
        <td class="right">${fmtDec(Number(t.haIzq))}</td>
      </tr>`
    const derRow = lados === 2 ? `
      <tr>
        <td class="center" style="color:#1565c0">DER</td>
        <td class="right">${fmt(Number(t.desdeDer))}</td>
        <td class="right">${fmt(Number(t.hastaDer))}</td>
        <td class="right">${fmt(Number(t.longDer))}</td>
        <td class="right">${Number(t.anchoDer).toFixed(1)}</td>
        <td class="right">${fmtDec(Number(t.haDer))}</td>
      </tr>` : ''
    return izqRow + derRow
  }).join('')

  return `
  <section>
    <h2>I. Cómputo de Superficie</h2>
    <p><strong>Método:</strong> ${esc(c.method) === 'formula' ? 'Fórmula por tramos progresivos' : 'Dibujo en mapa'}</p>
    ${tramos.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Designación</th><th>Lado</th><th class="right">Prog. desde (m)</th>
          <th class="right">Prog. hasta (m)</th><th class="right">Long. (m)</th>
          <th class="right">Ancho banq. (m)</th><th class="right">Sup. (ha)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="total-row">
          <td colspan="6"><strong>TOTAL</strong></td>
          <td class="right"><strong>${fmtDec(Number(c.Sup_ha))}</strong></td>
        </tr>
      </tbody>
    </table>` : ''}
    <table style="width:auto;margin-top:10px">
      <tbody>
        <tr><td>Superficie IZQ</td><td class="right">${fmtDec(Number(c.haIzq))} ha</td></tr>
        <tr><td>Superficie DER</td><td class="right">${fmtDec(Number(c.haDer))} ha</td></tr>
        <tr class="total-row"><td><strong>Superficie TOTAL</strong></td><td class="right"><strong>${fmtDec(Number(c.Sup_ha))} ha</strong></td></tr>
      </tbody>
    </table>
  </section>`
}

// ── Sección Desmalezado — AP ──────────────────────────────────────────────────
function desmAP(ap: Record<string, unknown>): string {
  const equipos = (ap.equipos as Record<string, unknown>[]) ?? []
  const mo      = (ap.mo      as Record<string, unknown>[]) ?? []

  const eqRows = equipos.map(e => `
    <tr>
      <td>${esc(e.nombre)}</td>
      <td class="right">${fmtPesos(Number(e.valor))}</td>
      <td class="right">${Number(e.hp) > 0 ? Number(e.hp) : '—'}</td>
    </tr>`).join('')

  const moRows = mo.map(r => `
    <tr>
      <td>${esc(r.cargo)}</td>
      <td class="right">${fmtPesos(Number(r.tarifa))}</td>
      <td class="right">${Number(r.coef).toFixed(4)}</td>
      <td class="right">${Number(r.hs)}</td>
      <td class="right">${Number(r.n)}</td>
      <td class="right">${fmtPesos(Number(r.tarifa) * Number(r.coef) * Number(r.hs) * Number(r.n))}</td>
    </tr>`).join('')

  return `
  <section>
    <h2>II. Análisis de Precios — Desmalezado de Banquinas</h2>

    <h3>Equipos</h3>
    <table>
      <thead><tr><th>Equipo</th><th class="right">Valor ($)</th><th class="right">HP</th></tr></thead>
      <tbody>
        ${eqRows}
        <tr class="subtotal-row"><td colspan="2"><strong>Total equipos</strong></td><td class="right"><strong>${fmtPesos(Number(ap.totalV))}</strong></td></tr>
      </tbody>
    </table>

    <h3>Posesión y Operación por jornada (${esc(ap.hsDia)} hs/día)</h3>
    <table style="width:auto">
      <tbody>
        <tr><td>Amortización</td><td class="right">${fmtPesos(Number(ap.amort))}</td></tr>
        <tr><td>Intereses</td><td class="right">${fmtPesos(Number(ap.interes))}</td></tr>
        <tr><td>Reparaciones (${esc(ap.pctRep)}%)</td><td class="right">${fmtPesos(Number(ap.rep))}</td></tr>
        <tr><td>Comb. Diesel (${esc(ap.hpDiesel)} HP · ${esc(ap.consDiesel)} l/HP · $${fmt(Number(ap.precioDiesel))}/l)</td><td class="right">${fmtPesos(Number(ap.combDiesel))}</td></tr>
        <tr><td>Comb. Nafta (${esc(ap.consNafta)} l · $${fmt(Number(ap.precioNafta))}/l)</td><td class="right">${fmtPesos(Number(ap.combNafta))}</td></tr>
        <tr><td>Lubricantes (${esc(ap.pctLub)}% comb.)</td><td class="right">${fmtPesos(Number(ap.lub))}</td></tr>
      </tbody>
    </table>

    <h3>Mano de Obra</h3>
    <table>
      <thead>
        <tr><th>Categoría</th><th class="right">$/h</th><th class="right">Coef. MO</th><th class="right">hs/día</th><th class="right">N°</th><th class="right">$/día</th></tr>
      </thead>
      <tbody>
        ${moRows}
        <tr class="subtotal-row"><td colspan="5"><strong>Total MO</strong></td><td class="right"><strong>${fmtPesos(Number(ap.moTotal))}</strong></td></tr>
      </tbody>
    </table>

    <h3>Resumen</h3>
    <table style="width:auto">
      <tbody>
        <tr><td>Subtotal directo</td><td class="right">${fmtPesos(Number(ap.subtotal))}</td></tr>
        <tr><td>Equipos menores (${esc(ap.pctEqMen)}%)</td><td class="right">${fmtPesos(Number(ap.eqMen))}</td></tr>
        <tr><td>Gastos generales (${esc(ap.pctGG)}%)</td><td class="right">${fmtPesos(Number(ap.gg))}</td></tr>
        <tr class="subtotal-row"><td><strong>Costo Directo Ejecutivo (CDE)</strong></td><td class="right"><strong>${fmtPesos(Number(ap.cde))}</strong></td></tr>
        <tr><td>Rendimiento: ${esc(ap.rendHa)} ha / ${esc(ap.rendDias)} días = ${fmtDec(Number(ap.rendDiaHa), 2)} ha/día</td><td></td></tr>
        <tr><td>Costo unitario calculado</td><td class="right">${fmtPesos(Number(ap.cu))}/ha</td></tr>
        <tr class="total-row"><td><strong>Precio adoptado</strong></td><td class="right"><strong>${fmtPesos(Number(ap.adoptado))}/ha</strong></td></tr>
      </tbody>
    </table>
  </section>`
}

// ── Sección Desmalezado — Presupuesto ─────────────────────────────────────────
function desmPres(p: Record<string, unknown>): string {
  return `
  <section>
    <h2>III. Presupuesto</h2>
    ${p.descTramo ? `<p><strong>Tramo:</strong> ${esc(p.descTramo)}</p>` : ''}
    <table>
      <thead>
        <tr><th>Ítem</th><th class="right">Sup. (ha)</th><th class="right">Precio unit.</th><th class="right">Subtotal ($)</th></tr>
      </thead>
      <tbody>
        <tr><td>Desmalezado Lado IZQ</td><td class="right">${fmtDec(Number(p.haIzq))}</td><td class="right">${fmtPesos(Number(p.precioUnit))}/ha</td><td class="right">${fmtPesos(Number(p.parcIzq))}</td></tr>
        ${Number(p.haDer) > 0 ? `<tr><td>Desmalezado Lado DER</td><td class="right">${fmtDec(Number(p.haDer))}</td><td class="right">${fmtPesos(Number(p.precioUnit))}/ha</td><td class="right">${fmtPesos(Number(p.parcDer))}</td></tr>` : ''}
        <tr class="subtotal-row"><td colspan="3"><strong>Subtotal mensual</strong></td><td class="right"><strong>${fmtPesos(Number(p.subtotal))}</strong></td></tr>
        <tr><td colspan="4">Plazo de contrato: <strong>${esc(p.plazo)} meses</strong></td></tr>
        <tr class="total-row"><td colspan="3"><strong>PRESUPUESTO TOTAL</strong></td><td class="right"><strong>${fmtPesos(Number(p.total))}</strong></td></tr>
      </tbody>
    </table>
    <h3>Distribución de aportes</h3>
    <table style="width:auto">
      <tbody>
        <tr><td>Aporte Provincial (${esc(p.dvpPct)}%)</td><td class="right">${fmtPesos(Number(p.dvp))}</td></tr>
        <tr><td>Aporte Consorcio (${100 - Number(p.dvpPct)}%)</td><td class="right">${fmtPesos(Number(p.ccc))}</td></tr>
        <tr class="total-row"><td><strong>Total</strong></td><td class="right"><strong>${fmtPesos(Number(p.total))}</strong></td></tr>
      </tbody>
    </table>
  </section>`
}

// ── Sección Desbosque — Cómputo ───────────────────────────────────────────────
function desbComputo(c: Record<string, unknown>): string {
  const izq = (c.entriesIzq as Record<string, unknown>[]) ?? []
  const der = (c.entriesDer as Record<string, unknown>[]) ?? []
  const haByType = (c.haByType as Record<string, number>) ?? {}

  const rows = [
    ...izq.map(e => `<tr><td>IZQ</td><td>${esc(MONTE_LABELS[String(e.monte)] ?? e.monte)}</td><td class="right">${fmtDec(Number(e.ha))}</td></tr>`),
    ...der.map(e => `<tr><td>DER</td><td>${esc(MONTE_LABELS[String(e.monte)] ?? e.monte)}</td><td class="right">${fmtDec(Number(e.ha))}</td></tr>`),
  ].join('')

  const typeRows = Object.entries(haByType)
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `<tr><td>${esc(MONTE_LABELS[k] ?? k)}</td><td class="right">${fmtDec(Number(v))} ha</td></tr>`)
    .join('')

  return `
  <section>
    <h2>I. Cómputo de Superficie</h2>
    <table>
      <thead><tr><th>Lado</th><th>Tipo de monte</th><th class="right">Superficie (ha)</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="subtotal-row"><td colspan="2"><strong>IZQ total</strong></td><td class="right"><strong>${fmtDec(Number(c.Sup_ha_izq))}</strong></td></tr>
        <tr class="subtotal-row"><td colspan="2"><strong>DER total</strong></td><td class="right"><strong>${fmtDec(Number(c.Sup_ha_der))}</strong></td></tr>
        <tr class="total-row"><td colspan="2"><strong>SUPERFICIE TOTAL</strong></td><td class="right"><strong>${fmtDec(Number(c.Sup_ha))} ha</strong></td></tr>
      </tbody>
    </table>
    ${typeRows ? `<h3>Por tipo de monte</h3><table style="width:auto"><tbody>${typeRows}</tbody></table>` : ''}
    <p style="margin-top:8px">
      Volumen arbóreo estimado: <strong>${fmt(Number(c.VolArb))} kg/ha·m²</strong> —
      Días de trabajo estimados: <strong>${fmtDec(Number(c.diasTrab), 1)}</strong>
    </p>
  </section>`
}

// ── Sección Desbosque — AP ────────────────────────────────────────────────────
function desbAP(ap: Record<string, unknown>): string {
  const eqRows = (ap.eqRows as Record<string, unknown>[]) ?? []
  const moRows = (ap.moRows as Record<string, unknown>[]) ?? []
  const precioHaPorTipo = (ap.precioHaPorTipo as Record<string, number>) ?? {}

  const eqHTML = eqRows.map(r => `
    <tr>
      <td>${esc(r.label)}</td>
      <td class="right">${fmtPesos(Number(r.capUnit))}</td>
      <td class="right">${Number(r.hp) > 0 ? Number(r.hp) : '—'}</td>
      <td class="right">${Number(r.cant)}</td>
      <td class="right">${fmtPesos(Number(r.capUnit) * Number(r.cant))}</td>
    </tr>`).join('')

  const moHTML = moRows.map(r => `
    <tr>
      <td>${esc(r.label)}</td>
      <td class="right">${fmtPesos(Number(r.tarifaH))}</td>
      <td class="right">${Number(r.coefMO).toFixed(4)}</td>
      <td class="right">${Number(r.hsDay)}</td>
      <td class="right">${Number(r.n)}</td>
      <td class="right">${fmtPesos(Number(r.tarifaH) * Number(r.coefMO) * Number(r.hsDay) * Number(r.n))}</td>
    </tr>`).join('')

  const precioHTML = Object.entries(precioHaPorTipo).map(([k, v]) => `
    <tr>
      <td>${esc(MONTE_LABELS[k] ?? k)}</td>
      <td class="right">${fmtPesos(v)}/ha</td>
    </tr>`).join('')

  return `
  <section>
    <h2>II. Análisis de Precios — Desbosque, Destronque y Limpieza</h2>

    <h3>I) Mano de Obra</h3>
    <table>
      <thead><tr><th>Categoría</th><th class="right">$/h</th><th class="right">Coef. MO</th><th class="right">hs/día</th><th class="right">N°</th><th class="right">$/día</th></tr></thead>
      <tbody>
        ${moHTML}
        <tr class="subtotal-row"><td colspan="5"><strong>Total MO/día</strong></td><td class="right"><strong>${fmtPesos(Number(ap.cMO))}</strong></td></tr>
      </tbody>
    </table>

    <h3>II–III) Equipos</h3>
    <table>
      <thead><tr><th>Equipo</th><th class="right">Valor unit. ($)</th><th class="right">HP</th><th class="right">Cant.</th><th class="right">Total ($)</th></tr></thead>
      <tbody>
        ${eqHTML}
        <tr class="subtotal-row"><td colspan="4"><strong>Total capital</strong></td><td class="right"><strong>${fmtPesos(Number(ap.totalCap))}</strong></td></tr>
      </tbody>
    </table>
    <table style="width:auto;margin-top:6px">
      <tbody>
        <tr><td>Amortización (coef. ${esc(ap.amortCoef)})</td><td class="right">${fmtPesos(Number(ap.amortD))}/día</td></tr>
        <tr><td>Reparaciones (coef. ${esc(ap.repCoef)})</td><td class="right">${fmtPesos(Number(ap.repD))}/día</td></tr>
        <tr><td>Combustible (${esc(ap.consumoLHpH)} l/HP·h · ${esc(ap.hsDiaComb)}h · $${fmt(Number(ap.precioLitro))}/l · coef. ${esc(ap.coefLubri)})</td><td class="right">${fmtPesos(Number(ap.combD))}/día</td></tr>
        <tr class="subtotal-row"><td><strong>Total equipos/día</strong></td><td class="right"><strong>${fmtPesos(Number(ap.cEquipos))}</strong></td></tr>
      </tbody>
    </table>

    <h3>IV) Resumen y Precio por tipo</h3>
    <table style="width:auto">
      <tbody>
        <tr><td>Costo diario (equipos + MO)</td><td class="right">${fmtPesos(Number(ap.costoDiario))}/día</td></tr>
        ${Number(ap.materiales) > 0 ? `<tr><td>Materiales</td><td class="right">${fmtPesos(Number(ap.materiales))}</td></tr>` : ''}
        ${Number(ap.transpInt) > 0 ? `<tr><td>Transporte interno</td><td class="right">${fmtPesos(Number(ap.transpInt))}</td></tr>` : ''}
        <tr><td>Coef. resumen CR (GG ${esc(ap.ggPct)}%, Ben ${esc(ap.benPct)}%, GF ${esc(ap.gfPct)}%, IVA ${esc(ap.ivaPct)}%)</td><td class="right">${Number(ap.CR).toFixed(4)}</td></tr>
      </tbody>
    </table>
    <table style="width:auto;margin-top:6px">
      <thead><tr><th>Tipo de monte</th><th class="right">Precio adoptado ($/ha)</th></tr></thead>
      <tbody>${precioHTML}</tbody>
    </table>
  </section>`
}

// ── Sección Desbosque — Presupuesto ───────────────────────────────────────────
function desbPres(p: Record<string, unknown>): string {
  const presRows = (p.presRows as Record<string, unknown>[]) ?? []
  const rows = presRows.map(r => `
    <tr>
      <td>${esc(r.num)}</td>
      <td>${esc(r.desc)}</td>
      <td>${esc(r.unit)}</td>
      <td class="right">${fmtDec(Number(r.cant), 2)}</td>
      <td class="right">${fmtPesos(Number(r.precioUnit))}</td>
      <td class="right">${fmtPesos(Number(r.cant) * Number(r.precioUnit))}</td>
    </tr>`).join('')

  return `
  <section>
    <h2>III. Presupuesto</h2>
    <table>
      <thead><tr><th>N°</th><th>Descripción</th><th>Un.</th><th class="right">Cant.</th><th class="right">P. Unit. ($)</th><th class="right">Subtotal ($)</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="total-row"><td colspan="5"><strong>PRESUPUESTO TOTAL</strong></td><td class="right"><strong>${fmtPesos(Number(p.presTotal))}</strong></td></tr>
      </tbody>
    </table>
    <h3>Distribución de aportes</h3>
    <table style="width:auto">
      <tbody>
        <tr><td>Aporte Provincial (${esc(p.dvpPct)}%)</td><td class="right">${fmtPesos(Number(p.aporteDVP))}</td></tr>
        <tr><td>Aporte Consorcio (${100 - Number(p.dvpPct)}%)</td><td class="right">${fmtPesos(Number(p.aporteCC))}</td></tr>
        <tr class="total-row"><td><strong>Total</strong></td><td class="right"><strong>${fmtPesos(Number(p.presTotal))}</strong></td></tr>
      </tbody>
    </table>
  </section>`
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; background: #fff; padding: 20mm 18mm; line-height: 1.5; }
  .doc-header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
  .doc-title { font-size: 14pt; font-weight: bold; }
  .doc-sub   { font-size: 9pt; color: #555; margin-top: 3px; }
  .doc-meta  { text-align: right; font-size: 8pt; color: #555; line-height: 1.8; }
  section { margin-bottom: 22px; }
  section + section { border-top: 1px solid #ddd; padding-top: 16px; }
  h2 { font-size: 11pt; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  h3 { font-size: 9.5pt; font-weight: bold; margin: 12px 0 5px; color: #333; }
  p  { margin: 4px 0; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 8px; }
  th { background: #f0f0f0; border: 1px solid #bbb; padding: 4px 8px; font-weight: bold; text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.3px; }
  td { border: 1px solid #ddd; padding: 4px 8px; vertical-align: middle; }
  tr:nth-child(even) td { background: #fafafa; }
  .right  { text-align: right; }
  .center { text-align: center; }
  .subtotal-row td { background: #f0f0f0 !important; font-weight: 600; border-top: 1px solid #bbb; }
  .total-row    td { background: #e0e0e0 !important; font-weight: bold; border-top: 2px solid #888; }
  .print-btn { position: fixed; top: 14px; right: 14px; background: #111; color: #fff; border: none; padding: 8px 18px; font-size: 11px; cursor: pointer; font-family: monospace; border-radius: 3px; z-index: 999; }
  .doc-footer { border-top: 1px solid #ccc; margin-top: 28px; padding-top: 8px; font-size: 7.5pt; color: #999; display: flex; justify-content: space-between; }
  @media print {
    body { padding: 8mm 10mm; font-size: 9pt; }
    .print-btn { display: none !important; }
    section { page-break-inside: avoid; }
    @page { margin: 12mm; size: A4; }
  }
`

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const supabase = createServiceClient()
  const { data: obra } = await supabase
    .from('obras')
    .select('*')
    .eq('id', id)
    .single()

  if (!obra) {
    return new NextResponse('Obra no encontrada', { status: 404 })
  }

  const dc = obra.datos_calculadora as Record<string, unknown> | null
  const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const titulo  = TIPO_LABELS[obra.tipo as string] ?? obra.tipo
  const subtit  = obra.consorcio_numero
    ? `Consorcio Caminero Nº ${obra.consorcio_numero}`
    : obra.ubicacion ?? '—'
  const calcNombre = dc?.calculadora === 'desmalezado'
    ? 'Desmalezado de Banquinas'
    : dc?.calculadora === 'desbosque'
    ? 'Desbosque, Destronque y Limpieza'
    : ''

  let cuerpo = ''
  if (!dc) {
    cuerpo = `<div style="padding:40px 0;text-align:center;color:#888;font-style:italic">
      Esta obra no tiene datos de calculadora guardados.<br>
      Editá la obra desde la calculadora para generar el informe completo.
    </div>`
  } else if (dc.calculadora === 'desmalezado') {
    cuerpo =
      desmComputo(dc.computo as Record<string, unknown>) +
      desmAP(dc.analisis_precio as Record<string, unknown>) +
      desmPres(dc.presupuesto as Record<string, unknown>)
  } else if (dc.calculadora === 'desbosque') {
    cuerpo =
      desbComputo(dc.computo as Record<string, unknown>) +
      desbAP(dc.analisis_precio as Record<string, unknown>) +
      desbPres(dc.presupuesto as Record<string, unknown>)
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(titulo)} — ${esc(subtit)}</title>
  <style>${CSS}</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>

  <div class="doc-header">
    <div>
      <div class="doc-title">${esc(titulo)}</div>
      <div class="doc-sub">${esc(subtit)}${obra.descripcion ? ` · ${esc(obra.descripcion)}` : ''}</div>
      ${calcNombre ? `<div class="doc-sub" style="color:#aaa;font-size:8pt">${esc(calcNombre)}</div>` : ''}
    </div>
    <div class="doc-meta">
      <div>Emisión: ${hoy}</div>
      ${obra.estado ? `<div>Estado: ${esc(ESTADO_LABELS[obra.estado as string] ?? obra.estado)}</div>` : ''}
      ${obra.fecha_inicio ? `<div>Inicio: ${esc(obra.fecha_inicio)}</div>` : ''}
    </div>
  </div>

  ${cuerpo}

  <div class="doc-footer">
    <span>Sistema de Gestión Vial — Consorcios Camineros del Chaco</span>
    <span>Generado el ${hoy}</span>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
