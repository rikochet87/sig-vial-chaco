import { useState, useEffect, useCallback, useRef } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import type { Relevamiento } from '@/types/relevamiento';

const FILE_PATH = FileSystem.documentDirectory + 'relevamientos.json';

export function useRelevamientos() {
  const [relevamientos, setRelevamientos] = useState<Relevamiento[]>([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<Relevamiento[]>([]);

  const load = useCallback(async () => {
    try {
      const info = await FileSystem.getInfoAsync(FILE_PATH);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(FILE_PATH);
        const parsed = JSON.parse(raw);
        listRef.current = parsed;
        setRelevamientos(parsed);
      }
    } catch (_) {
      setRelevamientos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = useCallback(async (r: Relevamiento) => {
    const next = [r, ...listRef.current];
    listRef.current = next;
    await FileSystem.writeAsStringAsync(FILE_PATH, JSON.stringify(next));
    setRelevamientos(next);
  }, []);

  const remove = useCallback(async (id: string) => {
    const next = listRef.current.filter(item => item.id !== id);
    listRef.current = next;
    await FileSystem.writeAsStringAsync(FILE_PATH, JSON.stringify(next));
    setRelevamientos(next);
  }, []);

  return { relevamientos, loading, add, remove, reload: load };
}
