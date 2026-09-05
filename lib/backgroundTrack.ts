/**
 * Grabación de track GPS en segundo plano.
 *
 * Problema que resuelve: `Location.watchPositionAsync` sólo entrega posiciones
 * mientras la app está en primer plano con la pantalla encendida. Cuando el
 * técnico arrancaba el track y salía a recorrer el camino en la camioneta, la
 * pantalla se apagaba, Android suspendía el hilo JS y dejaban de llegar puntos:
 * el tramo quedaba como una recta entre el punto inicial y el final.
 *
 * Solución: `Location.startLocationUpdatesAsync` + `TaskManager`. La tarea corre
 * en un servicio en primer plano (notificación persistente en Android) y sigue
 * acumulando puntos aunque la app esté en segundo plano o la pantalla apagada.
 * Los puntos se persisten en AsyncStorage para que sobrevivan incluso si el SO
 * mata el proceso JS de la app.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PuntoTrack } from '@/types/relevamiento';

// Importación condicional — mismo criterio que el resto del proyecto
let Location: any = null;
try { Location = require('expo-location'); } catch (_) {}

let TaskManager: any = null;
try { TaskManager = require('expo-task-manager'); } catch (_) {}

export const TRACK_TASK = 'SIG_VIAL_TRACK';
const BUF_KEY = 'sig_vial_track_buffer';
const CFG_KEY = 'sig_vial_track_config';

export type TrackConfig = {
  /** Distancia mínima entre puntos, en metros */
  intervaloM: number;
  /** Precisión máxima aceptada, en metros — peor que esto se descarta */
  maxAcc: number;
};

const DEFAULT_CFG: TrackConfig = { intervaloM: 10, maxAcc: 50 };

// ── Helpers de distancia ────────────────────────────────────────────────────

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// ── Persistencia del buffer ─────────────────────────────────────────────────

/** Estado acumulado del track en curso. */
export type TrackBuffer = {
  puntos: PuntoTrack[];
  /** Cuántas lecturas se descartaron por precisión insuficiente */
  descartados: number;
  /** Última precisión leída (aunque se haya descartado el punto) */
  ultimaAcc: number | null;
  /** Última altitud leída */
  ultimaAlt: number | null;
};

const EMPTY_BUFFER: TrackBuffer = { puntos: [], descartados: 0, ultimaAcc: null, ultimaAlt: null };

export async function readBuffer(): Promise<TrackBuffer> {
  try {
    const raw = await AsyncStorage.getItem(BUF_KEY);
    if (!raw) return { ...EMPTY_BUFFER };
    const parsed = JSON.parse(raw);
    return {
      puntos:      Array.isArray(parsed.puntos) ? parsed.puntos : [],
      descartados: parsed.descartados ?? 0,
      ultimaAcc:   parsed.ultimaAcc ?? null,
      ultimaAlt:   parsed.ultimaAlt ?? null,
    };
  } catch (_) {
    return { ...EMPTY_BUFFER };
  }
}

async function writeBuffer(b: TrackBuffer): Promise<void> {
  try { await AsyncStorage.setItem(BUF_KEY, JSON.stringify(b)); } catch (_) {}
}

export async function clearBuffer(): Promise<void> {
  try { await AsyncStorage.removeItem(BUF_KEY); } catch (_) {}
}

async function readConfig(): Promise<TrackConfig> {
  try {
    const raw = await AsyncStorage.getItem(CFG_KEY);
    return raw ? { ...DEFAULT_CFG, ...JSON.parse(raw) } : { ...DEFAULT_CFG };
  } catch (_) {
    return { ...DEFAULT_CFG };
  }
}

// ── Definición de la tarea ──────────────────────────────────────────────────
// Debe registrarse en el scope del módulo (fuera de cualquier componente) para
// que el SO pueda invocarla cuando la app no está en primer plano.

if (TaskManager && !TaskManager.isTaskDefined?.(TRACK_TASK)) {
  TaskManager.defineTask(TRACK_TASK, async ({ data, error }: any) => {
    if (error) return;
    const locations: any[] = data?.locations ?? [];
    if (locations.length === 0) return;

    const cfg = await readConfig();
    const buf = await readBuffer();

    let { puntos, descartados } = buf;
    let ultimaAcc = buf.ultimaAcc;
    let ultimaAlt = buf.ultimaAlt;

    for (const loc of locations) {
      const acc = loc.coords?.accuracy ?? null;
      const alt = loc.coords?.altitude ?? null;
      ultimaAcc = acc;
      ultimaAlt = alt;

      // Descartar lecturas imprecisas
      if (acc !== null && acc > cfg.maxAcc) { descartados++; continue; }

      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;

      // Evitar puntos redundantes: el SO a veces entrega lecturas más seguidas
      // que el distanceInterval pedido. Se usa la mitad del intervalo como piso
      // para no perder curvas cerradas pero sí filtrar ruido en parada.
      let prog = 0;
      if (puntos.length > 0) {
        const ant = puntos[puntos.length - 1];
        const seg = haversineM(ant, { lat, lng });
        if (seg < cfg.intervaloM * 0.5) continue;
        prog = (ant.prog ?? 0) + seg;
      }

      puntos = [...puntos, {
        lat, lng,
        alt: alt ?? undefined,
        acc: acc ?? undefined,
        ts:  loc.timestamp ?? Date.now(),
        prog,
      }];
    }

    await writeBuffer({ puntos, descartados, ultimaAcc, ultimaAlt });
  });
}

// ── API pública ─────────────────────────────────────────────────────────────

export type StartResult =
  | { ok: true; background: boolean }
  | { ok: false; motivo: 'sin-modulo' | 'permiso-foreground' | 'error'; detalle?: string };

/**
 * Arranca la grabación. Pide permiso de primer plano (obligatorio) y de segundo
 * plano (deseable). Si el técnico niega el de segundo plano igual se graba, pero
 * sólo con la app abierta — se informa vía `background: false` para poder
 * avisarle en pantalla.
 */
export async function startTrack(cfg: Partial<TrackConfig> = {}): Promise<StartResult> {
  if (!Location || !TaskManager) return { ok: false, motivo: 'sin-modulo' };

  const conf: TrackConfig = { ...DEFAULT_CFG, ...cfg };

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { ok: false, motivo: 'permiso-foreground' };

  let background = false;
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    background = bg.status === 'granted';
  } catch (_) {
    background = false;
  }

  try {
    await AsyncStorage.setItem(CFG_KEY, JSON.stringify(conf));
    await clearBuffer();

    // Si quedó una sesión colgada de un track anterior, cerrarla primero
    if (await isTracking()) {
      try { await Location.stopLocationUpdatesAsync(TRACK_TASK); } catch (_) {}
    }

    await Location.startLocationUpdatesAsync(TRACK_TASK, {
      accuracy:            Location.Accuracy.BestForNavigation,
      distanceInterval:    conf.intervaloM,
      timeInterval:        2000,
      // Evita que Android agrupe lecturas y las entregue tarde en lote
      deferredUpdatesInterval: 0,
      deferredUpdatesDistance: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'SIG Vial — grabando track',
        notificationBody:  'Registrando el tramo recorrido. Tocá para volver a la app.',
        notificationColor: '#F5C300',
        killServiceOnDestroy: false,
      },
    });

    return { ok: true, background };
  } catch (e: any) {
    return { ok: false, motivo: 'error', detalle: e?.message ?? String(e) };
  }
}

/** Detiene la grabación y devuelve los puntos acumulados. No limpia el buffer. */
export async function stopTrack(): Promise<TrackBuffer> {
  if (Location && await isTracking()) {
    try { await Location.stopLocationUpdatesAsync(TRACK_TASK); } catch (_) {}
  }
  return readBuffer();
}

/** Detiene la grabación y descarta lo acumulado. */
export async function cancelTrack(): Promise<void> {
  if (Location && await isTracking()) {
    try { await Location.stopLocationUpdatesAsync(TRACK_TASK); } catch (_) {}
  }
  await clearBuffer();
}

/** ¿Hay una grabación en curso registrada en el SO? */
export async function isTracking(): Promise<boolean> {
  if (!Location) return false;
  try { return await Location.hasStartedLocationUpdatesAsync(TRACK_TASK); } catch (_) { return false; }
}

export const trackDisponible = !!(Location && TaskManager);
