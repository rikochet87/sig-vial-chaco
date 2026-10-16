/**
 * Altura en Barranqueras para los próximos ~16 días, a partir de la lluvia
 * medida y pronosticada en el Paraná brasileño. El cálculo está en
 * `lib/crecidaCalculo.ts`; la cadena, en `lib/crecida.ts`; el método y su
 * validación, en `docs/pronostico-crecida-barranqueras.md`.
 *
 * **No es un pronóstico oficial**, y la respuesta lo dice: el del INA lo es.
 *
 * Guard: `requireLecturaHidrologia()`, como las demás lecturas del río: entra
 * en los enlaces públicos.
 */

import { NextResponse } from 'next/server'
import { requireLecturaHidrologia } from '@/lib/apiAuth'
import { calcularCrecida, ErrorCrecida } from '@/lib/crecidaCalculo'

export const dynamic = 'force-dynamic'
/** El CSV del ONS son ~9 MB */
export const maxDuration = 60
/** Tres horas: el ECMWF corre cada seis y el ONS publica una vez por día */
const CACHE_S = 10_800

export async function GET() {
  const auth = await requireLecturaHidrologia()
  if (auth instanceof NextResponse) return auth
  try {
    const { respuesta } = await calcularCrecida()
    return NextResponse.json(respuesta, {
      headers: { 'cache-control': `s-maxage=${CACHE_S}, stale-while-revalidate=${CACHE_S}` },
    })
  } catch (e) {
    if (e instanceof ErrorCrecida) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[crecida]', e)
    return NextResponse.json({ error: 'Error al calcular la crecida' }, { status: 500 })
  }
}
