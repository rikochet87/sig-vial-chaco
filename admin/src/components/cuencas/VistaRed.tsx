'use client'

/**
 * La red vial y las obras de arte de cada cuenca.
 *
 * Es la tercera vista del panel de cuencas, y la que baja el agua al camino:
 * cuántos kilómetros de red tiene cada cuenca, cuántos recibieron cada lámina
 * en el período, y qué puentes, alcantarillas y tubos relevados hay adentro.
 *
 * **Dos universos que no hay que confundir al leer.** La red es la traza
 * completa de los caminos de consorcio. Las obras de arte son las que se
 * relevaron con la app móvil: no es un inventario, y la pantalla lo dice.
 */

import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Cuenca } from '@/lib/cuencas'
import { colorLluvia } from '@/lib/lluvia'
import { RADIO_KM } from '@/lib/fusion'
import type { LluviaTramo, TramoRed } from '@/lib/redLluvia'
import {
  csvRedCuencas, cuencaDeMuestras, obrasPorCuenca, redPorCuenca, TIPOS_OBRA, UMBRALES_KM,
  type ObraRelevada, type ObrasDeCuenca, type RedDeCuenca,
} from '@/lib/redCuencas'
import type { MedicionConNombre } from '@/lib/thiessenAreal'
import { bajarCsv, boton, fCorta, nKm, nMm, td, tdD, th, thD } from './piezas'

/** Cuántas obras se listan al abrir una cuenca */
const OBRAS_VISIBLES = 15

const ROTULO_TIPO: Record<string, string> = { Puente: 'Puentes', Alcantarilla: 'Alcant.', Tubos: 'Tubos' }

interface Props {
  cuencas: Cuenca[]
  tramos: TramoRed[]
  lluviaTramos: LluviaTramo[]
  estaciones: MedicionConNombre[]
  desde: string
  hasta: string
}

export default function VistaRed({ cuencas, tramos, lluviaTramos, estaciones, desde, hasta }: Props) {
  const [detalle, setDetalle] = useState<number | null>(null)

  // A qué cuenca va cada muestra de la red: no depende de la fecha
  const asignacion = useMemo(
    () => (tramos.length > 0 ? cuencaDeMuestras(cuencas, tramos) : null),
    [cuencas, tramos],
  )
  const red = useMemo(
    () => (asignacion ? redPorCuenca(cuencas, tramos, lluviaTramos, asignacion) : null),
    [cuencas, tramos, lluviaTramos, asignacion],
  )

  // ── Las obras de arte relevadas ──
  const [obras, setObras] = useState<ObraRelevada[] | null>(null)
  const [sinCoordenada, setSinCoordenada] = useState(0)
  const [errorObras, setErrorObras] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vivo = true
    fetch('/api/lluvia/obras-de-arte')
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error ?? `el servidor respondió ${r.status}`)
        return j as { obras: ObraRelevada[]; sinCoordenada: number }
      })
      .then(j => {
        if (!vivo) return
        setObras(j.obras ?? []); setSinCoordenada(j.sinCoordenada ?? 0); setErrorObras(null)
      })
      .catch(e => { if (vivo) setErrorObras(e instanceof Error ? e.message : 'no se pudo consultar') })
    return () => { vivo = false }
  }, [intento])

  const obrasCuenca = useMemo(
    () => (obras ? obrasPorCuenca(cuencas, obras, estaciones) : null),
    [cuencas, obras, estaciones],
  )
  const obrasDe = useMemo(() => new Map((obrasCuenca ?? []).map(o => [o.cod, o])), [obrasCuenca])

  if (!red) {
    return <div style={{ color: '#8f8f8f' }}>La red vial todavía no cargó. Si el mapa de arriba tampoco la muestra, reintentá desde ahí.</div>
  }

  const hayLluvia = estaciones.length > 0 && lluviaTramos.length === tramos.length
  // La fila de lo que cae afuera sólo aparece si tiene algo que mostrar
  const visibles = red.filter(f => f.cod !== 0 || f.km >= 0.5 || (obrasDe.get(0)?.obras.length ?? 0) > 0)
  const suma = (f: (r: RedDeCuenca) => number) => red.reduce((s, r) => s + f(r), 0)
  const totalObras = TIPOS_OBRA.map((_, t) => (obrasCuenca ?? []).reduce((s, o) => s + o.cuenta[t], 0))

  return (<>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <span style={{ color: '#8f8f8f', flex: 1 }}>
        {hayLluvia
          ? <>Del {fCorta(desde)} al {fCorta(hasta)}. Tocá una cuenca para ver sus obras de arte relevadas.</>
          : <>Sin mediciones de la APA en el período: se muestra la red, sin lluvia.</>}
      </span>
      <button onClick={() => bajarCsv(
        csvRedCuencas(red, obrasCuenca, { desde, hasta }),
        `red-y-obras-por-cuenca_${desde}_a_${hasta}.csv`)} style={boton}>Descargar CSV</button>
    </div>

    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          <th style={th} colSpan={2} />
          <th style={thD} colSpan={2}>Red de consorcios</th>
          <th style={{ ...thD, borderBottom: '1px solid #2a2a2a' }} colSpan={UMBRALES_KM.length + 1}>
            Km de red que recibieron
          </th>
          <th style={{ ...thD, borderBottom: '1px solid #2a2a2a' }} colSpan={TIPOS_OBRA.length}>
            Obras de arte relevadas
          </th>
        </tr>
        <tr style={{ color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          <th style={{ ...th, width: 34 }}>Nº</th>
          <th style={th}>Cuenca</th>
          <th style={thD} title="Km de traza de la red de consorcios dentro de la cuenca">Km</th>
          <th style={thD} title="Qué parte de esa red es de tierra">Tierra</th>
          {UMBRALES_KM.map(u => (
            <th key={u} style={thD} title={`Km de red cuyo tramo recibió ${u} mm o más en el período`}>
              <span style={{ display: 'inline-block', width: 9, height: 9, marginRight: 5,
                background: colorLluvia(u), border: '1px solid #111', verticalAlign: 'middle' }} />
              {u} mm o más
            </th>
          ))}
          <th style={thD} title={`Km de red sin ningún pluviómetro a menos de ${RADIO_KM} km: no hay dato`}>Sin dato</th>
          {TIPOS_OBRA.map(t => <th key={t} style={thD}>{ROTULO_TIPO[t]}</th>)}
        </tr>
      </thead>
      <tbody>
        {visibles.map(f => (
          <FilaRed key={f.cod} f={f} obras={obrasDe.get(f.cod) ?? null} hayLluvia={hayLluvia}
            cargandoObras={!obras && !errorObras}
            abierta={detalle === f.cod} onClick={() => setDetalle(detalle === f.cod ? null : f.cod)} />
        ))}
        <tr style={{ borderTop: '1px solid #2a2a2a', color: '#ccc' }}>
          <td style={td} />
          <td style={{ ...td, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11, color: '#999' }}>Provincia</td>
          <td style={{ ...tdD, fontWeight: 700 }}>{nKm(suma(r => r.km))}</td>
          <td style={tdD}>{Math.round(suma(r => r.kmTierra) / Math.max(1, suma(r => r.km)) * 100)} %</td>
          {UMBRALES_KM.map((u, i) => (
            <td key={u} style={{ ...tdD, fontWeight: 700 }}>{hayLluvia ? nKm(suma(r => r.kmDesde[i])) : '—'}</td>
          ))}
          <td style={tdD}>{hayLluvia ? nKm(suma(r => r.kmSinDato)) : '—'}</td>
          {TIPOS_OBRA.map((t, i) => <td key={t} style={{ ...tdD, fontWeight: 700 }}>{obrasCuenca ? totalObras[i] : '…'}</td>)}
        </tr>
      </tbody>
    </table>

    {errorObras && (
      <div style={{ color: '#E8A87C', marginTop: 8 }}>
        No se pudieron traer las obras de arte relevadas ({errorObras}).{' '}
        <button onClick={() => setIntento(v => v + 1)} style={boton}>Reintentar</button>
      </div>
    )}

    <div style={{ color: '#8f8f8f', marginTop: 9 }}>
      Los kilómetros son de <b style={{ color: '#a0a0a0', fontWeight: 400 }}>traza</b> de la red de consorcios,
      medidos sobre el mapa; no son los que declara la ficha de cada consorcio. Un tramo que cruza de una
      cuenca a otra se reparte entre las dos, y los caminos que corren sobre el límite provincial van a la
      cuenca de al lado. La lámina de cada tramo es la que pinta el mapa.
    </div>
    <div style={{ color: '#8a8a8a', marginTop: 5 }}>
      Las obras de arte son las que se relevaron con la app, no un inventario: una cuenca con pocas
      puede tener muchas más sin relevar.
      {sinCoordenada > 0 && <> Hay {sinCoordenada} relevada{sinCoordenada === 1 ? '' : 's'} sin coordenada, que no se puede{sinCoordenada === 1 ? '' : 'n'} ubicar.</>}
    </div>
  </>)
}

function FilaRed({ f, obras, hayLluvia, cargandoObras, abierta, onClick }: {
  f: RedDeCuenca
  obras: ObrasDeCuenca | null
  hayLluvia: boolean
  cargandoObras: boolean
  abierta: boolean
  onClick: () => void
}) {
  const afuera = f.cod === 0
  const columnas = 4 + UMBRALES_KM.length + 1 + TIPOS_OBRA.length
  const lista = obras?.obras ?? []

  return (
    <Fragment>
      <tr onClick={onClick} style={{
        borderTop: '1px solid #141414', cursor: 'pointer',
        background: abierta ? 'rgba(245,195,0,0.05)' : 'transparent',
      }}>
        <td style={{ ...td, color: '#a0a0a0' }}>{afuera ? '' : f.cod}</td>
        <td style={{ ...td, color: afuera ? '#a0a0a0' : '#ccc' }}>{f.nombre}</td>
        <td style={{ ...tdD, color: '#ccc' }}>{nKm(f.km)}</td>
        <td style={{ ...tdD, color: '#a0a0a0' }}>{f.km > 0 ? `${Math.round(f.kmTierra / f.km * 100)} %` : '—'}</td>
        {f.kmDesde.map((km, i) => (
          <td key={i} style={{ ...tdD, color: km >= 0.5 ? '#ccc' : '#8f8f8f' }}>
            {!hayLluvia ? '—' : km >= 0.5 ? nKm(km) : '·'}
          </td>
        ))}
        <td style={{ ...tdD, color: hayLluvia && f.kmSinDato >= 0.5 ? '#E8833A' : '#8f8f8f' }}>
          {!hayLluvia ? '—' : f.kmSinDato >= 0.5 ? nKm(f.kmSinDato) : '·'}
        </td>
        {TIPOS_OBRA.map((t, i) => {
          const n = obras?.cuenta[i] ?? 0
          return <td key={t} style={{ ...tdD, color: n > 0 ? '#ccc' : '#8f8f8f' }}>{cargandoObras ? '…' : n > 0 ? n : '·'}</td>
        })}
      </tr>

      {abierta && (
        <tr>
          <td />
          <td colSpan={columnas - 1} style={{ padding: '4px 0 10px' }}>
            {lista.length === 0 ? (
              <div style={{ color: '#9aa0a6' }}>
                {cargandoObras
                  ? 'Cargando las obras de arte…'
                  : 'Ninguna obra de arte relevada en esta cuenca todavía.'}
              </div>
            ) : (<>
              <div style={{ color: '#8f8f8f', marginBottom: 3 }}>
                {lista.length} obra{lista.length === 1 ? '' : 's'} de arte relevada{lista.length === 1 ? '' : 's'},
                {' '}de la que más lluvia recibió a la que menos.
              </div>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 520 }}>
                <thead>
                  <tr style={{ color: '#8f8f8f' }}>
                    <th style={th}>Tipo</th>
                    <th style={th}>Ruta o tramo</th>
                    <th style={thD} title="La lluvia que cayó en el punto de la obra, no el agua que le llega">Lámina en el punto</th>
                    <th style={thD} />
                  </tr>
                </thead>
                <tbody>
                  {lista.slice(0, OBRAS_VISIBLES).map(o => (
                    <tr key={o.id} style={{ borderTop: '1px solid #141414' }}>
                      <td style={{ ...td, color: '#999' }}>{o.tipo}</td>
                      <td style={{ ...td, color: '#a0a0a0' }}>{o.rutaTramo ?? '—'}</td>
                      <td style={{ ...tdD, color: o.mm === null ? '#8f8f8f' : '#ccc' }}>
                        {!hayLluvia ? '—' : o.mm === null ? 'sin dato' : `${nMm(o.mm)} mm`}
                      </td>
                      <td style={tdD}>
                        <a href={`/dashboard/relevamientos/${o.id}`} onClick={e => e.stopPropagation()}
                          style={{ color: '#F5C300', fontSize: 11, letterSpacing: 0.8,
                            textTransform: 'uppercase', textDecoration: 'none' }}>
                          Ver →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lista.length > OBRAS_VISIBLES && (
                <div style={{ color: '#8f8f8f', marginTop: 4 }}>
                  … y {lista.length - OBRAS_VISIBLES} más. La descarga CSV trae la cuenta completa por cuenca.
                </div>
              )}
              <div style={{ color: '#8f8f8f', marginTop: 5 }}>
                La lámina es la que cayó sobre la obra. Cuánta agua le llega depende de su cuenca de
                aporte, que no se conoce sin un modelo de elevación.
              </div>
            </>)}
          </td>
        </tr>
      )}
    </Fragment>
  )
}
