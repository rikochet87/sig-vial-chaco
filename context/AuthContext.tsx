import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, UserProfile } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_CACHE_KEY = 'sig_vial_cached_profile';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  offlineMode: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  offlineMode: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession]     = useState<Session | null>(null);
  const [profile, setProfile]     = useState<UserProfile | null>(null);
  const [loading, setLoading]     = useState(true);
  const [offlineMode, setOffline] = useState(false);

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
      const { data } = await supabase
        .from('profiles')
        .select('id, nombre, zona, rol')
        .eq('id', userId)
        .single();
      const p: UserProfile = data
        ? { ...data, email } as UserProfile
        : { id: userId, email, nombre: email, zona: '', rol: 'tecnico' };
      setProfile(p);
      await cacheProfile(p);           // siempre actualizar caché cuando hay red
    } catch {
      // Sin red — intentar desde caché
      const cached = await loadCachedProfile();
      if (cached) setProfile(cached);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setSession(session);
          await fetchProfile(session.user.id, session.user.email ?? '');
          setOffline(false);
        } else {
          // Sin sesión activa: buscar perfil cacheado para modo offline
          const cached = await loadCachedProfile();
          if (cached) {
            setProfile(cached);
            setOffline(true);      // hay perfil pero sin sesión (offline o token vencido)
          }
          // Si no hay caché → loading=false → RouteGuard enviará a login
        }
      } catch {
        // Error de red al iniciar — intentar con caché
        const cached = await loadCachedProfile();
        if (cached) {
          setProfile(cached);
          setOffline(true);
        }
      } finally {
        setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setSession(session);
        setOffline(false);
        await fetchProfile(session.user.id, session.user.email ?? '');
      } else if (!offlineMode) {
        // Solo limpiar sesión si NO estamos en modo offline
        // (evita que un token refresh fallido desloguee al técnico sin red)
        const cached = await loadCachedProfile();
        if (cached) {
          setProfile(cached);
          setOffline(true);
        } else {
          setSession(null);
          setProfile(null);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    await supabase.auth.signOut();
    await AsyncStorage.multiRemove([PROFILE_CACHE_KEY, 'tecnico_nombre', 'tecnico_zona']);
    setSession(null);
    setProfile(null);
    setOffline(false);
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, offlineMode, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
