/**
 * Reintento automático de sincronización.
 *
 * Antes el sync solo corría al entrar a la pestaña Relevamientos. Un técnico
 * que cargaba todo desde el mapa y volvía a la oficina sin abrir esa pestaña
 * dejaba el trabajo sin subir, y no tenía forma de darse cuenta.
 *
 * Se monta una sola vez, en el layout de tabs.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { sincronizarAhora, contarSinSincronizar } from '@/lib/syncManager';

/** Cada cuánto reintentar mientras haya pendientes y estemos online */
const REINTENTO_MS = 60_000;

export function useAutoSync() {
  const { estadoConexion } = useAuth();
  const estadoPrevio = useRef(estadoConexion);

  // 1) Al recuperar la señal
  useEffect(() => {
    const antes = estadoPrevio.current;
    estadoPrevio.current = estadoConexion;
    if (estadoConexion === 'online' && antes !== 'online') {
      sincronizarAhora();
    }
  }, [estadoConexion]);

  // 2) Al volver la app a primer plano
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active' && estadoPrevio.current === 'online') {
        sincronizarAhora();
      }
    });
    return () => sub.remove();
  }, []);

  // 3) Reintento periódico mientras quede algo sin subir
  useEffect(() => {
    if (estadoConexion !== 'online') return;
    const t = setInterval(async () => {
      if (await contarSinSincronizar() > 0) sincronizarAhora();
    }, REINTENTO_MS);
    return () => clearInterval(t);
  }, [estadoConexion]);
}
