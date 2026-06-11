import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '@/constants/Colors';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="red-vial"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="autoridades"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="consorcio/[id]"
          options={{
            headerShown: true,
            headerTitle: 'Detalle del Consorcio',
            headerStyle: { backgroundColor: Colors.primary },
            headerTintColor: Colors.white,
          }}
        />
        <Stack.Screen
          name="reporte/[id]"
          options={{
            headerShown: true,
            headerTitl