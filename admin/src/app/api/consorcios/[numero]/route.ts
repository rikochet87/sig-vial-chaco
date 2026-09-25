import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requirePermiso, dbError } from '@/lib/apiAuth'

/**
 * Campos que el formulario de consorcio puede tocar.
 *
 * **Antes acá iba `{ ...body }`**, o sea que lo que vos mandaras se escribía en
 * la fila. Con eso se podían pisar columnas que el formulario ni muestra —
 * `numero`, que es la clave con la que se busca el consorcio en todo el sistema,
 * `nombre`, `latitude`, `longitude`— y no había forma de notarlo desde la
 * pantalla. La lista blanca es el mismo patrón que ya usaba
 * `/api/relevamientos/[id]`, que estaba bien.
 */
const TEXTO = ['presidente', 'vicepresidente', 'secretario', 'tesorero'] as const
const NUMERO = ['red_km', 'red_primaria', 'red_secundaria', 'red_terciaria'] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ numero: string }> },
) {
  // Permiso, no sólo sesión.
  //
  // Con `requireAdmin()` —que pese al nombre sólo valida que haya sesión—
  // cualquier usuario logueado podía editar cualquier consorcio, incluido un
  // técnico de la app móvil, que tiene cuenta. Y no puede ser `requireAdminRole`
  // porque los usuarios de oficina con el permiso `consorcios` sí deben poder.
  const auth = await requirePermiso('consorcios')
  if (auth instanceof NextResponse) return auth

  const { numero } = await params
  const n = Number.parseInt(numero, 10)
  if (!Number.isFinite(n)) {
    return NextResponse.json({ error: 'Número de consorcio inválido' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  for (const k of TEXTO) {
    if (k in body) update[k] = String(body[k] ?? '').slice(0, 200)
  }
  for (const k of NUMERO) {
    if (k in body) {
      const v = Number(body[k])
      // Un kilometraje negativo o disparatado es un error de carga, no un dato
      if (!Number.isFinite(v) || v < 0 || v > 100_000) {
        return NextResponse.json({ error: `Valor inválido en ${k}` }, { status: 400 })
      }
      update[k] = v
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No hay nada para actualizar' }, { status: 400 })
  }
  update.updated_at = new Date().toISOString()

  const supabase = createServiceClient()
  const { error } = await supabase.from('consorcios')
    .update(update)
    .eq('numero', n)
  if (error) return dbError(error, 400, 'actualizar el consorcio')

  return NextResponse.json({ success: true })
}
