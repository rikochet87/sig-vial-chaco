/**
 * Indicador de conexión y de relevamientos sin sincronizar.
 *
 * Va en el header de todas las pestañas. Antes el único aviso de "modo sin
 * conexión" estaba en la pantalla de Obras, así que el técnico podía pasar la
 * jornada cargando relevamientos sin enterarse de que se estaban apilando sin
 * subir. El contador de pendientes es la mitad importante: saber que no hay
 * señal sirve poco si no sabés cuánto trabajo tenés sin respaldar.
 */

import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '@/context/AuthContext';

const FILE_PATH = FileSystem.documentDirectory + 'relevamientos.json';
const REFRESH_MS = 5000;

async function contarPendientes(): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(FILE_PATH);
    if (!info.exists) return 0;
    const raw = await FileSystem.readAsStringAsync(FILE_PATH);
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return 0;
    // 'error' también cuenta: para el técnico es trabajo sin respaldar igual
    return list.filter((r: any) => r?.syncStatus === 'pendiente' || r?.syncStatus === 'error').length;
  } catch (_) {
    return 0;
  }
}

export default function ConexionBadge() {
  const { estadoConexion } = useAuth();
  const [pendientes, setPendientes] = useState(0);

  const refrescar = useCallback(() => { contarPendientes().then(setPendientes); }, []);

  useEffect(() => {
    refrescar();
    const t = setInterval(refrescar, REFRESH_MS);
    return () => clearInterval(t);
  }, [refrescar]);

  // Recontar al volver a una pestaña (recién guardó un relevamiento)
  useFocusEffect(useCallback(() => { refrescar(); }, [refrescar]));

  // Mientras verifica no se muestra nada: afirmar "sin conexión" antes de
  // saberlo es lo que hacía parpadear el aviso en cada arranque.
  if (estadoConexion === 'verificando' && pendientes === 0) return null;

  const offline = estadoConexion === 'offline';
  const color   = offline ? '#e74c3c' : '#27ae60';

  return (
    <View style={s.wrap}>
      {estadoConexion !== 'verificando' && (
        <>
          <View style={[s.dot, { backgroundColor: color }]} />
          <Text style={[s.txt, { color }]}>{offline ? 'SIN RED' : 'EN LÍNEA'}</Text>
        </>
      )}
      {pendientes > 0 && (
        <View style={s.pill}>
          <Text style={s.pillTxt}>↑{pendientes}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginRight: 12,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  txt: {
    fontSize: 9, fontFamily: 'monospace', fontWeight: '700', letterSpacing: 0.6,
  },
  pill: {
    backgroundColor: '#F5C300', paddingHorizontal: 5, paddingVertical: 1,
    marginLeft: 2,
  },
  pillTxt: {
    fontSize: 9, fontFamily: 'monospace', fontWeight: '800', color: '#111',
  },
});
