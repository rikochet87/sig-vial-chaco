import { supabase } from '@/lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import type { Relevamiento } from '@/types/relevamiento';

const FOTO_BUCKET = 'relevamiento-fotos';

/** Sube una foto local a Supabase Storage y devuelve la URL pública.
 *  Si ya es una URL http (ya subida), la devuelve sin cambios. */
async function uploadFotoIfLocal(uri: string, relevamientoId: string, index: number): Promise<string> {
  if (uri.startsWith('http')) return uri;
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    // base64 → Uint8Array (atob disponible en Hermes/Expo)
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${relevamientoId}/${index}.${ext}`;

    const { error } = await supabase.storage
      .from(FOTO_BUCKET)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;

    const { data } = supabase.storage.from(FOTO_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error('[sync] uploadFoto failed:', msg, '| uri:', uri.slice(0, 60));
    return uri; // fallback: el relevamiento se sincroniza igual, solo sin foto en la web
  }
}

function toSupabaseRow(r: Relevamiento, userId: string, fotosPublicas: string[]) {
  return {
    id: r.id,
    tecnico_id: userId,
    tipo: r.tipo,
    estado_calzada: r.estadoCalzada,
    coords_lat: r.coords?.lat ?? null,
    coords_lng: r.coords?.lng ?? null,
    coords_linea: r.coordsLinea ?? null,
    ruta_tramo: r.rutaTramo,
    cc_asociado: r.ccAsociado ?? r.autoDeteccion?.ccNombre ?? null,
    zona: r.tecnicoZona || null,
    observaciones: r.observaciones,
    fotos: fotosPublicas,
    datos_especificos: {
      puente: r.datosPuente,
      alcantarilla: r.datosAlcantarilla,
      tubos: r.datosTubos,
      ripio: r.datosRipio,
      otro: r.datosOtro,
    },
    fecha: r.fecha,
  };
}

export async function syncOne(r: Relevamiento, userId: string): Promise<void> {
  // 1. Subir fotos locales a Storage y obtener URLs públicas
  const fotosPublicas = await Promise.all(
    (r.fotos ?? []).map((uri, i) => uploadFotoIfLocal(uri, r.id, i))
  );
  // 2. Guardar fila con URLs públicas
  const { error } = await supabase
    .from('relevamientos')
    .upsert(toSupabaseRow(r, userId, fotosPublicas), { onConflict: 'id' });
  if (error) throw error;
}

export async function syncPendientes(
  relevamientos: Relevamiento[],
  userId: string,
  onUpdate: (id: string, status: 'sincronizado' | 'error') => void,
): Promise<void> {
  const pendientes = relevamientos.filter(r => r.syncStatus === 'pendiente');
  for (const r of pendientes) {
    try {
      await syncOne(r, userId);
      onUpdate(r.id, 'sincronizado');
    } catch {
      onUpdate(r.id, 'error');
    }
  }
}
