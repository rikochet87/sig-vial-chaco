'use client'
/**
 * El tiempo en el Dashboard: una tarjeta más en la fila de arriba, del mismo
 * alto que las otras.
 *
 * **La primera versión era una franja aparte** con una caja para alertas y otra
 * para la semana: con un día de tormentas listaba ocho avisos casi iguales, le
 * sacaba 70 px al mapa y se veía como otra pantalla metida adentro del tablero.
 * Ahora es una línea: la peor alerta vigente del SMN —agrupada por fenómeno y
 * nivel— y la semana en miniatura, con la máxima y la lluvia. El detalle está
 * en Hidrología → Tiempo.
 */
import Link from 'next/link'
import { useMemo } from 'react'
import { agruparAlertas, cieloDe, resumenProvincia } from '@/lib/tiempo'
import { useAlertasSmn } from './AlertasSmn'
import { usePronosticoTiempo } from './PanelTiempo'
import { COLOR_NIVEL, IconoCielo, fHora, mono, n0 } from './piezas'

const INICIAL = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const inicial = (f: string) => INICIAL[new Date(`${f}T12:00:00Z`).getUTCDay()]

/** 'sáb 03/10 15:00' + 'sáb 03/10 21:00' → 'sáb 15:00–21:00'; si cambia el día, los dos */
function ventana(inicio: string | null, fin: string | null): string {
  const a = fHora(inicio), b = fHora(fin)
  if (!inicio) return `hasta ${b}`
  return a.slice(0, 9) === b.slice(0, 9) ? `${a.slice(0, 3)} ${a.slice(10)}–${b.slice(10)}` : `${a.slice(0, 3)} ${a.slice(10)} → ${b.slice(0, 3)} ${b.slice(10)}`
}

export default function ResumenTiempo() {
  const alertas = useAlertasSmn()
  const { datos, error } = usePronosticoTiempo()
  const semana = useMemo(() => resumenProvincia(datos?.consorcios ?? []), [datos])
  const grupos = useMemo(() => agruparAlertas(alertas.datos?.alertas ?? []), [alertas.datos])
  const peor = grupos[0]

  return (
    <Link href="/dashboard/lluvia" title="Ver el tiempo por consorcio en Hidrología → Tiempo" style={{
      ...mono, display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none',
      background: '#191919', border: '1px solid #1e1e1e', borderLeft: '3px solid #F5C300',
      padding: '5px 14px', flex: 3, minWidth: 420,
    }}>
      <span style={{ color: '#8f8f8f', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>Tiempo</span>

      {/* La alerta: lo oficial va primero */}
      <span style={{ fontSize: 12, whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {alertas.error
          ? <span style={{ color: '#E8A87C' }}>SMN sin respuesta</span>
          : !alertas.datos
            ? <span style={{ color: '#8f8f8f' }}>…</span>
            : peor
              ? <>
                  <span style={{ display: 'inline-block', width: 7, height: 7, background: COLOR_NIVEL[peor.nivel], marginRight: 6 }} />
                  <span style={{ color: COLOR_NIVEL[peor.nivel] }}>{peor.evento}</span>
                  <span style={{ color: '#a0a0a0' }}> {ventana(peor.inicio, peor.fin)}</span>
                  {peor.consorcios.length > 0 && <span style={{ color: '#8f8f8f' }}> · {peor.consorcios.length} CC</span>}
                  {grupos.length > 1 && <span style={{ color: '#8f8f8f' }}> · +{grupos.length - 1}</span>}
                </>
              : <span style={{ color: '#8f8f8f' }}>sin alertas SMN</span>}
      </span>

      <span style={{ flex: 1 }} />

      {/* La semana: inicial del día, cielo —celeste si llueve en algún consorcio— y máxima */}
      {error
        ? <span style={{ color: '#E8A87C', fontSize: 12 }}>sin pronóstico</span>
        : <span style={{ display: 'flex', gap: 10 }}>
            {semana.map(d => {
              const c = cieloDe(d.codigo)
              return (
                <span key={d.fecha} title={`${c.texto} · ${n0(d.tMin)}°/${n0(d.tMax)}° · lluvia en ${d.conLluvia} consorcios, hasta ${n0(d.lluviaMax)} mm`}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15 }}>
                  <span style={{ fontSize: 11, color: '#8f8f8f' }}>{inicial(d.fecha)}</span>
                  <IconoCielo cielo={c.cielo} tam={14} color={d.conLluvia ? '#8fd0ff' : '#a0a0a0'} />
                  <span style={{ fontSize: 11, color: '#c8c8c8' }}>
                    {n0(d.tMax)}°
                  </span>
                </span>
              )
            })}
          </span>}
    </Link>
  )
}
