'use client'
/**
 * Elegir qué período mirar, y ver qué datos tiene ese período.
 *
 * ── El problema que resuelve ──────────────────────────────────────────────────
 *
 * Había **tres acciones que se veían parecidas y no lo son**:
 *
 *   1. cambiar lo que se mira — gratis, instantáneo
 *   2. descargar la serie del modelo — gasta cupo, tarda minutos, sólo admin
 *   3. interpolar los pluviómetros — gratis, instantáneo, sólo admin
 *
 * Las fechas ya se aplicaban solas al cambiarlas, así que el único botón visible
 * del panel —"↻ Actualizar rango"— parecía el "aplicar" y en realidad disparaba
 * la ingesta. "Actualizar" suena a refrescar la pantalla: el que quería ver otro
 * rango lo apretaba siempre.
 *
 * Acá van en **dos bloques separados**: arriba lo que cambia la vista, abajo lo
 * que toca datos, con lo que cuesta escrito al lado. Que estén separados importa
 * más que cómo se llamen.
 *
 * ── Los botones aparecen sólo si harían algo ──────────────────────────────────
 *
 * Explicar en un pie para qué sirve cada botón no alcanzó, y el motivo es que la
 * explicación era abstracta cuando la respuesta es concreta: **la pantalla ya
 * sabe** —por `cobertura`— si descargar traería algún día que falta y si
 * interpolar cambiaría alguna fila. Si no cambian nada, no se muestran.
 *
 * Es la misma regla que se aplicó con `sin_parte`: **un botón que no puede
 * cambiar nada es peor que no tener botón.** Ahí el cartel ofrecía «Recalcular»
 * sobre días que la APA nunca publicó, uno lo apretaba y el cartel volvía igual.
 *
 * Con todo al día no queda ningún botón, sólo el estado y una línea que dice que
 * lo trae el cron todos los días. Volver a descargar sigue siendo posible —hace
 * falta si se regeneran los puntos de muestreo desde QGIS— pero como enlace
 * chico, que es lo que es: una excepción.
 *
 * ── Dos detalles que no son obvios ────────────────────────────────────────────
 *
 * **Descargar ya interpola.** La ingesta llama a la fusión internamente, así que
 * no son dos pasos en orden. Interpolar por separado sirve para cuando la APA
 * publicó el parte *después* de que se bajó la serie, que es lo habitual porque
 * carga con retraso.
 *
 * **Sólo se confirma lo que cuesta.** Descargar tarda, gasta cupo y no se puede
 * cancelar a la mitad: abre un diálogo que dice esas tres cosas con números.
 * Interpolar es gratis e instantáneo, y pedirle confirmación sería fricción sin
 * motivo.
 */

import { useState } from 'react'
import { mmRedondeado, type Episodio } from '@/lib/lluvia'

const mono: React.CSSProperties = { fontFamily: 'monospace' }
const fmtCorta = (f: string) => {
  const [, m, d] = f.split('-')
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${Number(d)} ${meses[Number(m) - 1]}`
}

export interface PuntoSerie { fecha: string; mm: number | null }

export interface Cobertura {
  dias: number
  conSerie: number
  interpolados: number
  sinParte: number
}

interface Props {
  desde: string
  hasta: string
  hoy: string
  episodios: Episodio[]
  serie: PuntoSerie[]
  cobertura: Cobertura | null
  esAdmin: boolean
  onRango: (desde: string, hasta: string) => void
  onDescargar: () => void
  onInterpolar: () => void
  descargando: boolean
  interpolando: boolean
  progreso: { hecho: number; total: number } | null
  onDescargarCsv?: () => void
}

/** Un botón del grupo de presets */
function Preset({ activo, onClick, children }: {
  activo: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} style={{
      ...mono, fontSize: 12, cursor: 'pointer', padding: '5px 11px', borderRadius: 3,
      background: activo ? 'rgba(245,195,0,0.10)' : 'transparent',
      border: `1px solid ${activo ? '#5a4400' : '#2a2e32'}`,
      color: activo ? '#F5C300' : '#7d848c',
    }}>{children}</button>
  )
}

export default function SelectorPeriodo({
  desde, hasta, hoy, episodios, serie, cobertura, esAdmin,
  onRango, onDescargar, onInterpolar, descargando, interpolando, progreso,
  onDescargarCsv,
}: Props) {
  const [verFechas, setVerFechas] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  const dias = cobertura?.dias ?? 0

  /*
   * Qué haría cada botón, para decidir si mostrarlo.
   *
   * `sinParte` **no** se cuenta como pendiente: son días que la APA nunca
   * publicó y que no se van a poder interpolar jamás. Meterlos en la cuenta era
   * exactamente el error del cartel viejo — ofrecía arreglar algo que no tiene
   * arreglo, y volvía a aparecer después de apretarlo.
   */
  const faltanDias    = Math.max(0, dias - (cobertura?.conSerie ?? 0))
  const porInterpolar = Math.max(0,
    (cobertura?.conSerie ?? 0) - (cobertura?.interpolados ?? 0) - (cobertura?.sinParte ?? 0))
  const alDia = cobertura !== null && faltanDias === 0 && porInterpolar === 0
  const enEpisodio = episodios.some(e => e.desde === desde && e.hasta === hasta)

  /** ¿Este preset de N días es el rango actual? */
  const esPreset = (d: number) => {
    const t = Date.parse(hasta) - Date.parse(desde)
    return hasta === hoy && Math.round(t / 86_400_000) + 1 === d
  }

  const maxSerie = Math.max(1, ...serie.map(p => p.mm ?? 0))

  /**
   * Clickear una barra elige el evento entero, no el día suelto.
   *
   * Es lo que uno quiere el 90 % de las veces: los picos de la línea **son** los
   * eventos. Con esto la fila de chips de evento dejó de hacer falta, y eran
   * 50 px permanentes que le comían altura al mapa.
   */
  const alClickearDia = (fecha: string) => {
    const e = episodios.find(x => fecha >= x.desde && fecha <= x.hasta)
    if (e) onRango(e.desde, e.hasta)
    else onRango(fecha, fecha)
  }

  return (
    <div style={{ flexShrink: 0, marginBottom: 12 }}>

      {/* ── 1 · Qué período mirar ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ ...mono, fontSize: 11, color: '#6a7078', letterSpacing: 0.8,
          textTransform: 'uppercase', marginRight: 4 }}>
          Período
        </span>
        {episodios.length > 0 && (
          <Preset activo={enEpisodio} onClick={() => onRango(episodios[0].desde, episodios[0].hasta)}>
            Eventos
          </Preset>
        )}
        {[7, 30, 90].map(d => (
          <Preset key={d} activo={esPreset(d)}
            onClick={() => {
              const inicio = new Date(Date.parse(hoy) - (d - 1) * 86_400_000)
              onRango(inicio.toISOString().slice(0, 10), hoy)
            }}>
            {d} días
          </Preset>
        ))}
        <Preset activo={verFechas} onClick={() => setVerFechas(v => !v)}>Fechas…</Preset>

        {onDescargarCsv && (
          <button onClick={onDescargarCsv} style={{
            ...mono, fontSize: 12, cursor: 'pointer', padding: '5px 11px', borderRadius: 3,
            marginLeft: 'auto', background: 'transparent',
            border: '1px solid #2a2e32', color: '#7d848c',
          }}>
            Descargar CSV por camino
          </button>
        )}
      </div>

      {verFechas && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 10,
          background: '#191919', border: '1px solid #1e1e1e', padding: '10px 13px' }}>
          <label style={{ ...mono, fontSize: 11, color: '#6a7078' }}>
            <span style={{ display: 'block', marginBottom: 3 }}>Desde</span>
            <input type="date" value={desde} max={hasta}
              onChange={e => onRango(e.target.value, hasta)}
              style={{ background: '#0a0a0a', border: '1px solid #222', color: '#ddd',
                padding: '6px 9px', fontSize: 13, ...mono, outline: 'none' }} />
          </label>
          <label style={{ ...mono, fontSize: 11, color: '#6a7078' }}>
            <span style={{ display: 'block', marginBottom: 3 }}>Hasta</span>
            <input type="date" value={hasta} min={desde} max={hoy}
              onChange={e => onRango(desde, e.target.value)}
              style={{ background: '#0a0a0a', border: '1px solid #222', color: '#ddd',
                padding: '6px 9px', fontSize: 13, ...mono, outline: 'none' }} />
          </label>
        </div>
      )}

      {/*
        La línea de tiempo.
        Convierte un rango de fechas abstracto en algo que se ve: dónde cayó
        agua, cuándo, y dónde está parado el período elegido. Cada barra es la
        lámina máxima de la provincia ese día — el máximo y no el promedio,
        porque un temporal sobre tres consorcios desaparece en un promedio de
        103. Clickear una barra elige el evento al que pertenece ese día.
      */}
      {serie.length > 0 && (
        <div style={{ background: '#1b1e21', borderRadius: 4, padding: '9px 12px', marginBottom: 10 }}>
          {/*
            Dos extremos y nada en el medio. Con un texto centrado, en cuanto el
            de la izquierda crecía un poco se le montaba encima: "27 jun" quedaba
            tapado por la descripción.
          */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            gap: 16, ...mono, fontSize: 11, color: '#5e656d', marginBottom: 7 }}>
            <span>
              {fmtCorta(serie[0].fecha)} → {fmtCorta(serie[serie.length - 1].fecha)}
              <span style={{ color: '#4e555c' }}> · lámina máxima diaria · clic para elegir el evento</span>
            </span>
            <span style={{ fontSize: 12, color: '#8b9299', whiteSpace: 'nowrap' }}>
              <b style={{ color: '#F5C300', fontWeight: 400 }}>
                {desde === hasta ? fmtCorta(desde) : `${fmtCorta(desde)} → ${fmtCorta(hasta)}`}
              </b>
              {dias > 0 && <> · {dias} {dias === 1 ? 'día' : 'días'}</>}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 34 }}>
            {serie.map(p => {
              const dentro = p.fecha >= desde && p.fecha <= hasta
              const mm = p.mm ?? 0
              const alto = p.mm === null ? 2 : Math.max(2, Math.round((mm / maxSerie) * 40))
              return (
                <div key={p.fecha}
                  onClick={() => alClickearDia(p.fecha)}
                  title={`${fmtCorta(p.fecha)} · ${p.mm === null ? 'sin dato' : mmRedondeado(mm)}`}
                  style={{
                    flex: 1, height: alto, cursor: 'pointer', minWidth: 2,
                    background: dentro ? '#F5C300' : p.mm === null ? '#262a2e' : mm > 0 ? '#3f6f96' : '#2c3136',
                    boxShadow: dentro ? '0 0 0 1px #5a4400' : undefined,
                  }} />
              )
            })}
          </div>
        </div>
      )}

      {/* Los eventos detectados, como accesos directos */}
      {/* ── 2 · Datos de este período ─────────────────────────────────────── */}
      {esAdmin && cobertura && (
        <div style={{ background: '#1b1e21', borderRadius: 4, padding: '10px 12px' }}>
          {/*
            La etiqueta va **dentro** de la fila y no en un renglón propio: da el
            ancla para entender qué es esto sin gastar una línea entera de alto.
          */}
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center',
            ...mono, fontSize: 12, color: '#8b9299' }}>
            <span style={{ fontSize: 11, color: '#6a7078', letterSpacing: 0.8,
              textTransform: 'uppercase' }}>
              Datos
            </span>
            <span>
              <b style={{ color: cobertura.conSerie >= cobertura.dias ? '#5DCAA5' : '#EF9F27',
                fontWeight: 400 }}>●</b>{' '}
              Serie modelada · {cobertura.conSerie} de {cobertura.dias} días
            </span>
            <span>
              <b style={{ color: cobertura.interpolados > 0 ? '#85B7EB' : '#6a7078',
                fontWeight: 400 }}>●</b>{' '}
              Pluviómetros interpolados · {cobertura.interpolados} de {cobertura.dias} días
            </span>
            {cobertura.sinParte > 0 && (
              <span style={{ color: '#6a7078' }}>
                ● {cobertura.sinParte} {cobertura.sinParte === 1 ? 'día' : 'días'} sin parte de la APA
              </span>
            )}

            <span style={{ flex: 1 }} />

            {/*
              Descargar aparece sólo si hay días sin serie. Si están todos, el
              botón no puede traer nada nuevo: la excepción va como enlace abajo.
            */}
            {(faltanDias > 0 || descargando) && (
              <button onClick={() => setConfirmando(true)} disabled={descargando}
                style={{
                  ...mono, fontSize: 12, padding: '6px 11px', borderRadius: 3,
                  cursor: descargando ? 'default' : 'pointer', background: 'transparent',
                  border: `1px solid ${descargando ? '#333' : '#2e5540'}`,
                  color: descargando ? '#555' : '#7BC47F',
                }}>
                {descargando
                  ? progreso ? `Descargando ${progreso.hecho + 1} de ${progreso.total}…` : 'Descargando…'
                  : `Descargar los ${faltanDias} días que faltan…`}
              </button>
            )}

            {/*
              Interpolar aparece sólo si hay días con serie y con parte de la APA
              que todavía no se cruzaron. Los `sinParte` no cuentan: no se van a
              poder interpolar nunca.
            */}
            {(porInterpolar > 0 || interpolando) && (
              <button onClick={onInterpolar} disabled={interpolando}
                style={{
                  ...mono, fontSize: 12, padding: '6px 11px', borderRadius: 3,
                  cursor: interpolando ? 'default' : 'pointer', background: 'transparent',
                  border: `1px solid ${interpolando ? '#333' : '#2a3f55'}`,
                  color: interpolando ? '#555' : '#85B7EB',
                }}>
                {interpolando
                  ? 'Interpolando…'
                  : `Interpolar ${porInterpolar} ${porInterpolar === 1 ? 'día' : 'días'} (IDW)`}
              </button>
            )}
          </div>

          <div style={{ ...mono, fontSize: 11, color: '#5e656d', marginTop: 8 }}>
            {alDia ? (
              <>
                El período está completo. La serie se descarga sola todos los días;
                no hace falta tocar nada.
                {' '}
                <button onClick={() => setConfirmando(true)} disabled={descargando}
                  style={{
                    ...mono, fontSize: 11, padding: 0, border: 'none', background: 'none',
                    color: '#5e656d', textDecoration: 'underline', cursor: 'pointer',
                  }}>
                  Volver a descargarla
                </button>
                {' '}sólo si se regeneraron los puntos de muestreo.
              </>
            ) : porInterpolar > 0 && faltanDias === 0 ? (
              'La APA publicó el parte después de que se bajó la serie. Interpolar es gratis e instantáneo.'
            ) : (
              'Descargar ya interpola al final: no son dos pasos en orden.'
            )}
          </div>
        </div>
      )}

      {/*
        La confirmación va sólo en la acción cara.
        Tarda, gasta cupo y no se puede cancelar a la mitad: las tres cosas van
        con número, que es lo que permite decidir.
      */}
      {confirmando && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setConfirmando(false)}>
          <div onClick={ev => ev.stopPropagation()} style={{
            background: '#1e2225', border: '1px solid #333a40', borderRadius: 4,
            padding: 16, maxWidth: 440, ...mono,
          }}>
            <div style={{ fontSize: 14, color: '#e4e8eb', marginBottom: 9 }}>
              Descargar la serie modelada de {dias} {dias === 1 ? 'día' : 'días'}
            </div>
            <div style={{ fontSize: 12, color: '#9aa1a8', lineHeight: 1.7, marginBottom: 12 }}>
              Consulta Open-Meteo en los 452 puntos de muestreo y guarda la lámina diaria
              de cada consorcio. Al terminar interpola los pluviómetros de la APA sobre
              esa misma grilla.
            </div>
            <div style={{ borderTop: '1px solid #2b3136', paddingTop: 10, marginBottom: 12 }}>
              {([
                ['Tarda', `~${Math.max(1, Math.ceil(dias / 14)) * 20} s`],
                ['Consume del cupo', `452 ubicaciones × ${Math.max(1, Math.ceil(dias / 14))} ventana(s)`],
                ['Pisa lo guardado', `sí, de ${dias === 1 ? 'este día' : `estos ${dias} días`}`],
              ] as const).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                  fontSize: 12, color: '#8b9299', padding: '2px 0' }}>
                  <span>{k}</span><span style={{ color: '#c9ced3' }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmando(false)} style={{
                ...mono, fontSize: 12, padding: '6px 12px', cursor: 'pointer',
                background: 'transparent', border: 'none', color: '#7d848c',
              }}>Cancelar</button>
              <button onClick={() => { setConfirmando(false); onDescargar() }} style={{
                ...mono, fontSize: 12, padding: '6px 12px', borderRadius: 3, cursor: 'pointer',
                background: 'rgba(46,85,64,.25)', border: '1px solid #2e5540', color: '#7BC47F',
              }}>Descargar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
