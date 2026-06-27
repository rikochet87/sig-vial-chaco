import { supabase } from '@/lib/supabase';
import type { Relevamiento } from '@/types/relevamiento';

function toSupabaseRow(r: Relevamiento, userId: string) {
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
    zona: r.autoDeteccion?.zona ?? null,
    observaciones: r.observaciones,
    fotos: r.fotos ?? [],
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
  const { error } = await supabase
    .from('relevamientos')
    .upsert(toSupabaseRow(r, userId), { onConflict: 'id' });
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
