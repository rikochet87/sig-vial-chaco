/**
 * Consulta de precipitaciones ya ingeridas.
 *
 *   GET /api/lluvia?desde=&hasta=            → resumen por consorcio + episodios
 *   GET /api/lluvia?desde=&hasta=&consorcio= → la serie diaria de uno solo
 *
 * Lee de la tabla, no de Open-Meteo: la ingesta ya trajo el dato y acá interesa
 * que la pantalla responda rápido y que el número sea el mismo que se citó en un
 * expediente la semana pasada, aunque el modelo lo haya reajustado después.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError } from '@/lib/apiAuth'
import {
  resumirPorConsorcio, detectarEpisodios, hace, aISO, diasEntre, type RegistroLluvia,
} from '@/lib/lluvia'

/** Supabase corta en 1000 filas por defecto; 103 consorcios × 400 días no entran. */
const PAGINA = 1000

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde') ?? hace(30)
  const hasta = searchParams.get('hasta') ?? aISO(new Date())
  const consorcio = searchParams.get('consorcio')

  const supabase = createServiceClient()

  // ── Serie de un consorcio ────────────────────────────────────────────────
  if (consorcio) {
    const n = Number(consorcio)
    if (!Number.isInteger(n)) {
      return NextResponse.json({ error: 'consorcio tiene que ser un número' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('precipitaciones')
      .select('fecha, mm, fuente')
      .eq('consorcio_numero', n)
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha')
    if (error) return dbError(error)
    const total = (data ?? []).reduce((s, r) => s + Number(r.mm), 0)
    return NextResponse.json({
      desde, hasta, consorcio: n,
      total: Math.round(total * 10) / 10,
      serie: data ?? [],
    })
  }

  // ── Provincia entera ─────────────────────────────────────────────────────
  //
  // `mm_fusion` es la interpolación de los pluviómetros de la APA y es el número
  // que se muestra; `mm` es el modelo y queda de respaldo para las fechas que
  // todavía no se fusionaron —las anteriores a que esto existiera, o aquellas en
  // que la APA no publicó parte.
  /**
   * La procedencia del período se pesa **por milímetros**, no por días.
   *
   * La primera versión tomaba la peor procedencia de todos los días del rango, y
   * eso daba una etiqueta absurda: en una semana con dos días de lluvia y seis
   * secos, los seis secos no tienen parte de la APA —no hay nada que fusionar—
   * así que marcaban todo el acumulado como "sin recalcular", tapando que el
   * 100 % de los milímetros venía de pluviómetros.
   *
   * El número que se muestra es una suma. Un día que aportó 0 mm no aporta nada
   * al resultado, así que su procedencia no debería decidir la etiqueta. Se mira
   * de dónde vinieron los milímetros que efectivamente hay.
   */
  const registros: RegistroLluvia[] = []
  const proc = new Map<number, {
    mmPorProc: Record<string, number>
    mmTotal: number
    dist: number; n: number; fusionadas: number
  }>()

  /** Con menos de este aporte, la procedencia de esos días no cambia la etiqueta */
  const UMBRAL = 0.05

  /**
   * Estado de cada día del rango, para poder decirlo en pantalla.
   *
   * La pantalla necesita contestar "de estos 5 días, ¿cuántos tienen serie
   * descargada y cuántos ya se interpolaron?" sin que el usuario tenga que
   * deducirlo de un cartel que aparece y desaparece. Se arma acá porque las
   * filas ya están leídas: agrupar por fecha no cuesta nada más.
   */
  const porFecha = new Map<string, { serie: boolean; interpolado: boolean; sinParte: boolean }>()

  for (let desplazamiento = 0; ; desplazamiento += PAGINA) {
    const { data, error } = await supabase
      .from('precipitaciones')
      .select('consorcio_numero, fecha, mm, mm_fusion, procedencia, dist_pluviometro_km')
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha')
      .range(desplazamiento, desplazamiento + PAGINA - 1)
    if (error) return dbError(error)
    if (!data?.length) break

    for (const r of data) {
      const cc = r.consorcio_numero as number
      const mm = Number(r.mm_fusion ?? r.mm)
      registros.push({ consorcio_numero: cc, fecha: r.fecha as string, mm })

      // Sin `mm_fusion` la fila no tiene número de pluviómetros, y hay **dos
      // motivos distintos** que no se pueden mezclar:
      //
      //   `sin_parte`    — ese día la APA no publicó nada. No hay con qué
      //                    cruzar y recalcular no lo arregla: el dato no existe.
      //   `sin_calcular` — hay parte, pero esta fila todavía no se cruzó. Eso sí
      //                    se arregla recalculando.
      //
      // Juntarlos hacía que la pantalla ofreciera un botón de recalcular que no
      // podía cambiar nada, y que volvía a aparecer después de apretarlo.
      const marca = r.procedencia as string | null
      const p = r.mm_fusion == null
        ? (marca === 'sin_parte' ? 'sin_parte' : 'sin_calcular')
        : (marca ?? 'sin_calcular')

      let a = proc.get(cc)
      if (!a) { a = { mmPorProc: {}, mmTotal: 0, dist: 0, n: 0, fusionadas: 0 }; proc.set(cc, a) }
      a.mmPorProc[p] = (a.mmPorProc[p] ?? 0) + mm
      a.mmTotal += mm
      if (r.dist_pluviometro_km != null) { a.dist += Number(r.dist_pluviometro_km); a.n++ }
      if (r.mm_fusion != null) a.fusionadas++

      let f = porFecha.get(r.fecha as string)
      if (!f) { f = { serie: false, interpolado: false, sinParte: false }; porFecha.set(r.fecha as string, f) }
      f.serie = true
      if (r.mm_fusion != null) f.interpolado = true
      if (p === 'sin_parte') f.sinParte = true
    }
    if (data.length < PAGINA) break
  }

  // Última fecha con dato: sirve para avisar en pantalla si la ingesta se atrasó
  const { data: ultima } = await supabase
    .from('precipitaciones')
    .select('fecha')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()

  /**
   * La peor procedencia **entre las que aportan milímetros de verdad**.
   *
   * Si todo el período dio 0 mm no hay de dónde agarrarse, así que ahí sí manda
   * la peor de todas: no llovió y tampoco se recalculó, y eso hay que decirlo.
   */
  const ORDEN: Record<string, number> = {
    medido: 0, interpolado: 1, estimado: 2, sin_parte: 3, sin_calcular: 4,
  }
  const etiqueta = (a?: { mmPorProc: Record<string, number>; mmTotal: number }) => {
    if (!a) return 'sin_calcular'
    const claves = Object.keys(a.mmPorProc)
    if (claves.length === 0) return 'sin_calcular'
    const relevantes = a.mmTotal > 0
      ? claves.filter(k => a.mmPorProc[k] / a.mmTotal > UMBRAL)
      : claves
    return (relevantes.length ? relevantes : claves)
      .sort((x, y) => ORDEN[y] - ORDEN[x])[0]
  }

  const consorcios = resumirPorConsorcio(registros).map(c => {
    const a = proc.get(c.numero)
    return {
      ...c,
      procedencia: etiqueta(a),
      distanciaKm: a && a.n ? Math.round((a.dist / a.n) * 10) / 10 : null,
    }
  })

  return NextResponse.json({
    desde, hasta,
    consorcios,
    episodios: detectarEpisodios(registros),
    ultimaFechaCargada: ultima?.fecha ?? null,
    filas: registros.length,
    // Cuántas de las filas del rango ya tienen la interpolación calculada
    fusionadas: [...proc.values()].reduce((s, a) => s + a.fusionadas, 0),
    /**
     * Cuántos días del rango están en cada estado.
     *
     * `sinParte` no es un subconjunto de "falta interpolar": son días que no se
     * van a poder interpolar nunca porque la APA no publicó parte. Van
     * separados justamente para que la pantalla no ofrezca arreglarlos.
     */
    cobertura: {
      dias: diasEntre(desde, hasta),
      conSerie: porFecha.size,
      interpolados: [...porFecha.values()].filter(f => f.interpolado).length,
      sinParte: [...porFecha.values()].filter(f => f.sinParte && !f.interpolado).length,
    },
  })
}
