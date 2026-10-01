/**
 * Dónde viven las fotos de un relevamiento mientras no se subieron.
 *
 * La cámara y la galería entregan la foto en la carpeta de **caché** de la app,
 * y Android puede vaciar esa carpeta cuando le falta espacio. Un relevamiento
 * cargado sin señal puede esperar días para subir: si la foto se queda en
 * caché, el día que haya red puede no estar más.
 *
 * Por eso cada foto se copia a `documentDirectory/fotos/` apenas entra al
 * formulario, y se borra de ahí cuando ya está en el servidor.
 */

import * as FileSystem from 'expo-file-system/legacy';

const DIR = FileSystem.documentDirectory + 'fotos/';

/** Si la foto está en el teléfono y todavía no en el servidor */
export const esLocal = (uri: string) => !uri.startsWith('http');

/**
 * Copia una foto a la carpeta propia de la app y devuelve la ruta nueva.
 *
 * Si la copia falla devuelve la ruta original: perder la protección contra el
 * vaciado de caché es mejor que perder la foto que el técnico acaba de sacar.
 */
export async function guardarFotoLocal(uri: string): Promise<string> {
  try {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
    const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
    const destino = `${DIR}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: destino });
    return destino;
  } catch (_) {
    return uri;
  }
}

/** Borra la copia local de una foto que ya está en el servidor. Sólo las propias */
export async function borrarFotoLocal(uri: string): Promise<void> {
  if (!uri.startsWith(DIR)) return;
  try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch (_) {}
}
