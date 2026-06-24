import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColors, useTheme } from '@/context/ThemeContext';
import { ThemeProvider } from '@/context/ThemeContext';

SplashScreen.preventAutoHideAsync();

function AppStack() {
  const colors = useColors();
  const { theme } = useTheme();
  const statusBarStyle = theme === 'light' ? 'dark' : 'light';
  return (
    <>
    <StatusBar style={statusBarStyle} />
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="red-vial" options={{ headerShown: false }} />
      <Stack.Screen name="autoridades" options={{ headerShown: false }} />
      <Stack.Screen name="distribucion" options={{ headerShown: false }} />
      <Stack.Screen
        name="consorcio/[id]"
        options={{
          headerShown: true,
          headerTitle: 'Detalle del Consorcio',
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.white,
        }}
      />
      <Stack.Screen
        name="reporte/[id]"
        options={{
          headerShown: true,
          headerTitle: 'Detalle del Reporte',
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.white,
        }}
      />
    </Stack>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AppStack />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
