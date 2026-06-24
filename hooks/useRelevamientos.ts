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
    const prev = listRef.current;
    const next = [r, ...prev];
    listRef.current = next;
    try {
      await FileSystem.writeAsStringAsync(FILE_PATH, JSON.stringify(next));
      setRelevamientos(next);
    } catch (e) {
      listRef.current = prev;
      throw e;
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    const prev = listRef.current;
    const next = prev.filter(item => item.id !== id);
    listRef.current = next;
    try {
      await FileSystem.writeAsStringAsync(FILE_PATH, JSON.stringify(next));
      setRelevamientos(next);
    } catch (e) {
      listRef.current = prev;
      throw e;
    }
  }, []);

  return { relevamientos, loading, add, remove, reload: load };
}
