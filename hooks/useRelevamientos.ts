import { useState, useEffect, useCallback, useRef } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import type { Relevamiento } from '@/types/relevamiento';
import { supabase } from '@/lib/supabase';
import { syncOne, syncPendientes } from '@/hooks/useSupabaseSync';

const FILE_PATH = FileSystem.documentDirectory + 'relevamientos.json';

async function getUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function writeFile(list: Relevamiento[]) {
  await FileSystem.writeAsStringAsync(FILE_PATH, JSON.stringify(list));
}

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

  // Actualiza el syncStatus de un ítem en local sin disparar sync de nuevo
  const _patchStatus = useCallback(async (id: string, status: Relevamiento['syncStatus']) => {
    const prev = listRef.current;
    const idx = prev.findIndex(r => r.id === id);
    if (idx === -1) return;
    const next = [...prev];
    next[idx] = { ...next[idx], syncStatus: status };
    listRef.current = next;
    setRelevamientos(next);
    try { await writeFile(next); } catch (_) {}
  }, []);

  const add = useCallback(async (r: Relevamiento) => {
    const withPending: Relevamiento = { ...r, syncStatus: 'pendiente' };
    const prev = listRef.current;
    const next = [withPending, ...prev];
    listRef.current = next;
    try {
      await writeFile(next);
      setRelevamientos(next);
    } catch (e) {
      listRef.current = prev;
      throw e;
    }
    // Intento sync en background
    const userId = await getUserId();
    if (userId) {
      try {
        await syncOne(withPending, userId);
        await _patchStatus(withPending.id, 'sincronizado');
      } catch {
        await _patchStatus(withPending.id, 'error');
      }
    }
  }, [_patchStatus]);

  const remove = useCallback(async (id: string) => {
    const prev = listRef.current;
    const next = prev.filter(item => item.id !== id);
    listRef.current = next;
    try {
      await writeFile(next);
      setRelevamientos(next);
    } catch (e) {
      listRef.current = prev;
      throw e;
    }
  }, []);

  const update = useCallback(async (updated: Relevamiento) => {
    const withPending: Relevamiento = { ...updated, syncStatus: 'pendiente' };
    const prev = listRef.current;
    const idx = prev.findIndex(r => r.id === withPending.id);
    if (idx === -1) return;
    const next = [...prev];
    next[idx] = withPending;
    listRef.current = next;
    try {
      await writeFile(next);
      setRelevamientos(next);
    } catch (e) {
      listRef.current = prev;
      throw e;
    }
    const userId = await getUserId();
    if (userId) {
      try {
        await syncOne(withPending, userId);
        await _patchStatus(withPending.id, 'sincronizado');
      } catch {
        await _patchStatus(withPending.id, 'error');
      }
    }
  }, [_patchStatus]);

  const syncTodos = useCallback(async () => {
    const userId = await getUserId();
    if (!userId) return;
    await syncPendientes(listRef.current, userId, (id, status) => {
      _patchStatus(id, status);
    });
  }, [_patchStatus]);

  return { relevamientos, loading, add, remove, update, reload: load, syncTodos };
}
