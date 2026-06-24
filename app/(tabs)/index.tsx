import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors, useTheme } from '@/context/ThemeContext';
import type { ColorPalette } from '@/constants/Colors';
import { type ThemeName, THEME_LABELS, THEMES } from '@/constants/Colors';
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

const THEME_ICONS: Record<ThemeName, string> = {
  original: '🌑',
  dark:     '🌙',
  light:    '☀️',
};

function StatCard({
  label, value, icon, color, onPress, styles, C,
}: {
  label: string; value: string; icon: string; color: string;
  onPress?: () => void;
  styles: ReturnType<typeof makeStyles>;
  C: ColorPalette;
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
  const C = useColors();
  const { theme, setTheme } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  const totalKm = useMemo(() => CONSORCIOS.reduce((acc, c) => acc + c.redKm, 0), []);
  const consorciosActivos = CONSORCIOS.length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* ── Banner ─────────────────────────────────────────────────────────── */}
      <View style={styles.banner}>
        <View style={styles.bannerLeft}>
          <View style={styles.bannerBadge}>
            <Text style={styles.bannerBadgeText}>SIG</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle} numberOfLines={2}>SIG Vial Chaco</Text>
            <Text style={styles.bannerSubtitle}>Sistema de Gestión de Infraestructura Vial Rural</Text>
          </View>
        </View>
      </View>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Resumen General</Text>
      <View style={styles.statsGrid}>
        <StatCard label="Red Vial Total" value={`${Math.round(totalKm).toLocaleString('es-AR')} km`}
          icon="git-network" color={C.accent} onPress={() => router.push('/red-vial')} styles={styles} C={C} />
        <StatCard label="Consorcios" value={`${consorciosActivos}`}
          icon="business" color="#4CAF50" onPress={() => router.push('/autoridades')} styles={styles} C={C} />
        <StatCard label="Distribución de la Red" value="5 Zonas"
          icon="pie-chart" color="#2196F3" onPress={() => router.push('/distribucion')} styles={styles} C={C} />
        <StatCard label="Relevamientos" value="Ver"
          icon="clipboard" color="#9C27B0" onPress={() => router.push('/(tabs)/reportes')} styles={styles} C={C} />
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

      {/* ── Selector de tema ──────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Tema de la aplicación</Text>
      <View style={styles.themeCard}>
        {(['original', 'dark', 'light'] as ThemeName[]).map(t => {
          const active = theme === t;
          const palette = THEMES[t];
          return (
            <TouchableOpacity
              key={t}
              style={[styles.themeBtn, active && { borderColor: C.accent, backgroundColor: C.accent + '18' }]}
              onPress={() => setTheme(t)}
              activeOpacity={0.75}
            >
              {/* Mini preview */}
              <View style={[styles.themePreview, { backgroundColor: palette.primary }]}>
                <View style={[styles.themePreviewBar, { backgroundColor: palette.accent }]} />
                <View style={[styles.themePreviewDot, { backgroundColor: palette.surface }]} />
                <View style={[styles.themePreviewDot, { backgroundColor: palette.surface }]} />
              </View>
              <Text style={styles.themeIcon}>{THEME_ICONS[t]}</Text>
              <Text style={[styles.themeLabel, active && { color: C.accent, fontWeight: '800' }]}>
                {THEME_LABELS[t]}
              </Text>
              {active && (
                <View style={[styles.themeCheckmark, { backgroundColor: C.accent }]}>
                  <Text style={[styles.themeCheckmarkText, { color: C.primary }]}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function makeStyles(C: ColorPalette) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { padding: 16 },

  banner: {
    backgroundColor: C.primary, borderRadius: 16, padding: 18, marginBottom: 20,
    borderBottomWidth: 4, borderBottomColor: C.accent,
  },
  bannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerBadge: { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  bannerBadgeText: { color: C.primary, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  bannerTitle: { color: C.white, fontSize: 17, fontWeight: '800' },
  bannerSubtitle: { color: C.textMuted, fontSize: 12, marginTop: 1 },

  sectionTitle: {
    fontSize: 13, fontWeight: '800', color: C.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 4,
  },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    backgroundColor: C.surface, borderRadius: 12, padding: 14,
    width: (width - 42) / 2, alignItems: 'center', borderBottomWidth: 3,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3,
  },
  statIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 18, fontWeight: '800', color: C.textPrimary },
  statLabel: { fontSize: 11, color: C.textSecondary, marginTop: 2, textAlign: 'center' },

  card: {
    backgroundColor: C.surface, borderRadius: 12, padding: 14, marginBottom: 16,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3,
  },
  zonaRow: { marginBottom: 12 },
  zonaRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  zonaRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  zonaDot: { width: 10, height: 10, borderRadius: 5 },
  zonaLabel: { fontSize: 13, fontWeight: '700', color: C.textPrimary },
  zonaCount: { fontSize: 11, color: C.textMuted, marginLeft: 2 },
  zonaKm: { fontSize: 12, fontWeight: '700', color: C.textSecondary },
  progressBar: { height: 7, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },

  // ── Selector de tema ──────────────────────────────────────────────────────
  themeCard: {
    flexDirection: 'row', gap: 10, marginBottom: 16,
  },
  themeBtn: {
    flex: 1, alignItems: 'center', padding: 12, borderRadius: 12,
    backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2,
  },
  themePreview: {
    width: '100%', height: 36, borderRadius: 7, marginBottom: 8,
    overflow: 'hidden', justifyContent: 'flex-end', padding: 5, gap: 3,
  },
  themePreviewBar: { width: '100%', height: 4, borderRadius: 2 },
  themePreviewDot: { width: 14, height: 4, borderRadius: 2, opacity: 0.85 },
  themeIcon: { fontSize: 20, marginBottom: 4 },
  themeLabel: { fontSize: 11, fontWeight: '600', color: C.textSecondary },
  themeCheckmark: {
    position: 'absolute', top: 6, right: 6, width: 18, height: 18,
    borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  themeCheckmarkText: { fontSize: 11, fontWeight: '900' },
}); }
