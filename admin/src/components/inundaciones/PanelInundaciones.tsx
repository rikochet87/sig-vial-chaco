'use client'
/**
 * La pestaña «Gran Resistencia» de Hidrología: qué se moja con una crecida del
 * Paraná, con una lluvia larga, o con las dos a la vez.
 *
 * El mapa es la pantalla y debajo va el deslizador de la altura del río, que es
 * el control: al subirlo el agua crece. A la derecha, qué queda adentro.
 *
 * **Toda el agua que se dibuja es agua que se vio**, con su fecha y la altura
 * que tenía el río ese día. No hay ninguna mancha calculada. Para una altura se
 * dibujan, como una sola mancha celeste, la zona de esa altura y todas las
 * imágenes de un río igual o más bajo (`aguaDelRio`): acumulado, para que
 * subir el deslizador nunca saque agua. De qué imagen sale cada cosa lo dice
 * la lectura bajo el cursor y el detalle del panel, no el color.
 *
 * La primera versión pintaba cada imagen de un color —celeste la zona, naranja
 * la mancha más cercana, rojizo la parcial— y explicaba cada uno en el panel.
 * Era correcta y no se entendía: había que leer tres párrafos para mirar un
 * mapa. Los otros eventos (lluvia, río con lluvia) siguen, pero
 * plegados.
 *
 * Lo que se sabe que pasó y ninguna imagen muestra va aparte, como texto: no se
 * pinta como agua. Ver `lib/inundaciones.ts`.
 */
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState, useCallback } from 'react'
import type { TramoRed } from '@/lib/redLluvia'
import type { ObraRelevada } from '@/lib/redCuencas'
import type { SerieDiariaRio } from '@/lib/rioHistorico'
import { extremosAnuales, ajustarGumbel, alturaDeRecurrencia, recurrenciaDe, aniosSobre } from '@/lib/rioHistorico'
import type { Pronostico } from '@/lib/pronostico'
import { laminaPorCorrida, ventana, probSuperar } from '@/lib/pronostico'
import {
  BARRANQUERAS, cotaMop, enEscala, escenarioRio, aguaDelRio, informesHasta, IndicePoligonos, ladoDeDefensa,
  fueraDe, techoDelRecinto, alSurDe, elevadosDe, franjaDeDefensa, franjaParaDibujar,
  rutasDelRecuadro, caminosDelRecuadro, viaContra, resumirVias, nodosDelRecuadro,
  type IndiceInundaciones, type CapaInundacion, type MultiPoligono, type ClaseVia,
} from '@/lib/inundaciones'
import type { CapaDibujo, LineaDibujo, PuntoDibujo } from './MapaInundaciones'
import RioArriba from './RioArriba'

const MapaInundaciones = dynamic(() => import('./MapaInundaciones'), {
  ssr: false,
  loading: () => <div style={{ fontFamily: 'monospace', color: '#8f8f8f', fontSize: 13, padding: 20 }}>Cargando mapa…</div>,
})

const mono = { fontFamily: 'monospace' } as const
const ACENTO = '#F5C300'
const f1 = (v: number) => v.toFixed(1).replace('.', ',')
const f2 = (v: number) => v.toFixed(2).replace('.', ',')
const fFecha = (f: string) => f.slice(0, 10).split('-').reverse().join('/')

/** El agua del río a la altura elegida: zona e imágenes van del mismo color, como una sola mancha */
const C_RIO = '#29b6f6'
const ESTILO_RIO = { color: C_RIO, relleno: 0.6, trazo: 0, orden: 20, union: true }
/** Cómo se pinta lo demás. El orden decide qué queda arriba; menos de 10 = fondo */
const ESTILO: Record<string, { color: string; relleno: number; trazo: number; orden: number; union?: boolean }> = {
  'urbano-hoy':  { color: '#bdbdbd', relleno: 0.32, trazo: 0,   orden: 1 },
  permanente:    { color: '#0d47a1', relleno: 0.7,  trazo: 0,   orden: 5 },
  rio:           ESTILO_RIO,
  observada:     ESTILO_RIO,
  'lluvia-2019-01-22': { color: '#ce93d8', relleno: 0.28, trazo: 0, orden: 24 },
  'lluvia-2019-01-17': { color: '#8e24aa', relleno: 0.6,  trazo: 0, orden: 26 },
  combinada:     { color: '#ef5350', relleno: 0.22, trazo: 1.2, orden: 34 },
  defensa:       { color: '#ffee58', relleno: 0.22, trazo: 1.2, orden: 36 },
}
const estiloDe = (c: CapaInundacion) => ESTILO[c.id] ?? ESTILO[c.grupo] ?? ESTILO.rio
const esDelRio = (c: CapaInundacion) => c.grupo === 'rio' || c.grupo === 'observada'
/**
 * Lo que una imagen no ve: sólo el contorno, a rayas y con su rótulo. Sin
 * relleno: una placa gris tapaba el agua que otras imágenes sí vieron ahí y
 * se confundía con lo construido, que también es gris.
 */
const ESTILO_CIEGO = { color: '#1a1a1a', relleno: 0, trazo: 1.5, orden: 12, rayas: true }

const COLOR_VIA: Record<ClaseVia, { color: string; grosor: number }> = {
  nacional:   { color: '#F5C300', grosor: 3 },
  provincial: { color: '#f5f5f5', grosor: 2.2 },
  consorcio:  { color: '#a5d6a7', grosor: 1.4 },
}
const ROTULO_VIA: Record<ClaseVia, string> = {
  nacional: 'Rutas nacionales', provincial: 'Rutas provinciales', consorcio: 'Caminos de consorcio',
}

const seccion: React.CSSProperties = { borderTop: '1px solid #1e1e1e', padding: '12px 14px' }
const rotulo: React.CSSProperties = {
  ...mono, fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8,
}
const texto: React.CSSProperties = { ...mono, fontSize: 12, color: '#a0a0a0', lineHeight: 1.6 }
const aviso: React.CSSProperties = {
  ...mono, fontSize: 12, color: '#E8A87C', lineHeight: 1.6, background: 'rgba(40,24,16,.6)',
  border: '1px solid #5a3a1a', borderLeft: '3px solid #E8833A', padding: '7px 10px', marginTop: 8,
}
/** Lo informado: ni aviso ni dato de imagen, así que no lleva el naranja ni el color de ninguna capa */
const informe: React.CSSProperties = {
  ...mono, fontSize: 12, color: '#b8b8b8', lineHeight: 1.6, background: '#141414',
  border: '1px solid #2a2a2a', borderLeft: '3px solid #e0e0e0', padding: '7px 10px', marginTop: 8,
}
const plegado: React.CSSProperties = { ...rotulo, marginBottom: 0, cursor: 'pointer' }
const cifra: React.CSSProperties = { ...mono, fontSize: 20, color: '#fff', fontWeight: 700, lineHeight: 1.2 }

/** El deslizador: de la bajante a pasado el máximo del registro (8,59 m) */
const RIO_MIN = 2, RIO_MAX = 9
/** Ancho del cursor de `.sv-range-grande`: el recorrido del cursor es el ancho menos esto */
const CURSOR_PX = 11
/** Dónde cae una altura sobre el riel, para alinear las marcas con el cursor */
const enRiel = (m: number) => {
  const p = Math.min(1, Math.max(0, (m - RIO_MIN) / (RIO_MAX - RIO_MIN)))
  return `calc(${CURSOR_PX / 2}px + ${p.toFixed(4)} * (100% - ${CURSOR_PX}px))`
}

interface RioHoy {
  ultima: { fecha: string; m: number } | null
  /** El máximo de la banda superior del pronóstico del INA, y cuándo */
  pronMax: { fecha: string; m: number } | null
  pronMedio: { fecha: string; m: number } | null
  emitido: string | null
}

interface Geometria { coords: MultiPoligono; indice: IndicePoligonos; sinImagen?: MultiPoligono; ciego?: IndicePoligonos }

async function leerJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  // Un 404 devuelve una página de error que `.json()` no puede leer
  if (!r.ok) throw new Error(`${url}: el servidor respondió ${r.status}`)
  return r.json() as Promise<T>
}

export default function PanelInundaciones({ tramos }: { tramos: TramoRed[] }) {
  const [indice, setIndice] = useState<IndiceInundaciones | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [geo, setGeo] = useState<Record<string, Geometria>>({})
  const [rio, setRio] = useState<RioHoy | null>(null)
  const [rioError, setRioError] = useState<string | null>(null)
  const [serie, setSerie] = useState<SerieDiariaRio | null>(null)
  const [prono, setProno] = useState<Pronostico | null>(null)
  /** No contestó: no es lo mismo que «no llueve», y se dice */
  const [pronoError, setPronoError] = useState(false)
  const [rutas, setRutas] = useState<ReturnType<typeof rutasDelRecuadro>>([])
  const [obras, setObras] = useState<ObraRelevada[] | null>(null)

  /** La altura elegida. `null` = todavía nadie tocó: se usa la de hoy */
  const [altura, setAltura] = useState<number | null>(null)
  const [conLluvia, setConLluvia] = useState(false)
  const [conCombinada, setConCombinada] = useState(false)
  const [verUrbano, setVerUrbano] = useState(true)
  const [verDefensa, setVerDefensa] = useState(true)
  const [verValle, setVerValle] = useState(true)

  // ── Lo que se carga una vez ──
  useEffect(() => {
    let vivo = true
    leerJson<IndiceInundaciones>('/geo/inundaciones/indice.json')
      .then(j => { if (vivo) setIndice(j) })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer el índice de capas') })
    leerJson<SerieDiariaRio>('/rio/barranqueras_diario.json')
      .then(j => { if (vivo) setSerie(j) }).catch(() => { /* sin registro no hay recurrencia: se dice abajo */ })
    leerJson<Pronostico>('/api/lluvia/pronostico')
      .then(j => { if (vivo) setProno(j) }).catch(() => { if (vivo) setPronoError(true) })
    leerJson<{ obras: ObraRelevada[] }>('/api/lluvia/obras-de-arte')
      .then(j => { if (vivo) setObras(j.obras ?? []) }).catch(() => { if (vivo) setObras(null) })
    leerJson<{ estaciones: { id: number; ultima: { fecha: string; m: number } | null; pronostico: { emitido: string; puntos: { fecha: string; m: number; banda: string }[] } | null }[] }>('/api/rio?dias=10')
      .then(j => {
        if (!vivo) return
        const b = j.estaciones.find(e => e.id === BARRANQUERAS.id)
        if (!b) { setRioError('Barranqueras no contestó'); return }
        const mayor = (banda: string) => (b.pronostico?.puntos ?? []).filter(p => p.banda === banda)
          .reduce<{ fecha: string; m: number } | null>((a, p) => (!a || p.m > a.m ? { fecha: p.fecha, m: p.m } : a), null)
        setRio({ ultima: b.ultima, pronMax: mayor('superior'), pronMedio: mayor('medio'), emitido: b.pronostico?.emitido ?? null })
      })
      .catch(e => { if (vivo) setRioError(e instanceof Error ? e.message : 'No se pudo consultar el río') })
    return () => { vivo = false }
  }, [])

  // Las rutas nacionales y provinciales, cuando ya se sabe el recuadro
  useEffect(() => {
    if (!indice) return
    let vivo = true
    Promise.all([leerJson<Parameters<typeof rutasDelRecuadro>[0]>('/geo/geo_rn.json'), leerJson<Parameters<typeof rutasDelRecuadro>[1]>('/geo/geo_rp.json')])
      .then(([rn, rp]) => { if (vivo) setRutas(rutasDelRecuadro(rn, rp, indice.recuadro)) })
      .catch(() => { /* sin rutas el cruce queda con los caminos de consorcio */ })
    return () => { vivo = false }
  }, [indice])

  // ── El escenario ──
  const h = altura ?? rio?.ultima?.m ?? BARRANQUERAS.alerta
  const esc = useMemo(() => indice ? escenarioRio(indice.capas, h) : null, [indice, h])

  /** El agua del río a esa altura, de la imagen más baja a la más alta */
  const delRio = useMemo(() => indice ? aguaDelRio(indice.capas, h) : [], [indice, h])

  /** Los ids de las capas que hay que tener dibujadas, en un texto estable: no cambia mientras el deslizador no cruza una imagen */
  const claveActivas = useMemo(() => {
    if (!esc) return ''
    return [
      'permanente', verUrbano && 'urbano-hoy', ...delRio.map(c => c.id),
      conLluvia && 'lluvia-2019-01-22', conLluvia && 'lluvia-2019-01-17',
      conCombinada && 'obs-1998-05-20',
    ].filter(Boolean).join(',')
  }, [esc, delRio, verUrbano, conLluvia, conCombinada])

  // Cada capa se pide recién cuando se la prende, y queda guardada
  useEffect(() => {
    if (!claveActivas) return
    let vivo = true
    for (const id of claveActivas.split(',')) {
      if (geo[id]) continue
      leerJson<{ id: string; coordinates: MultiPoligono; sinImagen?: MultiPoligono }>(`/geo/inundaciones/${id}.json`)
        .then(j => { if (vivo) setGeo(g => g[id] ? g : { ...g, [id]: { coords: j.coordinates, indice: new IndicePoligonos(j.coordinates), sinImagen: j.sinImagen, ciego: j.sinImagen ? new IndicePoligonos(j.sinImagen) : undefined } }) })
        .catch(e => { if (vivo) setError(e instanceof Error ? e.message : `No se pudo leer la capa ${id}`) })
    }
    return () => { vivo = false }
    // `geo` no va en las dependencias: cada capa que llega volvería a disparar el pedido de las otras
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveActivas])

  const activas = useMemo(() => {
    if (!indice) return []
    const ids = new Set(claveActivas.split(','))
    return indice.capas.filter(c => ids.has(c.id))
  }, [indice, claveActivas])

  // La imagen más alta para esta altura puede no cubrir todo: ahí lo dibujado llega hasta la anterior
  const idParcial = esc?.parcial?.id
  const parcialM = esc?.parcial?.alturaM, completaM = esc?.referencia?.alturaM ?? esc?.zona?.alturaM
  const dibujo: CapaDibujo[] = useMemo(() => activas.filter(c => geo[c.id]).flatMap(c => {
    const capa: CapaDibujo = {
      id: c.id, coords: geo[c.id].coords, ...estiloDe(c),
      // El mismo título para todas las del río: en la leyenda son una sola entrada.
      // Sin la altura, para que mover el deslizador no redibuje lo que no cambió
      titulo: esDelRio(c) ? 'Agua con el río a la altura elegida' : c.grupo === 'base' ? c.titulo : `Agua del ${c.titulo}`,
    }
    const ciego = geo[c.id].sinImagen
    if (!ciego) return [capa]
    // De las del río, sólo la parcial vigente marca su límite: con una imagen más alta que ve todo ya no hace falta
    if (esDelRio(c)) {
      if (c.id !== idParcial || parcialM === undefined) return [capa]
      return [capa, {
        id: `${c.id}-sin-imagen`, coords: ciego, ...ESTILO_CIEGO, titulo: `Hasta dónde llega la imagen de ${f2(parcialM)} m`,
        // Corto y en dos renglones: en uno solo el cartel medía media ciudad y la tapaba
        rotulo: `<span class="tt-k">Sin imagen de ${f2(parcialM)} m</span>${completaM !== undefined ? `<br>acá, agua hasta ${f2(completaM)} m` : ''}`,
      }]
    }
    return [capa, { id: `${c.id}-sin-imagen`, coords: ciego, ...ESTILO_CIEGO, titulo: `Sin imagen el ${c.titulo.slice(0, 10)}`, rotulo: `Sin imagen el ${c.titulo.slice(0, 10)}` }]
  }), [activas, geo, idParcial, parcialM, completaM])

  // ── El recinto defendido ──
  // Con la defensa en pie, el agua del río no entra al recinto hasta que el río
  // pasa el coronamiento. El anillo no cierra: por el sur el recinto se corta
  // en la Av. Soberanía Nacional, y al sur de ella el río sí entra. Las otras capas —lluvia, río con lluvia, defensa
  // rota— sí van adentro: son agua que no vino por arriba del terraplén.
  const recinto = indice?.recintos?.[0]
  const recintoIdx = useMemo(() => recinto ? new IndicePoligonos([[recinto.anillo]]) : null, [recinto])
  const techo = recinto ? techoDelRecinto(recinto, indice?.defensas) : null
  /** El recinto recorta el agua del río. Sin cota conocida se lo toma en pie */
  const defendido = !!recintoIdx && (techo === null || h < techo)
  /**
   * El terraplén mismo: sobre él no hay agua del río ni camino cortado
   * mientras el río no pase el coronamiento. Se dibuja borrado igual que el recinto
   */
  /** Los terraplenes: la defensa y las rutas que hacen de defensa (la RN 11), cada uno con su franja */
  const terraplenes = useMemo(() => {
    const defensa = indice?.defensas?.find(d => d.id === recinto?.defensa)
    // La defensa protege mientras el río no pase su coronamiento; las rutas
    // nacionales en terraplén alto no se cortan nunca (indicación del usuario)
    const todos = [
      ...(defensa ? [{ nombre: 'la defensa', lineas: defensa.lineas, siempre: false }] : []),
      ...(indice?.terraplenes ?? []).map(t => ({ nombre: `la ${t.nombre}`, lineas: t.lineas, siempre: true })),
    ]
    return todos.map(t => ({ ...t, franja: franjaDeDefensa(t.lineas) }))
  }, [indice, recinto])
  /** Los terraplenes que valen a esta altura del río */
  const vigentes = useMemo(() => terraplenes.filter(t => t.siempre || defendido), [terraplenes, defendido])
  const recorteDibujo = useMemo(() => {
    const out = [...(recinto && defendido ? [recinto.anillo] : []), ...vigentes.flatMap(t => franjaParaDibujar(t.lineas))]
    return out.length ? out : null
  }, [recinto, defendido, vigentes])

  // ── El valle de inundación del Paraná ──
  const valle = indice?.valle
  const valleIdx = useMemo(() => valle ? new IndicePoligonos(valle.poligonos) : null, [valle])

  /** Lo que la defensa protege mientras el río no la pase: el recinto y el terraplén mismo */
  const protegido = useMemo(() => (defendido && recintoIdx) || vigentes.length ? {
    contiene: (lat: number, lng: number) => (defendido && !!recintoIdx?.contiene(lat, lng)) || vigentes.some(t => t.franja.contiene(lat, lng)),
  } : null, [defendido, recintoIdx, vigentes])

  /** Las capas de agua del escenario (sin el fondo), con su índice ya armado */
  const agua = useMemo(
    () => activas.filter(c => c.grupo !== 'base' && geo[c.id]).map(c => ({
      capa: c,
      indice: protegido && esDelRio(c) ? fueraDe(geo[c.id].indice, protegido) : geo[c.id].indice,
    })),
    [activas, geo, protegido])

  const vias = useMemo(
    () => indice ? [...rutas, ...caminosDelRecuadro(tramos, indice.recuadro)] : [],
    [indice, rutas, tramos])

  const permanente = geo.permanente?.indice
  const cruce = useMemo(() => {
    const idx = agua.map(a => a.indice)
    // Lo que va sobre agua permanente es un puente, no un camino inundado
    // Ni lo que va sobre el puente o su acceso elevado
    const elevadas = indice?.elevadas
    const afectadas = vias.map(v => viaContra(v, idx, [...(permanente ? [permanente] : []), ...elevadosDe(v, elevadas)]))
    return { resumen: resumirVias(afectadas), partes: afectadas.flatMap(a => a.partes) }
  }, [vias, agua, permanente, indice])

  const lineas: LineaDibujo[] = useMemo(
    () => vias.map(v => ({ puntos: v.puntos, ...COLOR_VIA[v.clase] })), [vias])

  const obrasAca = useMemo(() => {
    if (!indice || !obras) return []
    const c = indice.recuadro
    return obras.filter(o => o.lat >= c.sur && o.lat <= c.norte && o.lng >= c.oeste && o.lng <= c.este)
      .map(o => ({ ...o, dentro: agua.some(a => a.indice.contiene(o.lat, o.lng)) }))
  }, [indice, obras, agua])
  const puntos: PuntoDibujo[] = useMemo(
    () => obrasAca.map(o => ({ lat: o.lat, lng: o.lng, dentro: o.dentro, titulo: o.tipo })), [obrasAca])

  /** Las defensas, en el formato del mapa. Vacío si se apagaron */
  const defensas = useMemo(
    () => (verDefensa ? indice?.defensas ?? [] : []).map(d => ({ nombre: d.nombre, lineas: d.lineas })),
    [indice, verDefensa])

  const urbanoIdx = geo['urbano-hoy']?.indice
  const ciegoParcial = idParcial ? geo[idParcial]?.ciego : undefined
  const leer = useCallback((lat: number, lng: number) => {
    const out: string[] = []
    // Del río, la imagen más baja que tiene agua ahí: desde qué altura se la vio
    const adentro = defendido && !!recintoIdx?.contiene(lat, lng)
    const sobre = !adentro ? vigentes.find(t => t.franja.contiene(lat, lng)) : undefined
    const enTerraplen = !!sobre
    const primera = adentro || enTerraplen ? undefined : delRio.find(c => geo[c.id]?.indice.contiene(lat, lng))
    if (enTerraplen) {
      out.push(`sobre el terraplén de ${sobre!.nombre}${sobre!.siempre ? '' : techo !== null ? `: el río no lo pasa hasta ${f2(techo)} m` : ''}`)
    } else if (adentro && techo !== null) {
      out.push(`dentro del recinto defendido: el río no entra hasta ${f2(techo)} m`)
    } else if (adentro) {
      out.push('dentro del recinto defendido')
    } else if (primera) {
      out.push(primera.grupo === 'rio' ? `agua con el río hasta ${primera.alturaM} m`
        : `agua con el río en ${f2(primera.alturaM!)} m · imagen del ${primera.titulo}`)
    } else if (ciegoParcial?.contiene(lat, lng) && parcialM !== undefined) {
      out.push(`sin agua hasta ${f2(completaM ?? 0)} m · la imagen de ${f2(parcialM)} m no cubre este punto`)
    }
    if (valleIdx?.contiene(lat, lng)) out.push('en el valle de inundación del Paraná')
    else if (recinto && !recintoIdx?.contiene(lat, lng) && alSurDe(recinto.corte, lat, lng)) {
      out.push(`al sur de la ${recinto.corteNombre}: sin defensa contra el río`)
    }
    for (const a of agua) if (!esDelRio(a.capa) && a.indice.contiene(lat, lng)) out.push(`agua del ${a.capa.titulo}`)
    if (urbanoIdx?.contiene(lat, lng)) out.push('construido hoy')
    // Cerca de la traza, de qué lado: lejos el tramo más cercano puede ser el de la otra punta
    for (const d of defensas) {
      const l = ladoDeDefensa(d.lineas, lat, lng)
      if (l) out.push(`${l.lado === 'rio' ? 'del lado del río' : 'del lado de la ciudad'} de la defensa, a ${l.km < 1 ? `${Math.round(l.km * 1000)} m` : `${f1(l.km)} km`}`)
    }
    return out
  }, [delRio, geo, agua, urbanoIdx, ciegoParcial, parcialM, completaM, defensas, defendido, recintoIdx, techo, valleIdx, recinto, vigentes])

  // ── Qué tan seguido llega el río a esa altura ──
  const registro = useMemo(() => {
    if (!serie) return null
    const maximos = extremosAnuales(serie).filter(a => a.completo).map(a => a.max)
    return { maximos, g: ajustarGumbel(maximos) }
  }, [serie])
  const frecuencia = useMemo(() => {
    if (!registro) return null
    const c = aniosSobre(registro.maximos, h)
    return { ...c, cada: registro.g ? recurrenciaDe(registro.g, h) : null }
  }, [registro, h])

  // ── La lluvia pronosticada sobre el área ──
  const lluvia = useMemo(() => {
    if (!prono || !indice) return null
    const nodos = nodosDelRecuadro(prono.puntos, indice.recuadro)
    if (!nodos.length) return null
    const porCorrida = laminaPorCorrida(prono, nodos)
    const siete = ventana(porCorrida, 0, 7)
    return { nodos: nodos.length, tres: ventana(porCorrida, 0, 3), siete, p100: siete ? probSuperar(siete, 100) : null }
  }, [prono, indice])

  const informes = useMemo(() => informesHasta(indice?.informes, h), [indice, h])
  // Una línea de referencia se dibuja sólo mientras está a la vista el informe
  // que habla de ella: suelta, es una raya con nombre que no se refiere a nada
  // El Canal 16 no se dibuja nunca (indicación del usuario, 08/10/2026): de lo
  // informado queda sólo el texto. Las referencias siguen en el índice
  const referencias = useMemo(() => [] as { nombre: string; lineas: [number, number][][] }[], [])

  /** Las marcas del deslizador. Arriba, lo de hoy; abajo, los niveles del INA y los picos del registro */
  const marcas = useMemo(() => {
    const arriba: { t: string; m: number; d: string }[] = []
    if (rio?.ultima) arriba.push({ t: 'Hoy', m: rio.ultima.m, d: `${f2(rio.ultima.m)} m, medido el ${fFecha(rio.ultima.fecha)}` })
    // El pronóstico pegado a lo de hoy se pisaría con su rótulo
    if (rio?.pronMax && (!rio.ultima || Math.abs(rio.pronMax.m - rio.ultima.m) >= 0.6)) {
      arriba.push({ t: 'Pronóstico', m: rio.pronMax.m, d: `${f2(rio.pronMax.m)} m, techo de la banda del INA para el ${fFecha(rio.pronMax.fecha)}` })
    }
    const abajo = [
      { t: 'Alerta', m: BARRANQUERAS.alerta, d: `${f2(BARRANQUERAS.alerta)} m, nivel de alerta del INA` },
      { t: 'Evacuación', m: BARRANQUERAS.evacuacion, d: `${f2(BARRANQUERAS.evacuacion)} m, nivel de evacuación del INA` },
      { t: '2023', m: 7.05, d: '7,05 m, referencia: pico del 10/11/2023' },
      { t: '1998', m: 8.17, d: '8,17 m, referencia: pico del 04/05/1998' },
      { t: '1983', m: 8.59, d: '8,59 m, referencia: el 22/06/1983, máximo del registro, sin el anillo de defensas' },
    ]
    return { arriba, abajo }
  }, [rio])

  /** Lo que queda bajo agua: el mayor de cada columna entre las capas dibujadas. Se pisan, así que no se suman */
  const bajoAgua = useMemo(() => {
    // Con la defensa en pie, lo que la capa tiene dentro del recinto no cuenta
    const mayor = (k: 'km2' | 'urbanoKm2' | 'construidoKm2') => delRio.reduce((a, c) =>
      Math.max(a, Math.max(0, (c[k] ?? 0) - (defendido ? c.enRecinto?.[k] ?? 0 : 0))), 0)
    return { km2: mayor('km2'), urbano: mayor('urbanoKm2'), construido: mayor('construidoKm2') }
  }, [delRio, defendido])
  const imagenes = delRio.filter(c => c.grupo === 'observada')

  /** Las capas del río que ven todo el recuadro, de la más baja a la más alta, con qué parte del valle mojan */
  const porAltura = useMemo(() => {
    const total = indice?.valle?.enRecuadroKm2
    if (!total || !indice) return []
    return indice.capas.filter(c => c.porZona && c.alturaM !== undefined && (c.vistoPct === undefined || c.vistoPct >= 90))
      .sort((a, b) => a.alturaM! - b.alturaM!)
      .map(c => ({ ...c, pct: 100 * c.porZona!.valleKm2 / total }))
  }, [indice])
  /** Con lo dibujado: el mayor de cada columna, como las cifras de arriba */
  const valleAhora = useMemo(() => {
    const total = indice?.valle?.enRecuadroKm2
    const con = delRio.filter(c => c.porZona)
    if (!total || !con.length) return null
    const v = Math.max(...con.map(c => c.porZona!.valleKm2)), ch = Math.max(...con.map(c => c.porZona!.chacoKm2))
    return { valle: v, pct: 100 * v / total, chaco: ch }
  }, [indice, delRio])
  const masAlta = imagenes[imagenes.length - 1]

  if (error && !indice) {
    return <div style={{ ...aviso, margin: 12 }}><b>No se pudieron cargar las capas.</b> {error}</div>
  }
  if (!indice || !esc) return <div style={{ ...texto, padding: 20 }}>Cargando…</div>

  const combinado = conLluvia && h >= BARRANQUERAS.alerta
  const filaCapa = (c: CapaInundacion) => (
    <tr key={c.id}>
      <td style={{ padding: '3px 6px 3px 0', color: '#d0d0d0' }}>
        <span style={{ display: 'inline-block', width: 9, height: 9, background: estiloDe(c).color, marginRight: 6 }} />
        {c.grupo === 'rio' ? `Río hasta ${c.alturaM} m` : c.titulo}
        {c.vistoPct !== undefined && <span style={{ color: '#8f8f8f' }}> · ve el {c.vistoPct} %</span>}
      </td>
      <td style={{ textAlign: 'right', padding: '3px 0 3px 8px', color: '#e0e0e0' }}>{c.km2 === undefined ? '—' : f1(c.km2)}</td>
      <td style={{ textAlign: 'right', padding: '3px 0 3px 8px', color: '#e0e0e0' }}>{c.urbanoKm2 === undefined ? '—' : f1(c.urbanoKm2)}</td>
      <td style={{ textAlign: 'right', padding: '3px 0 3px 8px', color: c.construidoKm2 && c.construidoKm2 >= 0.5 ? '#E8833A' : '#e0e0e0' }}>
        {c.construidoKm2 === undefined ? '—' : f2(c.construidoKm2)}
      </td>
    </tr>
  )

  const marca = (a: { t: string; m: number; d: string }, arriba: boolean) => {
    const activa = Math.abs(h - a.m) < 0.005
    return (
      <button key={a.t} type="button" title={a.d} onClick={() => setAltura(a.m)} style={{
        ...mono, position: 'absolute', left: enRiel(a.m), transform: 'translateX(-50%)', [arriba ? 'bottom' : 'top']: 0,
        display: 'flex', flexDirection: arriba ? 'column' : 'column-reverse', alignItems: 'center', gap: 1,
        background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', whiteSpace: 'nowrap',
        fontSize: 11, color: activa ? ACENTO : arriba ? '#e0e0e0' : '#a0a0a0',
      }}>
        <span>{a.t}</span>
        <span style={{ width: 1, height: 6, background: activa ? ACENTO : '#8f8f8f' }} />
      </button>
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 360, display: 'flex', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#191919', border: '1px solid #1e1e1e' }}>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <MapaInundaciones recuadro={indice.recuadro} urbano={indice.urbano}
            capas={dibujo} vias={lineas} afectadas={cruce.partes} obras={puntos} referencias={referencias} defensas={defensas}
            recorte={recorteDibujo}
            corte={recinto && verDefensa ? { nombre: recinto.corteNombre, linea: recinto.corte } : null}
            valle={valle && verValle ? { nombre: 'Valle de inundación del Paraná', poligonos: valle.poligonos } : null} leer={leer} />
        </div>

        {/* ── El control: la altura del río ── */}
        <div className="sv-panel" style={{ flexShrink: 0, borderTop: '1px solid #1e1e1e', borderLeft: `3px solid ${ACENTO}`, background: '#111', padding: '10px 18px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ ...rotulo, marginBottom: 0 }}>Altura del río en Barranqueras{defendido && ' · con la defensa de hoy'}</span>
            <span style={{ ...mono, fontSize: 28, color: '#fff', fontWeight: 700, lineHeight: 1 }}>{f2(h)} <span style={{ fontSize: 14, fontWeight: 400, color: '#a0a0a0' }}>m</span></span>
            <span style={{ ...texto, marginLeft: 'auto', textAlign: 'right' }}>
              {frecuencia ? (frecuencia.veces === 0
                ? <>El río nunca llegó a esa altura en {frecuencia.de} años de registro</>
                : <>El río llegó a esa altura en <b style={{ color: '#fff' }}>{frecuencia.veces} de {frecuencia.de}</b> años</>)
                : 'Mové el deslizador para ver qué se inunda'}
            </span>
          </div>
          <div style={{ position: 'relative', height: 22, marginTop: 4 }}>{marcas.arriba.map(a => marca(a, true))}</div>
          <input type="range" className="sv-range sv-range-grande" min={RIO_MIN} max={RIO_MAX} step={0.01} value={Math.min(RIO_MAX, Math.max(RIO_MIN, h))}
            onChange={e => setAltura(Number(e.target.value))} style={{ width: '100%', display: 'block' }}
            aria-label="Altura del río en Barranqueras, en metros" />
          <div style={{ position: 'relative', height: 22 }}>{marcas.abajo.map(a => marca(a, false))}</div>
        </div>
      </div>

      <div className="sv-panel" style={{ width: 380, flexShrink: 0, overflowY: 'auto', minHeight: 0,
        background: '#191919', border: '1px solid #1e1e1e' }}>

        {/* ── Qué se inunda ── */}
        <div style={{ ...seccion, borderTop: 'none' }}>
          <div style={rotulo}>Con el río en {f2(h)} m</div>
          <div style={{ display: 'flex', gap: 14 }}>
            {([[bajoAgua.km2, 'km² bajo agua'], [bajoAgua.urbano, 'en el área urbana'], [bajoAgua.construido, 'sobre lo construido hoy']] as const).map(([v, t]) => (
              <div key={t} style={{ flex: 1 }}>
                <div style={{ ...cifra, color: t !== 'km² bajo agua' && v >= 0.5 ? '#E8833A' : '#fff' }}>{v >= 10 ? Math.round(v) : f1(v)}</div>
                <div style={{ ...texto, fontSize: 11 }}>{t}</div>
              </div>
            ))}
          </div>
          <div style={{ ...texto, fontSize: 11, color: '#8f8f8f', marginTop: 6 }}>
            Como mínimo, y sin contar el río y las lagunas de siempre (cota MOP {f2(cotaMop(h))}).
          </div>

          <div style={{ ...texto, marginTop: 10 }}>
            <b style={{ color: C_RIO }}>Celeste:</b>{' '}
            {defendido && <>fuera del recinto defendido, </>}
            {masAlta ? (<>
              donde se vio agua desde un satélite con el río a esta altura o más bajo. Son {imagenes.length}{' '}
              {imagenes.length === 1 ? 'imagen' : 'imágenes'} de crecidas; la más alta, del {masAlta.titulo}, con el río en {f2(masAlta.alturaM!)} m.
            </>) : (<>
              donde hubo agua en la mitad o más de las {esc.zona?.escenas} imágenes de satélite con el río hasta {esc.zona?.alturaM} m.
            </>)}
          </div>

          {(indice.defensas ?? []).map(d => (
            <label key={d.id} style={{ ...texto, display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer', marginTop: 6 }}>
              <input type="checkbox" checked={verDefensa} onChange={e => setVerDefensa(e.target.checked)} style={{ marginTop: 3 }} />
              <span><b style={{ color: '#c9955a' }}>Color tierra:</b> la {d.nombre.charAt(0).toLowerCase() + d.nombre.slice(1)}, {f1(d.km)} km.
                {' '}Pasando el cursor cerca dice de qué lado queda cada punto.
                {d.coronamientoMop !== undefined && (<>
                  <br />Coronamiento en cota MOP {f2(d.coronamientoMop)}, que es <b style={{ color: '#fff' }}>{f2(enEscala(d.coronamientoMop))} m</b> en
                  la escala de Barranqueras: con el río en {f2(h)} m le quedan <b style={{ color: '#fff' }}>{f2(enEscala(d.coronamientoMop) - h)} m</b>.
                  <span style={{ color: '#8f8f8f' }}> Es la cota de Puerto Vilelas tomada para toda la traza: un punto bajo del terraplén tendría menos. Con viento hay ola, y con el río alto el terraplén puede fallar sin desbordar.</span>
                </>)}
                {recinto && d.id === recinto.defensa && (<>
                  <br />Con la RN 11 al oeste encierra el recinto defendido ({Math.round(recinto.areaKm2)} km²): adentro no se dibuja el agua del río.
                  <br /><b style={{ color: '#fff' }}>El anillo no cierra.</b> Entre la punta sur de la defensa y la RN 11 no hay terraplén: el
                  recinto se corta en la {recinto.corteNombre} (gris a rayas, {f1(recinto.corteKm)} km), que no es una defensa.
                  Al sur de la avenida el río entra, y es la parte más expuesta del Gran Resistencia.
                  <span style={{ color: '#8f8f8f' }}> El agua que se ve dentro del recinto es de lluvia, en «Otros eventos».</span>
                </>)}</span>
            </label>
          ))}

          {esc.sobreObservado && (
            <div style={aviso}><b>No hay ninguna imagen con el río tan alto.</b> Lo más alto que se vio es {f2(masAlta?.alturaM ?? 0)} m,
              {' '}{f2(esc.faltaM ?? 0)} m menos. Lo dibujado es un piso: con {f2(h)} m habría más agua.</div>
          )}
          {!esc.sobreObservado && esc.sobreZonas && masAlta && (esc.faltaM ?? 0) >= 0.3 && (
            <div style={aviso}>La imagen más cercana por debajo es de {f2(masAlta.alturaM!)} m, {f2(esc.faltaM!)} m menos que lo pedido. Con {f2(h)} m habría más agua que la dibujada.</div>
          )}
          {esc.parcial && (
            <div style={informe}>
              <b style={{ color: '#e8e8e8' }}>La imagen de {f2(esc.parcial.alturaM!)} m no cubre todo.</b> Es del {esc.parcial.titulo} y ve la ciudad pero no el valle
              del Paraná ({esc.parcial.vistoPct} % del área). En el mapa, la línea a rayas marca hasta dónde llega: del otro lado lo
              dibujado es hasta {f2(completaM ?? 0)} m.
            </div>
          )}
          {masAlta?.epoca && (
            <div style={aviso}><b>Sobre 7,3 m la referencia es {masAlta.epoca}</b>, cuando el anillo de defensas no estaba terminado.
              {defendido
                ? <> Se usa sólo afuera del recinto, para ver hasta dónde llega el río; adentro no se dibuja, porque hoy la defensa está.</>
                : <> Dentro del recinto no dice qué pasaría hoy; fuera, sí.</>}</div>
          )}
          {informes.map(i => (
            <div key={i.id} style={informe}>
              <span style={{ color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>
                Informado, sin imagen · {f2(i.alturaM)} m, {fFecha(i.fecha)}
              </span>
              <br /><b style={{ color: '#e8e8e8' }}>{i.texto}</b>
              <br />{i.contraste}
            </div>
          ))}
        </div>

        {/* ── El valle del Paraná ── */}
        {valle && (
          <div style={seccion}>
            <div style={rotulo}>Por dónde entra el río</div>
            <label style={{ ...texto, display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer' }}>
              <input type="checkbox" checked={verValle} onChange={e => setVerValle(e.target.checked)} style={{ marginTop: 3 }} />
              <span><b style={{ color: '#9C4DCC' }}>Violeta:</b> el valle de inundación del Paraná, la franja baja entre el cauce y la
                tierra alta, como está en las cuencas de la provincia. Su borde norte llega a la punta sur de la defensa: por el
                sur de Resistencia, donde el anillo no cierra, no hay terraplén entre el valle y los barrios.</span>
            </label>
            {valleAhora && (
              <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={cifra}>{Math.round(valleAhora.pct)} %</div>
                  <div style={{ ...texto, fontSize: 11 }}>del valle con agua ({Math.round(valleAhora.valle)} de {Math.round(valle.enRecuadroKm2)} km²)</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={cifra}>{Math.round(valleAhora.chaco)}</div>
                  <div style={{ ...texto, fontSize: 11 }}>km² más en la margen chaqueña, fuera del valle y del recinto</div>
                </div>
              </div>
            )}
            <table style={{ ...mono, fontSize: 11, width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
              <thead>
                <tr style={{ color: '#8f8f8f' }}>
                  <th style={{ textAlign: 'left', fontWeight: 400, padding: '0 6px 3px 0' }}>Río</th>
                  <th style={{ textAlign: 'right', fontWeight: 400, padding: '0 0 3px 6px' }}>valle</th>
                  <th style={{ textAlign: 'right', fontWeight: 400, padding: '0 0 3px 6px' }}>margen, km²</th>
                </tr>
              </thead>
              <tbody>
                {porAltura.map(c => {
                  const dibujada = delRio.some(d => d.id === c.id)
                  return (
                    <tr key={c.id} style={{ color: dibujada ? '#e0e0e0' : '#8f8f8f' }}>
                      <td style={{ padding: '2px 6px 2px 0' }}>
                        <span style={{ color: dibujada ? C_RIO : 'transparent' }}>■ </span>
                        {c.grupo === 'rio' ? `hasta ${c.alturaM} m` : `${f2(c.alturaM!)} m · ${c.titulo.slice(0, 10)}`}
                      </td>
                      <td style={{ textAlign: 'right', padding: '2px 0 2px 6px' }}>
                        <span style={{ display: 'inline-block', width: 40, height: 6, background: '#2a2a2a', marginRight: 5, verticalAlign: 'middle' }}>
                          <span style={{ display: 'block', height: 6, width: `${Math.min(100, c.pct)}%`, background: '#9C4DCC' }} />
                        </span>
                        {Math.round(c.pct)} %
                      </td>
                      <td style={{ textAlign: 'right', padding: '2px 0 2px 6px' }}>{Math.round(c.porZona!.chacoKm2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ ...texto, fontSize: 11, color: '#8f8f8f', marginTop: 6 }}>
              Qué parte del valle tuvo agua en cada capa del río, y cuánta más hubo en el resto de la margen chaqueña.
              Hasta 6 m el río casi no sale al valle: menos de una décima parte. En los días de crecida que se vieron con
              6,9 m o más, el agua cubrió entre la mitad y cuatro quintos del valle. Fuera de él también se moja la margen
              chaqueña, y más cuanto más alto viene el río. Medido dentro del recuadro y sin el agua de siempre; no entran
              las imágenes que no ven todo el recuadro, ni lo que queda del otro lado del cauce (islas y Corrientes).
            </div>
          </div>
        )}

        {/* ── Qué viene río arriba ── */}
        <div style={seccion}>
          <div style={rotulo}>Qué viene río arriba</div>
          <RioArriba />
        </div>

        {/* ── Rutas ── */}
        <div style={seccion}>
          <div style={rotulo}>Rutas y caminos dentro del agua</div>
          {cruce.resumen.map(r => (
            <div key={r.clase} style={{ ...texto, marginBottom: 6 }}>
              <span style={{ display: 'inline-block', width: 14, height: 3, background: COLOR_VIA[r.clase].color, marginRight: 7, verticalAlign: 'middle' }} />
              <span style={{ color: '#d0d0d0' }}>{ROTULO_VIA[r.clase]}:</span>{' '}
              <b style={{ color: r.kmDentro >= 0.05 ? '#E57373' : '#fff' }}>{f1(r.kmDentro)} km</b> de {f1(r.km)}
              {r.rutas.length > 0 && (
                <div style={{ color: '#a0a0a0', paddingLeft: 21 }}>
                  {r.rutas.slice(0, 8).map(x => `${x.nombre} ${f1(x.kmDentro)} km`).join(' · ')}
                  {r.rutas.length > 8 && ` · y ${r.rutas.length - 8} más`}
                </div>
              )}
            </div>
          ))}
          <div style={{ ...texto, fontSize: 11, color: '#8f8f8f' }}>
            En rojo en el mapa. Que un tramo caiga adentro no quiere decir que se corte: la mancha no ve terraplenes.
            Es la lista de dónde mirar.
            {(indice.elevadas ?? []).map(e => <> No cuenta el {e.nombre.charAt(0).toLowerCase() + e.nombre.slice(1)} ({e.via}): va elevado y el agua no lo corta.</>)}
            {tramos.length === 0 && ' Los caminos de consorcio todavía están cargando.'}
          </div>
          {obras !== null && obrasAca.length > 0 && (
            <div style={{ ...texto, marginTop: 8 }}>
              Obras de arte relevadas: <b style={{ color: obrasAca.some(o => o.dentro) ? '#E57373' : '#fff' }}>{obrasAca.filter(o => o.dentro).length}</b> de{' '}
              {obrasAca.length} quedan dentro del agua.
              {obrasAca.filter(o => o.dentro).slice(0, 6).map(o => (
                <div key={o.id} style={{ color: '#a0a0a0' }}>{o.tipo}{o.rutaTramo ? ` · ${o.rutaTramo}` : ''}</div>
              ))}
            </div>
          )}
        </div>

        {/* ── Situación ── */}
        <div style={seccion}>
          <div style={rotulo}>Situación de hoy</div>
          <div style={texto}>
            {rio?.ultima ? (<>
              Río en Barranqueras: <b style={{ color: '#fff' }}>{f2(rio.ultima.m)} m</b> el {fFecha(rio.ultima.fecha)}
              {rio.ultima.m >= BARRANQUERAS.evacuacion ? <b style={{ color: '#E57373' }}> · sobre evacuación</b>
                : rio.ultima.m >= BARRANQUERAS.alerta ? <b style={{ color: '#E8833A' }}> · sobre alerta</b>
                : <> · faltan {f2(BARRANQUERAS.alerta - rio.ultima.m)} m para el alerta</>}.
            </>) : rioError ? <span style={{ color: '#E8A87C' }}>No se pudo consultar el río: {rioError}.</span> : 'Consultando el río…'}
            {rio?.pronMax && (<>
              <br />Pronóstico del INA: hasta <b style={{ color: '#fff' }}>{f2(rio.pronMax.m)} m</b> el {fFecha(rio.pronMax.fecha)}
              {rio.pronMedio && <> (valor central, {f2(rio.pronMedio.m)} m)</>}.
            </>)}
            {rio && !rio.pronMax && <><br />El INA no tiene corrida de pronóstico publicada para Barranqueras.</>}
            <br />
            {lluvia?.siete && lluvia.tres ? (<>
              Lluvia pronosticada sobre el área: <b style={{ color: '#fff' }}>{Math.round(lluvia.tres.mediana)} mm</b> en 3 días
              ({Math.round(lluvia.tres.p10)}–{Math.round(lluvia.tres.p90)}) y{' '}
              <b style={{ color: '#fff' }}>{Math.round(lluvia.siete.mediana)} mm</b> en 7
              ({Math.round(lluvia.siete.p10)}–{Math.round(lluvia.siete.p90)}).
              {lluvia.p100 !== null && lluvia.p100 >= 0.1 && <b style={{ color: '#E8833A' }}> {Math.round(lluvia.p100 * 100)} % de las corridas da 100 mm o más en la semana.</b>}
            </>) : pronoError
              ? <span style={{ color: '#E8A87C' }}>No se pudo consultar el pronóstico de lluvia. Está en Cuencas → Pronóstico.</span>
              : 'Consultando el pronóstico de lluvia…'}
          </div>
          {frecuencia && frecuencia.cada !== null && frecuencia.cada >= 1.5 && (
            <div style={{ ...texto, fontSize: 11, color: '#8f8f8f', marginTop: 4 }}>
              La altura elegida ({f2(h)} m) se alcanza 1 año de cada {frecuencia.cada >= 20 ? Math.round(frecuencia.cada) : f1(frecuencia.cada)}, según el ajuste del registro desde 1906.
            </div>
          )}
        </div>

        {/* ── Otros eventos: plegado ── */}
        <details style={seccion}>
          <summary style={plegado}>Otros eventos de referencia: lluvia</summary>
          <div style={{ ...rotulo, marginTop: 12 }}>Lluvia intensa y larga</div>
          <label style={{ ...texto, display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer', color: '#d0d0d0' }}>
            <input type="checkbox" checked={conLluvia} onChange={e => setConLluvia(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Mostrar lo que dejó enero de 2019: 588 mm en 17 días, con el río en 4 m</span>
          </label>
          {conLluvia && (
            <div style={{ ...texto, marginTop: 8 }}>
              <b style={{ color: '#ab47bc' }}>Violeta oscuro:</b> agua abierta el 17/01/2019, cinco días después de lo peor.<br />
              <b style={{ color: '#ce93d8' }}>Violeta claro:</b> suelo saturado el 22/01/2019.
            </div>
          )}
          <div style={{ ...texto, fontSize: 11, color: '#8f8f8f', marginTop: 8 }}>
            Es el único evento de lluvia con imagen, y la imagen llega tarde: el agua en la calle dura horas y no se ve
            a 10 m. Sirve para ver dónde se junta fuera del casco, no qué barrios se anegan. Para eso está el mapa de
            amenaza por precipitaciones de la APA (Resolución 121/14).
          </div>

          <div style={{ ...rotulo, marginTop: 14 }}>Río alto y lluvia a la vez</div>
          <div style={texto}>
            No se suman: se condicionan. Con el río alto el agua de una tormenta no sale por gravedad y depende del
            bombeo. Con imagen hay un solo caso claro: abril y mayo de 1998.
          </div>
          <label style={{ ...texto, display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer', color: '#d0d0d0', marginTop: 8 }}>
            <input type="checkbox" checked={conCombinada} onChange={e => setConCombinada(e.target.checked)} style={{ marginTop: 3 }} />
            <span><b style={{ color: '#ef5350' }}>Rojo:</b> el agua del 20/05/1998, río en 7,07 m tras un pico de 8,17 y el abril más lluvioso de la serie</span>
          </label>
          {combinado && (
            <div style={aviso}>
              <b>Río sobre el alerta y lluvia a la vez.</b> Lo dibujado son las dos manchas superpuestas, cada una observada por
              separado. La combinación real es peor que la superposición y no hay con qué calcularla: faltan las cotas y la
              capacidad de las estaciones de bombeo.
            </div>
          )}
        </details>

        {/* ── Detalle por imagen: plegado ── */}
        <details style={seccion}>
          <summary style={plegado}>Detalle: de qué imagen sale cada cosa</summary>
          <div style={{ height: 10 }} />
          <table style={{ ...mono, fontSize: 12, width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#8f8f8f', fontSize: 11 }}>
                <th style={{ textAlign: 'left', fontWeight: 400, padding: '0 6px 4px 0' }}>Capa</th>
                <th style={{ textAlign: 'right', fontWeight: 400, padding: '0 0 4px 8px' }}>km²</th>
                <th style={{ textAlign: 'right', fontWeight: 400, padding: '0 0 4px 8px' }}>urbano</th>
                <th style={{ textAlign: 'right', fontWeight: 400, padding: '0 0 4px 8px' }}>construido</th>
              </tr>
            </thead>
            <tbody>{activas.filter(c => c.grupo !== 'base').map(filaCapa)}</tbody>
          </table>
          <div style={{ ...texto, fontSize: 11, color: '#8f8f8f', marginTop: 6 }}>
            Fuera del agua de siempre. «Urbano» es el recuadro de {Math.round(indice.urbanoKm2)} km² que contiene a Fontana,
            Resistencia, Barranqueras y Vilelas; «construido», lo edificado hoy ahí adentro ({f1(indice.construidoHoyKm2)} km²).
            Cada capa por separado: no se suman.
          </div>
          <label style={{ ...texto, display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', marginTop: 8 }}>
            <input type="checkbox" checked={verUrbano} onChange={e => setVerUrbano(e.target.checked)} />
            <span>Dibujar lo construido hoy (gris)</span>
          </label>

          {imagenes.length > 0 && (
            <div style={{ ...texto, fontSize: 11, color: '#8f8f8f', marginTop: 8 }}>
              {imagenes.map(c => `${c.titulo}: ${c.sensor}${c.nota ? `. ${c.nota}` : ''}`).join(' · ')}
            </div>
          )}
        </details>

        {/* ── Cómo leerlo ── */}
        <details style={seccion}>
          <summary style={plegado}>Cómo leerlo</summary>
          <div style={{ ...texto, fontSize: 11, color: '#8f8f8f', marginTop: 10 }}>
            Toda el agua dibujada es agua que se vio desde un satélite, con su fecha. No hay modelo hidráulico ni cotas del
            terreno: no da profundidades ni sirve para un lote. No ve agua debajo de monte ni de nubes, así que cada
            mancha es un piso; la línea a rayas encierra lo que una imagen no llegó a ver. Lo «informado» es lo que se sabe que
            pasó y no tiene imagen: no se pinta. La zonificación que vale para un certificado de riesgo hídrico es la de la APA.
            {error && <><br /><span style={{ color: '#E8A87C' }}>{error}</span></>}
          </div>
        </details>
      </div>
    </div>
  )
}
