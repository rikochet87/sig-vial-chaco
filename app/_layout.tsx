import { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';

SplashScreen.preventAutoHideAsync();

// Maneja redirección según estado de sesión
function RouteGuard() {
  const { session, loading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inLogin = segments[0] === 'login';
    if (!session && !inLogin) {
      router.replace('/login');
    } else if (session && inLogin) {
      router.replace('/(tabs)/');
    }
  }, [session, loading, segments]);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  return null;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
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
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
