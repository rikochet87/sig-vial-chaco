import { ScrollView, View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Alert } from 'react-native';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import type { ColorPalette } from '@/constants/Colors';
import { ZONAS_CONFIG } from '@/constants/realData';
import { useConsorcios } from '@/hooks/useConsorcios';

function StatCard({ label, value, unit, onPress, styles }: {
  label: string; value: string; unit?: string; onPress?: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <Text style={styles.statValue}>{value}</Text>
      {unit && <Text style={styles.statUnit}>{unit}</Text>}
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const C = useColors();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(C, width), [C, width]);
  const { profile, signOut } = useAuth();
  const { consorcios: CONSORCIOS } = useConsorcios();

  const totalKm = useMemo(() => CONSORCIOS.reduce((acc, c) => acc + c.redKm, 0), [CONSORCIOS]);

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que querés salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* ── Usuario ──────────────────────────────────────────────────────── */}
      <View style={styles.userBar}>
        <Text style={styles.userBarText}>
          {profile?.nombre ?? '—'}{profile?.zona ? `  ·  ${profile.zona}` : ''}
        </Text>
        <TouchableOpacity onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={16} color={C.textMuted} />
        </TouchableOpacity>
      </View>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <View style={styles.secLabel}><Text style={styles.secLabelText}>Resumen general</Text></View>
      <View style={styles.statsGrid}>
        <StatCard label="Red vial total" value={Math.round(totalKm).toLocaleString('es-AR')} unit="km"
          onPress={() => router.push('/red-vial')} styles={styles} />
        <StatCard label="Consorcios" value={`${CONSORCIOS.length}`} unit="u."
          onPress={() => router.push('/autoridades')} styles={styles} />
        <StatCard label="Zonas" value="5" unit="zon."
          onPress={() => router.push('/distribucion')} styles={styles} />
        <StatCard label="Relevamientos" value="→"
          onPress={() => router.push('/(tabs)/reportes')} styles={styles} />
      </View>

      {/* ── Red vial por zona ────────────────────────────────────────────── */}
      <View style={styles.secLabel}><Text style={styles.secLabelText}>Red vial por zona</Text></View>
      <View style={styles.zonaBlock}>
        {ZONAS_CONFIG.map(z => {
          const count = CONSORCIOS.filter(c => c.zona === z.id).length;
          const km = Math.round(CONSORCIOS.filter(c => c.zona === z.id).reduce((a, c) => a + c.redKm, 0));
          const pct = totalKm > 0 ? (km / totalKm) * 100 : 0;
          return (
            <View key={z.id} style={styles.zonaRow}>
              <View style={styles.zonaRowHeader}>
                <View style={styles.zonaRowLeft}>
                  <View style={[styles.zonaDot, { backgroundColor: z.color }]} />
                  <Text style={styles.zonaLabel}>{z.id}</Text>
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

function makeStyles(C: ColorPalette, width: number) {
  const numCols   = width >= 600 ? 4 : 2;
  const gap       = 1;
  const cardWidth = (width - 32 - gap * (numCols - 1)) / numCols;
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content:   { padding: 16 },

  userBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 14,
  },
  userBarText: { fontSize: 11, color: C.textMuted, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5 },

  secLabel: { borderLeftWidth: 2, borderLeftColor: C.accent, paddingLeft: 8, marginBottom: 8, marginTop: 4 },
  secLabelText: { fontSize: 9, color: C.textMuted, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' },

  statsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap, marginBottom: 16 },
  statCard: {
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    borderLeftWidth: 2, borderLeftColor: C.accent,
    padding: 12, width: cardWidth,
  },
  statValue: { fontSize: 18, fontWeight: '700', color: C.textPrimary, fontFamily: 'monospace' },
  statUnit:  { fontSize: 10, color: C.accent, fontFamily: 'monospace', marginTop: 1 },
  statLabel: { fontSize: 9, color: C.textMuted, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'monospace' },

  zonaBlock: { borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  zonaRow: { borderBottomWidth: 1, borderBottomColor: C.border, padding: 10 },
  zonaRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  zonaRowLeft:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  zonaDot:  { width: 6, height: 6 },
  zonaLabel: { fontSize: 11, fontWeight: '700', color: C.textPrimary, fontFamily: 'monospace' },
  zonaCount: { fontSize: 10, color: C.textMuted, fontFamily: 'monospace' },
  zonaKm:    { fontSize: 11, fontWeight: '700', color: C.textSecondary, fontFamily: 'monospace' },
  progressBar:  { height: 2, backgroundColor: C.border },
  progressFill: { height: 2 },
}); }
