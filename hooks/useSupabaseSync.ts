import { supabase } from '@/lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { esLocal, borrarFotoLocal } from '@/lib/fotos';
import type { Relevamiento } from '@/types/relevamiento';

const FOTO_BUCKET = 'relevamiento-fotos';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
};

/** Qué pasó con una foto al intentar subirla */
type Subida =
  | { estado: 'subida'; url: string }
  /** El archivo ya no está en el teléfono: no se va a poder subir nunca */
  | { estado: 'perdida' }
  /** Falló la subida — típicamente sin señal — y se puede reintentar */
  | { estado: 'fallo' };

/**
 * Sube una foto local a Storage.
 *
 * **El nombre en Storage es el del archivo local, no la posición en la lista.**
 * Con `${id}/${posición}.jpg`, sacar la primera foto de un relevamiento y
 * agregar otra hacía que la nueva cayera en la posición de una que ya estaba
 * subida y, con `upsert`, la pisara: la URL vieja pasaba a mostrar la foto
 * nueva. El nombre local es único, y reintentar la misma foto se pisa a sí
 * misma, que es lo que se quiere.
 */
async function subirFoto(uri: string, relevamientoId: string): Promise<Subida> {
  const nombre = uri.split('?')[0].split('/').pop() || `${Date.now()}.jpg`;
  const ext = nombre.includes('.') ? nombre.split('.').pop()!.toLowerCase() : 'jpg';
  const path = `${relevamientoId}/${nombre}`;
  const url = supabase.storage.from(FOTO_BUCKET).getPublicUrl(path).data.publicUrl;

  let existe: boolean;
  try {
    existe = (await FileSystem.getInfoAsync(uri)).exists;
  } catch (_) {
    return { estado: 'fallo' };
  }

  /*
   * El archivo no está. Antes de darlo por perdido hay que mirar el servidor.
   *
   * La copia local se borra cuando la foto sube, así que "no está" es también
   * lo que ve una sincronización que arranca con la lista vieja de un
   * relevamiento que otra ya subió — el guardado y el auto-sync pueden
   * cruzarse así. Tomarlo como pérdida mandaría la fila sin esa foto y
   * **borraría del servidor una foto que sí estaba**. Como el nombre en Storage
   * sale del nombre local, se puede preguntar si ya está allá.
   *
   * Sin red la pregunta falla y la respuesta es reintentar, no perderla.
   */
  if (!existe) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return { estado: 'subida', url };
      // Storage contesta 400 o 404 cuando el objeto no existe
      return res.status === 400 || res.status === 404 ? { estado: 'perdida' } : { estado: 'fallo' };
    } catch (_) {
      return { estado: 'fallo' };
    }
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    // base64 → Uint8Array (atob disponible en Hermes/Expo)
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const { error } = await supabase.storage
      .from(FOTO_BUCKET)
      .upload(path, bytes, { contentType: MIME[ext] ?? 'image/jpeg', upsert: true });
    if (error) throw error;

    return { estado: 'subida', url };
  } catch (e: any) {
    console.error('[sync] subirFoto falló:', e?.message ?? String(e), '| uri:', uri.slice(0, 60));
    return { estado: 'fallo' };
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
 * Lo que devuelve una sincronización.
 *
 * `fotos` es la lista para guardar en el registro local: URL pública donde la
 * foto subió, ruta local donde falló. `completo` es falso si quedó alguna sin
 * subir, y entonces el relevamiento **no** está sincronizado aunque la fila
 * haya llegado.
 */
export interface ResultadoSync {
  fotos: string[];
  /** Fotos cuyo archivo ya no está en el teléfono */
  perdidas: number;
  completo: boolean;
}

/**
 * ¿Hay que subir este relevamiento?
 *
 * Además de los pendientes y los que fallaron, los que figuran sincronizados
 * pero conservan una foto local. Con la versión anterior, una foto que fallaba
 * al subir dejaba la fila guardada con la ruta del teléfono y el relevamiento
 * marcado como sincronizado: nadie lo reintentaba y el panel recibía una ruta
 * que no puede abrir. Esto los recupera en el próximo sync.
 */
export function necesitaSubir(r: Relevamiento): boolean {
  if (r.syncStatus === 'pendiente' || r.syncStatus === 'error') return true;
  return (r.fotos ?? []).some(esLocal);
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
const enCurso = new Map<string, { huella: string; promesa: Promise<ResultadoSync> }>();

function huellaDe(r: Relevamiento): string {
  const { syncStatus: _, ...resto } = r;
  return JSON.stringify(resto);
}

/**
 * Sincroniza un relevamiento.
 *
 * Lanza si no se pudo guardar la fila. Si la fila se guardó pero quedó alguna
 * foto sin subir, **no lanza**: devuelve `completo: false` con la lista de
 * fotos tal como quedó, para que quien llama la guarde y lo reintente.
 */
export async function syncOne(r: Relevamiento, userId: string): Promise<ResultadoSync> {
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

async function subirUno(r: Relevamiento, userId: string): Promise<ResultadoSync> {
  // 1. Subir las fotos locales.
  // De a una y no con Promise.all: cada foto pasa entera por memoria tres veces
  // (base64, binario y bytes), y todas juntas multiplican ese pico por la
  // cantidad de fotos justo en el momento de guardar.
  const fotos: string[] = [];
  const recienSubidas: string[] = [];
  let perdidas = 0;
  let fallos = 0;

  for (const uri of r.fotos ?? []) {
    if (!esLocal(uri)) { fotos.push(uri); continue; }
    const s = await subirFoto(uri, r.id);
    if (s.estado === 'subida') { fotos.push(s.url); recienSubidas.push(uri); }
    else if (s.estado === 'perdida') perdidas++;
    else { fotos.push(uri); fallos++; }
  }

  // 2. Guardar la fila, **sólo con las fotos que están en el servidor**.
  // Una ruta `file://` del teléfono no le sirve a nadie en el panel. La fila se
  // manda igual aunque falten fotos: el dato del relevamiento llega ya, y las
  // fotos que faltan llegan en el reintento.
  const { error } = await supabase
    .from('relevamientos')
    .upsert(toSupabaseRow(r, userId, fotos.filter(u => !esLocal(u))), { onConflict: 'id' });
  if (error) throw error;

  // 3. Las copias locales de lo que ya subió no hacen falta. Recién acá, con la
  // fila guardada: si el upsert falla, el reintento las vuelve a necesitar.
  for (const uri of recienSubidas) await borrarFotoLocal(uri);

  return { fotos, perdidas, completo: fallos === 0 };
}

export async function syncPendientes(
  relevamientos: Relevamiento[],
  userId: string,
  onUpdate: (id: string, status: 'sincronizado' | 'error', res?: ResultadoSync) => void,
): Promise<void> {
  // Incluye 'error': un relevamiento que falló una vez (típicamente por falta
  // de señal) quedaba en 'error' y no se reintentaba nunca más, así que el
  // trabajo del técnico no llegaba al servidor aunque después hubiera red.
  for (const r of relevamientos.filter(necesitaSubir)) {
    try {
      const res = await syncOne(r, userId);
      onUpdate(r.id, res.completo ? 'sincronizado' : 'error', res);
    } catch {
      onUpdate(r.id, 'error');
    }
  }
}
