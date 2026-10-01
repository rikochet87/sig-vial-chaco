/**
 * Sincronización de relevamientos a nivel archivo.
 *
 * Existe aparte de `useRelevamientos` porque el sync tiene que poder dispararse
 * sin que esté montada la pantalla de Relevamientos: hasta ahora solo corría al
 * entrar a esa pestaña, así que un técnico que cargaba todo desde el mapa y
 * cerraba la app dejaba el trabajo sin subir por tiempo indefinido.
 *
 * Cuidado con la concurrencia: `useRelevamientos` también escribe este archivo
 * (vuelca su estado completo en memoria). Si acá escribiéramos un snapshot
 * viejo, pisaríamos los relevamientos que el técnico guardó mientras corría el
 * sync. Por eso se releé el archivo antes de cada escritura y se parchea por id
 * en vez de reemplazar la lista entera.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { syncOne, necesitaSubir, type ResultadoSync as ResultadoSubida } from '@/hooks/useSupabaseSync';
import type { Relevamiento } from '@/types/relevamiento';

const FILE_PATH = FileSystem.documentDirectory + 'relevamientos.json';

/** Evita que dos disparos simultáneos (volvió la señal + volvió a foreground) suban lo mismo dos veces. */
let enCurso = false;

async function leerArchivo(): Promise<Relevamiento[]> {
  try {
    const info = await FileSystem.getInfoAsync(FILE_PATH);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(FILE_PATH);
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

/**
 * Actualiza el estado de UN relevamiento releyendo el archivo primero.
 * No escribe la lista completa: así se conservan los relevamientos que se hayan
 * agregado desde otra pantalla mientras este sync estaba corriendo.
 */
async function parchearUno(
  id: string,
  status: Relevamiento['syncStatus'],
  res?: ResultadoSubida,
): Promise<void> {
  try {
    const list = await leerArchivo();
    const i = list.findIndex(r => r.id === id);
    if (i === -1) return;                       // lo borraron mientras tanto
    list[i] = {
      ...list[i],
      syncStatus: status,
      ...(res ? {
        fotos: res.fotos,
        ...(res.perdidas > 0 ? { fotosPerdidas: (list[i].fotosPerdidas ?? 0) + res.perdidas } : {}),
      } : {}),
    };
    await FileSystem.writeAsStringAsync(FILE_PATH, JSON.stringify(list));
  } catch (_) {}
}

export type ResultadoSync = {
  intentados: number;
  subidos: number;
  fallidos: number;
  /** true si no se hizo nada porque ya había un sync corriendo */
  omitido?: boolean;
};

/** Cuenta relevamientos sin subir: pendientes, fallidos y los que tienen fotos que faltan. */
export async function contarSinSincronizar(): Promise<number> {
  const list = await leerArchivo();
  return list.filter(necesitaSubir).length;
}

/**
 * Sube todo lo que esté sin sincronizar. Silencioso: no lanza excepciones.
 * Devuelve un resumen para poder loguearlo o mostrarlo.
 */
export async function sincronizarAhora(): Promise<ResultadoSync> {
  if (enCurso) return { intentados: 0, subidos: 0, fallidos: 0, omitido: true };
  enCurso = true;

  try {
    // Sin sesión válida no tiene sentido intentar: Supabase rechazaría el upsert
    // y marcaríamos todo como 'error' sin motivo real.
    let userId: string | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      userId = data?.user?.id ?? null;
    } catch (_) {
      userId = null;
    }
    if (!userId) return { intentados: 0, subidos: 0, fallidos: 0 };

    const list = await leerArchivo();
    const sinSubir = list.filter(necesitaSubir);
    if (sinSubir.length === 0) return { intentados: 0, subidos: 0, fallidos: 0 };

    let subidos = 0;
    let fallidos = 0;

    for (const viejo of sinSubir) {
      // La lista se leyó al empezar y subir cada uno tarda: para cuando le toca
      // a éste pueden haberlo subido desde la pantalla, editado o borrado. Se
      // vuelve a leer para subir lo que hay ahora y no una copia vieja.
      const r = (await leerArchivo()).find(x => x.id === viejo.id);
      if (!r || !necesitaSubir(r)) continue;
      try {
        const res = await syncOne(r, userId);
        await parchearUno(r.id, res.completo ? 'sincronizado' : 'error', res);
        if (res.completo) subidos++; else fallidos++;
      } catch (_) {
        await parchearUno(r.id, 'error');
        fallidos++;
        // Si falla el primero por falta de red, los siguientes van a fallar
        // igual: cortar acá evita castigar la batería reintentando en vano.
        if (subidos === 0) break;
      }
    }

    return { intentados: sinSubir.length, subidos, fallidos };
  } catch (_) {
    return { intentados: 0, subidos: 0, fallidos: 0 };
  } finally {
    enCurso = false;
  }
}
