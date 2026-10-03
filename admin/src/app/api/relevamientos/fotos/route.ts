/**
 * Sube una foto de un relevamiento de gabinete al bucket de la app.
 *
 *   POST /api/relevamientos/fotos   (multipart: id, foto) → { url }
 *
 * Va al mismo bucket y con la misma ruta que las de la app
 * (`relevamiento-fotos/{id}/{archivo}`), así la ficha las muestra igual.
 *
 * - **Nunca pisa**: `upsert: false`. El nombre lleva la hora y un azar, así que
 *   no choca con las de la app ni con otra subida; y si chocara, es mejor un
 *   error que reemplazar la foto de un relevamiento ajeno.
 * - **El navegador achica la imagen antes de mandarla**: el cuerpo de una
 *   función de Vercel tiene un tope de 4,5 MB y una foto de cámara lo pasa.
 *   El tope de acá es el último resguardo, no el camino normal.
 */

import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requirePermiso } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

const BUCKET = 'relevamiento-fotos'
const MAX_BYTES = 4 * 1024 * 1024
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export async function POST(request: Request) {
  const auth = await requirePermiso('relevamientos')
  if (auth instanceof NextResponse) return auth

  const form = await request.formData().catch(() => null)
  const id = String(form?.get('id') ?? '')
  const foto = form?.get('foto')
  if (!/^\d{10,16}$/.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  if (!(foto instanceof File)) return NextResponse.json({ error: 'Falta la foto' }, { status: 400 })
  const ext = EXT[foto.type]
  if (!ext) return NextResponse.json({ error: 'La foto tiene que ser JPG, PNG o WebP' }, { status: 400 })
  if (foto.size > MAX_BYTES) return NextResponse.json({ error: 'La foto pesa más de 4 MB' }, { status: 413 })

  const path = `${id}/gabinete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const supabase = createServiceClient()
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, Buffer.from(await foto.arrayBuffer()), { contentType: foto.type, upsert: false })
  if (error) {
    console.error('[fotos gabinete]', error.message)
    return NextResponse.json({ error: 'No se pudo subir la foto' }, { status: 500 })
  }

  return NextResponse.json({ url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl })
}
