import { useState, useEffect, useCallback } from 'react';
import * as FileSystem from 'expo-file-system';
import type { Relevamiento } from '@/types/relevamiento';

const FILE_PATH = FileSystem.documentDirectory + 'relevamientos.json';

export function useRelevamientos() {
  const [relevamientos, setRelevamientos] = useState<Relevamiento[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const info = await FileSystem.getInfoAsync(FILE_PATH);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(FILE_PATH);
        setRelevamientos(JSON.parse(raw));
      }
    } catch (_) {
      setRelevamientos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const persist = useCallback(async (list: Relevamiento[]) => {
    await FileSystem.writeAsStringAsync(FILE_PATH, JSON.stringify(list));
    setRelevamientos(list);
  }, []);

  const add = useCallback(async (r: Relevamiento) => {
    setRelevamientos(prev => {
      const next = [r, ...prev];
      FileSystem.writeAsStringAsync(FILE_PATH, JSON.stringify(next));
      return next;
    });
  }, []);

  const remove = useCallback(async (id: string) => {
    setRelevamientos(prev => {
      const next = prev.filter(r => r.id !== id);
      FileSystem.writeAsStringAsync(FILE_PATH, JSON.stringify(next));
      return next;
    });
  }, []);

  return { relevamientos, loading, add, remove, reload: load };
}
