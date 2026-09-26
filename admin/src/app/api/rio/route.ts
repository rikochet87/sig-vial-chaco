/**
 * El río Paraná, para la pantalla de Lluvias.
 *
 * ── Por qué pasa por el servidor y no lo pide el navegador ────────────────────
 *
 * Tres motivos, en orden de importancia:
 *
 * 1. **No sabemos si el INA sirve CORS**, y si no lo sirve el navegador no puede
 *    leerlo. Desde el servidor la pregunta no existe.
 * 2. **Una sola llamada en vez de doce.** Traer seis estaciones son doce pedidos
 *    —serie y pronóstico por cada una— y hacerlos desde cada navegador que abre
 *    la pantalla multiplica la carga sobre un organismo público sin motivo.
 * 3. **Se puede cachear.** El INA emite una corrida por día; pedirla de nuevo en
 *    cada `render` sería maltratar la fuente.
 *
 * ── El guard ──────────────────────────────────────────────────────────────────
 *
 * `requirePermiso('lluvia')`, que es el permiso de la pantalla que la consume.
 *
 * **`/api/lluvia` y `/api/lluvia/serie` todavía usan `requireAdmin()`**, que
 * sólo verifica que haya sesión — el nombre engaña. Son de sólo lectura y de
 * datos públicos, así que el daño es bajo, pero es el mismo molde que ya causó
 * agujeros acá: el botón escondido en la pantalla y el endpoint abierto. Un
 * técnico de la app móvil tiene cuenta y puede obtener sesión en `/login`
 * aunque el middleware después lo saque del panel. Esta ruta no repite el
 * patrón; las otras dos habría que emparejarlas.
 *
 * ── Qué NO hace ───────────────────────────────────────────────────────────────
 *
 * **No combina el río con la lluvia.** Son amenazas de causa distinta —ver
 * `lib/ina.ts`— y juntarlas en un número sería inventar un modelo que no
 * tenemos. Devuelve las series; la coincidencia la lee el que mira.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermiso } from '@/lib/apiAuth'
import {
  ESTACIONES, estadoCompleto, estadoDe,
  type LecturaRio, type PuntoPronostico, type EstadoRio,
} from '@/lib/ina'

export const dynamic = 'force-dynamic'

/**
 * Cuánto vale la respuesta antes de volver a preguntarle al INA.
 *
 * Media hora. La corrida de pronóstico es diaria y las alturas se cargan una o
 * dos veces por día, así que preguntar más seguido no trae nada nuevo — pero
 * tampoco conviene un cache largo: si el río está subiendo, media hora es el
 * peor retraso aceptable.
 */
const CACHE_S = 1800

/** Tope de días hacia atrás, para que nadie pida el siglo entero sin querer */
const MAX_DIAS = 400

export interface EstacionConRio {
  id: number
  nombre: string
  rio: string
  alerta: number
  evacuacion: number
  /** Cero de escala referido al datum del IGN. `null` en Barranqueras */
  ceroIgn: number | null
  observado: LecturaRio[]
  /** `null` cuando esa estación no tiene corrida publicada — es normal */
  pronostico: { emitido: string; puntos: PuntoPronostico[] } | null
  /** Lo último medido, para el resumen */
  ultima: { fecha: string; m: number; estado: EstadoRio } | null
  /** Cuántos metros le faltan al alerta. Negativo si ya lo pasó */
  margen: number | null
}

export async function GET(req: NextRequest) {
  const auth = await requirePermiso('lluvia')
  if (auth instanceof NextResponse) return auth

  const sp = new URL(req.url).searchParams
  const pedido = Number(sp.get('dias') ?? 90)
  const dias = Number.isFinite(pedido)
    ? Math.min(Math.max(Math.round(pedido), 1), MAX_DIAS)
    : 90

  const hasta = new Date()
  const desde = new Date(hasta)
  // `dias - 1` porque el rango incluye las dos puntas: mismo criterio que los
  // presets de la pantalla y que `/api/lluvia/serie`.
  desde.setDate(desde.getDate() - (dias - 1))
  const d = desde.toISOString().slice(0, 10)
  const h = hasta.toISOString().slice(0, 10)

  try {
    /*
     * **Secuencial, no en paralelo, y a propósito.**
     *
     * La primera versión lanzaba las seis estaciones con `Promise.allSettled` y
     * cada una hacía dos consultas de series —una por `alturasObservadas` y otra
     * por `pronosticoDe`—, o sea **24 pedidos simultáneos** contra el Alerta
     * Hidrológico. El organismo dejaba de contestar y el panel mostraba las seis
     * como "sin responder"; el relevamiento por consola andaba porque va de a
     * una. Ahora `estadoCompleto()` pide las series **una sola vez** por
     * estación y las seis van encadenadas: catorce pedidos espaciados en vez de
     * veinticuatro de golpe.
     *
     * Cuesta unos segundos más, y no importa: la respuesta se cachea media hora.
     * No hay ninguna razón para apurar a un organismo público con una ráfaga.
     *
     * Cada estación se envuelve aparte: **una caída no puede tirar abajo las
     * otras cinco.**
     */
    const estaciones: EstacionConRio[] = []
    const motivos: string[] = []

    for (const e of ESTACIONES) {
      try {
        const { observado, pronostico } = await estadoCompleto(e.id, d, h)
        const u = observado[observado.length - 1] ?? null
        estaciones.push({
          id: e.id,
          nombre: e.nombre,
          rio: e.rio,
          alerta: e.alerta,
          evacuacion: e.evacuacion,
          ceroIgn: e.ceroIgn,
          observado,
          pronostico,
          ultima: u ? { fecha: u.fecha, m: u.m, estado: estadoDe(e, u.m) } : null,
          margen: u ? Math.round((e.alerta - u.m) * 100) / 100 : null,
        })
      } catch (err) {
        // El motivo se guarda: si fallan todas, la pantalla tiene que poder
        // decir por qué en vez de seis renglones que dicen "sin responder".
        motivos.push(`${e.nombre}: ${err instanceof Error ? err.message : 'error'}`)
      }
    }

    /*
     * Cuáles fallaron, por nombre y no sólo cuántas.
     *
     * Con un contador, la pantalla puede decir "faltan dos" pero no **cuáles**,
     * y entonces las que no llegaron simplemente desaparecen de la lista. Una
     * estación ausente tiene que verse ausente: es el mismo criterio que
     * `mm: null` en la red vial y que `sin_parte` en la lluvia — la falta de
     * dato se muestra como falta de dato, no como un hueco.
     */
    const llegaron = new Set(estaciones.map(e => e.id))
    const sinRespuesta = ESTACIONES.filter(e => !llegaron.has(e.id)).map(e => e.nombre)

    return NextResponse.json(
      {
        desde: d, hasta: h, dias,
        estaciones,
        /**
         * Qué estaciones no contestaron. Va a pantalla: un panel con cuatro de
         * seis tiene que decir cuáles faltan, no mostrarse como completo.
         */
        sinRespuesta,
        /** Por qué fallaron, para poder diagnosticar en vez de sólo contarlas */
        motivos,
        fuente: 'Alerta Hidrológico — Instituto Nacional del Agua',
      },
      { headers: { 'cache-control': `s-maxage=${CACHE_S}, stale-while-revalidate=${CACHE_S * 2}` } },
    )
  } catch (e) {
    // Un organismo se cae, y cuando se cae hay que decirlo — no devolver una
    // lista vacía que la pantalla lea como "el río está bajo".
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo consultar el Alerta Hidrológico' },
      { status: 502 },
    )
  }
}
