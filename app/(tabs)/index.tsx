import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { CONSORCIOS, ZONAS_CONFIG } from '@/constants/realData';

const { width } = Dimensions.get('window');

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon as any} size={28} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const totalKm = Math.round(CONSORCIOS.reduce((acc, c) => acc + c.redKm, 0));
  const totalPresupuesto = 0;
  const totalEjecutado = 0;
  const pctEjecutado = 0;
  const consorciosActivos = CONSORCIOS.length;

  const gastosRecientes: any[] = [];
  const reportesRecientes: any[] = [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Banner */}
      <View style={styles.banner}>
        <View>
          <Text style={styles.bannerTitle}>Sistema Vial</Text>
          <Text style={styles.bannerSubtitle}>Panel de control general</Text>
        </View>
        <Ionicons name="map-outline" size={40} color="rgba(255,255,255,0.3)" />
      </View>

      {/* KPIs */}
      <Text style={styles.sectionTitle}>Resumen General</Text>
      <View style={styles.statsGrid}>
        <StatCard label="Red Vial Total" value={`${totalKm.toLocaleString()} km`} icon="map" color={Colors.primaryLight} />
        <StatCard label="Consorcios" value={`${consorciosActivos}`} icon="business" color={Colors.success} />
        <StatCard label="Zonas" value="5" icon="layers" color={Colors.secondary} />
        <StatCard label="Provincia" value="Chaco" icon="location" color="#4ecf8a" />
      </View>

      {/* Zones breakdown */}
      <Text style={styles.sectionTitle}>Consorcios por Zona</Text>
      <View style={styles.card}>
        {ZONAS_CONFIG.map(z => {
          const count = CONSORCIOS.filter(c => c.zona === z.id).length;
          const km = Math.round(CONSORCIOS.filter(c => c.zona === z.id).reduce((a, c) => a + c.redKm, 0));
          const pct = Math.round((count / CONSORCIOS.length) * 100);
          return (
            <View key={z.id} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: z.color }} />
                  <Text style={{ fontSize: 12, color: Colors.textSecondary, fontWeight: '600' }}>{z.label}</Text>
                </View>
                <Text style={{ fontSize: 12, color: Colors.textMuted }}>{count} consorcios · {km.toLocaleString()} km</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: z.color }]} />
              </View>
            </View>
          );
        })}
      </View>

      {/* Accesos rápidos */}
      <Text style={styles.sectionTitle}>Accesos Rápidos</Text>
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(tabs)/mapa')}>
          <Ionicons name="map" size={24} color={Colors.primary} />
          <Text style={styles.actionLabel}>Ver Mapa</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(tabs)/consorcios')}>
          <Ionicons name="business" size={24} color={Colors.primary} />
          <Text style={styles.actionLabel}>Consorcios</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(tabs)/reportes')}>
          <Ionicons name="document-text" size={24} color={Colors.primary} />
          <Text style={styles.actionLabel}>Reportes</Text>
        </TouchableOpacity>
      </View>

      {/* Gastos recientes */}
      <Text style={styles.sectionTitle}>Últimos Gastos</Text>
      <View style={styles.card}>
        {gastosRecientes.map((g, i) => (
          <View key={g.id} style={[styles.listItem, i < gastosRecientes.length - 1 && styles.listItemBorder]}>
            <View style={styles.listIcon}>
              <Ionicons name="receipt-outline" size={18} color={Colors.primaryLight} />
            </View>
            <View style={styles.listContent}>
              <Text style={styles.listTitle} numberOfLines={1}>{g.descripcion}</Text>
              <Text style={styles.listSub}>{g.fecha} • {g.categoria}</Text>
            </View>
            <Text style={styles.listAmount}>${(g.monto / 1000).toFixed(0)}K</Text>
          </View>
        ))}
      </View>

      {/* Reportes recientes */}
      <Text style={styles.sectionTitle}>Últimos Reportes</Text>
      <View style={styles.card}>
        {reportesRecientes.map((r, i) => (
          <TouchableOpacity key={r.id} style={[styles.listItem, i < reportesRecientes.length - 1 && styles.listItemBorder]}
            onPress={() => router.push(`/reporte/${r.id}` as any)}>
            <View style={[styles.listIcon, { backgroundColor: r.tipo === 'incidente' ? '#FDEDEC' : '#EBF5FB' }]}>
              <Ionicons name={r.tipo === 'incidente' ? 'warning-outline' : 'document-outline'} size={18}
                color={r.tipo === 'incidente' ? Colors.danger : Colors.primaryLight} />
            </View>
            <View style={styles.listContent}>
              <Text style={styles.listTitle} numberOfLines={1}>{r.titulo}</Text>
              <Text style={styles.listSub}>{r.fecha} • {r.tipo}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  banner: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerTitle: { color: Colors.white, fontSize: 22, fontWeight: 'bold' },
  bannerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10, marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    width: (width - 42) / 2, alignItems: 'center',
    borderLeftWidth: 4, elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3,
  },
  statValue: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginTop: 6 },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 16,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 14, color: Colors.textSecondary },
  progressPct: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary },
  progressBar: { height: 10, backgroundColor: Colors.border, borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', borderRadius: 5 },
  progressDetail: { fontSize: 12, color: Colors.textMuted, textAlign: 'right' },
  quickActions: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  actionBtn: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    alignItems: 'center', gap: 6, elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3,
  },
  actionLabel: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  listItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  listIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#EBF5FB', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  listContent: { flex: 1 },
  listTitle: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  listSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  listAmount: { fontSize: 13, fontWeight: 'bold', color: Colors.secondary },
});
