import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, dbError } from '@/lib/apiAuth'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ numero: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { numero } = await params
  const body = await request.json()
  const supabase = createServiceClient()
  const { error } = await supabase.from('consorcios')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('numero', parseInt(numero))
  if (error) return dbError(error)
  return NextResponse.json({ success: true })
}
