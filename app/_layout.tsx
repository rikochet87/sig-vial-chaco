import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/context/ThemeContext';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
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
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
