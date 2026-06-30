import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params
  const body = await request.json()
  const supabase = createServiceClient()
  const { error } = await supabase.from('consorcios')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('numero', parseInt(numero))
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
