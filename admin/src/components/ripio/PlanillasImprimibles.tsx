'use client'
/**
 * Legajo imprimible de ripio.
 *
 * Arma las planillas en hojas A4 encadenadas: carátula, cómputo métrico, los
 * cuatro análisis de precio y el presupuesto oficial. Una sola orden de impresión
 * saca todo el juego.
 *
 * Por qué un componente aparte y no un botón en cada panel: el CSS de impresión
 * que ya usaba la composición esconde todo el `body` y muestra un único
 * `.print-area`, así que sólo podía salir una hoja por vez. Acá el contenedor
 * `.legajo` es el que se muestra, y cada `.hoja` lleva su salto de página.
 *
 * Se imprime en blanco y negro sobre fondo blanco a propósito: es documentación
 * para presentar en papel, no la pantalla del panel.
 */

import { useMemo, useState } from 'react'
import {
  calcularAPU, calcularComputo, calcularPresupuesto, montoEnLetras,
  valorEfectivo, desgloseCargas,
  type Coeficientes, type CostosMdeO, type TramoComputo, type ResultadoAPU,
} from '@/lib/ripioCalculo'
import {
  paramsAPU, CLAVES_APU, ETIQUETAS_APU,
  type AnalisisRipio, type ClaveAPU,
} from '@/lib/ripioAnalisis'

// ── Formato ───────────────────────────────────────────────────────────────────
const n2 = (v: number) => v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const n0 = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 0 })
const nx = (v: number, d: number) => v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })

// ── Estilos de hoja ───────────────────────────────────────────────────────────
const MONO = '"DM Mono", "Roboto Mono", ui-monospace, monospace'

const hoja: React.CSSProperties = {
  width: 794, minHeight: 1123, background: '#fff', color: '#111',
  padding: '16mm 14mm', boxSizing: 'border-box',
  margin: '0 auto 22px', fontFamily: MONO, fontSize: 10.5, lineHeight: 1.35,
  boxShadow: '0 2px 14px rgba(0,0,0,.5)',
}

const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }
const cel: React.CSSProperties = {
  border: '0.7px solid #444', padding: '3px 5px', verticalAlign: 'middle',
}
const celNum: React.CSSProperties = { ...cel, textAlign: 'right', whiteSpace: 'nowrap' }
const celTit: React.CSSProperties = {
  ...cel, background: '#e8e8e8', fontWeight: 700, textAlign: 'center',
  fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.3,
}
const sinBorde: React.CSSProperties = { border: 'none', padding: '3px 5px' }

function Encabezado({ datos, titulo }: { datos: AnalisisRipio['datos']; titulo: string }) {
  const filas: [string, string][] = [
    ['Act. Nº',  datos.actuacion],
    ['Obra',     datos.obra],
    ['Tramo',    datos.tramo],
    ['Objeto',   datos.objeto],
  ].filter(([, v]) => v) as [string, string][]

  return (
    <div style={{ marginBottom: 12 }}>
      {filas.length > 0 && (
        <table style={{ ...tabla, marginBottom: 10 }}>
          <tbody>
            {filas.map(([k, v]) => (
              <tr key={k}>
                <td style={{ ...sinBorde, width: 62, fontWeight: 700, verticalAlign: 'top' }}>{k}:</td>
                <td style={sinBorde}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{
        textAlign: 'center', fontWeight: 700, fontSize: 12.5, letterSpacing: 1.5,
        textTransform: 'uppercase', background: '#e8e8e8',
        border: '0.7px solid #444', padding: '5px 0',
      }}>
        {titulo}
      </div>
    </div>
  )
}

function PiePagina({ n, total }: { n: number; total: number }) {
  return (
    <div style={{
      marginTop: 'auto', paddingTop: 10, fontSize: 8.5, color: '#666',
      display: 'flex', justifyContent: 'space-between',
      borderTop: '0.5px solid #bbb',
    }}>
      <span>SIG Vial · Chaco</span>
      <span>Hoja {n} de {total}</span>
    </div>
  )
}

function Hoja({ children, n, total }: { children: React.ReactNode; n: number; total: number }) {
  return (
    <div className="hoja" style={{ ...hoja, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1 }}>{children}</div>
      <PiePagina n={n} total={total} />
    </div>
  )
}

// ── Hoja: análisis de precio unitario ─────────────────────────────────────────
function HojaAPU({ clave, a, r, coef, mdo, distanciaKm, n, total }: {
  clave: ClaveAPU
  a: AnalisisRipio
  r: ResultadoAPU
  coef: Coeficientes
  mdo: CostosMdeO
  distanciaKm?: number
  n: number
  total: number
}) {
  const meta = ETIQUETAS_APU[clave]
  const cfg  = a.apu[clave]
  const esTransporte = clave === 'transNoPav' || clave === 'transPav'
  const u = meta.unidad
  const precio = valorEfectivo(r.precioCalculado, cfg.precioAdoptado)

  const nomina = [
    ['Oficial especializado', cfg.nomina.oficialEsp,   mdo.oficialEsp.costoHora],
    ['Oficial',               cfg.nomina.oficial,      mdo.oficial.costoHora],
    ['Medio oficial',         cfg.nomina.medioOficial, mdo.medioOficial.costoHora],
    ['Ayudante',              cfg.nomina.ayudante,     mdo.ayudante.costoHora],
  ] as const

  const coeficientes: [string, string, string, number][] = [
    ['Amortización e intereses', nx(coef.amortMasInt, 4),        '1/día', r.amortizacionInt],
    ['Reparación y repuestos',   nx(coef.reparacion, 4),         '1/día', r.reparacion],
    esTransporte
      ? ['Combustible y lubricantes (vuelta cargado)', n2(coef.combustibleCargado), '$/km', r.combustible]
      : ['Combustible y lubricantes', n2(coef.combustibleEquipos), '$/HP', r.combustible],
    ...(esTransporte
      ? [['Combustible (ida vacío)', n2(coef.combustibleVacio), '$/km', r.combustibleVacio] as [string,string,string,number]]
      : []),
    ['Cámaras y cubiertas', n2(coef.cubiertas), '$/km',  r.cubiertas],
    ['Seguros y patentes',  nx(coef.seguros, 4), '1/día', r.seguros],
  ]

  return (
    <Hoja n={n} total={total}>
      <Encabezado datos={a.datos} titulo={`Análisis de precio — ${meta.titulo}`} />

      <div style={{ textAlign: 'right', fontWeight: 700, marginBottom: 6 }}>{u}</div>

      {/* 1. EJECUCIÓN */}
      <div style={{ fontWeight: 700, marginBottom: 4 }}>1. EJECUCIÓN</div>

      <div style={{ marginLeft: 10, marginBottom: 3 }}>1.a. Equipos</div>
      <table style={{ ...tabla, marginBottom: 8 }}>
        <thead>
          <tr>
            <td style={{ ...celTit, width: 26 }}>Nº</td>
            <td style={celTit}>Equipo</td>
            <td style={{ ...celTit, width: 62 }}>Cant.</td>
            <td style={{ ...celTit, width: 62 }}>Pot. HP</td>
            <td style={{ ...celTit, width: 108 }}>Unitario ($)</td>
            <td style={{ ...celTit, width: 116 }}>Total ($)</td>
          </tr>
        </thead>
        <tbody>
          {cfg.equipos.map((e, i) => (
            <tr key={i}>
              <td style={{ ...cel, textAlign: 'center' }}>{i + 1}</td>
              <td style={cel}>{e.nombre || '—'}</td>
              <td style={celNum}>{e.cantidad}</td>
              <td style={celNum}>{e.hp || '—'}</td>
              <td style={celNum}>{n2(e.costoUsd * a.precios.dolar)}</td>
              <td style={celNum}>{n2(e.costoUsd * a.precios.dolar * e.cantidad)}</td>
            </tr>
          ))}
          {cfg.equipos.length === 0 && (
            <tr><td style={{ ...cel, textAlign: 'center', color: '#888' }} colSpan={6}>—</td></tr>
          )}
          <tr>
            <td style={{ ...cel, background: '#f4f4f4' }} colSpan={3} />
            <td style={{ ...celNum, background: '#f4f4f4', fontWeight: 700 }}>{n0(r.hpTotal)}</td>
            <td style={{ ...cel, background: '#f4f4f4' }} />
            <td style={{ ...celNum, background: '#f4f4f4', fontWeight: 700 }}>{n2(r.costoEquiposTotal)}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ ...tabla, marginBottom: 10 }}>
        <thead>
          <tr>
            <td style={celTit}>Designación</td>
            <td style={{ ...celTit, width: 96 }}>Coef.</td>
            <td style={{ ...celTit, width: 58 }}>Unidad</td>
            <td style={{ ...celTit, width: 116 }}>Parcial ($/día)</td>
          </tr>
        </thead>
        <tbody>
          {coeficientes.map(([desig, c, un, parcial]) => (
            <tr key={desig}>
              <td style={cel}>{desig}</td>
              <td style={celNum}>{c}</td>
              <td style={{ ...cel, textAlign: 'center' }}>{un}</td>
              <td style={celNum}>{n2(parcial)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cel, textAlign: 'right', fontWeight: 700, background: '#f4f4f4' }} colSpan={3}>
              Sub-total 1.a. Equipos
            </td>
            <td style={{ ...celNum, fontWeight: 700, background: '#f4f4f4' }}>{n2(r.subtotalEquipos)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginLeft: 10, marginBottom: 3 }}>1.b. Mano de obra</div>
      <table style={{ ...tabla, marginBottom: 10 }}>
        <thead>
          <tr>
            <td style={celTit}>Nómina</td>
            <td style={{ ...celTit, width: 62 }}>Cant.</td>
            <td style={{ ...celTit, width: 62 }}>hs/día</td>
            <td style={{ ...celTit, width: 108 }}>Unitario ($/hs)</td>
            <td style={{ ...celTit, width: 116 }}>Parcial ($/día)</td>
          </tr>
        </thead>
        <tbody>
          {nomina.map(([lbl, cant, costo]) => (
            <tr key={lbl}>
              <td style={cel}>{lbl}</td>
              <td style={celNum}>{cant}</td>
              <td style={celNum}>{cfg.nomina.hsDia}</td>
              <td style={celNum}>{n2(costo)}</td>
              <td style={celNum}>{n2(cant * cfg.nomina.hsDia * costo)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cel, textAlign: 'right', fontWeight: 700, background: '#f4f4f4' }} colSpan={4}>
              Sub-total 1.b. Mano de obra
            </td>
            <td style={{ ...celNum, fontWeight: 700, background: '#f4f4f4' }}>{n2(r.subtotalManoObra)}</td>
          </tr>
          <tr>
            <td style={{ ...cel, textAlign: 'right', fontWeight: 700 }} colSpan={4}>
              Costo diario de ejecución ($/día)
            </td>
            <td style={{ ...celNum, fontWeight: 700 }}>{n2(r.costoDiario)}</td>
          </tr>
        </tbody>
      </table>

      {/* Rendimiento */}
      <table style={{ ...tabla, marginBottom: 12 }}>
        <tbody>
          <tr>
            <td style={{ ...cel, fontWeight: 700, width: 130 }}>Rendimiento</td>
            <td style={cel}>
              {esTransporte
                ? `Carga ${cfg.cargaTn} tn  ·  Recorrido ${n0(cfg.rendimiento)} km/día`
                : `${n0(cfg.rendimiento)} ${u === '$/m' ? 'm' : 'tn'}/día`}
            </td>
            <td style={{ ...celTit, width: 130 }}>Costo unitario</td>
            <td style={{ ...celNum, width: 116, fontWeight: 700 }}>
              {n2(r.costoUnitarioEjecucion)} <span style={{ fontWeight: 400 }}>{u}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 2 y 3 */}
      {[
        { t: '2. MATERIALES', filas: cfg.materiales.map(m => [m.designacion, m.unidad, String(m.cantidad), n2(m.costoOrigen), n2(m.costoOrigen * m.cantidad)]), total: r.costoUnitarioMateriales },
        { t: '3. HERRAMIENTAS MENORES Y TRANSPORTE INTERNO', filas: cfg.herramientas.map(h => [h.designacion, '', String(h.cantidad), n2(h.valor), n2(h.valor)]), total: r.costoUnitarioHerramientas },
      ].map(sec => (
        <div key={sec.t} style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{sec.t}</div>
          <table style={tabla}>
            <thead>
              <tr>
                <td style={{ ...celTit, width: 26 }}>Nº</td>
                <td style={celTit}>Designación</td>
                <td style={{ ...celTit, width: 58 }}>Unidad</td>
                <td style={{ ...celTit, width: 70 }}>Cantidad</td>
                <td style={{ ...celTit, width: 108 }}>Costo origen</td>
                <td style={{ ...celTit, width: 116 }}>Total</td>
              </tr>
            </thead>
            <tbody>
              {sec.filas.length > 0 ? sec.filas.map((f, i) => (
                <tr key={i}>
                  <td style={{ ...cel, textAlign: 'center' }}>{i + 1}</td>
                  <td style={cel}>{f[0] || '—'}</td>
                  <td style={{ ...cel, textAlign: 'center' }}>{f[1]}</td>
                  <td style={celNum}>{f[2]}</td>
                  <td style={celNum}>{f[3]}</td>
                  <td style={celNum}>{f[4]}</td>
                </tr>
              )) : (
                <tr><td style={{ ...cel, textAlign: 'center', color: '#888' }} colSpan={6}>—</td></tr>
              )}
              <tr>
                <td style={{ ...cel, textAlign: 'right', fontWeight: 700, background: '#f4f4f4' }} colSpan={5}>
                  Costo unitario ({u})
                </td>
                <td style={{ ...celNum, fontWeight: 700, background: '#f4f4f4' }}>{n2(sec.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      {/* RESUMEN */}
      <div style={{ fontWeight: 700, marginBottom: 4, marginTop: 4 }}>RESUMEN</div>
      <table style={tabla}>
        <tbody>
          {[
            ['1. Ejecución',   r.costoUnitarioEjecucion],
            ['2. Materiales',  r.costoUnitarioMateriales],
            ['3. Herramientas menores y transporte interno', r.costoUnitarioHerramientas],
          ].map(([lbl, v]) => (
            <tr key={lbl as string}>
              <td style={cel}>{lbl}</td>
              <td style={{ ...celNum, width: 130 }}>{n2(v as number)}</td>
              <td style={{ ...cel, width: 62, textAlign: 'center' }}>{u}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cel, fontWeight: 700, background: '#f4f4f4' }}>Costo — costo</td>
            <td style={{ ...celNum, fontWeight: 700, background: '#f4f4f4' }}>{n2(r.costoCosto)}</td>
            <td style={{ ...cel, textAlign: 'center', background: '#f4f4f4' }}>{u}</td>
          </tr>
          <tr>
            <td style={cel}>Coeficiente resumen</td>
            <td style={celNum}>{coef.coeficienteResumen}</td>
            <td style={cel} />
          </tr>
          <tr>
            <td style={{ ...cel, fontWeight: 700 }}>Precio calculado</td>
            <td style={{ ...celNum, fontWeight: 700 }}>{n2(r.precioCalculado)}</td>
            <td style={{ ...cel, textAlign: 'center' }}>{u}</td>
          </tr>
          {cfg.precioAdoptado.valor != null && (
            <tr>
              <td style={{ ...cel, fontWeight: 700, background: '#e8e8e8' }}>Precio adoptado</td>
              <td style={{ ...celNum, fontWeight: 700, background: '#e8e8e8' }}>{n2(precio)}</td>
              <td style={{ ...cel, textAlign: 'center', background: '#e8e8e8' }}>{u}</td>
            </tr>
          )}
          {esTransporte && distanciaKm != null && distanciaKm > 0 && (
            <>
              <tr>
                <td style={cel}>Distancia</td>
                <td style={celNum}>{n2(distanciaKm)}</td>
                <td style={{ ...cel, textAlign: 'center' }}>km</td>
              </tr>
              <tr>
                <td style={{ ...cel, fontWeight: 700, background: '#e8e8e8' }}>Precio por tonelada</td>
                <td style={{ ...celNum, fontWeight: 700, background: '#e8e8e8' }}>{n2(precio * distanciaKm)}</td>
                <td style={{ ...cel, textAlign: 'center', background: '#e8e8e8' }}>$/tn</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </Hoja>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function PlanillasImprimibles({
  analisis, tramos, coef, mdo, color = '#90A4AE',
}: {
  analisis: AnalisisRipio
  tramos: TramoComputo[]
  coef: Coeficientes
  mdo: CostosMdeO
  color?: string
}) {
  const a = analisis
  const dolar = a.precios.dolar

  const [incluir, setIncluir] = useState<Record<string, boolean>>({
    caratula: true, computo: true, apu: true, presupuesto: true,
  })

  const computo = useMemo(() => calcularComputo(tramos), [tramos])
  const toneladas = valorEfectivo(computo.toneladasCalculado, a.toneladasAdoptadas)
  const metros    = valorEfectivo(computo.largoTotalM,        a.metrosAdoptados)

  const resultados = useMemo(() => {
    const out = {} as Record<ClaveAPU, ResultadoAPU>
    for (const k of CLAVES_APU) out[k] = calcularAPU(paramsAPU(k, a.apu[k]), coef, mdo, dolar)
    return out
  }, [a.apu, coef, mdo, dolar])

  const precioDe = (k: ClaveAPU) => valorEfectivo(resultados[k].precioCalculado, a.apu[k].precioAdoptado)

  const pres = useMemo(() => calcularPresupuesto({
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [toneladas, metros, a.datos, a.movilizacion, resultados])

  // Numeración de hojas según lo que se incluya
  const hojas: string[] = []
  if (incluir.caratula)    hojas.push('caratula')
  if (incluir.computo)     hojas.push('computo')
  if (incluir.apu)         CLAVES_APU.forEach(k => hojas.push(`apu:${k}`))
  if (incluir.presupuesto) hojas.push('presupuesto')
  const totalHojas = hojas.length
  const nro = (id: string) => hojas.indexOf(id) + 1

  const cargas = desgloseCargas(a.manoObra)

  const chk: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
    fontFamily: 'monospace', color: '#bbb', cursor: 'pointer',
  }

  return (
    <div>
      {/* ── Controles ── */}
      <div className="no-print" style={{
        background: '#0c0c0c', border: '1px solid #1e1e1e', padding: '12px 14px',
        marginBottom: 16, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 12, color, letterSpacing: 1, textTransform: 'uppercase',
          fontFamily: 'monospace',
        }}>
          Legajo · {totalHojas} hoja{totalHojas === 1 ? '' : 's'}
        </span>

        {([
          ['caratula',    'Carátula'],
          ['computo',     'Cómputo métrico'],
          ['apu',         'Análisis de precios (4)'],
          ['presupuesto', 'Presupuesto oficial'],
        ] as const).map(([k, lbl]) => (
          <label key={k} style={chk}>
            <input type="checkbox" checked={incluir[k]}
              onChange={e => setIncluir(p => ({ ...p, [k]: e.target.checked }))}
              style={{ accentColor: '#F5C300', width: 14, height: 14, cursor: 'pointer' }} />
            {lbl}
          </label>
        ))}

        <button
          onClick={() => window.print()}
          disabled={totalHojas === 0}
          style={{
            marginLeft: 'auto', background: totalHojas ? '#F5C300' : '#222',
            border: 'none', color: totalHojas ? '#111' : '#555', fontWeight: 700,
            fontSize: 13, padding: '8px 18px', cursor: totalHojas ? 'pointer' : 'default',
            letterSpacing: 0.8, fontFamily: 'monospace',
          }}>
          🖨 Imprimir legajo
        </button>
      </div>

      <div className="no-print" style={{
        fontSize: 12, color: '#555', fontFamily: 'monospace',
        marginBottom: 14, lineHeight: 1.5,
      }}>
        La composición cartográfica se imprime desde su propia pestaña: es un mapa en vivo
        y necesita su propio encuadre.
      </div>

      {/* ── Hojas ── */}
      <div className="legajo">

        {/* CARÁTULA */}
        {incluir.caratula && (
          <Hoja n={nro('caratula')} total={totalHojas}>
            <Encabezado datos={a.datos} titulo="Datos de la obra" />

            <table style={{ ...tabla, marginBottom: 14 }}>
              <tbody>
                {([
                  ['Origen',  a.datos.origen],
                  ['Destino', a.datos.destino],
                  ['Material', a.datos.material],
                  ['Tipo',     a.datos.tipoMaterial],
                  ['Fecha',    a.datos.fecha],
                ] as [string, string][]).filter(([, v]) => v).map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ ...cel, width: 150, fontWeight: 700, background: '#f4f4f4' }}>{k}</td>
                    <td style={cel}>{v}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...cel, fontWeight: 700, background: '#f4f4f4' }}>Distancia pavimentada</td>
                  <td style={cel}>{n2(a.datos.distanciaPavKm)} km</td>
                </tr>
                <tr>
                  <td style={{ ...cel, fontWeight: 700, background: '#f4f4f4' }}>Distancia no pavimentada</td>
                  <td style={cel}>{n2(a.datos.distanciaNoPavKm)} km</td>
                </tr>
                <tr>
                  <td style={{ ...cel, fontWeight: 700, background: '#f4f4f4' }}>Distancia total</td>
                  <td style={{ ...cel, fontWeight: 700 }}>
                    {n2(a.datos.distanciaPavKm + a.datos.distanciaNoPavKm)} km
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ fontWeight: 700, marginBottom: 4 }}>PRECIOS DE REFERENCIA</div>
            <table style={{ ...tabla, marginBottom: 14 }}>
              <tbody>
                {([
                  ['Gas oil',              `${n2(a.precios.gasoil)} $/lt`],
                  ['Neumático',            `${n2(a.precios.neumatico)} $/un`],
                  ['Dólar',                `${n2(a.precios.dolar)} $`],
                  ['Oficial especializado', `${n2(a.precios.jornalOficialEsp)} $/hs`],
                  ['Oficial',              `${n2(a.precios.jornalOficial)} $/hs`],
                  ['Medio oficial',        `${n2(a.precios.jornalMedioOficial)} $/hs`],
                  ['Ayudante',             `${n2(a.precios.jornalAyudante)} $/hs`],
                  ['Ripio en cantera',     `${n2(a.precios.ripio)} $/tn`],
                ] as [string, string][]).map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ ...cel, width: 220 }}>{k}</td>
                    <td style={celNum}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontWeight: 700, marginBottom: 4 }}>COEFICIENTE RESUMEN</div>
            <table style={{ ...tabla, marginBottom: 14 }}>
              <tbody>
                {([
                  ['Costo', '1,0000'],
                  [`Gastos generales  ${nx(a.coeficientes.gastosGenerales * 100, 1)} %`, nx(a.coeficientes.gastosGenerales, 4)],
                  [`Beneficio  ${nx(a.coeficientes.beneficio * 100, 1)} %`, nx(a.coeficientes.beneficio, 4)],
                  ['Subtotal', nx(coef.subtotalCostoGGBeneficio, 4)],
                  [`Gastos financieros  ${nx(a.coeficientes.gastosFinancieros * 100, 1)} % s/subtotal`,
                    nx(coef.conGastosFinancieros - coef.subtotalCostoGGBeneficio, 4)],
                  ['Subtotal', nx(coef.conGastosFinancieros, 4)],
                  [`IVA e Ingresos Brutos  ${nx(a.coeficientes.ivaIngBrutos * 100, 1)} % s/subtotal`,
                    nx(coef.montoIvaIngBrutos, 4)],
                ] as [string, string][]).map(([k, v], i) => (
                  <tr key={i}>
                    <td style={cel}>{k}</td>
                    <td style={{ ...celNum, width: 130 }}>{v}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...cel, fontWeight: 700, background: '#e8e8e8' }}>Coeficiente resumen</td>
                  <td style={{ ...celNum, fontWeight: 700, background: '#e8e8e8', fontSize: 12 }}>
                    {coef.coeficienteResumen}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ fontWeight: 700, marginBottom: 4 }}>MANO DE OBRA — COSTO HORARIO</div>
            <table style={tabla}>
              <thead>
                <tr>
                  <td style={celTit}>Categoría</td>
                  <td style={{ ...celTit, width: 96 }}>Jornal</td>
                  <td style={{ ...celTit, width: 110 }}>Costo real</td>
                  <td style={{ ...celTit, width: 96 }}>No rem.</td>
                  <td style={{ ...celTit, width: 110 }}>Costo horario</td>
                  <td style={{ ...celTit, width: 74 }}>Incid.</td>
                </tr>
              </thead>
              <tbody>
                {([
                  ['Oficial especializado', mdo.oficialEsp],
                  ['Oficial',               mdo.oficial],
                  ['Medio oficial',         mdo.medioOficial],
                  ['Ayudante',              mdo.ayudante],
                ] as const).map(([lbl, c]) => (
                  <tr key={lbl}>
                    <td style={cel}>{lbl}</td>
                    <td style={celNum}>{n2(c.jornal)}</td>
                    <td style={celNum}>{n2(c.costoRealHora)}</td>
                    <td style={celNum}>{n2(c.noRemunerativo)}</td>
                    <td style={{ ...celNum, fontWeight: 700 }}>{n2(c.costoHora)}</td>
                    <td style={celNum}>{c.incidencia}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>
              Cargas sociales {nx(cargas.total * 100, 2)} % sobre el bruto.
              Suma no remunerativa prorrateada sobre {a.manoObra.hsProrrateoNoRem} hs.
            </div>
          </Hoja>
        )}

        {/* CÓMPUTO MÉTRICO */}
        {incluir.computo && (
          <Hoja n={nro('computo')} total={totalHojas}>
            <Encabezado datos={a.datos} titulo="Cómputos métricos" />

            <table style={tabla}>
              <thead>
                <tr>
                  <td style={{ ...celTit, width: 52 }} rowSpan={2}>Nº ítem</td>
                  <td style={celTit} rowSpan={2}>Designación de la obra</td>
                  <td style={celTit} colSpan={4}>Cómputos métricos</td>
                  <td style={{ ...celTit, width: 52 }} rowSpan={2}>Unidad</td>
                  <td style={{ ...celTit, width: 96 }} rowSpan={2}>Cantidad</td>
                </tr>
                <tr>
                  <td style={{ ...celTit, width: 74 }}>Largo</td>
                  <td style={{ ...celTit, width: 62 }}>Ancho</td>
                  <td style={{ ...celTit, width: 62 }}>Espesor</td>
                  <td style={{ ...celTit, width: 62 }}>Dens.</td>
                </tr>
              </thead>
              <tbody>
                {/* I — PROVISIÓN */}
                <tr>
                  <td style={{ ...cel, textAlign: 'center', fontWeight: 700 }}>I</td>
                  <td style={{ ...cel, fontWeight: 700 }} colSpan={5}>PROVISIÓN</td>
                  <td style={{ ...cel, textAlign: 'center' }}>tn</td>
                  <td style={{ ...celNum, fontWeight: 700 }}>{n2(toneladas)}</td>
                </tr>
                <tr>
                  <td style={cel} />
                  <td style={cel} colSpan={7}>
                    Material: {a.datos.material || '—'} · Tipo: {a.datos.tipoMaterial || '—'}
                  </td>
                </tr>
                {computo.porTramo.map(t => {
                  const src = tramos.find(x => x.id === t.id)
                  return (
                    <tr key={t.id}>
                      <td style={cel} />
                      <td style={{ ...cel, paddingLeft: 16 }}>{t.nombre}</td>
                      <td style={celNum}>{n2(t.largoM)}</td>
                      <td style={celNum}>{src?.anchoM ?? '—'}</td>
                      <td style={celNum}>{src?.espesorM ?? '—'}</td>
                      <td style={celNum}>{src?.densidad ?? '—'}</td>
                      <td style={{ ...cel, textAlign: 'center' }}>tn</td>
                      <td style={celNum}>{n2(t.toneladas)}</td>
                    </tr>
                  )
                })}
                {tramos.length === 0 && (
                  <tr><td style={{ ...cel, textAlign: 'center', color: '#888' }} colSpan={8}>Sin tramos cargados</td></tr>
                )}
                <tr>
                  <td style={cel} colSpan={5} />
                  <td style={{ ...cel, textAlign: 'right' }}>Calculado</td>
                  <td style={{ ...cel, textAlign: 'center' }}>tn</td>
                  <td style={celNum}>{n2(computo.toneladasCalculado)}</td>
                </tr>
                <tr>
                  <td style={cel} colSpan={5} />
                  <td style={{ ...cel, textAlign: 'right' }}>Redondeo</td>
                  <td style={{ ...cel, textAlign: 'center' }}>tn</td>
                  <td style={celNum}>{n2(toneladas - computo.toneladasCalculado)}</td>
                </tr>
                <tr>
                  <td style={cel} colSpan={5} />
                  <td style={{ ...cel, textAlign: 'right', fontWeight: 700, background: '#f4f4f4' }}>Total</td>
                  <td style={{ ...cel, textAlign: 'center', background: '#f4f4f4' }}>tn</td>
                  <td style={{ ...celNum, fontWeight: 700, background: '#f4f4f4' }}>{n2(toneladas)}</td>
                </tr>

                {/* II — TRANSPORTE */}
                <tr><td style={{ ...cel, height: 8 }} colSpan={8} /></tr>
                <tr>
                  <td style={{ ...cel, textAlign: 'center', fontWeight: 700 }}>II</td>
                  <td style={{ ...cel, fontWeight: 700 }} colSpan={5}>TRANSPORTE Y DESCARGA</td>
                  <td style={{ ...cel, textAlign: 'center' }}>tn</td>
                  <td style={{ ...celNum, fontWeight: 700 }}>{n2(toneladas)}</td>
                </tr>
                <tr>
                  <td style={cel} />
                  <td style={cel} colSpan={7}>
                    Origen: {a.datos.origen || '—'} · Destino: {a.datos.destino || '—'}
                  </td>
                </tr>
                {([
                  ['Calzada no pavimentada', a.datos.distanciaNoPavKm],
                  ['Calzada pavimentada',    a.datos.distanciaPavKm],
                ] as [string, number][]).map(([lbl, km]) => (
                  <tr key={lbl}>
                    <td style={cel} />
                    <td style={{ ...cel, paddingLeft: 16 }}>{lbl}</td>
                    <td style={celNum}>{n2(km)}</td>
                    <td style={{ ...cel, textAlign: 'center' }} colSpan={3}>km</td>
                    <td style={{ ...cel, textAlign: 'center' }}>tn</td>
                    <td style={celNum}>{km > 0 ? n2(toneladas) : '—'}</td>
                  </tr>
                ))}
                <tr>
                  <td style={cel} colSpan={5} />
                  <td style={{ ...cel, textAlign: 'right', fontWeight: 700, background: '#f4f4f4' }}>Distancia total</td>
                  <td style={{ ...cel, textAlign: 'center', background: '#f4f4f4' }}>km</td>
                  <td style={{ ...celNum, fontWeight: 700, background: '#f4f4f4' }}>
                    {n2(a.datos.distanciaNoPavKm + a.datos.distanciaPavKm)}
                  </td>
                </tr>

                {/* III — EJECUCIÓN */}
                <tr><td style={{ ...cel, height: 8 }} colSpan={8} /></tr>
                <tr>
                  <td style={{ ...cel, textAlign: 'center', fontWeight: 700 }}>III</td>
                  <td style={{ ...cel, fontWeight: 700 }} colSpan={5}>EJECUCIÓN</td>
                  <td style={{ ...cel, textAlign: 'center' }}>m</td>
                  <td style={{ ...celNum, fontWeight: 700 }}>{n2(metros)}</td>
                </tr>
                <tr>
                  <td style={cel} />
                  <td style={cel} colSpan={7}>Tramo: {a.datos.tramo || '—'}</td>
                </tr>
                <tr>
                  <td style={cel} colSpan={5} />
                  <td style={{ ...cel, textAlign: 'right' }}>Calculado</td>
                  <td style={{ ...cel, textAlign: 'center' }}>m</td>
                  <td style={celNum}>{n2(computo.largoTotalM)}</td>
                </tr>
                <tr>
                  <td style={cel} colSpan={5} />
                  <td style={{ ...cel, textAlign: 'right' }}>Redondeo</td>
                  <td style={{ ...cel, textAlign: 'center' }}>m</td>
                  <td style={celNum}>{n2(metros - computo.largoTotalM)}</td>
                </tr>
                <tr>
                  <td style={cel} colSpan={5} />
                  <td style={{ ...cel, textAlign: 'right', fontWeight: 700, background: '#f4f4f4' }}>Total</td>
                  <td style={{ ...cel, textAlign: 'center', background: '#f4f4f4' }}>m</td>
                  <td style={{ ...celNum, fontWeight: 700, background: '#f4f4f4' }}>{n2(metros)}</td>
                </tr>
              </tbody>
            </table>
          </Hoja>
        )}

        {/* ANÁLISIS DE PRECIO — cuatro hojas */}
        {incluir.apu && CLAVES_APU.map(k => (
          <HojaAPU
            key={k} clave={k} a={a} r={resultados[k]} coef={coef} mdo={mdo}
            distanciaKm={k === 'transNoPav' ? a.datos.distanciaNoPavKm
                       : k === 'transPav'   ? a.datos.distanciaPavKm : undefined}
            n={nro(`apu:${k}`)} total={totalHojas}
          />
        ))}

        {/* PRESUPUESTO OFICIAL */}
        {incluir.presupuesto && (
          <Hoja n={nro('presupuesto')} total={totalHojas}>
            <Encabezado datos={a.datos} titulo="Presupuesto oficial" />

            <table style={tabla}>
              <thead>
                <tr>
                  <td style={{ ...celTit, width: 52 }} rowSpan={2}>Nº ítem</td>
                  <td style={celTit} rowSpan={2}>Designación de obra</td>
                  <td style={{ ...celTit, width: 44 }} rowSpan={2}>Un.</td>
                  <td style={{ ...celTit, width: 88 }} rowSpan={2}>Cantidad</td>
                  <td style={celTit} colSpan={2}>Precio</td>
                </tr>
                <tr>
                  <td style={{ ...celTit, width: 110 }}>Unitario</td>
                  <td style={{ ...celTit, width: 140 }}>Parcial</td>
                </tr>
              </thead>
              <tbody>
                {pres.items.map((it, i) => {
                  const primero = i === 0 || pres.items[i - 1].numero !== it.numero
                  return (
                    <tr key={i}>
                      <td style={{ ...cel, textAlign: 'center', fontWeight: 700 }}>
                        {primero ? it.numero : ''}
                      </td>
                      <td style={cel}>
                        {primero && <div style={{ fontWeight: 700 }}>{it.designacion}</div>}
                        {it.detalle && (
                          <div style={{ paddingLeft: primero ? 12 : 0 }}>{it.detalle}</div>
                        )}
                      </td>
                      <td style={{ ...cel, textAlign: 'center' }}>{it.unidad}</td>
                      <td style={celNum}>{n2(it.cantidad)}</td>
                      <td style={celNum}>{n2(it.precioUnitario)}</td>
                      <td style={celNum}>{it.parcial > 0 ? `$ ${n2(it.parcial)}` : '$   —'}</td>
                    </tr>
                  )
                })}
                <tr>
                  <td style={{ ...cel, textAlign: 'right', fontWeight: 700, letterSpacing: 2, background: '#f4f4f4' }} colSpan={5}>
                    T O T A L
                  </td>
                  <td style={{ ...celNum, fontWeight: 700, fontSize: 12, background: '#e8e8e8' }}>
                    $ {n2(pres.total)}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{
              marginTop: 14, padding: '8px 10px', border: '0.7px solid #444',
              lineHeight: 1.5,
            }}>
              El presupuesto oficial asciende a la suma de{' '}
              <b>{montoEnLetras(pres.total)}</b> <b>($ {n2(pres.total)}).</b>
            </div>
          </Hoja>
        )}
      </div>

      {/* CSS de impresión: varias hojas A4 encadenadas */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body {
            margin: 0 !important; padding: 0 !important;
            background: #fff !important;
          }
          body * { visibility: hidden; }
          .legajo, .legajo * { visibility: visible; }
          .legajo {
            position: absolute !important; top: 0 !important; left: 0 !important;
            width: 210mm !important;
          }
          .hoja {
            width: 210mm !important; min-height: 297mm !important;
            margin: 0 !important; box-shadow: none !important;
            page-break-after: always; break-after: page;
          }
          .hoja:last-child { page-break-after: auto; break-after: auto; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  )
}
