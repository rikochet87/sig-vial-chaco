'use client'
/**
 * El tiempo en el Dashboard: las alertas vigentes del SMN y la semana en la
 * provincia, en una franja.
 *
 * Es lo primero que se ve al entrar al panel, así que va compacto: el alto en
 * el Dashboard lo necesita el mapa. El detalle por consorcio está en
 * Hidrología → Tiempo.
 */
import Link from 'next/link'
import { useMemo } from 'react'
import { cieloDe, resumenProvincia } from '@/lib/tiempo'
import AlertasSmn, { useAlertasSmn } from './AlertasSmn'
import { usePronosticoTiempo } from './PanelTiempo'
import { IconoCielo, fDia, mono, n0 } from './piezas'

export default function ResumenTiempo() {
  const alertas = useAlertasSmn()
  const { datos, error } = usePronosticoTiempo()
  const resumen = useMemo(() => resumenProvincia(datos?.consorcios ?? []), [datos])
  const total = datos?.consorcios.length ?? 0
  const hayAlertas = (alertas.datos?.alertas.length ?? 0) > 0

  return (
    <div style={{ ...mono, display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap', marginBottom: 8 }}>
      <div style={{
        background: '#191919', border: '1px solid #1e1e1e', borderLeft: '3px solid #F5C300',
        padding: '6px 12px', flex: hayAlertas ? '1 1 420px' : '0 1 auto', minWidth: 260,
      }}>
        <div style={{ fontSize: 11, color: '#8f8f8f', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>Alertas SMN</div>
        <AlertasSmn estado={alertas} compacto />
      </div>

      <div style={{ background: '#191919', border: '1px solid #1e1e1e', padding: '6px 10px', flex: '1 1 520px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#8f8f8f', letterSpacing: 1, textTransform: 'uppercase', flex: 1 }}>La semana</span>
          <Link href="/dashboard/lluvia" style={{ fontSize: 11, color: '#8fd0ff', textDecoration: 'none' }}>
            Por consorcio: Hidrología → Tiempo
          </Link>
        </div>
        {error && <div style={{ fontSize: 12, color: '#E8A87C' }}>No se pudo consultar el pronóstico ({error}).</div>}
        {!error && !datos && <div style={{ fontSize: 12, color: '#8f8f8f' }}>Consultando…</div>}
        {datos && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${resumen.length}, minmax(0, 1fr))`, gap: 4 }}>
            {resumen.map(d => {
              const c = cieloDe(d.codigo)
              return (
                <div key={d.fecha} title={`${c.texto} · lluvia en ${d.conLluvia} de ${total} consorcios, hasta ${n0(d.lluviaMax)} mm`}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <IconoCielo cielo={c.cielo} tam={18} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: '#a0a0a0', whiteSpace: 'nowrap' }}>{fDia(d.fecha)}</div>
                    <div style={{ fontSize: 12, color: '#e0e0e0', whiteSpace: 'nowrap' }}>
                      {n0(d.tMin)}°/{n0(d.tMax)}°
                      {d.conLluvia > 0 && <span style={{ color: '#8fd0ff' }}> · {d.conLluvia}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
