/**
 * Lo que midió cada pluviómetro **día por día**, para la serie por cuenca.
 *
 *   GET /api/lluvia/estaciones/diario?desde=&hasta=
 *     → { estaciones: [{ nombre, lat, lng }], partes: [{ fecha, mm: number[] }] }
 *
 * `/api/lluvia/estaciones` devuelve el acumulado del período, que alcanza para
 * las isohietas. Para buscar la lámina máxima en 3 o 7 días corridos hace falta
 * saber cuánto cayó cada día, y eso es esta ruta.
 *
 * ── Qué viene y qué no ────────────────────────────────────────────────────────
 *
 * **Sólo los días con parte.** La APA publica los días que llueve, así que la
 * mayoría de los días del rango no aparecen. No se rellenan acá: quién arma la
 * serie decide qué hacer con un día sin parte, y tiene que poder distinguirlo
 * de un cero medido.
 *
 * **Dentro de un día con parte sí van los ceros**, para todas las estaciones
 * activas. Es la misma deducción que hace la ruta del acumulado, y por el mismo
 * motivo: la APA nunca publica un cero, y sin ellos la interpolación pintaría
 * lluvia sobre toda la provincia.
 *
 * `mm` va como arreglo alineado con `estaciones` y no como objeto por nombre:
 * son hasta 400 días por 71 estaciones, y repetir el nombre en cada celda
 * multiplica el peso de la respuesta por diez.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requirePermiso, dbError } from '@/lib/apiAuth'
import { hace, aISO } from '@/lib/lluvia'
import { ESTACIONES_ACTIVAS } from '@/data/estacionesApa'
import { fechasApa } from '@/lib/apa'
import { partesFaltantes } from '@/lib/lluviaCuencas'

export const dynamic = 'force-dynamic'

const PAGINA = 1000
/** Tope de días, para que nadie pida el histórico entero sin querer */
const MAX_DIAS = 400
const FECHA = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  // El permiso de la pantalla que la consume, no la sesión a secas.
  const auth = await requirePermiso('lluvia')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde') ?? hace(89)
  const hasta = searchParams.get('hasta') ?? aISO(new Date())
  if (!FECHA.test(desde) || !FECHA.test(hasta)) {
    return NextResponse.json({ error: 'Fechas inválidas: se espera AAAA-MM-DD' }, { status: 400 })
  }
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1
  if (!(dias >= 1)) {
    return NextResponse.json({ error: 'El rango está al revés' }, { status: 400 })
  }
  if (dias > MAX_DIAS) {
    return NextResponse.json(
      { error: `El rango es de ${dias} días y el máximo es ${MAX_DIAS}` }, { status: 400 })
  }

  const indice = new Map(ESTACIONES_ACTIVAS.map((e, i) => [e.nombre, i]))
  const porFecha = new Map<string, number[]>()

  const supabase = createServiceClient()
  for (let off = 0; ; off += PAGINA) {
    const { data, error } = await supabase
      .from('mediciones_lluvia')
      .select('estacion, fecha, mm')
      .gte('fecha', desde).lte('fecha', hasta)
      // Sin `order` el paginado no es estable y se pierden o repiten filas
      .order('fecha').order('estacion')
      .range(off, off + PAGINA - 1)
    if (error) return dbError(error, 400, 'leer las mediciones diarias')
    if (!data?.length) break

    for (const r of data) {
      const fecha = r.fecha as string
      let fila = porFecha.get(fecha)
      if (!fila) {
        // El día tiene parte: todas las activas arrancan en cero
        fila = new Array<number>(ESTACIONES_ACTIVAS.length).fill(0)
        porFecha.set(fecha, fila)
      }
      const i = indice.get(r.estacion as string)
      const mm = Number(r.mm)
      if (i !== undefined && Number.isFinite(mm)) fila[i] = Math.round(mm * 10) / 10
    }
    if (data.length < PAGINA) break
  }

  /*
   * Los partes que la APA publicó y acá no están cargados.
   *
   * Un día sin filas en la tabla se lee igual que un día sin parte, así que la
   * falta no se ve desde la serie: hay que preguntarle a la APA qué publicó. Es
   * un pedido liviano —la lista de fechas—, y si la APA no contesta la serie se
   * entrega igual con `faltan: null`, que es «no se pudo comprobar» y no «no
   * falta nada».
   */
  let faltan: string[] | null = null
  try {
    faltan = partesFaltantes(await fechasApa(), porFecha.keys(), desde, hasta)
  } catch {
    faltan = null
  }

  return NextResponse.json({
    desde, hasta, faltan,
    estaciones: ESTACIONES_ACTIVAS.map(e => ({ nombre: e.nombre, lat: e.lat, lng: e.lng })),
    partes: [...porFecha].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, mm]) => ({ fecha, mm })),
  })
}
