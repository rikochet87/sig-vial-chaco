import { useEffect, Component, ReactNode } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { View, Text, ScrollView } from 'react-native';

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

SplashScreen.preventAutoHideAsync();

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
      router.replace('/(tabs)/');
    }
  }, [session, profile, loading, segments]);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  return null;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ErrorBoundary>
          <AuthProvider>
            <RouteGuard />
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false }}>
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
