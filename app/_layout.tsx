import { useEffect, useState, Component, ReactNode } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';

// Error Boundary: captura crashes de JS y muestra el error en pantalla
// (solo para debug — remover antes de producción final)
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#1a1a1a', padding: 20, paddingTop: 60 }}>
          <Text style={{ color: '#F5C300', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>
            💥 Error capturado
          </Text>
          <ScrollView>
            <Text style={{ color: '#ff6b6b', fontSize: 13, fontFamily: 'monospace' }}>
              {this.state.error.toString()}
            </Text>
            <Text style={{ color: '#9E9E9E', fontSize: 11, marginTop: 12 }}>
              {this.state.error.stack}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * El splash se oculta una sola vez, venga de donde venga la orden.
 *
 * Antes la única salida era que `loading` pasara a false, lo que dependía de una
 * llamada de red sin timeout: si esa llamada se colgaba, la app quedaba trabada
 * en la pantalla negra con el logo. Ahora hay además un límite duro: pase lo que
 * pase con la sesión, a los SPLASH_MAX_MS el splash se va y el técnico entra a
 * la app (la navegación se acomoda sola cuando auth termina de resolver).
 */
const SPLASH_MAX_MS = 6000;
let splashOculto = false;
function ocultarSplash() {
  if (splashOculto) return;
  splashOculto = true;
  SplashScreen.hideAsync().catch(() => {});
}

// Maneja redirección según estado de sesión
function RouteGuard() {
  const { session, profile, loading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inLogin = segments[0] === 'login';
    const isAuthenticated = !!session || !!profile; // sesión activa O perfil cacheado offline
    if (!isAuthenticated && !inLogin) {
      router.replace('/login');
    } else if (isAuthenticated && inLogin) {
      router.replace('/');
    }
  }, [session, profile, loading, segments]);

  // Camino normal: auth resolvió, damos un respiro a la navegación y salimos
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(ocultarSplash, 600);
      return () => clearTimeout(t);
    }
  }, [loading]);

  // Red de seguridad: aunque auth nunca resuelva, el splash igual se va
  useEffect(() => {
    const t = setTimeout(ocultarSplash, SPLASH_MAX_MS);
    return () => clearTimeout(t);
  }, []);

  // Si la sesión tarda más de lo normal, mostrar que la app está viva en vez
  // de un rectángulo negro mudo (el técnico no puede distinguir "cargando" de
  // "colgada", y termina cerrando la app).
  const [tardando, setTardando] = useState(false);
  useEffect(() => {
    if (!loading) { setTardando(false); return; }
    const t = setTimeout(() => setTardando(true), 2500);
    return () => clearTimeout(t);
  }, [loading]);

  if (loading) {
    return (
      <View style={styles.loadingOverlay}>
        {tardando && (
          <>
            <ActivityIndicator size="large" color="#F5C300" />
            <Text style={styles.loadingTxt}>Verificando sesión…</Text>
            <Text style={styles.loadingSub}>
              Si no hay señal puede demorar unos segundos
            </Text>
          </>
        )}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0d0d0d',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 999,
  },
  loadingTxt: {
    color: '#F5C300', fontSize: 13, fontFamily: 'monospace',
    letterSpacing: 1, marginTop: 16, textTransform: 'uppercase',
  },
  loadingSub: {
    color: '#555', fontSize: 11, fontFamily: 'monospace',
    marginTop: 6, textAlign: 'center', paddingHorizontal: 40,
  },
});

export default function RootLayout() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0d0d0d' }}>
          <ErrorBoundary>
          <AuthProvider>
            <RouteGuard />
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0d0d0d' } }}>
              <Stack.Screen name="login" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="red-vial" />
              <Stack.Screen name="autoridades" />
              <Stack.Screen name="distribucion" />
              <Stack.Screen
                name="consorcio/[id]"
                options={{
                  headerShown: true,
                  headerTitle: 'Detalle del Consorcio',
                  headerStyle: { backgroundColor: '#2C2C2C' },
                  headerTintColor: '#FFFFFF',
                }}
              />
              <Stack.Screen
                name="reporte/[id]"
                options={{
                  headerShown: true,
                  headerTitle: 'Detalle del Reporte',
                  headerStyle: { backgroundColor: '#2C2C2C' },
                  headerTintColor: '#FFFFFF',
                }}
              />
            </Stack>
          </AuthProvider>
          </ErrorBoundary>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}
