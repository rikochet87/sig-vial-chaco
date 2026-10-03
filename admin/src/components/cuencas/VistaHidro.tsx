'use client'

/**
 * Los cursos de agua, los canales y los cruces con la red, por cuenca.
 *
 * Es la cuarta vista del panel de cuencas y la única que no depende del
 * período: no hay lluvia acá, hay por dónde corre el agua. Por cuenca, los
 * kilómetros de cursos permanentes, no permanentes y canales, la densidad de
 * drenaje, y **dónde la red de consorcios cruza un curso** — que es donde tiene
 * que haber una obra de arte.
 *
 * **Los cruces no son un inventario**, y la pantalla lo dice: salen de una
 * carta a 1:250.000, que no tiene los cursos menores, cruzada con la traza de
 * los caminos. Al lado va cuántos tienen una obra relevada cerca, que con lo
 * relevado hasta hoy son pocos; la diferencia es lo que falta relevar, no lo
 * que falta construir.
 */

import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Cuenca } from '@/lib/cuencas'
import {
  cargarHidrografia, categoriaDe, crucesDe, csvCruces, hidroPorCuenca, obrasSobreCruces,
  rotuloCurso, CATEGORIAS, ROTULO_CATEGORIA, TOLERANCIA_OBRA_KM,
  type CursoAgua, type HidroDeCuenca,
} from '@/lib/hidrografia'
import type { ObraRelevada } from '@/lib/redCuencas'
import type { TramoRed } from '@/lib/redLluvia'
import { bajarCsv, boton, nKm, td, tdD, th, thD } from './piezas'

/** Cuántos cruces se listan al abrir una cuenca */
const CRUCES_VISIBLES = 25

const TOL_M = TOLERANCIA_OBRA_KM * 1000
const nDens = (v: number | null) => (v === null ? '—' : v.toFixed(2).replace('.', ','))
const grados = (v: number) => Math.abs(v).toFixed(4).replace('.', ',')

interface Props {
  cuencas: Cuenca[]
  tramos: TramoRed[]
}

export default function VistaHidro({ cuencas, tramos }: Props) {
  const [detalle, setDetalle] = useState<number | null>(null)

  const [cursos, setCursos] = useState<CursoAgua[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vivo = true
    cargarHidrografia()
      .then(c => { if (vivo) { setCursos(c); setError(null) } })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'no se pudo descargar') })
    return () => { vivo = false }
  }, [intento])

  // Las obras de arte relevadas: las mismas que usa la vista de la red
  const [obras, setObras] = useState<ObraRelevada[] | null>(null)
  const [errorObras, setErrorObras] = useState<string | null>(null)
  const [intentoObras, setIntentoObras] = useState(0)

  useEffect(() => {
    let vivo = true
    fetch('/api/lluvia/obras-de-arte')
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error ?? `el servidor respondió ${r.status}`)
        return j as { obras: ObraRelevada[] }
      })
      .then(j => { if (vivo) { setObras(j.obras ?? []); setErrorObras(null) } })
      .catch(e => { if (vivo) setErrorObras(e instanceof Error ? e.message : 'no se pudo consultar') })
    return () => { vivo = false }
  }, [intentoObras])

  // El mismo arreglo que dibuja el mapa: `crucesDe` guarda el cálculo
  const cruces = useMemo(
    () => (cursos && tramos.length > 0 ? crucesDe(tramos, cursos) : null),
    [cursos, tramos],
  )
  const filas = useMemo(
    () => (cursos && cruces ? hidroPorCuenca(cuencas, cursos, cruces, obras) : null),
    [cuencas, cursos, cruces, obras],
  )
  const obrasCerca = useMemo(
    () => (cruces && obras ? obrasSobreCruces(cruces, obras) : null),
    [cruces, obras],
  )

  if (error) {
    return (
      <div style={{ color: '#E8A87C' }}>
        No se pudo cargar la hidrografía ({error}).{' '}
        <button onClick={() => setIntento(v => v + 1)} style={boton}>Reintentar</button>
      </div>
    )
  }
  if (!cursos) return <div style={{ color: '#8f8f8f' }}>Cargando los cursos de agua…</div>
  if (!filas) {
    return <div style={{ color: '#8f8f8f' }}>La red vial todavía no cargó. Si el mapa tampoco la muestra, reintentá desde ahí.</div>
  }

  const suma = (f: (r: HidroDeCuenca) => number) => filas.reduce((s, r) => s + f(r), 0)
  const totalCruces = suma(r => r.lista.length)
  const km2 = cuencas.reduce((s, c) => s + c.ha / 100, 0)
  const adentro = filas.filter(f => f.cod !== 0)

  return (<>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <span style={{ color: '#8f8f8f', flex: 1 }}>
        No depende del período. Tocá una cuenca para ver dónde la red cruza un curso o un canal.
      </span>
      <button onClick={() => bajarCsv(csvCruces(filas, cursos, tramos), 'cruces-red-y-cursos-de-agua.csv')}
        style={boton}>Descargar los cruces (CSV)</button>
    </div>

    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          <th style={th} colSpan={2} />
          <th style={{ ...thD, borderBottom: '1px solid #2a2a2a' }} colSpan={CATEGORIAS.length}>Km de traza</th>
          <th style={thD} />
          <th style={{ ...thD, borderBottom: '1px solid #2a2a2a' }} colSpan={CATEGORIAS.length + 1}>
            Cruces con la red de consorcios
          </th>
        </tr>
        <tr style={{ color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          <th style={{ ...th, width: 34 }}>Nº</th>
          <th style={th}>Cuenca</th>
          {CATEGORIAS.map(k => <th key={k} style={thD}>{ROTULO_CATEGORIA[k]}</th>)}
          <th style={thD} title="Km de cursos y canales por km² de cuenca. Depende de la escala de la carta: sirve para comparar cuencas entre sí">
            Densidad km/km²
          </th>
          {CATEGORIAS.map(k => <th key={k} style={thD}>{ROTULO_CATEGORIA[k]}</th>)}
          <th style={thD} title={`Cruces con una obra de arte relevada a menos de ${TOL_M} m, sobre el total de cruces de la cuenca. El total son los cruces que marca la carta a 1:250.000, no las obras que existen ni las que faltan relevar`}>Con obra relevada</th>
        </tr>
      </thead>
      <tbody>
        {filas.filter(f => f.cod !== 0 || f.km.some(v => v >= 0.5) || f.lista.length > 0).map(f => (
          <FilaHidro key={f.cod} f={f} cursos={cursos} tramos={tramos} cargandoObras={!obras && !errorObras}
            abierta={detalle === f.cod} onClick={() => setDetalle(detalle === f.cod ? null : f.cod)} />
        ))}
        <tr style={{ borderTop: '1px solid #2a2a2a', color: '#ccc' }}>
          <td style={td} />
          <td style={{ ...td, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11, color: '#999' }}>Total</td>
          {CATEGORIAS.map((k, i) => <td key={k} style={{ ...tdD, fontWeight: 700 }}>{nKm(suma(r => r.km[i]))}</td>)}
          <td style={tdD} title="Sólo lo que cae dentro de las cuencas">
            {nDens(adentro.reduce((s, r) => s + r.km.reduce((a, b) => a + b, 0), 0) / km2)}
          </td>
          {CATEGORIAS.map((k, i) => <td key={k} style={{ ...tdD, fontWeight: 700 }}>{suma(r => r.cruces[i])}</td>)}
          <td style={{ ...tdD, fontWeight: 700 }}>
            {obras ? `${suma(r => r.conObra)} de ${suma(r => r.lista.length)} cruces` : '…'}
          </td>
        </tr>
      </tbody>
    </table>

    {errorObras && (
      <div style={{ color: '#E8A87C', marginTop: 8 }}>
        No se pudieron traer las obras de arte relevadas ({errorObras}); los cruces se muestran igual.{' '}
        <button onClick={() => setIntentoObras(v => v + 1)} style={boton}>Reintentar</button>
      </div>
    )}

    <div style={{ color: '#8f8f8f', marginTop: 9 }}>
      Los cursos son los de la carta del IGN a <b style={{ color: '#a0a0a0', fontWeight: 400 }}>1:250.000</b>:
      están los ríos, arroyos, riachos y cañadas que entran a esa escala, y faltan los menores. Los canales
      son los del sistema de la Línea Paraná, en el sudoeste; no están los del área metropolitana. Fuera de
      las cuencas quedan los ríos limítrofes —Bermejo, Teuco, Paraná, Paraguay— y el tramo del canal troncal
      que sale de la provincia.
    </div>
    <div style={{ color: '#8f8f8f', marginTop: 5 }}>
      Un <b style={{ color: '#a0a0a0', fontWeight: 400 }}>cruce</b> es donde la traza de un camino de
      consorcio corta un curso o un canal. Un camino que corre al costado de un canal no lo cruza, y varios
      cortes del mismo curso en menos de 300 m cuentan como uno. Son {totalCruces.toLocaleString('es-AR')} y{' '}
      <b style={{ color: '#a0a0a0', fontWeight: 400 }}>no son un inventario</b>: dicen dónde tiene que haber
      una obra de arte según la carta, no qué hay construido, y la posición vale al centenar de metros.
      {obras && obrasCerca !== null && (
        <> De las {obras.length} obras de arte relevadas (en campo o de gabinete), {obrasCerca} está{obrasCerca === 1 ? '' : 'n'} a
        menos de {TOL_M} m de un cruce; el resto está sobre cursos que la carta no tiene, o sobre caminos
        que no son de la red de consorcios.</>
      )}
    </div>
    <div style={{ color: '#8f8f8f', marginTop: 5 }}>
      La columna <b style={{ color: '#a0a0a0', fontWeight: 400 }}>con obra relevada</b> dice cuántos de los
      cruces de cada cuenca tienen una obra relevada a menos de {TOL_M} m. El total es el de cruces de la
      carta, no el de obras: a esta escala faltan los cursos menores, así que va a haber obras donde la carta
      no marca ningún cruce. Sirve como lista de lugares a visitar, no como cuenta de lo que falta relevar.
    </div>
    <div style={{ color: '#8f8f8f', marginTop: 5 }}>
      La densidad de drenaje —km de cursos y canales por km² de cuenca— depende de la escala de la carta:
      sirve para comparar una cuenca con otra, no contra valores de otra fuente.
    </div>
  </>)
}

function FilaHidro({ f, cursos, tramos, cargandoObras, abierta, onClick }: {
  f: HidroDeCuenca
  cursos: CursoAgua[]
  tramos: TramoRed[]
  cargandoObras: boolean
  abierta: boolean
  onClick: () => void
}) {
  const afuera = f.cod === 0
  const columnas = 2 + CATEGORIAS.length * 2 + 2
  // Primero los permanentes, que son los que piden la obra mayor; después por nombre
  const lista = useMemo(() => [...f.lista].sort((a, b) =>
    CATEGORIAS.indexOf(categoriaDe(cursos[a.curso])) - CATEGORIAS.indexOf(categoriaDe(cursos[b.curso]))
    || rotuloCurso(cursos[a.curso]).localeCompare(rotuloCurso(cursos[b.curso]), 'es')
    || tramos[a.tramo].cc - tramos[b.tramo].cc), [f.lista, cursos, tramos])

  const celda = (n: number) => (n > 0 ? n : '·')

  return (
    <Fragment>
      <tr onClick={onClick} style={{
        borderTop: '1px solid #141414', cursor: 'pointer',
        background: abierta ? 'rgba(245,195,0,0.05)' : 'transparent',
      }}>
        <td style={{ ...td, color: '#a0a0a0' }}>{afuera ? '' : f.cod}</td>
        <td style={{ ...td, color: afuera ? '#a0a0a0' : '#ccc' }}>{f.nombre}</td>
        {f.km.map((km, i) => (
          <td key={i} style={{ ...tdD, color: km >= 0.5 ? '#ccc' : '#8f8f8f' }}>{km >= 0.5 ? nKm(km) : '·'}</td>
        ))}
        <td style={{ ...tdD, color: '#a0a0a0' }}>{nDens(f.densidad)}</td>
        {f.cruces.map((n, i) => (
          <td key={i} style={{ ...tdD, color: n > 0 ? '#ccc' : '#8f8f8f' }}>{celda(n)}</td>
        ))}
        <td style={{ ...tdD, color: f.conObra > 0 ? '#ccc' : '#8f8f8f' }}>
          {cargandoObras ? '…' : `${f.conObra} de ${f.lista.length} cruces`}
        </td>
      </tr>

      {abierta && (
        <tr>
          <td />
          <td colSpan={columnas - 1} style={{ padding: '4px 0 10px' }}>
            {lista.length === 0 ? (
              <div style={{ color: '#9aa0a6' }}>
                La red de consorcios no cruza ningún curso de la carta en esta cuenca.
              </div>
            ) : (<>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
                <thead>
                  <tr style={{ color: '#8f8f8f' }}>
                    <th style={th}>Curso o canal</th>
                    <th style={th}>Clase</th>
                    <th style={thD}>Consorcio</th>
                    <th style={th}>&nbsp;&nbsp;Camino</th>
                    <th style={thD}>Dónde</th>
                    <th style={thD}>Obra relevada</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.slice(0, CRUCES_VISIBLES).map((x, i) => {
                    const c = cursos[x.curso], t = tramos[x.tramo]
                    return (
                      <tr key={i} style={{ borderTop: '1px solid #141414' }}>
                        <td style={{ ...td, color: '#ccc' }}>{rotuloCurso(c)}</td>
                        <td style={{ ...td, color: '#999' }}>{ROTULO_CATEGORIA[categoriaDe(c)].replace(/s$/, '')}</td>
                        <td style={{ ...tdD, color: '#a0a0a0' }}>{Number.isFinite(t.cc) ? `CC ${t.cc}` : '—'}</td>
                        <td style={{ ...td, color: '#a0a0a0' }}>
                          &nbsp;&nbsp;{[t.ruta && `RP ${t.ruta}`, t.material && t.material.toLowerCase()].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td style={{ ...tdD, color: '#8f8f8f' }}>{grados(x.lat)}° S · {grados(x.lng)}° O</td>
                        <td style={{ ...tdD, color: x.conObra ? '#5DCAA5' : '#8f8f8f' }}>
                          {cargandoObras ? '…' : x.conObra ? 'sí' : 'no'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {lista.length > CRUCES_VISIBLES && (
                <div style={{ color: '#8f8f8f', marginTop: 4 }}>
                  … y {lista.length - CRUCES_VISIBLES} más. La descarga CSV los trae todos, con su coordenada.
                </div>
              )}
            </>)}
          </td>
        </tr>
      )}
    </Fragment>
  )
}
