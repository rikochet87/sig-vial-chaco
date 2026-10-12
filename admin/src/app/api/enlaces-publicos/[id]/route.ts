import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminRole, dbError } from '@/lib/apiAuth'

/**
 * Da de baja un enlace público. No borra la fila: le pone fecha, para que en
 * la lista quede a quién se le había dado. Quien lo tenía abierto puede seguir
 * viendo hasta un minuto más (ver `enlaceVigente()`).
 */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRole()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  const { error } = await createServiceClient()
    .from('enlaces_publicos')
    .update({ revocado_en: new Date().toISOString() })
    .eq('id', id)
    .is('revocado_en', null)
  if (error) return dbError(error, 400, 'dar de baja el enlace público')
  return NextResponse.json({ success: true })
}
