import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { GEO_BUNDLE } from '@/constants/geoBundle';

const CONSORCIOS = GEO_BUNDLE.sedes as any[];
const ZONAS_CONFIG = [
  { id: 'ZI',   label: 'Zona I',   color: '#6baed6' },
  { id: 'ZII',  label: 'Zona II',  color: '#fb6a4a' },
  { id: 'ZIII', label: 'Zona III', color: '#fdd44c' },
  { id: 'ZIV',  label: 'Zona IV',  color: '#74c476' },
  { id: 'ZV',   label: 'Zona V',   color: '#9e9ac8' },
];

const { width } = Dimensions.get('window');

function StatCard({
  label, value, icon, color, onPress,
}: {
  label: string; value: string; icon: string; color: string; onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.statCard, { borderBottomColor: color }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.statIconWrap, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const totalKm = CONSORCIOS.reduce((acc, c) => acc + c.redKm, 0);
  const consorciosActivos = CONSORCIOS.length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* ── Banner DVP ─────────────────────────────────────────────────────── */}
      <View style={styles.banner}>
        <View style={styles.bannerLeft}>
          <View style={styles.bannerBadge}>
            <Text style={styles.bannerBadgeText}>DVP</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle} numberOfLines={2}>Dirección de Conservación Vial</Text>
            <Text style={styles.bannerSubtitle}>Dpto. Consorcios Camineros</Text>
          </View>
        </View>
      </View>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Resumen General</Text>
      <View style={styles.statsGrid}>
        <StatCard
          label="Red Vial Total"
          value={`${Math.round(totalKm).toLocaleString('es-AR')} km`}
          icon="git-network"
          color={Colors.accent}
          onPress={() => router.push('/red-vial')}
        />
        <StatCard
          label="Consorcios"
          value={`${consorciosActivos}`}
          icon="business"
          color="#4CAF50"
          onPress={() => router.push('/autoridades')}
        />
        <StatCard
          label="Distribución de la Red"
          value="5 Zonas"
          icon="pie-chart"
          color="#2196F3"
          onPress={() => router.push('/distribucion')}
        />
        <StatCard
          label="Reportes"
          value="Ver"
          icon="document-text"
          color="#9C27B0"
          onPress={() => router.push('/(tabs)/reportes')}
        />
      </View>

      {/* ── Red vial por zona ─────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Red Vial por Zona</Text>
      <View style={styles.card}>
        {ZONAS_CONFIG.map(z => {
          const count = CONSORCIOS.filter(c => c.zona === z.id).length;
          const km = Math.round(CONSORCIOS.filter(c => c.zona === z.id).reduce((a, c) => a + c.redKm, 0));
          const pct = Math.round((km / totalKm) * 100);
          return (
            <View key={z.id} style={styles.zonaRow}>
              <View style={styles.zonaRowHeader}>
                <View style={styles.zonaRowLeft}>
                  <View style={[styles.zonaDot, { backgroundColor: z.color }]} />
                  <Text style={styles.zonaLabel}>{z.label}</Text>
                  <Text style={styles.zonaCount}>{count} cons.</Text>
                </View>
                <Text style={styles.zonaKm}>{km.toLocaleString('es-AR')} km</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: z.color }]} />
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },

  // Banner
  banner: {
    backgroundColor: Colors.primary,
    borderRadius: 16, padding: 18,
    marginBottom: 20,
    borderBottomWidth: 4,
    borderBottomColor: Colors.accent,
  },
  bannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerBadge: {
    backgroundColor: Colors.accent,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  bannerBadgeText: { color: Colors.primary, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  bannerTitle: { color: Colors.white, fontSize: 17, fontWeight: '800' },
  bannerSubtitle: { color: '#aaaaaa', fontSize: 12, marginTop: 1 },

  sectionTitle: {
    fontSize: 13, fontWeight: '800', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 10, marginTop: 4,
  },

  // Stat cards
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    width: (width - 42) / 2, alignItems: 'center',
    borderBottomWidth: 3,
    elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3,
  },
  statIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },

  // Zona rows
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 16, elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3,
  },
  zonaRow: { marginBottom: 12 },
  zonaRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  zonaRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  zonaDot: { width: 10, height: 10, borderRadius: 5 },
  zonaLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  zonaCount: { fontSize: 11, color: Colors.textMuted, marginLeft: 2 },
  zonaKm: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  progressBar: { height: 7, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },

});
