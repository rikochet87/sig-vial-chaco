/**
 * Precipitación media areal por cuenca hídrica.
 *
 * Es el cálculo para el que existe el concepto: una cuenca es una superficie
 * que recibe la lluvia entera, y lo que se pregunta es cuánta lámina cayó sobre
 * ella y —multiplicando por su área— cuánta agua es eso.
 *
 * Se calcula por **dos caminos independientes**, igual que a nivel provincia:
 *
 * - **IDW** — se evalúa el mismo IDW que el resto de la pantalla en una grilla
 *   de puntos adentro de la cuenca y se promedia. Es el número que manda, por
 *   el mismo motivo que en la tabla de consorcios: midió mejor.
 * - **Thiessen por superficie** — el método de manual, con la tabla de pesos al
 *   lado. Acá es el literal: el peso de cada pluviómetro son los km² de su
 *   polígono dentro de la cuenca.
 *
 * Que sean dos no es redundancia. Uno muestrea puntos y el otro recorta
 * polígonos: no comparten ni una línea de geometría, así que si los dos dicen
 * que la cuenca tiene 62 % de cobertura, ese 62 % está bien calculado.
 *
 * **No hay respaldo del modelo.** Donde no hay pluviómetro a menos de
 * {@link RADIO_KM} no hay dato, y esa parte de la cuenca queda afuera del
 * promedio y se informa en `cobertura`. Mismo criterio que `mm: null` en
 * `redLluvia`: promediarla como 0 mm inventaría sequía.
 *
 * Acá no hay React ni red: entra geometría y mediciones, sale una tabla.
 */

import { distanciaKm, estimarPunto, PEGADO_KM, POTENCIA, RADIO_KM } from './fusion'
import { arealPorPartes, type MediaAreal, type MedicionConNombre } from './thiessenAreal'
import { cuencaEn, type Cuenca } from './cuencas'

/**
 * Separación de la grilla de muestreo, en km.
 *
 * Con 2,5 km cada punto representa 6,25 km²: la cuenca más chica (Quiá, 931
 * km²) tiene unos 150 puntos y la provincia entera unos 16.000, que contra 71
 * pluviómetros son un millón de distancias — nada. No hace falta más fino: la
 * longitud de decorrelación de la lluvia acá es de 42 km.
 */
export const PASO_KM = 2.5

export interface Muestra { lat: number; lng: number }

/**
 * Los puntos de la grilla que caen adentro de la cuenca.
 *
 * Se resuelve por barrido: para cada fila de la grilla se calculan los cruces
 * con el borde y se rellenan los tramos interiores. Probar punto por punto
 * contra un borde de 2.400 vértices serían decenas de millones de operaciones;
 * así es una pasada por el borde por fila.
 *
 * El paso en longitud se calcula **por fila**, con la latitud de esa fila, para
 * que cada punto represente la misma superficie en toda la cuenca y el promedio
 * simple de los puntos sea un promedio por área.
 *
 * No depende de la fecha: se calcula una vez por cuenca y se reusa.
 */
export function muestrasDe(cuenca: Cuenca, pasoKm = PASO_KM): Muestra[] {
  const dLat = pasoKm / 111.32
  const out: Muestra[] = []

  // La grilla se ancla a múltiplos del paso, no al borde de cada cuenca: así
  // dos cuencas vecinas comparten grilla y ningún punto cae en las dos.
  const fila0 = Math.ceil(cuenca.caja[0] / dLat)
  const filaN = Math.floor(cuenca.caja[2] / dLat)

  for (let f = fila0; f <= filaN; f++) {
    const lat = f * dLat
    const dLng = pasoKm / (111.32 * Math.cos((lat * Math.PI) / 180))

    for (const parte of cuenca.partes) {
      const cruces: number[] = []
      for (let i = 0, j = parte.length - 1; i < parte.length; j = i++) {
        const [latI, lngI] = parte[i], [latJ, lngJ] = parte[j]
        if ((latI > lat) !== (latJ > lat)) {
          cruces.push(((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI)
        }
      }
      cruces.sort((a, b) => a - b)
      for (let c = 0; c + 1 < cruces.length; c += 2) {
        for (let k = Math.ceil(cruces[c] / dLng); k * dLng < cruces[c + 1]; k++) {
          out.push({ lat, lng: k * dLng })
        }
      }
    }
  }

  // Una cuenca más angosta que el paso podría quedar sin ningún punto, y
  // entonces no tendría lámina. Se le da uno, que es mejor que ninguno.
  if (out.length === 0) out.push({ lat: cuenca.rotulo[0], lng: cuenca.rotulo[1] })
  return out
}

/** La lluvia de una cuenca en un período */
export interface LaminaCuenca {
  cod: number
  nombre: string
  /** Superficie declarada en el origen, en km² */
  km2: number
  /**
   * Lámina media por IDW sobre la parte cubierta, en mm; `null` si ningún punto
   * de la cuenca tiene pluviómetro en el radio.
   */
  mm: number | null
  /** El punto de la cuenca que más recibió, en mm */
  mmMax: number | null
  /** Fracción de la cuenca con pluviómetro en el radio, en tanto por uno */
  cobertura: number
  /** Cuántos puntos de grilla tiene la cuenca */
  puntos: number
  /** El método de manual, con el desglose de pesos */
  thiessen: MediaAreal
  /**
   * Volumen precipitado **sobre la parte cubierta**, en hm³ (millones de m³):
   * lámina × superficie cubierta. Un milímetro sobre un km² son mil m³.
   */
  hm3: number | null
}

const redondear = (x: number, n = 2) => {
  const f = 10 ** n
  return Math.round(x * f) / f
}

/**
 * La lámina de cada cuenca.
 *
 * `muestras` es lo que devolvió {@link muestrasDe} para cada una, en el mismo
 * orden: se pasa de afuera porque no cambia con la fecha y esto sí.
 */
export function laminaPorCuenca(
  cuencas: Cuenca[],
  muestras: Muestra[][],
  mediciones: MedicionConNombre[],
): LaminaCuenca[] {
  return cuencas.map((c, i) => {
    const pts = muestras[i] ?? []
    let suma = 0, cubiertos = 0, max = -Infinity

    for (const p of pts) {
      const e = estimarPunto(p, mediciones, null)
      // 'estimado' es el respaldo del modelo, que acá no hay: sin pluviómetro
      // en el radio el punto no tiene dato.
      if (e.procedencia === 'estimado') continue
      suma += e.mm
      cubiertos++
      if (e.mm > max) max = e.mm
    }

    const km2 = c.ha / 100
    const mm = cubiertos > 0 ? suma / cubiertos : null
    const cobertura = pts.length > 0 ? cubiertos / pts.length : 0

    return {
      cod: c.cod,
      nombre: c.nombre,
      km2,
      mm: mm === null ? null : redondear(mm),
      mmMax: cubiertos > 0 ? redondear(max) : null,
      cobertura: redondear(cobertura, 4),
      puntos: pts.length,
      // Thiessen quiere los anillos en [lng, lat]
      thiessen: arealPorPartes(mediciones, c.partes.map(p => p.map(([lat, lng]) => [lng, lat] as [number, number]))),
      hm3: mm === null ? null : redondear((mm * km2 * cobertura) / 1000, 1),
    }
  })
}

/** El total de la provincia: lámina pesada por superficie cubierta, y volumen */
export function totalCuencas(filas: LaminaCuenca[]): {
  km2: number; mm: number | null; cobertura: number; hm3: number | null
} {
  let km2 = 0, cubierto = 0, agua = 0
  for (const f of filas) {
    km2 += f.km2
    if (f.mm === null) continue
    cubierto += f.km2 * f.cobertura
    agua += f.mm * f.km2 * f.cobertura
  }
  return {
    km2,
    mm: cubierto > 0 ? redondear(agua / cubierto) : null,
    cobertura: km2 > 0 ? redondear(cubierto / km2, 4) : 0,
    hm3: cubierto > 0 ? redondear(agua / 1000, 1) : null,
  }
}

/** La tabla como CSV, con punto y coma y coma decimal para Excel en español */
export function csvCuencas(filas: LaminaCuenca[], rango: { desde: string; hasta: string }): string {
  const n = (v: number | null, dec = 1) => (v === null ? '' : v.toFixed(dec).replace('.', ','))
  const lineas = [
    `Precipitación media areal por cuenca;${rango.desde};${rango.hasta}`,
    `Lámina por IDW (potencia 2, radio ${RADIO_KM} km) sobre grilla de ${String(PASO_KM).replace('.', ',')} km; Thiessen pesado por superficie`,
    '',
    'Cod;Cuenca;Superficie km2;Lamina IDW mm;Lamina Thiessen mm;Lamina maxima mm;Cobertura %;Volumen hm3;Pluviometros',
    ...filas.map(f => [
      f.cod, f.nombre, n(f.km2, 0), n(f.mm), n(f.thiessen.mm), n(f.mmMax),
      n(f.cobertura * 100), n(f.hm3), f.thiessen.aportes.length,
    ].join(';')),
  ]
  return lineas.join('\r\n')
}

// ── La serie diaria ──────────────────────────────────────────────────────────

/**
 * Cuánto pesa cada pluviómetro en la lámina de una cuenca.
 *
 * **El IDW es lineal en las mediciones**: el peso de cada estación en un punto
 * depende sólo de las distancias, no de cuánto llovió. Entonces la lámina de
 * una cuenca es siempre la misma combinación de pluviómetros, día tras día:
 *
 *     lámina(día) = Σ pesoⱼ · mmⱼ(día)
 *
 * Calcular esos pesos una vez —son 16.000 puntos contra 71 estaciones— deja
 * cada día en 71 multiplicaciones por cuenca. Correr `laminaPorCuenca` por
 * cada día cuesta ~150 ms: con los cincuenta días con parte de un trimestre
 * serían unos 7 segundos.
 *
 * Vale mientras las estaciones sean las mismas todos los días, y lo son: la
 * pantalla trabaja con las estaciones activas y deduce el cero de la que no
 * informó.
 *
 * Repite las tres reglas de `estimarPunto` —radio, potencia y la estación
 * pegada que manda sola— en vez de llamarlo, porque acá hacen falta los pesos y
 * aquél devuelve el resultado. **El test afirma que los dos caminos dan lo
 * mismo**; si alguien cambia una regla allá y no acá, falla.
 */
export interface PesosCuenca {
  /** Un peso por estación, en el orden en que se pasaron. Suman 1, o 0 si no hay cobertura */
  pesos: number[]
  /** Fracción de la cuenca con pluviómetro en el radio */
  cobertura: number
}

export function pesosIdw(
  muestras: Muestra[][],
  estaciones: { lat: number; lng: number }[],
): PesosCuenca[] {
  return muestras.map(pts => {
    const acumulado = new Array<number>(estaciones.length).fill(0)
    const delPunto = new Array<number>(estaciones.length)
    let cubiertos = 0

    for (const p of pts) {
      let suma = 0, pegada = -1
      for (let j = 0; j < estaciones.length; j++) {
        const d = distanciaKm(p, estaciones[j])
        if (d > RADIO_KM) { delPunto[j] = 0; continue }
        // Encima de la estación: es su valor, no un promedio. La primera gana.
        if (d <= PEGADO_KM) { pegada = j; break }
        delPunto[j] = 1 / Math.pow(d, POTENCIA)
        suma += delPunto[j]
      }

      if (pegada >= 0) { acumulado[pegada] += 1; cubiertos++; continue }
      if (suma <= 0) continue
      for (let j = 0; j < estaciones.length; j++) acumulado[j] += delPunto[j] / suma
      cubiertos++
    }

    return {
      pesos: cubiertos > 0 ? acumulado.map(w => w / cubiertos) : acumulado,
      cobertura: pts.length > 0 ? cubiertos / pts.length : 0,
    }
  })
}

/** Lo que midió cada estación un día con parte, en el orden de las estaciones */
export interface ParteDiario { fecha: string; mm: number[] }

/**
 * Qué partes publicó la APA en el rango y no están cargados.
 *
 * **Existe porque la falta no se ve.** La serie diaria sale de
 * `mediciones_lluvia`, que se llena importando; un día que la APA publicó y
 * nadie importó no tiene filas, y entonces se lee igual que un día sin parte:
 * suma cero. Pasó —el 05/10/2026 la tabla tenía 11 fechas de las 168
 * publicadas— y se descubrió por otro lado, mirando un río que había crecido
 * sin lluvia a la vista.
 *
 * `publicadas` es la lista de fechas de la APA; `cargadas`, las que tienen
 * alguna fila. Devuelve las que faltan, de la más vieja a la más nueva.
 */
export function partesFaltantes(
  publicadas: string[], cargadas: Iterable<string>, desde: string, hasta: string,
): string[] {
  const ya = new Set(cargadas)
  return [...new Set(publicadas)].filter(f => f >= desde && f <= hasta && !ya.has(f)).sort()
}

/** Un día de la serie de una cuenca */
export interface DiaCuenca {
  fecha: string
  /** Lámina areal del día, en mm; `null` si ese día la APA no publicó parte */
  mm: number | null
}

const DIA_MS = 86_400_000
const isoDe = (t: number) => new Date(t).toISOString().slice(0, 10)

/**
 * La lámina de una cuenca día por día, entre dos fechas.
 *
 * Devuelve **todos** los días del rango, no sólo los que tienen parte. Los que
 * no lo tienen van con `mm: null`: la APA publica sólo los días que llueve, así
 * que casi siempre significan "no llovió", pero no es una medición y la
 * pantalla los dibuja distinto de un cero medido.
 *
 * Una cuenca sin cobertura no tiene serie: todos sus días van en `null`.
 */
export function serieDiaria(
  pesos: PesosCuenca, partes: ParteDiario[], desde: string, hasta: string,
): DiaCuenca[] {
  const porFecha = new Map(partes.map(p => [p.fecha, p.mm]))
  const out: DiaCuenca[] = []
  for (let t = Date.parse(desde); t <= Date.parse(hasta); t += DIA_MS) {
    const fecha = isoDe(t)
    const mm = porFecha.get(fecha)
    if (!mm || pesos.cobertura <= 0) { out.push({ fecha, mm: null }); continue }
    let s = 0
    for (let j = 0; j < pesos.pesos.length; j++) s += pesos.pesos[j] * (mm[j] ?? 0)
    out.push({ fecha, mm: redondear(s) })
  }
  return out
}

/**
 * Las duraciones para las que se busca la lámina máxima, en días.
 *
 * Varios días y no sólo uno, porque en llanura el agua no se va: lo que anega
 * es lo que se junta en una semana, no el pico de una tarde. Una lámina de 60
 * mm en un día y otra de 60 mm repartida en cinco son eventos distintos, y hace
 * falta ver los dos números para distinguirlos.
 */
export const VENTANAS_DIAS = [1, 3, 5, 7] as const

export interface LaminaMaxima {
  dias: number
  mm: number
  desde: string
  hasta: string
}

/**
 * La mayor lámina acumulada en `dias` días corridos dentro de la serie.
 *
 * **Los días sin parte suman cero.** Es la misma deducción que hace el
 * acumulado del período en toda la pantalla, y hay que decirla porque es una
 * suposición: si la APA dejó de publicar un día que sí llovió, este número
 * queda corto.
 *
 * Devuelve `null` si la serie es más corta que la ventana o si no tiene ningún
 * día con parte — sin mediciones no hay máximo, y no es cero.
 */
export function laminaMaxima(serie: DiaCuenca[], dias: number): LaminaMaxima | null {
  if (dias < 1 || serie.length < dias || !serie.some(d => d.mm !== null)) return null

  let suma = 0
  for (let i = 0; i < dias; i++) suma += serie[i].mm ?? 0
  let mejor = suma, fin = dias - 1

  for (let i = dias; i < serie.length; i++) {
    suma += (serie[i].mm ?? 0) - (serie[i - dias].mm ?? 0)
    // Con `>` gana la primera; con `>=` la más reciente, que es la que importa
    // cuando dos ventanas empatan.
    if (suma >= mejor - 1e-9 && suma > 0) { mejor = Math.max(mejor, suma); fin = i }
  }
  return { dias, mm: redondear(mejor), desde: serie[fin - dias + 1].fecha, hasta: serie[fin].fecha }
}

/** Las máximas de todas las cuencas como CSV */
export function csvMaximas(
  filas: { cod: number; nombre: string; maximas: (LaminaMaxima | null)[] }[],
  rango: { desde: string; hasta: string },
): string {
  const n = (v: number) => v.toFixed(1).replace('.', ',')
  const lineas = [
    `Lámina máxima por cuenca en ${VENTANAS_DIAS.join(', ')} días corridos;${rango.desde};${rango.hasta}`,
    `Lámina areal por IDW (potencia ${POTENCIA}, radio ${RADIO_KM} km); los días sin parte de la APA suman cero`,
    '',
    ['Cod', 'Cuenca', ...VENTANAS_DIAS.flatMap(d => [`Max ${d} d mm`, `Max ${d} d desde`, `Max ${d} d hasta`])].join(';'),
    ...filas.map(f => [
      f.cod, f.nombre,
      ...f.maximas.flatMap(m => (m ? [n(m.mm), m.desde, m.hasta] : ['', '', ''])),
    ].join(';')),
  ]
  return lineas.join('\r\n')
}

// ── La lectura de un punto ───────────────────────────────────────────────────

/** Lo que se sabe de la lluvia en un punto cualquiera del mapa */
export interface LecturaPunto {
  /** Milímetros en el punto por IDW; `null` si no hay pluviómetro en el radio */
  mm: number | null
  /** Si el punto está encima de un pluviómetro y el valor es el medido */
  medido: boolean
  /** Cuántos pluviómetros entraron en el promedio */
  estaciones: number
  /** El pluviómetro más cercano, aunque esté fuera del radio */
  cercano: { nombre: string; km: number; mm: number } | null
  /** La cuenca que contiene al punto, o `null` si está fuera de todas */
  cuenca: Cuenca | null
  /** La lámina del período de esa cuenca, si ya se calculó */
  lamina: LaminaCuenca | null
}

/**
 * La lluvia en un punto, y en qué cuenca cae.
 *
 * **Es el mismo `estimarPunto` que promedia la lámina areal**, sin respaldo del
 * modelo. La lámina de una cuenca es el promedio de esta lectura sobre su
 * grilla, así que pasar el cursor por adentro es ver, uno por uno, los números
 * que la tabla promedió. El test lo afirma: el promedio de las lecturas sobre
 * la grilla de cada cuenca es su lámina.
 *
 * Fuera del radio de todo pluviómetro no hay dato y `mm` es `null`, no cero:
 * mismo criterio que en la red vial y en las isohietas.
 */
export function leerPunto(
  lat: number, lng: number,
  mediciones: MedicionConNombre[],
  cuencas: Cuenca[],
  filas: LaminaCuenca[] | null,
): LecturaPunto {
  const e = estimarPunto({ lat, lng }, mediciones, null)

  let cercano: LecturaPunto['cercano'] = null
  for (const m of mediciones) {
    const km = distanciaKm({ lat, lng }, m)
    if (!cercano || km < cercano.km) cercano = { nombre: m.nombre, km, mm: m.mm }
  }

  const cuenca = cuencaEn(cuencas, lat, lng)
  return {
    mm: e.procedencia === 'estimado' ? null : e.mm,
    medido: e.procedencia === 'medido',
    estaciones: e.estaciones,
    cercano,
    cuenca,
    lamina: cuenca ? filas?.find(f => f.cod === cuenca.cod) ?? null : null,
  }
}
