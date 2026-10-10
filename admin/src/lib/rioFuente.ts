/**
 * Una escala del río, armada con sus dos fuentes: las alturas de Prefectura y
 * el pronóstico del INA. Lo usan `/api/rio` y `/api/rio/arriba`, para que las
 * dos rutas —que muestran Itá Ibaté las dos— no puedan armarla distinto.
 *
 * Sólo para el servidor: sale a la red.
 *
 * ── Qué pasa cuando falta una fuente ──────────────────────────────────────────
 *
 * | Falta | Qué se muestra | Qué se avisa |
 * |---|---|---|
 * | el histórico de Prefectura | la serie del INA con las dos últimas de Prefectura encima | `sinHistorico` |
 * | todo Prefectura | lo del INA, como antes de que existiera esto | `prefectura.ok = false` en la ruta |
 * | el INA | las alturas de Prefectura, sin pronóstico | `sinIna` |
 * | las dos | nada: la escala va a `sinRespuesta` | el motivo |
 * | lecturas, con el INA contestando | la escala vacía: está atrasada, no caída | nada |
 *
 * Una escala no se cae porque se cayó una fuente; se cae cuando no hay ninguna
 * lectura que mostrar.
 */
import { estadoCompleto, type LecturaRio, type Pronostico } from './ina'
import {
  PUERTOS_PREFECTURA, filaDe, lecturasDePrefectura, traerHistorico, unirSeries,
  type FilaPrefectura, type LecturaPrefectura,
} from './prefectura'

export interface EscalaDelDia {
  observado: LecturaRio[]
  pronostico: Pronostico | null
  /** La última lectura, si es de Prefectura */
  prefectura: LecturaPrefectura | null
  /** Cuántas lecturas puso cada fuente */
  fuentes: { prefectura: number; ina: number }
  descartadas: LecturaRio[]
  descartadasPrefectura: LecturaRio[]
  /** Los niveles que publica Prefectura para esta escala; `null` si no se leyeron */
  umbralPrefectura: { alerta: number; evacuacion: number } | null
  /** Por qué no se pudo leer el histórico de Prefectura; `null` si se leyó o no corresponde */
  sinHistorico: string | null
  /** Por qué no contestó el INA; `null` si contestó o la escala no está en el INA */
  sinIna: string | null
}

const motivoDe = (e: unknown) => (e instanceof Error ? e.message : 'error')

/**
 * @param id        el id de la escala en este sistema (ver `PUERTOS_PREFECTURA`)
 * @param enIna     si la escala existe en el INA; las de sólo Prefectura, no
 * @param filas     las últimas alturas de Prefectura, o `null` si no se pudieron leer
 * @param desde     primer día del período, `AAAA-MM-DD`
 * @param hasta     último día, para pedirle al INA
 * @throws si no hay ninguna lectura y el INA no contestó o la escala no está ahí
 */
export async function escalaDelDia(
  id: number, enIna: boolean, filas: FilaPrefectura[] | null,
  desde: string, hasta: string, ahora: number,
): Promise<EscalaDelDia> {
  let ina: Awaited<ReturnType<typeof estadoCompleto>> | null = null
  let sinIna: string | null = null
  if (enIna) {
    try { ina = await estadoCompleto(id, desde, hasta) } catch (e) { sinIna = motivoDe(e) }
  }

  const fila = filas ? filaDe(filas, id) : null
  let historico: LecturaRio[] | null = null
  let sinHistorico: string | null = null
  // Sin las últimas alturas Prefectura está caída: no se le pide además el histórico
  if (filas && PUERTOS_PREFECTURA[id]) {
    try { historico = await traerHistorico(id) } catch (e) { sinHistorico = motivoDe(e) }
  }

  const unida = unirSeries(lecturasDePrefectura(historico, fila), ina?.observado ?? [], desde, ahora)
  /*
   * Sin lecturas hay dos casos. Si el INA contestó y no tiene ninguna en el
   * período, la escala existe y está atrasada —El Colorado se carga con meses
   * de demora—: se devuelve vacía y la pantalla la muestra así. Si no contestó
   * nadie, es un fallo y se dice.
   */
  if (unida.observado.length === 0 && ina === null) {
    throw new Error(sinIna ?? sinHistorico ?? 'Prefectura no trae lecturas de esta escala')
  }

  return {
    observado: unida.observado,
    pronostico: ina?.pronostico ?? null,
    prefectura: unida.lectura,
    fuentes: unida.fuentes,
    descartadas: [...(ina?.descartadas ?? []), ...unida.descartadasIna],
    descartadasPrefectura: unida.descartadasPrefectura,
    umbralPrefectura: fila && fila.alerta !== null && fila.evacuacion !== null
      ? { alerta: fila.alerta, evacuacion: fila.evacuacion }
      : null,
    sinHistorico,
    sinIna,
  }
}
