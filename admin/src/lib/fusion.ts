/**
 * Estimación de lluvia sobre la red vial a partir de los pluviómetros de la APA.
 *
 * ── Por qué así ───────────────────────────────────────────────────────────────
 *
 * El número que se muestra por consorcio sale de interpolar las mediciones
 * reales con **IDW** (ponderación por distancia inversa): el valor en un punto
 * es el promedio de los pluviómetros de alrededor, pesando cada uno por
 * `1 / distancia²`. El modelo de Open-Meteo queda de respaldo, sólo donde no
 * hay ninguna estación dentro del radio.
 *
 * Esto se eligió midiendo, no por gusto. Validación dejando cada estación
 * afuera, sobre las 162 fechas con parte y 11.502 combinaciones estación-fecha:
 *
 *   | método                          |  MAE | RMSE |    r |
 *   |---------------------------------|------|------|------|
 *   | modelo crudo (Open-Meteo)       | 6,82 |15,17 | 0,47 |
 *   | modelo corregido + pluviómetros | 4,60 |12,34 | 0,68 |
 *   | Thiessen (polígonos)            | 4,47 |12,50 | 0,70 |
 *   | IDW² radio 60 km   ← este       | 3,98 |10,47 | 0,77 |
 *
 * Anclar en el modelo y corregirlo con los pluviómetros —que fue el primer
 * diseño— sale peor que ignorar el modelo: arrastra su patrón espacial, que
 * correlaciona 0,47. Mezclar los dos suavemente por distancia sale peor todavía
 * (MAE 4,94), porque contamina la buena estimación de cerca. Por eso el cambio
 * al modelo es tardío y duro, no gradual.
 *
 * ── De qué depende ────────────────────────────────────────────────────────────
 *
 * **Una estación que no figura en el parte midió cero.** La API de la APA nunca
 * publica ceros —mínimo 1 mm, ni un solo registro en 0 sobre 3.334— así que hay
 * que deducirlo. Está fundado: la tasa de reporte sube de 11 % a 86 % según
 * cuánta lluvia vio el modelo en esa celda. Si el silencio fuera falta de dato
 * esa tasa sería plana. Pero falla en el 14 % de los casos de lluvia fuerte, y
 * ahí esto subestima; por eso `mmModelo` viaja al lado, como control.
 *
 * Esa deducción **sólo vale para fechas que tienen parte**. Si la APA no publicó
 * nada ese día no se puede concluir que no llovió en ninguna parte, y entonces
 * no hay interpolación posible: queda el modelo.
 */

/** Medición de un pluviómetro en una fecha */
export interface Medicion {
  lat: number
  lng: number
  mm: number
}

export interface PuntoConsulta {
  lat: number
  lng: number
}

/**
 * De dónde salió el número, para poder decirlo en pantalla.
 *
 * `sin_calcular` no lo produce este motor: lo pone la API cuando la fila de
 * `precipitaciones` todavía no tiene `mm_fusion`, sea porque es anterior a que
 * esto existiera o porque no se reingirió. **Tiene que ser un estado aparte.**
 * Antes esas filas se etiquetaban como `estimado`, y el mapa afirmaba "sin
 * pluviómetro a menos de 60 km" sobre consorcios que tienen uno a 12 km. Decir
 * "no lo calculé todavía" es la verdad; inventar el motivo es peor que no decir
 * nada.
 */
export type Procedencia = 'medido' | 'interpolado' | 'estimado' | 'sin_calcular'

export interface Estimacion {
  mm: number
  procedencia: Procedencia
  /** Distancia al pluviómetro más cercano que informó, en km; null si no hay */
  distanciaKm: number | null
  /** Cuántas estaciones entraron en el promedio */
  estaciones: number
}

/**
 * Potencia del IDW. Con 2, un pluviómetro a 8 km pesa treinta veces más que uno
 * a 45. Se barrieron 1, 1,5, 2 y 3: entre 1,5 y 3 la diferencia es de centésimas
 * y 2 dio el mejor MAE.
 */
export const POTENCIA = 2

/**
 * Radio de búsqueda, en km.
 *
 * Más allá, el pluviómetro aporta ruido: el correlograma de la lluvia en el
 * Chaco cae de 0,76 a 15 km hasta una meseta de 0,39 pasados los 130 km, con
 * longitud de decorrelación de 42 km. Se probaron 60, 120 y 250 km; 60 ganó.
 */
export const RADIO_KM = 60

/**
 * Por debajo de esta distancia el punto se considera **en** la estación y toma
 * su valor tal cual. Evita además la división por cero.
 */
const PEGADO_KM = 1.5

/** Distancia en km, plano equirectangular — sobra para el tamaño del Chaco */
export function distanciaKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dy = (a.lat - b.lat) * 111.32
  const dx = (a.lng - b.lng) * 111.32 * Math.cos((a.lat * Math.PI) / 180)
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Estima los milímetros en un punto.
 *
 * `mmModelo` es el respaldo: se usa sólo si no hay ningún pluviómetro dentro del
 * radio. Si tampoco hay modelo, devuelve 0 marcado como estimado.
 */
export function estimarPunto(
  punto: PuntoConsulta,
  mediciones: Medicion[],
  mmModelo: number | null,
): Estimacion {
  let numerador = 0
  let denominador = 0
  let usadas = 0
  let masCerca = Infinity
  let mmMasCerca = 0

  for (const m of mediciones) {
    const d = distanciaKm(punto, m)
    if (d < masCerca) { masCerca = d; mmMasCerca = m.mm }
    if (d > RADIO_KM) continue

    // Encima de la estación: es su valor, no un promedio
    if (d <= PEGADO_KM) {
      return {
        mm: redondear(m.mm),
        procedencia: 'medido',
        distanciaKm: Math.round(d * 10) / 10,
        estaciones: 1,
      }
    }

    const peso = 1 / Math.pow(d, POTENCIA)
    numerador += peso * m.mm
    denominador += peso
    usadas++
  }

  if (usadas > 0) {
    return {
      mm: redondear(numerador / denominador),
      procedencia: 'interpolado',
      distanciaKm: Math.round(masCerca * 10) / 10,
      estaciones: usadas,
    }
  }

  return {
    mm: redondear(mmModelo ?? 0),
    procedencia: 'estimado',
    distanciaKm: Number.isFinite(masCerca) ? Math.round(masCerca * 10) / 10 : null,
    estaciones: 0,
  }
}

const redondear = (x: number) => Math.round(x * 100) / 100

/** Un punto de muestreo de la red vial, con el peso que tiene en su consorcio */
export interface PuntoRed {
  cc: number
  lat: number
  lng: number
  peso: number
  /** Lo que dijo el modelo ahí, si se consultó */
  mmModelo?: number | null
}

export interface ResultadoConsorcio {
  consorcio: number
  mm: number
  /** La peor procedencia de sus puntos: si uno quedó estimado, el consorcio también */
  procedencia: Procedencia
  /** Distancia media ponderada al pluviómetro más cercano */
  distanciaKm: number | null
  /** Qué fracción de la red quedó sin pluviómetro dentro del radio */
  fraccionEstimada: number
}

const ORDEN: Record<Procedencia, number> = {
  medido: 0, interpolado: 1, estimado: 2, sin_calcular: 3,
}

/**
 * Agrega por consorcio: estima en cada punto de muestreo y promedia ponderando
 * por el peso del punto, que es la fracción de camino que representa.
 *
 * Se divide por el peso efectivamente usado, no por 1: si a un punto le faltó el
 * dato, el promedio sale de los que sí se pudieron estimar en vez de diluirse.
 */
export function estimarPorConsorcio(
  puntos: PuntoRed[],
  mediciones: Medicion[],
): ResultadoConsorcio[] {
  const acum = new Map<number, {
    mm: number; peso: number; dist: number; pesoDist: number
    pesoEstimado: number; procedencia: Procedencia
  }>()

  for (const p of puntos) {
    const e = estimarPunto(p, mediciones, p.mmModelo ?? null)
    let a = acum.get(p.cc)
    if (!a) {
      a = { mm: 0, peso: 0, dist: 0, pesoDist: 0, pesoEstimado: 0, procedencia: 'medido' }
      acum.set(p.cc, a)
    }
    a.mm += e.mm * p.peso
    a.peso += p.peso
    if (e.distanciaKm != null) { a.dist += e.distanciaKm * p.peso; a.pesoDist += p.peso }
    if (e.procedencia === 'estimado') a.pesoEstimado += p.peso
    if (ORDEN[e.procedencia] > ORDEN[a.procedencia]) a.procedencia = e.procedencia
  }

  const salida: ResultadoConsorcio[] = []
  for (const [cc, a] of acum) {
    if (a.peso <= 0) continue
    salida.push({
      consorcio: cc,
      mm: redondear(a.mm / a.peso),
      procedencia: a.procedencia,
      distanciaKm: a.pesoDist > 0 ? Math.round((a.dist / a.pesoDist) * 10) / 10 : null,
      fraccionEstimada: Math.round((a.pesoEstimado / a.peso) * 100) / 100,
    })
  }
  return salida.sort((x, y) => x.consorcio - y.consorcio)
}

/** Etiqueta para pantalla */
export const TEXTO_PROCEDENCIA: Record<Procedencia, { label: string; nota: string; color: string }> = {
  medido: {
    label: 'Medido',
    nota: 'Hay un pluviómetro de la APA sobre la red: es el dato, no una estimación.',
    color: '#5DCAA5',
  },
  interpolado: {
    label: 'Interpolado',
    nota: 'Promedio de los pluviómetros cercanos, pesando más a los que están cerca. '
        + 'El error típico es de unos 4 mm.',
    color: '#85B7EB',
  },
  estimado: {
    label: 'Estimado',
    nota: `Sin pluviómetro a menos de ${RADIO_KM} km: es la salida del modelo, `
        + 'con un error típico de unos 7 mm.',
    color: '#EF9F27',
  },
  sin_calcular: {
    label: 'Sin recalcular',
    nota: 'Esta fecha todavía no se cruzó con los pluviómetros, así que el número '
        + 'es la salida del modelo. Tocá «Actualizar rango» para recalcularla.',
    color: '#9aa0a6',
  },
}
