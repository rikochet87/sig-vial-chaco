import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { ZONAS_CONFIG } from '@/constants/realData';
import { useConsorcios } from '@/hooks/useConsorcios';

export default function ConsorcioDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { consorcios } = useConsorcios();
  // id is "zona-numero-idx" format (from consorcios list) or just index
  const consorcio = consorcios.find((c, idx) =>
    String(idx) === id ||
    `${c.zona}-${c.numero}` === id ||
    String(c.numero) === id
  );

  if (!consorcio) {
    return (
      <View style={styles.notFound}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.notFoundText}>Consorcio no encontrado</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: Colors.primary }}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const zonaLabel = ZONAS_CONFIG.find(z => z.id === consorcio.zona)?.label ?? consorcio.zona;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: consorcio.color }]}>
        <View style={styles.headerTop}>
          <View style={styles.numBadge}>
            <Text style={styles.numText}>{consorcio.numero}</Text>
          </View>
          <View style={[styles.zonaBadge, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
            <Text style={styles.zonaText}>{zonaLabel}</Text>
          </View>
        </View>
        <Text style={styles.localidad}>{consorcio.localidad}</Text>
        <View style={styles.provinciaRow}>
          <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.8)" />
          <Text style={styles.provincia}>Chaco, Argentina</Text>
        </View>
      </View>

      {/* Road network */}
      <Text style={styles.sectionTitle}>Red Vial</Text>
      <View style={styles.kmGrid}>
        <View style={[styles.kmCard, { borderLeftColor: consorcio.color }]}>
          <Text style={[styles.kmValue, { color: consorcio.color }]}>{consorcio.redKm.toFixed(0)}</Text>
          <Text style={styles.kmLabel}>km totales</Text>
        </View>
        <View style={[styles.kmCard, { borderLeftColor: '#9b9b9b' }]}>
          <Text style={styles.kmValue}>{consorcio.redTerciaria.toFixed(0)}</Text>
          <Text style={styles.kmLabel}>km terciaria</Text>
        </View>
        <View style={[styles.kmCard, { borderLeftColor: Colors.success }]}>
          <Text style={[styles.kmValue, { color: Colors.success }]}>{consorcio.redSecundaria.toFixed(0)}</Text>
          <Text style={styles.kmLabel}>km secundaria</Text>
        </View>
        <View style={[styles.kmCard, { borderLeftColor: Colors.warning }]}>
          <Text style={[styles.kmValue, { color: Colors.warning }]}>{consorcio.redPrimaria.toFixed(0)}</Text>
          <Text style={styles.kmLabel}>km primaria</Text>
        </View>
      </View>

      {/* Authorities */}
      <Text style={styles.sectionTitle}>Autoridades</Text>
      <View style={styles.card}>
        {[
          { label: 'Presidente', value: consorcio.presidente, icon: 'person' },
          { label: 'Vicepresidente', value: consorcio.vicepresidente, icon: 'person-outline' },
          { label: 'Secretario/a', value: consorcio.secretario, icon: 'create-outline' },
          { label: 'Tesorero/a', value: consorcio.tesorero, icon: 'wallet-outline' },
        ].map((item, i, arr) => (
          <View key={item.label} style={[styles.authorRow, i < arr.length - 1 && styles.rowBorder]}>
            <Ionicons name={item.icon as any} size={16} color={consorcio.color} style={{ width: 22 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.authorLabel}>{item.label}</Text>
              <Text style={styles.authorValue}>{item.value}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Location */}
      <Text style={styles.sectionTitle}>Ubicación</Text>
      <View style={styles.card}>
        <View style={styles.coordRow}>
          <Text style={styles.coordLabel}>Latitud</Text>
          <Text style={styles.coordValue}>{consorcio.latitude.toFixed(5)}</Text>
        </View>
        <View style={styles.coordRow}>
          <Text style={styles.coordLabel}>Longitud</Text>
          <Text style={styles.coordValue}>{consorcio.longitude.toFixed(5)}</Text>
        </View>
      </View>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { fontSize: 16, color: Colors.textMuted },

  header: { borderRadius: 16, padding: 18, marginBottom: 16 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  numBadge: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  numText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  zonaBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  zonaText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  localidad: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 6 },
  provinciaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  provincia: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },

  kmGrid: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  kmCard: {
    flex: 1, minWidth: '40%', backgroundColor: Colors.surface, borderRadius: 10, padding: 12,
    borderLeftWidth: 3, alignItems: 'center',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2,
  },
  kmValue: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  kmLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },

  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 16,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3,
  },
  authorRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9, gap: 8 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  authorLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 1 },
  authorValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  coordRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  coordLabel: { fontSize: 13, color: Colors.textMuted },
  coordValue: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600', fontFamily: 'monospace' },
});
