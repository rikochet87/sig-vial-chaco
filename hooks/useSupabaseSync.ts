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
      ripio: r.datosLineal,
      otro: r.datosOtro,
    },
    fecha: r.fecha,
  };
}

/**
 * Subidas en curso, por id de relevamiento.
 *
 * Al guardar, `useRelevamientos` sube el relevamiento en el momento, y el
 * auto-sync —que corre al volver a primer plano y cada minuto— lo encuentra
 * todavía 'pendiente' en el archivo y lo sube también. En Storage se ve: la
 * misma foto escrita dos veces con segundos de diferencia. Son dos copias de
 * cada foto en memoria a la vez y el doble de datos móviles.
 *
 * La `huella` es el contenido sin el estado de sync: si el técnico editó el
 * relevamiento mientras subía la versión anterior, la subida en curso no sirve
 * para la nueva y hay que esperar a que termine y subir de nuevo.
 */
const enCurso = new Map<string, { huella: string; promesa: Promise<string[]> }>();

function huellaDe(r: Relevamiento): string {
  const { syncStatus: _, ...resto } = r;
  return JSON.stringify(resto);
}

/** Sincroniza un relevamiento y devuelve las URLs públicas de las fotos (para actualizar el registro local). */
export async function syncOne(r: Relevamiento, userId: string): Promise<string[]> {
  const huella = huellaDe(r);
  const previa = enCurso.get(r.id);
  if (previa) {
    if (previa.huella === huella) return previa.promesa;
    try { await previa.promesa; } catch (_) {}
  }
  const promesa = subirUno(r, userId);
  enCurso.set(r.id, { huella, promesa });
  try {
    return await promesa;
  } finally {
    if (enCurso.get(r.id)?.promesa === promesa) enCurso.delete(r.id);
  }
}

async function subirUno(r: Relevamiento, userId: string): Promise<string[]> {
  // 1. Subir fotos locales a Storage y obtener URLs públicas.
  // De a una y no con Promise.all: cada foto pasa entera por memoria tres veces
  // (base64, binario y bytes), y todas juntas multiplican ese pico por la
  // cantidad de fotos justo en el momento de guardar.
  const fotosPublicas: string[] = [];
  const fotos = r.fotos ?? [];
  for (let i = 0; i < fotos.length; i++) {
    fotosPublicas.push(await uploadFotoIfLocal(fotos[i], r.id, i));
  }
  // 2. Guardar fila con URLs públicas
  const { error } = await supabase
    .from('relevamientos')
    .upsert(toSupabaseRow(r, userId, fotosPublicas), { onConflict: 'id' });
  if (error) throw error;
  return fotosPublicas;
}

export async function syncPendientes(
  relevamientos: Relevamiento[],
  userId: string,
  onUpdate: (id: string, status: 'sincronizado' | 'error', fotosPublicas?: string[]) => void,
): Promise<void> {
  // Incluye 'error': un relevamiento que falló una vez (típicamente por falta
  // de señal) quedaba en 'error' y no se reintentaba nunca más, así que el
  // trabajo del técnico no llegaba al servidor aunque después hubiera red.
  const pendientes = relevamientos.filter(
    r => r.syncStatus === 'pendiente' || r.syncStatus === 'error'
  );
  for (const r of pendientes) {
    try {
      const fotosPublicas = await syncOne(r, userId);
      onUpdate(r.id, 'sincronizado', fotosPublicas);
    } catch {
      onUpdate(r.id, 'error');
    }
  }
}
