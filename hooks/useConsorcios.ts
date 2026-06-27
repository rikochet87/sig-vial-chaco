import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { CONSORCIOS, ZONAS_CONFIG } from '@/constants/realData';
import type { ConsorcioDato } from '@/types';

const CACHE_KEY = 'consorcios_cache';

// Color por zona (mismo esquema que realData.ts)
const ZONA_COLOR: Record<string, string> = Object.fromEntries(
  ZONAS_CONFIG.map(z => [z.id, z.color])
);

// Map a Supabase row → ConsorcioDato, fusionando sub-km desde local si existe
function rowToConsorcioDato(row: Record<string, any>, localMap: Map<number, ConsorcioDato>): ConsorcioDato {
  const local = localMap.get(Number(row.numero));
  return {
    numero: Number(row.numero),
    nombre: row.nombre ?? local?.nombre ?? '',
    localidad: row.localidad ?? local?.localidad ?? '',
    zona: (row.zona ?? local?.zona) as ConsorcioDato['zona'],
    color: ZONA_COLOR[row.zona ?? ''] ?? local?.color ?? '#888',
    latitude: row.coords_lat ?? local?.latitude ?? 0,
    longitude: row.coords_lng ?? local?.longitude ?? 0,
    redKm: row.red_km ?? local?.redKm ?? 0,
    redPrimaria: local?.redPrimaria ?? 0,
    redSecundaria: local?.redSecundaria ?? 0,
    redTerciaria: local?.redTerciaria ?? 0,
    presidente: row.presidente ?? local?.presidente ?? '',
    vicepresidente: row.vicepresidente ?? local?.vicepresidente ?? '',
    secretario: row.secretario ?? local?.secretario ?? '',
    tesorero: row.tesorero ?? local?.tesorero ?? '',
  };
}

export type ConsorcionSource = 'local' | 'cache' | 'remoto';

export function useConsorcios() {
  const [consorcios, setConsorcios] = useState<ConsorcioDato[]>(CONSORCIOS);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<ConsorcionSource>('local');

  useEffect(() => {
    let cancelled = false;
    const localMap = new Map<number, ConsorcioDato>(
      CONSORCIOS.map(c => [Number(c.numero), c])
    );

    async function fetchRemoto() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('consorcios')
          .select('*')
          .order('numero');

        if (!cancelled && !error && data && data.length > 0) {
          const mapped = data.map(row => rowToConsorcioDato(row, localMap));
          setConsorcios(mapped);
          setSource('remoto');
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(mapped));
          return;
        }
      } catch (_) {
        // sin red — caer a cache
      }

      if (cancelled) return;

      // Intentar cache
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (!cancelled && cached) {
          setConsorcios(JSON.parse(cached));
          setSource('cache');
          return;
        }
      } catch (_) {}

      // Fallback local (ya está seteado desde el estado inicial)
      if (!cancelled) setSource('local');
    }

    fetchRemoto().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { consorcios, loading, source };
}
