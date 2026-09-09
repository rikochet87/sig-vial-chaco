import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, requireAdminRole, dbError, requireFields } from '@/lib/apiAuth'

/**
 * Plantillas de precios.
 *
 * NO son la fuente de verdad: los precios de una obra viven dentro del proyecto.
 * Esto es solo un lugar donde guardar juegos de referencia para no retipear ocho
 * valores en cada proyecto nuevo. El proyecto se los copia al crearse y a partir
 * de ahí son suyos; si después se edita la plantilla, el proyecto no se mueve.
 */

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('precios_base')
    .select('*')
    .order('vigencia_desde', { ascending: false })

  if (error) return dbError(error)
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminRole()
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const invalid = requireFields(body, ['vigencia_desde'])
  if (invalid) return invalid
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('precios_base')
    .insert({
      vigencia_desde:       body.vigencia_desde,
      etiqueta:             body.etiqueta ?? null,
      gasoil:               body.gasoil ?? 0,
      neumatico:            body.neumatico ?? 0,
      dolar:                body.dolar ?? 0,
      jornal_oficial_esp:   body.jornal_oficial_esp ?? 0,
      jornal_oficial:       body.jornal_oficial ?? 0,
      jornal_medio_oficial: body.jornal_medio_oficial ?? 0,
      jornal_ayudante:      body.jornal_ayudante ?? 0,
      ripio:                body.ripio ?? 0,
      notas:                body.notas ?? null,
      created_by:           auth.userId,
    })
    .select()
    .single()

  if (error) return dbError(error)
  return NextResponse.json(data, { status: 201 })
}
