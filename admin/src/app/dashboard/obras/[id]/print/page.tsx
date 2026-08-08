import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface TramoSnap {
  id: string; ruta: string; lados: number
  desdeIzq: number; hastaIzq: number; anchoIzq: number; haIzq: number
  desdeDer: number; hastaDer: number; anchoDer: number; haDer: number
  ha: number; longIzq: number; longDer: number
}
interface DesmSnap { calculadora: 'desmalezado'; computo: DesmComputo; analisis_precio: DesmAP; presupuesto: DesmPres; inputs: Record<string, unknown> }
interface DesmComputo { Sup_ha: number; haIzq: number; haDer: number; tramos: TramoSnap[]; method: string }
interface DesmAP {
  equipos: { id: string; nombre: string; hp: number; valor: number }[]
  mo: { id: string; cargo: string; n: number; tarifa: number; coef: number; hs: number }[]
  totalV: number; hsDia: number; hpDiesel: number
  amort: number; interes: number; ai: number; pctRep: number; rep: number
  consDiesel: number; precioDiesel: number; combDiesel: number
  consNafta: number; precioNafta: number; combNafta: number; combTotal: number
  pctLub: number; lub: number; moTotal: number; subtotal: number
  pctEqMen: number; eqMen: number; pctGG: number; gg: number; cde: number
  rendHa: number; rendDias: number; rendDiaHa: number; cu: number; adoptado: number
}
interface DesmPres { descTramo: string; haIzq: number; haDer: number; precioUnit: number; parcIzq: number; parcDer: number; subtotal: number; plazo: number; total: number; dvpPct: number; dvp: number; ccc: number }

interface MonteEntrySnap { id: string; ha: number; monte: string; fromMap?: boolean }
interface DesbSnap { calculadora: 'desbosque'; computo: DesbComputo; analisis_precio: DesbAP; presupuesto: DesbPres; inputs: Record<string, unknown> }
interface DesbComputo { Sup_ha: number; Sup_ha_izq: number; Sup_ha_der: number; haByType: Record<string, number>; VolArb: number; diasTrab: number; entriesIzq: MonteEntrySnap[]; entriesDer: MonteEntrySnap[] }
interface DesbAP { eqRows: { id: string; label: string; capUnit: number; hp: number; cant: number }[]; moRows: { id: string; label: string; tarifaH: number; coefMO: number; hsDay: number; n: number }[]; totalCap: number; totalHP: number; amortCoef: number; repCoef: number; amortD: number; repD: number; consumoLHpH: number; hsDiaComb: number; precioLitro: number; coefLubri: number; combPerHpD: number; combD: number; cEquipos: number; cMO: number; materiales: number; transpInt: number; costoDiario: number; ggPct: number; benPct: number; gfPct: number; ivaPct: number; CR: number; precioHaPorTipo: Record<string, number>; costoByType: Record<string, number>; CostoTotal: number; precioHa: number }
interface DesbPres { presRows: { id: string; num: number; desc: string; unit: string; cant: number; precioUnit: number }[]; presTotal: number; dvpPct: number; aporteDVP: number; aporteCC: number; Sup_ha: number; precioHaPromedio: number }

type DatosCalculadora = DesmSnap | DesbSnap

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) { return Math.round(n).toLocaleString('es-AR') }
function fmtDec(n: number, d = 4) { return n.toFixed(d).replace('.', ',') }
function fmtPesos(n: number) { return `$ ${Math.round(n).toLocaleString('es-AR')}` }

const MONTE_LABELS: Record<string, string> = {
  ralo: 'Monte Ralo', semitupido: 'Monte Semi-tupido', tupido: 'Monte Tupido',
}

// ── Secciones Desmalezado ─────────────────────────────────────────────────────
function DesmComputoSection({ data }: { data: DesmComputo }) {
  return (
    <section>
      <h2>I. Cómputo de Superficie</h2>
      <p><strong>Método:</strong> {data.method === 'formula' ? 'Fórmula por tramos' : 'Dibujo en mapa'}</p>
      {data.method === 'formula' && data.tramos.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Designación</th>
              <th>Lado</th>
              <th>Prog. desde (m)</th>
              <th>Prog. hasta (m)</th>
              <th>Long. (m)</th>
              <th>Ancho banq. (m)</th>
              <th>Sup. (ha)</th>
            </tr>
          </thead>
          <tbody>
            {data.tramos.map(t => (<>
              <tr key={`${t.id}-izq`}>
                <td rowSpan={t.lados === 2 ? 2 : 1}>{t.ruta}</td>
                <td className="center">IZQ</td>
                <td className="right">{fmt(t.desdeIzq)}</td>
                <td className="right">{fmt(t.hastaIzq)}</td>
                <td className="right">{fmt(t.longIzq)}</td>
                <td className="right">{t.anchoIzq.toFixed(1)}</td>
                <td className="right">{fmtDec(t.haIzq)}</td>
              </tr>
              {t.lados === 2 && (
                <tr key={`${t.id}-der`}>
                  <td className="center">DER</td>
                  <td className="right">{fmt(t.desdeDer)}</td>
                  <td className="right">{fmt(t.hastaDer)}</td>
                  <td className="right">{fmt(t.longDer)}</td>
                  <td className="right">{t.anchoDer.toFixed(1)}</td>
                  <td className="right">{fmtDec(t.haDer)}</td>
                </tr>
              )}
            </>))}
            <tr className="total-row">
              <td colSpan={6}><strong>TOTAL</strong></td>
              <td className="right"><strong>{fmtDec(data.Sup_ha)}</strong></td>
            </tr>
          </tbody>
        </table>
      )}
      <table style={{ marginTop: '12px', width: 'auto' }}>
        <tbody>
          <tr><td>Superficie IZQ</td><td className="right">{fmtDec(data.haIzq)} ha</td></tr>
          <tr><td>Superficie DER</td><td className="right">{fmtDec(data.haDer)} ha</td></tr>
          <tr className="total-row"><td><strong>Superficie TOTAL</strong></td><td className="right"><strong>{fmtDec(data.Sup_ha)} ha</strong></td></tr>
        </tbody>
      </table>
    </section>
  )
}

function DesmAPSection({ data }: { data: DesmAP }) {
  return (
    <section>
      <h2>II. Análisis de Precios — Desmalezado de Banquinas</h2>

      <h3>Equipos</h3>
      <table>
        <thead><tr><th>Equipo</th><th className="right">Valor ($)</th><th className="right">HP</th></tr></thead>
        <tbody>
          {data.equipos.map(e => (
            <tr key={e.id}><td>{e.nombre}</td><td className="right">{fmtPesos(e.valor)}</td><td className="right">{e.hp || '—'}</td></tr>
          ))}
          <tr className="subtotal-row"><td><strong>Total equipos</strong></td><td className="right"><strong>{fmtPesos(data.totalV)}</strong></td><td></td></tr>
        </tbody>
      </table>

      <h3>Posesión y Operación por jornada ({data.hsDia} hs/día)</h3>
      <table>
        <tbody>
          <tr><td>Amortización</td><td className="right">{fmtPesos(data.amort)}</td></tr>
          <tr><td>Intereses</td><td className="right">{fmtPesos(data.interes)}</td></tr>
          <tr><td>Reparaciones ({data.pctRep}%)</td><td className="right">{fmtPesos(data.rep)}</td></tr>
          <tr><td>Combustible Diesel ({data.hpDiesel} HP × {data.consDiesel} l/HP × ${fmt(data.precioDiesel)}/l)</td><td className="right">{fmtPesos(data.combDiesel)}</td></tr>
          <tr><td>Combustible Nafta ({data.consNafta} l × ${fmt(data.precioNafta)}/l)</td><td className="right">{fmtPesos(data.combNafta)}</td></tr>
          <tr><td>Lubricantes ({data.pctLub}% comb.)</td><td className="right">{fmtPesos(data.lub)}</td></tr>
        </tbody>
      </table>

      <h3>Mano de Obra</h3>
      <table>
        <thead><tr><th>Categoría</th><th className="right">Tarifa $/h</th><th className="right">Coef. MO</th><th className="right">hs/día</th><th className="right">N°</th><th className="right">$/día</th></tr></thead>
        <tbody>
          {data.mo.map(r => (
            <tr key={r.id}><td>{r.cargo}</td><td className="right">{fmtPesos(r.tarifa)}</td><td className="right">{r.coef.toFixed(4)}</td><td className="right">{r.hs}</td><td className="right">{r.n}</td><td className="right">{fmtPesos(r.tarifa * r.coef * r.hs * r.n)}</td></tr>
          ))}
          <tr className="subtotal-row"><td colSpan={5}><strong>Total MO</strong></td><td className="right"><strong>{fmtPesos(data.moTotal)}</strong></td></tr>
        </tbody>
      </table>

      <h3>Resumen</h3>
      <table>
        <tbody>
          <tr><td>Subtotal directo</td><td className="right">{fmtPesos(data.subtotal)}</td></tr>
          <tr><td>Equipos menores ({data.pctEqMen}%)</td><td className="right">{fmtPesos(data.eqMen)}</td></tr>
          <tr><td>Gastos generales ({data.pctGG}%)</td><td className="right">{fmtPesos(data.gg)}</td></tr>
          <tr className="subtotal-row"><td><strong>Costo directo ejecutivo (CDE)</strong></td><td className="right"><strong>{fmtPesos(data.cde)}</strong></td></tr>
          <tr><td>Rendimiento: {data.rendHa} ha / {data.rendDias} días = {fmtDec(data.rendDiaHa, 2)} ha/día</td><td></td></tr>
          <tr><td>Costo unitario calculado</td><td className="right">{fmtPesos(data.cu)}/ha</td></tr>
          <tr className="total-row"><td><strong>Precio adoptado</strong></td><td className="right"><strong>{fmtPesos(data.adoptado)}/ha</strong></td></tr>
        </tbody>
      </table>
    </section>
  )
}

function DesmPresSection({ data }: { data: DesmPres }) {
  return (
    <section>
      <h2>III. Presupuesto</h2>
      <p><strong>Tramo:</strong> {data.descTramo || '—'}</p>
      <table>
        <thead>
          <tr><th>Ítem</th><th className="right">Sup. (ha)</th><th className="right">Precio unit.</th><th className="right">Subtotal</th></tr>
        </thead>
        <tbody>
          <tr><td>Desmalezado Lado IZQ</td><td className="right">{fmtDec(data.haIzq)}</td><td className="right">{fmtPesos(data.precioUnit)}/ha</td><td className="right">{fmtPesos(data.parcIzq)}</td></tr>
          {data.haDer > 0 && <tr><td>Desmalezado Lado DER</td><td className="right">{fmtDec(data.haDer)}</td><td className="right">{fmtPesos(data.precioUnit)}/ha</td><td className="right">{fmtPesos(data.parcDer)}</td></tr>}
          <tr className="subtotal-row"><td colSpan={3}><strong>Subtotal mensual</strong></td><td className="right"><strong>{fmtPesos(data.subtotal)}</strong></td></tr>
          <tr><td colSpan={3}>Plazo de contrato: {data.plazo} meses</td><td></td></tr>
          <tr className="total-row"><td colSpan={3}><strong>PRESUPUESTO TOTAL</strong></td><td className="right"><strong>{fmtPesos(data.total)}</strong></td></tr>
        </tbody>
      </table>

      <h3>Distribución de aportes</h3>
      <table style={{ width: 'auto' }}>
        <tbody>
          <tr><td>Aporte Provincial ({data.dvpPct}%)</td><td className="right">{fmtPesos(data.dvp)}</td></tr>
          <tr><td>Aporte Consorcio ({100 - data.dvpPct}%)</td><td className="right">{fmtPesos(data.ccc)}</td></tr>
          <tr className="total-row"><td><strong>Total</strong></td><td className="right"><strong>{fmtPesos(data.total)}</strong></td></tr>
        </tbody>
      </table>
    </section>
  )
}

// ── Secciones Desbosque ───────────────────────────────────────────────────────
function DesbComputoSection({ data }: { data: DesbComputo }) {
  return (
    <section>
      <h2>I. Cómputo de Superficie</h2>
      <table>
        <thead><tr><th>Lado</th><th>Tipo de monte</th><th className="right">Superficie (ha)</th></tr></thead>
        <tbody>
          {data.entriesIzq.map(e => <tr key={e.id}><td>IZQ</td><td>{MONTE_LABELS[e.monte] ?? e.monte}</td><td className="right">{fmtDec(e.ha)}</td></tr>)}
          {data.entriesDer.map(e => <tr key={e.id}><td>DER</td><td>{MONTE_LABELS[e.monte] ?? e.monte}</td><td className="right">{fmtDec(e.ha)}</td></tr>)}
          <tr className="subtotal-row"><td colSpan={2}><strong>IZQ total</strong></td><td className="right"><strong>{fmtDec(data.Sup_ha_izq)}</strong></td></tr>
          <tr className="subtotal-row"><td colSpan={2}><strong>DER total</strong></td><td className="right"><strong>{fmtDec(data.Sup_ha_der)}</strong></td></tr>
          <tr className="total-row"><td colSpan={2}><strong>SUPERFICIE TOTAL</strong></td><td className="right"><strong>{fmtDec(data.Sup_ha)}</strong></td></tr>
        </tbody>
      </table>

      <h3>Por tipo de monte</h3>
      <table style={{ width: 'auto' }}>
        <tbody>
          {Object.entries(data.haByType).map(([k, v]) => v > 0 ? <tr key={k}><td>{MONTE_LABELS[k] ?? k}</td><td className="right">{fmtDec(v)} ha</td></tr> : null)}
        </tbody>
      </table>
      <p>Volumen arbóreo estimado: <strong>{fmt(data.VolArb)} kg/ha·m²</strong> — Días de trabajo: <strong>{fmtDec(data.diasTrab, 1)}</strong></p>
    </section>
  )
}

function DesbAPSection({ data }: { data: DesbAP }) {
  return (
    <section>
      <h2>II. Análisis de Precios — Desbosque, Destronque y Limpieza</h2>

      <h3>I) Mano de Obra</h3>
      <table>
        <thead><tr><th>Categoría</th><th className="right">$/h</th><th className="right">Coef. MO</th><th className="right">hs/día</th><th className="right">N°</th><th className="right">$/día</th></tr></thead>
        <tbody>
          {data.moRows.map(r => (
            <tr key={r.id}><td>{r.label}</td><td className="right">{fmtPesos(r.tarifaH)}</td><td className="right">{r.coefMO.toFixed(4)}</td><td className="right">{r.hsDay}</td><td className="right">{r.n}</td><td className="right">{fmtPesos(r.tarifaH * r.coefMO * r.hsDay * r.n)}</td></tr>
          ))}
          <tr className="subtotal-row"><td colSpan={5}><strong>Total MO/día</strong></td><td className="right"><strong>{fmtPesos(data.cMO)}</strong></td></tr>
        </tbody>
      </table>

      <h3>II–III) Equipos</h3>
      <table>
        <thead><tr><th>Equipo</th><th className="right">Valor unit. ($)</th><th className="right">HP</th><th className="right">Cant.</th><th className="right">Total ($)</th></tr></thead>
        <tbody>
          {data.eqRows.map(r => (
            <tr key={r.id}><td>{r.label}</td><td className="right">{fmtPesos(r.capUnit)}</td><td className="right">{r.hp || '—'}</td><td className="right">{r.cant}</td><td className="right">{fmtPesos(r.capUnit * r.cant)}</td></tr>
          ))}
          <tr className="subtotal-row"><td colSpan={4}><strong>Total capital</strong></td><td className="right"><strong>{fmtPesos(data.totalCap)}</strong></td></tr>
        </tbody>
      </table>
      <table style={{ marginTop: 8, width: 'auto' }}>
        <tbody>
          <tr><td>Amortización (coef. {data.amortCoef})</td><td className="right">{fmtPesos(data.amortD)}/día</td></tr>
          <tr><td>Reparaciones (coef. {data.repCoef})</td><td className="right">{fmtPesos(data.repD)}/día</td></tr>
          <tr><td>Combustible ({data.consumoLHpH} l/HP·h × {data.hsDiaComb}h × ${fmt(data.precioLitro)}/l × coef. {data.coefLubri})</td><td className="right">{fmtPesos(data.combD)}/día</td></tr>
          <tr className="subtotal-row"><td><strong>Total equipos/día</strong></td><td className="right"><strong>{fmtPesos(data.cEquipos)}</strong></td></tr>
        </tbody>
      </table>

      <h3>IV) Resumen</h3>
      <table style={{ width: 'auto' }}>
        <tbody>
          <tr><td>Costo diario total (equipos + MO)</td><td className="right">{fmtPesos(data.costoDiario)}/día</td></tr>
          {data.materiales > 0 && <tr><td>Materiales</td><td className="right">{fmtPesos(data.materiales)}</td></tr>}
          {data.transpInt > 0 && <tr><td>Transporte interno</td><td className="right">{fmtPesos(data.transpInt)}</td></tr>}
          <tr><td>Coef. resumen CR (GG {data.ggPct}%, Ben {data.benPct}%, GF {data.gfPct}%, IVA {data.ivaPct}%)</td><td className="right">{data.CR.toFixed(4)}</td></tr>
        </tbody>
      </table>

      <h3>Precio por tipo de monte</h3>
      <table style={{ width: 'auto' }}>
        <thead><tr><th>Tipo</th><th className="right">Rend. (ha/día)</th><th className="right">Costo dir. ($/ha)</th><th className="right">Precio c/CR ($/ha)</th></tr></thead>
        <tbody>
          {Object.entries(data.precioHaPorTipo).map(([k, v]) => {
            const m: Record<string, number> = { ralo: 2.5, semitupido: 2, tupido: 1.5 }
            return <tr key={k}><td>{MONTE_LABELS[k] ?? k}</td><td className="right">{m[k] ?? '—'}</td><td className="right">{fmtPesos((data.costoByType[k] ?? 0) > 0 && (m[k] ?? 0) > 0 ? data.costoDiario / (m[k] ?? 1) + data.materiales + data.transpInt : 0)}</td><td className="right">{fmtPesos(v)}</td></tr>
          })}
        </tbody>
      </table>
    </section>
  )
}

function DesbPresSection({ data }: { data: DesbPres }) {
  return (
    <section>
      <h2>III. Presupuesto</h2>
      <table>
        <thead><tr><th>N°</th><th>Descripción</th><th>Un.</th><th className="right">Cant.</th><th className="right">P. Unit. ($)</th><th className="right">Subtotal ($)</th></tr></thead>
        <tbody>
          {data.presRows.map(r => (
            <tr key={r.id}><td>{r.num}</td><td>{r.desc}</td><td>{r.unit}</td><td className="right">{fmtDec(r.cant, 2)}</td><td className="right">{fmtPesos(r.precioUnit)}</td><td className="right">{fmtPesos(r.cant * r.precioUnit)}</td></tr>
          ))}
          <tr className="total-row"><td colSpan={5}><strong>PRESUPUESTO TOTAL</strong></td><td className="right"><strong>{fmtPesos(data.presTotal)}</strong></td></tr>
        </tbody>
      </table>

      <h3>Distribución de aportes</h3>
      <table style={{ width: 'auto' }}>
        <tbody>
          <tr><td>Aporte Provincial ({data.dvpPct}%)</td><td className="right">{fmtPesos(data.aporteDVP)}</td></tr>
          <tr><td>Aporte Consorcio ({100 - data.dvpPct}%)</td><td className="right">{fmtPesos(data.aporteCC)}</td></tr>
          <tr className="total-row"><td><strong>Total</strong></td><td className="right"><strong>{fmtPesos(data.presTotal)}</strong></td></tr>
        </tbody>
      </table>
    </section>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const { data: obra } = await supabase
    .from('obras')
    .select('*')
    .eq('id', id)
    .single()

  if (!obra) notFound()

  const dc = obra.datos_calculadora as DatosCalculadora | null

  const TIPO_LABELS: Record<string, string> = {
    terraplen: 'Terraplén', excavacion: 'Excavación', ripio: 'Ripio',
    canal: 'Canal', limpieza: 'Limpieza Vial',
  }

  const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>
          {TIPO_LABELS[obra.tipo] ?? obra.tipo}
          {obra.consorcio_numero ? ` — CC Nº ${obra.consorcio_numero}` : obra.ubicacion ? ` — ${obra.ubicacion}` : ''}
        </title>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

          body {
            font-family: 'Arial', sans-serif;
            font-size: 10pt;
            color: #111;
            background: #fff;
            padding: 20mm 18mm;
            line-height: 1.5;
          }

          /* ── Header ──────────────────────────────────────────── */
          .doc-header {
            border-bottom: 2px solid #111;
            padding-bottom: 10px;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .doc-header .title { font-size: 14pt; font-weight: bold; }
          .doc-header .subtitle { font-size: 9pt; color: #555; margin-top: 2px; }
          .doc-header .meta { text-align: right; font-size: 8pt; color: #555; line-height: 1.7; }

          /* ── Secciones ───────────────────────────────────────── */
          section { margin-bottom: 20px; }
          section + section { border-top: 1px solid #ddd; padding-top: 14px; }

          h2 { font-size: 11pt; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #111; }
          h3 { font-size: 9.5pt; font-weight: bold; margin: 10px 0 5px; color: #333; }
          p  { margin: 4px 0; font-size: 9pt; }

          /* ── Tablas ──────────────────────────────────────────── */
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9pt;
            margin-bottom: 8px;
          }
          th {
            background: #f0f0f0;
            border: 1px solid #ccc;
            padding: 4px 8px;
            font-weight: bold;
            text-align: left;
            font-size: 8.5pt;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          td {
            border: 1px solid #ddd;
            padding: 3px 8px;
            vertical-align: middle;
          }
          tr:nth-child(even) td { background: #fafafa; }

          .right { text-align: right; }
          .center { text-align: center; }

          .subtotal-row td { background: #f5f5f5 !important; font-weight: 600; border-top: 1px solid #bbb; }
          .total-row td    { background: #e8e8e8 !important; font-weight: bold; border-top: 2px solid #888; }

          /* ── Footer ──────────────────────────────────────────── */
          .doc-footer {
            border-top: 1px solid #ccc;
            margin-top: 24px;
            padding-top: 8px;
            font-size: 7.5pt;
            color: #888;
            display: flex;
            justify-content: space-between;
          }

          /* ── Print ───────────────────────────────────────────── */
          @media print {
            body { padding: 10mm 12mm; font-size: 9pt; }
            section { page-break-inside: avoid; }
            @page { margin: 15mm; }
            .no-print { display: none !important; }
          }

          /* ── Botón (solo pantalla) ───────────────────────────── */
          .print-btn {
            position: fixed; top: 16px; right: 16px;
            background: #111; color: #fff; border: none;
            padding: 8px 18px; font-size: 11px; cursor: pointer;
            font-family: monospace; letter-spacing: 0.5px;
          }
        `}</style>
      </head>
      <body>
        {/* Botón imprimir (no aparece en PDF) */}
        <button className="print-btn no-print" onClick={() => {}}
          style={{ position: 'fixed', top: 16, right: 16 }}
          onClickCapture={() => { if (typeof window !== 'undefined') window.print() }}>
          🖨 Imprimir / Guardar PDF
        </button>

        {/* Header del documento */}
        <div className="doc-header">
          <div>
            <div className="title">{TIPO_LABELS[obra.tipo] ?? obra.tipo}</div>
            <div className="subtitle">
              {obra.consorcio_numero
                ? `Consorcio Caminero Nº ${obra.consorcio_numero}`
                : obra.ubicacion ?? '—'}
              {obra.descripcion ? ` · ${obra.descripcion}` : ''}
            </div>
            {dc && <div className="subtitle" style={{ marginTop: 2, color: '#888', fontSize: '8pt' }}>
              Calculator: {dc.calculadora === 'desmalezado' ? 'Desmalezado de Banquinas' : 'Desbosque, Destronque y Limpieza'}
            </div>}
          </div>
          <div className="meta">
            <div>Fecha de emisión: {hoy}</div>
            {obra.estado && <div>Estado: {obra.estado === 'planificada' ? 'Planificada' : obra.estado === 'en_curso' ? 'En curso' : 'Ejecutada'}</div>}
            {obra.fecha_inicio && <div>Inicio: {obra.fecha_inicio}</div>}
          </div>
        </div>

        {/* ── Sin snapshot ── */}
        {!dc && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: '#888', fontStyle: 'italic', fontSize: '10pt' }}>
            Esta obra no tiene datos de calculadora guardados.<br />
            Editá la obra desde la calculadora para generar el informe completo.
          </div>
        )}

        {/* ── Desmalezado ── */}
        {dc?.calculadora === 'desmalezado' && (<>
          <DesmComputoSection data={dc.computo} />
          <DesmAPSection      data={dc.analisis_precio} />
          <DesmPresSection    data={dc.presupuesto} />
        </>)}

        {/* ── Desbosque ── */}
        {dc?.calculadora === 'desbosque' && (<>
          <DesbComputoSection data={dc.computo} />
          <DesbAPSection      data={dc.analisis_precio} />
          <DesbPresSection    data={dc.presupuesto} />
        </>)}

        {/* Footer */}
        <div className="doc-footer">
          <span>Sistema de Gestión Vial — Consorcios Camineros del Chaco</span>
          <span>Generado el {hoy}</span>
        </div>

        {/* Auto-print script */}
        <script dangerouslySetInnerHTML={{ __html: `
          // El botón imprimir es client-side; aquí solo reconectamos el handler
          document.querySelector('.print-btn')?.addEventListener('click', () => window.print());
        `}} />
      </body>
    </html>
  )
}
