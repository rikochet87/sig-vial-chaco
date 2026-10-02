/**
 * Los cursos de agua y los canales de la provincia, y dónde los cruza la red
 * vial.
 *
 * Salen de `public/geo/geo_hidro.json`, que se **genera** con
 * `scripts/build_hidrografia.mjs` desde `docs/geo/hidrografia/` — no editar a
 * mano. Son dos orígenes: la hidrografía del IGN a escala 1:250.000 para toda
 * la provincia, y los shapefiles del sistema de canales de la Línea Paraná para
 * el sudoeste, que es justo donde el IGN casi no tiene nada.
 *
 * ── Para qué está ─────────────────────────────────────────────────────────────
 *
 * Hasta acá una cuenca era un contorno: se sabía cuánta lámina le cayó y
 * cuántos kilómetros de camino tiene adentro, pero no por dónde corre el agua.
 * Con los cursos se puede preguntar lo que le importa a un camino: **dónde lo
 * cruza el agua**. Cada cruce es un lugar donde tiene que haber una obra de
 * arte, y se puede comparar contra las que se relevaron con la app.
 *
 * ── Qué no afirma ─────────────────────────────────────────────────────────────
 *
 * - **No es un inventario de obras de arte.** Un cruce dice que ahí el camino
 *   pasa sobre un curso que figura en la carta, no qué hay construido.
 * - **Faltan los cursos menores.** A 1:250.000 no entra la cañada que cruza un
 *   camino vecinal con un tubo de 60. Que un tramo no tenga cruces no quiere
 *   decir que no tenga alcantarillas.
 * - **La posición vale al centenar de metros.** Sirve para decir «este camino
 *   cruza el arroyo tal», no para ubicar la alcantarilla.
 * - **Los canales son los del sistema de la Línea Paraná**, no todos los de la
 *   provincia: no están los del área metropolitana ni las defensas.
 *
 * Acá no hay React. La carga es lo único que toca la red.
 */

import { cuencaEn, dentroDe, type Cuenca } from './cuencas'
import { distanciaAlSegmentoKm } from './redFondo'
import type { TramoRed } from './redLluvia'

export type ClaseCurso = 'curso' | 'canal'

export interface CursoAgua {
  clase: ClaseCurso
  /** Río, Arroyo, Riacho… para un curso; Principal, Secundario… para un canal */
  tipo: string
  /** `null` cuando la carta lo trae sin nombre */
  nombre: string | null
  /** Si lleva agua todo el año. `null` en los canales: el origen no lo dice */
  permanente: boolean | null
  /** A qué sistema pertenece un canal: Módulo I, Línea Paraná… */
  sistema: string | null
  /** La traza, una línea por parte, en `[lat, lng]` como la quiere Leaflet */
  lineas: [number, number][][]
  km: number
}

interface FeatureHidro {
  properties: { clase: ClaseCurso; tipo: string; nombre: string | null; permanente?: boolean; sistema?: string | null }
  geometry:
    | { type: 'LineString'; coordinates: number[][] }
    | { type: 'MultiLineString'; coordinates: number[][][] }
}

const KM_POR_GRADO = 111.32

/** Kilómetros entre dos puntos `[lat, lng]`, en plano local */
export function distKm(a: [number, number], b: [number, number]): number {
  const f = Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180)
  return Math.hypot((b[1] - a[1]) * f, b[0] - a[0]) * KM_POR_GRADO
}

export function parsearHidrografia(geojson: { features: FeatureHidro[] }): CursoAgua[] {
  return geojson.features.map(f => {
    const crudas = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
    const lineas = crudas.map(l => l.map(([lng, lat]) => [lat, lng] as [number, number]))
    let km = 0
    for (const l of lineas) for (let i = 1; i < l.length; i++) km += distKm(l[i - 1], l[i])
    const p = f.properties
    return {
      clase: p.clase, tipo: p.tipo, nombre: p.nombre,
      permanente: p.clase === 'curso' ? p.permanente === true : null,
      sistema: p.sistema ?? null, lineas, km,
    }
  })
}

/** «Arroyo Guaycurú», «Arroyo sin nombre», «Canal 6 · Módulo I» */
export function rotuloCurso(c: CursoAgua): string {
  if (c.clase === 'curso') return `${c.tipo} ${c.nombre ?? 'sin nombre'}`
  const nombre = c.nombre ?? 'Canal sin nombre'
  // «Canal 6» ya dice que es un canal; «Viglia» o «Tramo I», no
  const conTipo = /^(canal|colector|aliviador)/i.test(nombre) ? nombre : `Canal ${nombre}`
  return c.sistema && c.sistema !== nombre ? `${conTipo} · ${c.sistema}` : conTipo
}

// ── Carga ────────────────────────────────────────────────────────────────────

let cache: Promise<CursoAgua[]> | null = null

/** Los cursos y los canales. Se bajan una sola vez (1,8 MB) y se comparten. */
export function cargarHidrografia(): Promise<CursoAgua[]> {
  if (!cache) {
    cache = fetch('/geo/geo_hidro.json')
      .then(r => {
        if (!r.ok) throw new Error(`el servidor respondió ${r.status}`)
        return r.json()
      })
      .then(parsearHidrografia)
    // Un fallo no queda cacheado: el próximo intento puede reintentar.
    cache.catch(() => { cache = null })
  }
  return cache
}

// ── Qué curso hay bajo el cursor ─────────────────────────────────────────────

/** Celda del índice del cursor, en grados (~5 km): la misma de la red vial */
const CELDA_CURSOR = 0.05

/**
 * Índice espacial de los cursos, para saber cuál está bajo el cursor.
 *
 * Las líneas van en el mapa sin recibir eventos, como los caminos y por el
 * mismo motivo, así que la pregunta se contesta por afuera de Leaflet. Es la
 * misma idea de `IndiceTramos`, con una diferencia: acá la traza está
 * simplificada y hay segmentos de varios kilómetros, así que cada uno se
 * registra en **todas** las celdas que toca su caja y no sólo en las de sus
 * extremos.
 */
export class IndiceCursos {
  private celdas = new Map<string, { curso: number; a: [number, number]; b: [number, number] }[]>()

  constructor(private cursos: CursoAgua[]) {
    cursos.forEach((c, ci) => {
      for (const l of c.lineas) for (let i = 1; i < l.length; i++) {
        const a = l[i - 1], b = l[i]
        const i0 = Math.floor(Math.min(a[0], b[0]) / CELDA_CURSOR), i1 = Math.floor(Math.max(a[0], b[0]) / CELDA_CURSOR)
        const j0 = Math.floor(Math.min(a[1], b[1]) / CELDA_CURSOR), j1 = Math.floor(Math.max(a[1], b[1]) / CELDA_CURSOR)
        for (let x = i0; x <= i1; x++) for (let y = j0; y <= j1; y++) {
          const k = `${x}|${y}`
          const lista = this.celdas.get(k)
          if (lista) lista.push({ curso: ci, a, b })
          else this.celdas.set(k, [{ curso: ci, a, b }])
        }
      }
    })
  }

  /** El curso más cercano al punto dentro de la tolerancia, o `null` */
  cursoEn(lat: number, lng: number, tolKm: number): CursoAgua | null {
    const fLat = Math.floor(lat / CELDA_CURSOR), fLng = Math.floor(lng / CELDA_CURSOR)
    let mejor = -1, mejorD = tolKm
    for (let dLat = -1; dLat <= 1; dLat++) for (let dLng = -1; dLng <= 1; dLng++) {
      for (const s of this.celdas.get(`${fLat + dLat}|${fLng + dLng}`) ?? []) {
        const d = distanciaAlSegmentoKm({ lat, lng }, s.a[0], s.a[1], s.b[0], s.b[1])
        if (d <= mejorD) { mejorD = d; mejor = s.curso }
      }
    }
    return mejor >= 0 ? this.cursos[mejor] : null
  }
}

// ── Los cruces ───────────────────────────────────────────────────────────────

/**
 * El ángulo mínimo entre el camino y el curso para contarlo como cruce.
 *
 * **Sin esto los canales inventan cruces.** En el sudoeste muchos canales
 * corren al costado de un camino —hay uno que se llama «Ruta Nac. Nº 89»—, y
 * dos líneas paralelas dibujadas por separado se pisan una y otra vez sin que
 * el camino cruce nada. Lo que distingue un cruce de un roce es el ángulo: un
 * camino que pasa sobre un arroyo lo corta, no lo acompaña.
 */
export const ANGULO_MINIMO = 30

/**
 * A menos de esto, dos cruces del mismo camino con el mismo curso son uno.
 *
 * Un arroyo con meandros dibujado a 1:250.000 puede cortar tres veces la misma
 * recta en doscientos metros. En el terreno es un puente.
 */
export const SEPARACION_KM = 0.3

/** Celda del índice de segmentos, en grados (~2 km) */
const CELDA = 0.02

export interface Cruce {
  lat: number
  lng: number
  /** Índice en el arreglo de tramos */
  tramo: number
  /** Índice en el arreglo de cursos */
  curso: number
  /** Ángulo entre el camino y el curso, de 0 a 90 grados */
  angulo: number
}

interface SegCurso { curso: number; a: [number, number]; b: [number, number] }

/**
 * Dónde la red vial cruza un curso de agua o un canal.
 *
 * Segmento contra segmento, con los del agua metidos en una grilla para no
 * comparar todos contra todos: son 250 mil segmentos de camino y 75 mil de
 * agua. Cada segmento se registra en **todas** las celdas que toca su caja —la
 * traza simplificada tiene segmentos de varios kilómetros—, no sólo en las de
 * sus extremos.
 */
export function crucesConRed(tramos: TramoRed[], cursos: CursoAgua[]): Cruce[] {
  const grilla = new Map<string, SegCurso[]>()
  const celdasDe = (a: [number, number], b: [number, number], cada: (k: string) => void) => {
    const i0 = Math.floor(Math.min(a[0], b[0]) / CELDA), i1 = Math.floor(Math.max(a[0], b[0]) / CELDA)
    const j0 = Math.floor(Math.min(a[1], b[1]) / CELDA), j1 = Math.floor(Math.max(a[1], b[1]) / CELDA)
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) cada(`${i}|${j}`)
  }

  cursos.forEach((c, ci) => {
    for (const l of c.lineas) for (let i = 1; i < l.length; i++) {
      const s: SegCurso = { curso: ci, a: l[i - 1], b: l[i] }
      celdasDe(s.a, s.b, k => {
        const lista = grilla.get(k)
        if (lista) lista.push(s)
        else grilla.set(k, [s])
      })
    }
  })

  const salida: Cruce[] = []
  /** Los cruces ya aceptados de este tramo, por curso, para no repetirlos */
  let delTramo = new Map<number, Cruce[]>()

  tramos.forEach((t, ti) => {
    delTramo = new Map()
    const pts = t.puntos
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i]
      const vistos = new Set<SegCurso>()
      celdasDe(p, q, k => {
        for (const s of grilla.get(k) ?? []) {
          if (vistos.has(s)) continue
          vistos.add(s)
          const x = interseccion(p, q, s.a, s.b)
          if (!x || x.angulo < ANGULO_MINIMO) continue
          const previos = delTramo.get(s.curso) ?? []
          if (previos.some(c => distKm([c.lat, c.lng], [x.lat, x.lng]) < SEPARACION_KM)) continue
          const cruce: Cruce = { lat: x.lat, lng: x.lng, tramo: ti, curso: s.curso, angulo: x.angulo }
          previos.push(cruce)
          delTramo.set(s.curso, previos)
          salida.push(cruce)
        }
      })
    }
  })
  return salida
}

/**
 * Dónde se cortan dos segmentos `[lat, lng]`, y con qué ángulo.
 *
 * `null` si no se cortan. Tocarse en un extremo cuenta: un camino que termina
 * justo sobre el curso lo alcanzó.
 */
export function interseccion(
  p: [number, number], q: [number, number], a: [number, number], b: [number, number],
): { lat: number; lng: number; angulo: number } | null {
  // En plano local: la longitud se achica con el coseno de la latitud
  const f = Math.cos(p[0] * Math.PI / 180)
  const rx = (q[1] - p[1]) * f, ry = q[0] - p[0]
  const sx = (b[1] - a[1]) * f, sy = b[0] - a[0]
  const den = rx * sy - ry * sx
  if (den === 0) return null   // paralelos, o alguno de largo cero
  const dx = (a[1] - p[1]) * f, dy = a[0] - p[0]
  const t = (dx * sy - dy * sx) / den
  const u = (dx * ry - dy * rx) / den
  if (t < 0 || t > 1 || u < 0 || u > 1) return null

  const cos = Math.abs(rx * sx + ry * sy) / (Math.hypot(rx, ry) * Math.hypot(sx, sy))
  return {
    lat: p[0] + t * (q[0] - p[0]),
    lng: p[1] + t * (q[1] - p[1]),
    angulo: Math.acos(Math.min(1, cos)) * 180 / Math.PI,
  }
}

/*
 * Los cruces no dependen de la fecha ni de nada que cambie en la pantalla: se
 * calculan una vez por red y por juego de cursos, y los usan el mapa y la
 * tabla. Si cada uno los calculara podrían llegar a decir números distintos.
 */
const memo = new WeakMap<TramoRed[], WeakMap<CursoAgua[], Cruce[]>>()

export function crucesDe(tramos: TramoRed[], cursos: CursoAgua[]): Cruce[] {
  let porCursos = memo.get(tramos)
  if (!porCursos) { porCursos = new WeakMap(); memo.set(tramos, porCursos) }
  let c = porCursos.get(cursos)
  if (!c) { c = crucesConRed(tramos, cursos); porCursos.set(cursos, c) }
  return c
}

// ── Por cuenca ───────────────────────────────────────────────────────────────

/** Las tres clases en que se cuenta todo, en el orden en que se muestran */
export const CATEGORIAS = ['permanente', 'no_permanente', 'canal'] as const
export type Categoria = typeof CATEGORIAS[number]

export const ROTULO_CATEGORIA: Record<Categoria, string> = {
  permanente: 'Permanentes', no_permanente: 'No permanentes', canal: 'Canales',
}

export const categoriaDe = (c: CursoAgua): Categoria =>
  c.clase === 'canal' ? 'canal' : c.permanente ? 'permanente' : 'no_permanente'

/**
 * A menos de esto de un cruce, una obra de arte relevada es la de ese cruce.
 *
 * Medio kilómetro, y no menos, por la escala de la carta: el curso está
 * dibujado con un error del orden de cien metros o más, y la obra se relevó
 * con el GPS de un teléfono parado al costado.
 */
export const TOLERANCIA_OBRA_KM = 0.5

/** Cada cuánto se muestrea una traza para repartirla entre cuencas, en km */
const PASO_REPARTO_KM = 1

const memoKm = new WeakMap<Cuenca[], WeakMap<CursoAgua[], number[][]>>()

/**
 * Los km de cada categoría en cada cuenca; la última fila es lo que cae afuera.
 *
 * Es la parte cara del reparto —pregunta en qué cuenca cae cada kilómetro de
 * los catorce mil— y no depende de nada que cambie en la pantalla, así que se
 * guarda. La primera versión lo rehacía cada vez que llegaban las obras de
 * arte, y eran dos segundos con la pantalla trabada.
 *
 * **Se prueba primero la cuenca del pedazo anterior**: un curso corre casi
 * siempre dentro de la misma, y así la mayoría de las preguntas se contestan
 * mirando un solo polígono en vez de varios.
 */
export function kmPorCuenca(cuencas: Cuenca[], cursos: CursoAgua[]): number[][] {
  let porCursos = memoKm.get(cuencas)
  if (!porCursos) { porCursos = new WeakMap(); memoKm.set(cuencas, porCursos) }
  const guardado = porCursos.get(cursos)
  if (guardado) return guardado

  const km = Array.from({ length: cuencas.length + 1 }, () => CATEGORIAS.map(() => 0))
  const indice = new Map(cuencas.map((c, i) => [c.cod, i]))
  let ultima = -1
  const adentro = (j: number, lat: number, lng: number) => {
    const c = cuencas[j]
    return lat >= c.caja[0] && lat <= c.caja[2] && lng >= c.caja[1] && lng <= c.caja[3]
      && c.partes.some(p => dentroDe(p, lat, lng))
  }

  /** Suma `largo` km a la cuenca que contiene el punto */
  const asignar = (lat: number, lng: number, largo: number, cat: number) => {
    if (ultima < 0 || !adentro(ultima, lat, lng)) {
      const c = cuencaEn(cuencas, lat, lng)
      ultima = c ? indice.get(c.cod)! : -1
    }
    km[ultima >= 0 ? ultima : cuencas.length][cat] += largo
  }

  for (const curso of cursos) {
    const cat = CATEGORIAS.indexOf(categoriaDe(curso))
    for (const l of curso.lineas) {
      /*
       * Los segmentos cortos se juntan hasta completar el paso y se asignan de
       * una vez; los largos se parten. Preguntar por cada segmento suelto eran
       * 75 mil consultas para 14 mil kilómetros.
       */
      let pendiente = 0
      for (let i = 1; i < l.length; i++) {
        const a = l[i - 1], b = l[i]
        const d = distKm(a, b)
        if (d < PASO_REPARTO_KM) {
          pendiente += d
          if (pendiente >= PASO_REPARTO_KM || i === l.length - 1) {
            asignar((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, pendiente, cat)
            pendiente = 0
          }
          continue
        }
        const n = Math.ceil(d / PASO_REPARTO_KM)
        for (let k = 0; k < n; k++) {
          const u = (k + 0.5) / n
          // Lo que venía acumulado va con el primer pedazo, que es el contiguo
          asignar(a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]), d / n + (k === 0 ? pendiente : 0), cat)
        }
        pendiente = 0
      }
    }
  }
  porCursos.set(cursos, km)
  return km
}

export interface CruceDeCuenca extends Cruce {
  /** ¿Hay una obra de arte relevada a menos de {@link TOLERANCIA_OBRA_KM}? */
  conObra: boolean
}

export interface HidroDeCuenca {
  cod: number
  nombre: string
  /** Km de traza dentro de la cuenca, en el orden de {@link CATEGORIAS} */
  km: number[]
  /**
   * Densidad de drenaje: km de cursos y canales por km² de cuenca. `null` en la
   * fila de lo que cae afuera, que no tiene superficie.
   */
  densidad: number | null
  /** Cruces de la red de consorcios, en el orden de {@link CATEGORIAS} */
  cruces: number[]
  /** De esos cruces, cuántos tienen una obra de arte relevada cerca */
  conObra: number
  /** Todos los cruces de la cuenca */
  lista: CruceDeCuenca[]
}

/**
 * Los cursos, los canales y los cruces de cada cuenca.
 *
 * **La traza se reparte por pedazos y no por curso**, igual que la red vial: un
 * río cruza de una cuenca a otra, y asignarlo entero a una le regalaría
 * kilómetros. Cada pedazo va a la cuenca que contiene su punto medio.
 *
 * La última fila, con `cod: 0`, es lo que cae fuera de todas. **Acá no es un
 * resto: son los ríos limítrofes** —Bermejo, Teuco, Paraná, Paraguay—, que
 * corren por afuera del contorno de las cuencas y son casi mil kilómetros.
 *
 * `obras` son los puntos de las obras de arte relevadas, o `null` si todavía no
 * llegaron: los cruces se cuentan igual y `conObra` queda en cero.
 */
export function hidroPorCuenca(
  cuencas: Cuenca[],
  cursos: CursoAgua[],
  cruces: Cruce[],
  obras: { lat: number; lng: number }[] | null,
): HidroDeCuenca[] {
  const vacia = (cod: number, nombre: string): HidroDeCuenca => ({
    cod, nombre, km: CATEGORIAS.map(() => 0), densidad: null,
    cruces: CATEGORIAS.map(() => 0), conObra: 0, lista: [],
  })
  const filas = cuencas.map(c => vacia(c.cod, c.nombre))
  const afuera = vacia(0, 'Fuera de las cuencas')
  const indice = new Map(cuencas.map((c, i) => [c.cod, i]))
  const filaEn = (lat: number, lng: number) => {
    const c = cuencaEn(cuencas, lat, lng)
    return c ? filas[indice.get(c.cod)!] : afuera
  }

  // Los km no dependen de los cruces ni de las obras: se reparten una vez
  const km = kmPorCuenca(cuencas, cursos)
  filas.forEach((f, i) => { f.km = [...km[i]] })
  afuera.km = [...km[cuencas.length]]

  const TOL_GRADOS = TOLERANCIA_OBRA_KM / KM_POR_GRADO
  for (const x of cruces) {
    const f = filaEn(x.lat, x.lng)
    const conObra = (obras ?? []).some(o =>
      // Primero por caja, que descarta casi todo sin medir
      Math.abs(o.lat - x.lat) <= TOL_GRADOS && Math.abs(o.lng - x.lng) <= TOL_GRADOS * 1.2
      && distKm([o.lat, o.lng], [x.lat, x.lng]) <= TOLERANCIA_OBRA_KM)
    f.cruces[CATEGORIAS.indexOf(categoriaDe(cursos[x.curso]))]++
    if (conObra) f.conObra++
    f.lista.push({ ...x, conObra })
  }

  cuencas.forEach((c, i) => {
    const km2 = c.ha / 100
    filas[i].densidad = km2 > 0 ? filas[i].km.reduce((s, v) => s + v, 0) / km2 : null
  })
  return [...filas, afuera]
}

/**
 * De las obras de arte relevadas, cuántas están cerca de un cruce.
 *
 * Es la comprobación al revés, y dice cuánto ve la carta: una obra relevada
 * lejos de todo cruce está sobre un curso que la capa no tiene.
 */
export function obrasSobreCruces(cruces: Cruce[], obras: { lat: number; lng: number }[]): number {
  return obras.filter(o =>
    cruces.some(x => distKm([o.lat, o.lng], [x.lat, x.lng]) <= TOLERANCIA_OBRA_KM)).length
}

/** Los cruces como CSV, con punto y coma y coma decimal */
export function csvCruces(filas: HidroDeCuenca[], cursos: CursoAgua[], tramos: TramoRed[]): string {
  const n = (v: number, d: number) => v.toFixed(d).replace('.', ',')
  const lineas = [
    'Cruces de la red de consorcios con cursos de agua y canales',
    'Cursos: hidrografia del IGN a 1:250.000. La posicion vale al centenar de metros; no es un inventario de obras de arte',
    '',
    ['Cod', 'Cuenca', 'Curso o canal', 'Clase', 'Consorcio', 'Ruta', 'Material', 'Latitud', 'Longitud',
      'Angulo', `Obra relevada a menos de ${TOLERANCIA_OBRA_KM * 1000} m`].join(';'),
  ]
  for (const f of filas) for (const x of f.lista) {
    const c = cursos[x.curso], t = tramos[x.tramo]
    lineas.push([
      f.cod || '', f.nombre, rotuloCurso(c), ROTULO_CATEGORIA[categoriaDe(c)],
      Number.isFinite(t.cc) ? t.cc : '', t.ruta, t.material,
      n(x.lat, 5), n(x.lng, 5), Math.round(x.angulo), x.conObra ? 'si' : 'no',
    ].join(';'))
  }
  return lineas.join('\r\n')
}
