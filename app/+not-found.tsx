import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="map-outline" size={64} color={Colors.textMuted} />
      <Text style={styles.title}>Página no encontrada</Text>
      <TouchableOpacity style={styles.button} onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.buttonText}>Volver al inicio</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: Colors.background },
  title: { fontSize: 18, color: Colors.textSecondary },
  button: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  buttonText: { color: Colors.white, fontWeight: 'bold' },
});
