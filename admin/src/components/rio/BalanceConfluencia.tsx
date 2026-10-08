'use client'

/**
 * De dónde viene el agua que pasa frente a Barranqueras.
 *
 * Una fila por mes del año con el caudal medio de Barranqueras y qué parte
 * trajo cada río, según `lib/rioCaudales.ts`. Va debajo del traslado porque
 * contesta la pregunta que aquél deja abierta: el Paraguay no anuncia a
 * Barranqueras como Itá Ibaté, pero sí se puede decir cuánta del agua viene
 * por ahí. Corrientes, enfrente y con otra curva de gasto, es el control.
 *
 * ── La barra ──────────────────────────────────────────────────────────────────
 *
 * Es el reparto de cada mes, con las doce a la misma escala: todas miden el
 * 100 % del caudal de ese mes, no el caudal. Lo que se quiere ver es cómo
 * cambia la parte del Paraguay a lo largo del año, y con barras proporcionales
 * al caudal esa diferencia quedaría tapada por la del caudal mismo.
 *
 * El resto va al final y apagado: es lo que no se mide, no un cuarto río.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  balanceDeLaConfluencia, type Balance, type CaudalConfluencia, type Partes,
} from '@/lib/rioCaudales'
import { mono, boton, th, thD, td, tdD } from '@/components/cuencas/piezas'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

const COLOR = { yacyreta: '#6f6f6f', paraguay: '#F5C300', bermejo: '#E8833A', resto: '#333' } as const

const nQ = (v: number) => Math.round(v).toLocaleString('es-AR')
const fLarga = (f: string) => f.slice(0, 10).split('-').reverse().join('/')

/** Sin decimales salvo en lo chico, donde el decimal es lo que distingue */
function pct(parte: number, total: number): string {
  const v = (100 * parte) / total
  if (Math.abs(v) < 0.05) return '0'
  return Math.abs(v) < 10 ? v.toFixed(1).replace('.', ',').replace('-', '−') : String(Math.round(v))
}

export default function BalanceConfluencia() {
  const [datos, setDatos] = useState<CaudalConfluencia | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vivo = true
    fetch('/rio/confluencia_caudal.json')
      .then(r => {
        if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
        return r.json() as Promise<CaudalConfluencia>
      })
      .then(j => {
        if (!vivo) return
        if (!j?.m3s?.barranqueras || typeof j.desde !== 'string') throw new Error('el archivo no tiene la forma esperada')
        setDatos(j)
        setError(null)
      })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo leer') })
    return () => { vivo = false }
  }, [intento])

  const b = useMemo(() => (datos ? balanceDeLaConfluencia(datos) : null), [datos])
  // El mismo río medido más abajo: el control
  const control = useMemo(() => (datos ? balanceDeLaConfluencia(datos, 'formosa') : null), [datos])
  // La misma sección, enfrente y con otra curva: el otro control
  const enCorrientes = useMemo(
    () => (datos ? balanceDeLaConfluencia(datos, 'paraguay', 'corrientes') : null), [datos])

  if (error) {
    return (
      <div style={{ ...mono, fontSize: 12, color: '#E8A87C', border: '1px solid #7a4a22',
        background: 'rgba(40,24,16,.5)', borderLeft: '3px solid #E8833A', borderRadius: 2,
        padding: '8px 12px', marginTop: 8 }}>
        <b>No se pudo cargar el registro de caudales.</b> {error}
        <button onClick={() => setIntento(i => i + 1)} style={{ ...boton, marginLeft: 10 }}>
          Reintentar
        </button>
      </div>
    )
  }

  if (!datos) {
    return (
      <div style={{ ...mono, fontSize: 12, color: '#8f8f8f', marginTop: 8 }}>
        Cargando el registro de caudales…
      </div>
    )
  }

  if (!b) {
    return (
      <div style={{ ...mono, fontSize: 12, color: '#8f8f8f', marginTop: 8 }}>
        El registro de caudales no alcanza para armar el balance de la confluencia.
      </div>
    )
  }

  const m = b.medias
  const mesMax = b.porMes.reduce((a, x) => (x.paraguay / x.total > a.paraguay / a.total ? x : a))
  const mesMin = b.porMes.reduce((a, x) => (x.paraguay / x.total < a.paraguay / a.total ? x : a))
  const p = b.porElParaguay

  return (
    <div className="sv-panel" style={{ ...mono, border: '1px solid #1e1e1e', background: '#191919',
      borderLeft: '3px solid #F5C300', marginTop: 8, padding: '10px 12px 12px' }}>

      <div style={{ fontSize: 12, color: '#ddd', textTransform: 'uppercase', letterSpacing: 1.2 }}>
        De dónde viene el agua que pasa frente a Barranqueras
      </div>
      <div style={{ fontSize: 11, color: '#8f8f8f', lineHeight: 1.5, marginTop: 4 }}>
        Balance en la confluencia del Paraná con el Paraguay. Caudal medio diario,{' '}
        {fLarga(b.desde)} a {fLarga(b.hasta)}: {b.dias.toLocaleString('es-AR')} días en que están las
        cuatro series.
      </div>

      <div style={{ fontSize: 12, color: '#c4c4c4', lineHeight: 1.6, marginTop: 10,
        borderLeft: '3px solid #85B7EB', paddingLeft: 9 }}>
        De cada 100 m³ que pasan frente a Barranqueras, <b>{pct(m.yacyreta, m.total)}</b> vienen por
        el Paraná desde Yacyretá, <b>{pct(m.paraguay, m.total)}</b> por el Paraguay
        y <b>{pct(m.bermejo, m.total)}</b> por el Bermejo. El Paraguay pesa más
        en {MESES_LARGOS[mesMax.mes - 1]} ({pct(mesMax.paraguay, mesMax.total)} %) y menos
        en {MESES_LARGOS[mesMin.mes - 1]} ({pct(mesMin.paraguay, mesMin.total)} %).
      </div>

      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', color: '#c4c4c4', marginTop: 12 }}>
        <thead>
          <tr style={{ color: '#8f8f8f', fontSize: 11 }}>
            <th style={th}>Mes</th>
            <th style={thD}>Barranqueras, m³/s</th>
            <th style={thD}><Marca color={COLOR.yacyreta} />Paraná, %</th>
            <th style={thD}><Marca color={COLOR.paraguay} />Paraguay, %</th>
            <th style={thD}><Marca color={COLOR.bermejo} />Bermejo, %</th>
            <th style={thD}><Marca color={COLOR.resto} borde />Resto, %</th>
            <th style={{ ...th, paddingLeft: 16 }}>Reparto del caudal del mes</th>
          </tr>
        </thead>
        <tbody>
          <Fila rotulo="Año" partes={m} destacada />
          {b.porMes.map(x => <Fila key={x.mes} rotulo={MESES[x.mes - 1]} partes={x} />)}
        </tbody>
      </table>

      <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 10, lineHeight: 1.5,
        borderTop: '1px solid #232323', paddingTop: 9 }}>
        <b style={{ color: '#a0a0a0' }}>Paraná</b> es lo que sale de Yacyretá, tomado{' '}
        {b.desfases.yacyreta} días antes; <b style={{ color: '#a0a0a0' }}>Paraguay</b>, el caudal en
        Puerto Pilcomayo, frente a Asunción, {b.desfases.paraguay} días antes;{' '}
        <b style={{ color: '#a0a0a0' }}>Bermejo</b>, el de El Colorado, {b.desfases.bermejo} días
        antes: desemboca en el Paraguay aguas abajo de Puerto Pilcomayo, así que no está contado dos
        veces. <b style={{ color: '#a0a0a0' }}>Resto</b> es Barranqueras menos los otros tres: el
        Tebicuary y los demás afluentes que nadie mide, más el error de las curvas. No se reparte.
        {' '}<b style={{ color: '#a0a0a0' }}>Las cuatro series se miden por separado y nada las obliga
        a sumar</b>: que el resto sea el {pct(m.resto, m.total)} % del caudal medio es lo que
        dice que el balance está bien armado.
        {control && (
          <> Con el Paraguay medido en Puerto Formosa, más abajo y con otra escala, su parte
          da {pct(control.medias.paraguay, control.medias.total)} %.</>
        )}
        {enCorrientes && (
          <> Con el total medido en Corrientes, enfrente y con otra curva de gasto, la parte del
          Paraguay da {pct(enCorrientes.medias.paraguay, enCorrientes.medias.total)} % y el
          resto {pct(enCorrientes.medias.resto, enCorrientes.medias.total)} %.</>
        )}
        {' '}Día por día, lo que entra por el Paraguay con el Bermejo va del {Math.round(p.p5 * 100)} al{' '}
        {Math.round(p.p95 * 100)} % en nueve de cada diez días, y llegó al {Math.round(p.max * 100)} %
        el {fLarga(p.fechaMax)}. La demora del Paraguay es la que mejor cierra la cuenta, no una
        medida de cuánto tarda: es un río lento y con una semana de más o de menos el balance casi
        no cambia. Salvo en Yacyretá, son caudales de curva de gasto y no aforos: los promedios son
        firmes, un día suelto no tanto. Es de dónde vino el agua, no a cuánto va a llegar el río.
        Fuente: {datos.fuente}.
      </div>
    </div>
  )
}

/** El cuadrado de color que une la columna con su tramo de la barra */
function Marca({ color, borde }: { color: string; borde?: boolean }) {
  return (
    <span aria-hidden style={{ display: 'inline-block', width: 8, height: 8, marginRight: 5,
      background: color, border: borde ? '1px solid #5a5a5a' : 'none', verticalAlign: 'baseline' }} />
  )
}

function Fila({ rotulo, partes, destacada }: { rotulo: string; partes: Partes; destacada?: boolean }) {
  const c = partes.total
  return (
    <tr style={{ borderTop: '1px solid #232323', background: destacada ? '#141414' : undefined }}>
      <td style={{ ...td, color: destacada ? '#fff' : undefined }}>{rotulo}</td>
      <td style={tdD}>{nQ(c)}</td>
      <td style={{ ...tdD, color: '#a0a0a0' }}>{pct(partes.yacyreta, c)}</td>
      <td style={{ ...tdD, color: '#fff' }}>{pct(partes.paraguay, c)}</td>
      <td style={tdD}>{pct(partes.bermejo, c)}</td>
      <td style={{ ...tdD, color: '#a0a0a0' }}>{pct(partes.resto, c)}</td>
      <td style={{ paddingLeft: 16, width: '34%' }}><Barra partes={partes} rotulo={rotulo} /></td>
    </tr>
  )
}

/**
 * El reparto como una barra partida en cuatro.
 *
 * Un resto negativo —los tres ríos suman algo más que el total— no se
 * dibuja: no hay un tramo de ancho negativo, y el número de la columna ya lo
 * dice. En ese caso los otros tres se reparten el ancho entero.
 */
function Barra({ partes, rotulo }: { partes: Partes; rotulo: string }) {
  const tramos = [
    { clave: 'yacyreta', v: partes.yacyreta, color: COLOR.yacyreta },
    { clave: 'paraguay', v: partes.paraguay, color: COLOR.paraguay },
    { clave: 'bermejo', v: partes.bermejo, color: COLOR.bermejo },
    { clave: 'resto', v: Math.max(0, partes.resto), color: COLOR.resto },
  ]
  const total = tramos.reduce((s, t) => s + t.v, 0)
  return (
    <div role="img"
      aria-label={`${rotulo}: Paraná ${pct(partes.yacyreta, partes.total)} %, Paraguay ${pct(partes.paraguay, partes.total)} %, Bermejo ${pct(partes.bermejo, partes.total)} %`}
      style={{ display: 'flex', height: 10, width: '100%', gap: 1 }}>
      {tramos.map(t => (
        <div key={t.clave} style={{ width: `${(100 * t.v) / total}%`, background: t.color }} />
      ))}
    </div>
  )
}
