import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, UserProfile } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_CACHE_KEY = 'sig_vial_cached_profile';

/** Límite para cualquier llamada de red durante el arranque. */
const NET_TIMEOUT_MS = 8000;

/**
 * Corre una promesa contra un reloj y devuelve `fallback` si se pasa del límite.
 *
 * Necesario porque `supabase.auth.getSession()` dispara un refresh de token
 * contra la red cuando el guardado está vencido, y supabase-js no le pone
 * timeout a ese fetch. Sin señal la promesa nunca resuelve: el `finally` que
 * apaga `loading` no corre y la app queda trabada en el splash. Es el bug de
 * "la primera vez no arranca, cerrás y abrís y anda" — a la segunda el token
 * ya está fresco en AsyncStorage y no hace falta ir a la red.
 */
function withTimeout<T>(p: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    let listo = false;
    const t = setTimeout(() => {
      if (listo) return;
      listo = true;
      resolve(fallback);
    }, ms);
    Promise.resolve(p).then(
      v => { if (!listo) { listo = true; clearTimeout(t); resolve(v); } },
      _ => { if (!listo) { listo = true; clearTimeout(t); resolve(fallback); } },
    );
  });
}

/**
 * El arranque tiene tres estados, no dos.
 *
 * Con un booleano había que elegir cuál perder, y "todavía no sé" terminaba
 * mostrándose como "sin conexión": el banner de offline parpadeaba en cada
 * arranque aunque hubiera señal, porque la validación de sesión es asincrónica.
 */
export type EstadoConexion = 'verificando' | 'online' | 'offline';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  estadoConexion: EstadoConexion;
  /** Derivado de estadoConexion — se mantiene por compatibilidad */
  offlineMode: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  estadoConexion: 'verificando',
  offlineMode: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession]     = useState<Session | null>(null);
  const [profile, setProfile]     = useState<UserProfile | null>(null);
  const [loading, setLoading]     = useState(true);
  const [estadoConexion, setEstado] = useState<EstadoConexion>('verificando');

  // Espejo del perfil para leerlo desde callbacks de larga vida
  // (onAuthStateChange se suscribe una sola vez: sin ref vería siempre el
  // valor inicial y expulsaría al técnico cuando falla un refresh de token).
  const profileRef = useRef<UserProfile | null>(null);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  // supabase-js emite SIGNED_OUT tanto cuando el técnico cierra sesión a mano
  // como cuando un refresh de token falla definitivamente (típico sin señal).
  // Solo la primera debe borrar el perfil; la segunda tiene que dejarlo trabajar
  // en offline. Este flag distingue una de otra.
  const salidaExplicitaRef = useRef(false);

  // Guarda el perfil en caché local para uso offline
  const cacheProfile = async (p: UserProfile) => {
    await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
  };

  // Carga perfil cacheado (fallback offline)
  const loadCachedProfile = async (): Promise<UserProfile | null> => {
    const raw = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  };

  const fetchProfile = async (userId: string, email: string) => {
    try {
      // Con timeout: sin señal esta query queda colgada y bloquea el arranque
      const { data } = await withTimeout(
        supabase.from('profiles').select('id, nombre, zona, rol').eq('id', userId).single(),
        NET_TIMEOUT_MS,
        { data: null } as any,
      );
      if (data) {
        const p: UserProfile = { ...data, email } as UserProfile;
        setProfile(p);
        await cacheProfile(p);         // siempre actualizar caché cuando hay red
        return;
      }
      // Sin datos (timeout o perfil inexistente): preferir la caché antes que
      // inventar un perfil vacío que pisaría el nombre/zona reales del técnico
      const cached = await loadCachedProfile();
      setProfile(cached ?? { id: userId, email, nombre: email, zona: '', rol: 'tecnico' });
    } catch {
      // Sin red — intentar desde caché
      const cached = await loadCachedProfile();
      if (cached) setProfile(cached);
    }
  };

  useEffect(() => {
    let vivo = true;

    /**
     * Valida la sesión contra la red y, si está bien, sube a modo online.
     *
     * Corre en segundo plano cuando ya entramos con perfil cacheado, así la red
     * nunca bloquea el arranque. Solo es bloqueante en instalación nueva, donde
     * no hay nada local que mostrar y el login necesita red igual.
     */
    const validarSesion = async (habiaCache: boolean) => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          NET_TIMEOUT_MS,
          { data: { session: null } } as any,
        );
        if (!vivo) return;

        if (session?.user) {
          setSession(session);
          setEstado('online');
          await fetchProfile(session.user.id, session.user.email ?? '');
        } else if (habiaCache) {
          // Había caché y no hay sesión: recién ACÁ se confirma que está offline.
          // No se expulsa al técnico — puede estar a mitad de un relevamiento y
          // la sesión se revalida sola cuando vuelva a haber señal.
          setEstado('offline');
        } else {
          // Instalación nueva sin sesión → RouteGuard manda a login
          setSession(null);
          setProfile(null);
        }
      } catch {
        if (vivo && habiaCache) setEstado('offline');
      } finally {
        if (vivo && !habiaCache) setLoading(false);
      }
    };

    const init = async () => {
      // 1) Arranque local: el perfil cacheado sale de AsyncStorage en ms.
      let cached: UserProfile | null = null;
      try { cached = await loadCachedProfile(); } catch (_) {}
      if (!vivo) return;

      if (cached) {
        // Entrar ya, sin esperar a la red. El estado sigue en 'verificando':
        // todavía no sabemos si hay señal, y marcarlo como offline acá es lo que
        // hacía parpadear el banner de "sin conexión" en cada arranque.
        setProfile(cached);
        setLoading(false);
      }

      // 2) La sesión se resuelve después, sin trabar la UI
      validarSesion(!!cached);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!vivo) return;

      if (session?.user) {
        // Volvió la señal / login exitoso → subir a online
        setSession(session);
        setEstado('online');
        await fetchProfile(session.user.id, session.user.email ?? '');
        return;
      }

      if (event === 'SIGNED_OUT' && salidaExplicitaRef.current) {
        // Cerró sesión a mano: limpiar todo
        salidaExplicitaRef.current = false;
        setSession(null);
        setProfile(null);
        setEstado('verificando');
        return;
      }

      // Sesión nula sin logout explícito = refresh de token fallido, casi
      // siempre por falta de señal. Si hay perfil, se baja a offline y se sigue
      // trabajando; expulsarlo acá le haría perder el relevamiento en curso.
      if (profileRef.current) {
        setSession(null);
        setEstado('offline');
      } else {
        setSession(null);
        setProfile(null);
      }
    });

    return () => { vivo = false; subscription.unsubscribe(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    // Marca la salida como intencional para que onAuthStateChange sí limpie
    // el perfil (ver salidaExplicitaRef arriba)
    salidaExplicitaRef.current = true;
    try {
      await supabase.auth.signOut();
    } catch (_) {
      // Sin señal signOut() falla, pero el técnico igual quiere salir:
      // se borra la caché local de todas formas
    }
    await AsyncStorage.multiRemove([PROFILE_CACHE_KEY, 'tecnico_nombre', 'tecnico_zona']);
    setSession(null);
    setProfile(null);
    setEstado('verificando');
  };

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      loading,
      estadoConexion,
      offlineMode: estadoConexion === 'offline',
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
