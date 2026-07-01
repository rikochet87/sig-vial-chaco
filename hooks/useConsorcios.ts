import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { CONSORCIOS, ZONAS_CONFIG } from '@/constants/realData';
import { GEO_BUNDLE } from '@/constants/geoBundle';
import type { ConsorcioDato } from '@/types';

const CACHE_KEY = 'consorcios_cache_v2';

// Color por zona
const ZONA_COLOR: Record<string, string> = Object.fromEntries(
  ZONAS_CONFIG.map(z => [z.id, z.color])
);

// GEO_BUNDLE.sedes es la fuente de verdad para los km de red (valores QGIS)
const GEO_SEDES = (GEO_BUNDLE.sedes as any[]);
const geoKmMap = new Map<number, { redKm: number; redPrimaria: number; redSecundaria: number; redTerciaria: number }>(
  GEO_SEDES.map((s: any) => [
    Number(s.numero),
    {
      redKm:        s.redKm        ?? 0,
      redPrimaria:  s.redPrimaria  ?? 0,
      redSecundaria: s.redSecundaria ?? 0,
      redTerciaria: s.redTerciaria ?? 0,
    },
  ])
);

// Estado inicial: CONSORCIOS de realData pero con km corregidos desde geoBundle
const CONSORCIOS_INIT: ConsorcioDato[] = CONSORCIOS.map(c => {
  const geo = geoKmMap.get(Number(c.numero));
  return geo ? { ...c, ...geo } : c;
});

// Map a Supabase row → ConsorcioDato
// Los km SIEMPRE vienen de geoBundle (QGIS), nunca de Supabase
// Los datos editables (autoridades, nombre) vienen de Supabase
function rowToConsorcioDato(row: Record<string, any>, localMap: Map<number, ConsorcioDato>): ConsorcioDato {
  const local = localMap.get(Number(row.numero));
  const geo   = geoKmMap.get(Number(row.numero));
  return {
    numero:       Number(row.numero),
    nombre:       row.nombre        ?? local?.nombre    ?? '',
    localidad:    row.localidad     ?? local?.localidad ?? '',
    zona:         (row.zona         ?? local?.zona)     as ConsorcioDato['zona'],
    color:        ZONA_COLOR[row.zona ?? ''] ?? local?.color ?? '#888',
    latitude:     local?.latitude   ?? 0,
    longitude:    local?.longitude  ?? 0,
    // km siempre desde geoBundle
    redKm:        geo?.redKm        ?? local?.redKm        ?? 0,
    redPrimaria:  geo?.redPrimaria  ?? local?.redPrimaria  ?? 0,
    redSecundaria: geo?.redSecundaria ?? local?.redSecundaria ?? 0,
    redTerciaria: geo?.redTerciaria ?? local?.redTerciaria ?? 0,
    // autoridades actualizables desde Supabase
    presidente:   row.presidente    ?? local?.presidente    ?? '',
    vicepresidente: row.vicepresidente ?? local?.vicepresidente ?? '',
    secretario:   row.secretario    ?? local?.secretario   ?? '',
    tesorero:     row.tesorero      ?? local?.tesorero     ?? '',
  };
}

export type ConsorcionSource = 'local' | 'cache' | 'remoto';

export function useConsorcios() {
  const [consorcios, setConsorcios] = useState<ConsorcioDato[]>(CONSORCIOS_INIT);
  const [loading, setLoading]       = useState(false);
  const [source, setSource]         = useState<ConsorcionSource>('local');

  useEffect(() => {
    let cancelled = false;
    const localMap = new Map<number, ConsorcioDato>(
      CONSORCIOS_INIT.map(c => [Number(c.numero), c])
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
      } catch (_) {}

      if (cancelled) return;

      // Caché
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (!cancelled && cached) {
          // Al cargar desde caché también corregir km desde geoBundle
          const parsed: ConsorcioDato[] = JSON.parse(cached);
          const fixed = parsed.map(c => {
            const geo = geoKmMap.get(Number(c.numero));
            return geo ? { ...c, ...geo } : c;
          });
          setConsorcios(fixed);
          setSource('cache');
          return;
        }
      } catch (_) {}

      if (!cancelled) setSource('local');
    }

    fetchRemoto().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { consorcios, loading, source };
}
