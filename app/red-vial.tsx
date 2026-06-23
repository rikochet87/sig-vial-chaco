import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, TextInput, ScrollView, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { GEO_BUNDLE } from '@/constants/geoBundle';

const SEDES = GEO_BUNDLE.sedes as any[];
const { width } = Dimensions.get('window');

const ZONAS = ['Todas', 'ZI', 'ZII', 'ZIII', 'ZIV', 'ZV'];
const ZONA_LABELS: Record<string, string> = {
  ZI: 'Zona I', ZII: 'Zona II', ZIII: 'Zona III', ZIV: 'Zona IV', ZV: 'Zona V',
};
const ZONA_COLORS: Record<string, string> = {
  ZI: '#6baed6', ZII: '#fb6a4a', ZIII: '#fdd44c', ZIV: '#74c476', ZV: '#9e9ac8',
};

function fmt(km: number) {
  return km.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Fila de consorcio ────────────────────────────────────────────────────────
function SedeRow({ item, index }: { item: any; index: number }) {
  const color = ZONA_COLORS[item.zona] ?? '#aaa';
  return (
    <View style={[styles.row, index % 2 === 0 ? styles.rowEven : styles.rowOdd]}>
      <View style={[styles.rowZonaBadge, { backgroundColor: color + '30', borderColor: color }]}>
        <Text style={[styles.rowZonaText, { color }]}>{item.zona}</Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowName} numberOfLines={2}>{item.nombre}</Text>
        <View style={styles.rowKms}>
          <KmChip label="1ª" value={item.redPrimaria} color="#E74C3C" />
          <KmChip label="2ª" value={item.redSecundaria} color="#E67E22" />
          <KmChip label="3ª" value={item.redTerciaria} color="#27AE60" />
          <KmChip label="Total" value={item.redKm} color={Colors.accent} bold />
        </View>
      </View>
    </View>
  );
}

function KmChip({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  return (
    <View style={styles.chip}>
      <Text style={[styles.chipLabel, { color }]}>{label}</Text>
      <Text style={[styles.chipValue, bold && styles.chipBold]}>{fmt(value)}</Text>
    </View>
  );
}

// ── Cabecera de zona (subtotal) ───────────────────────────────────────────────
function ZonaHeader({ zona, items }: { zona: string; items: any[] }) {
  const color = ZONA_COLORS[zona];
  const p = items.reduce((a, c) => a + c.redPrimaria, 0);
  const s = items.reduce((a, c) => a + c.redSecundaria, 0);
  const t = items.reduce((a, c) => a + c.redTerciaria, 0);
  const total = items.reduce((a, c) => a + c.redKm, 0);
  return (
    <View style={[styles.zonaHeader, { borderLeftColor: color }]}>
      <View style={styles.zonaHeaderTop}>
        <View style={[styles.zonaBadgeLarge, { backgroundColor: color }]}>
          <Text style={styles.zonaBadgeLargeText}>{ZONA_LABELS[zona]}</Text>
        </View>
        <Text style={styles.zonaHeaderCount}>{items.length} consorcios</Text>
        <Text style={[styles.zonaHeaderTotal, { color }]}>{fmt(total)} km</Text>
      </View>
      <View style={styles.zonaHeaderKms}>
        <Text style={styles.zonaHeaderKm}>1ª {fmt(p)} km</Text>
        <Text style={styles.zonaHeaderKm}>2ª {fmt(s)} km</Text>
        <Text style={styles.zonaHeaderKm}>3ª {fmt(t)} km</Text>
      </View>
    </View>
  );
}

export default function RedVialScreen() {
  const [zonaFiltro, setZonaFiltro] = useState('Todas');
  const [search, setSearch] = useState('');

  const filtrados = useMemo(() => {
    let list = SEDES;
    if (zonaFiltro !== 'Todas') list = list.filter(c => c.zona === zonaFiltro);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c => c.nombre.toLowerCase().includes(q));
    }
    return list;
  }, [zonaFiltro, search]);

  // Agrupar para mostrar cabeceras por zona
  const sections = useMemo(() => {
    const zonasActivas = zonaFiltro === 'Todas'
      ? ['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV']
      : [zonaFiltro];
    return zonasActivas
      .map(z => ({ zona: z, items: filtrados.filter(c => c.zona === z) }))
      .filter(s => s.items.length > 0);
  }, [filtrados, zonaFiltro]);

  const totalFiltrado = filtrados.reduce((a, c) => a + c.redKm, 0);
  const totalPrim = filtrados.reduce((a, c) => a + c.redPrimaria, 0);
  const totalSec = filtrados.reduce((a, c) => a + c.redSecundaria, 0);
  const totalTerc = filtrados.reduce((a, c) => a + c.redTerciaria, 0);

  return (
    <View style={styles.container}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Red Vial</Text>
          <Text style={styles.headerSub}>SIG Vial Chaco — Red Vial Rural</Text>
        </View>
      </View>

      {/* ── Totalizador global ─────────────────────────────────────────────── */}
      <View style={styles.totalBar}>
        <View style={styles.totalItem}>
          <Text style={styles.totalValue}>{fmt(totalFiltrado)}</Text>
          <Text style={styles.totalLabel}>Total km</Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalItem}>
          <Text style={[styles.totalValue, { color: '#E74C3C' }]}>{fmt(totalPrim)}</Text>
          <Text style={styles.totalLabel}>Primaria</Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalItem}>
          <Text style={[styles.totalValue, { color: '#E67E22' }]}>{fmt(totalSec)}</Text>
          <Text style={styles.totalLabel}>Secundaria</Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalItem}>
          <Text style={[styles.totalValue, { color: '#27AE60' }]}>{fmt(totalTerc)}</Text>
          <Text style={styles.totalLabel}>Terciaria</Text>
        </View>
      </View>

      {/* ── Filtros ────────────────────────────────────────────────────────── */}
      <View style={styles.filtersWrap}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={Colors.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar consorcio..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.zonaScroll}>
          {ZONAS.map(z => {
            const active = zonaFiltro === z;
            const color = z === 'Todas' ? Colors.accent : ZONA_COLORS[z];
            return (
              <TouchableOpacity
                key={z}
                style={[styles.zonaChip, active && { backgroundColor: color, borderColor: color }]}
                onPress={() => setZonaFiltro(z)}
              >
                {z !== 'Todas' && (
                  <View style={[styles.zonaChipDot, { backgroundColor: active ? '#fff' : color }]} />
                )}
                <Text style={[styles.zonaChipText, active && styles.zonaChipTextActive]}>
                  {z === 'Todas' ? 'Todas' : ZONA_LABELS[z]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Lista ──────────────────────────────────────────────────────────── */}
      <FlatList
        data={sections}
        keyExtractor={s => s.zona}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: section }) => (
          <View>
            <ZonaHeader zona={section.zona} items={section.items} />
            {section.items.map((c, i) => (
              <SedeRow key={c.numero ?? c.nombre} item={c} index={i} />
            ))}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Sin resultados</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    backgroundColor: Colors.primary,
    paddingTop: 48,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 3,
    borderBottomColor: Colors.accent,
  },
  backBtn: { padding: 4 },
  headerText: { flex: 1 },
  headerTitle: { color: Colors.white, fontSize: 18, fontWeight: '900' },
  headerSub: { color: '#aaa', fontSize: 11, marginTop: 1 },

  // Totalizador
  totalBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    elevation: 2,
  },
  totalItem: { flex: 1, alignItems: 'center' },
  totalValue: { fontSize: 13, fontWeight: '900', color: Colors.accent },
  totalLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  totalDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },

  // Filtros
  filtersWrap: { backgroundColor: Colors.surface, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 10, marginBottom: 8, height: 38,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  zonaScroll: { marginBottom: 4 },
  zonaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border,
    marginRight: 8, backgroundColor: Colors.background,
  },
  zonaChipDot: { width: 8, height: 8, borderRadius: 4 },
  zonaChipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  zonaChipTextActive: { color: Colors.primary },

  // Lista
  listContent: { padding: 12, paddingBottom: 40 },

  // Zona header
  zonaHeader: {
    backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginBottom: 6,
    borderLeftWidth: 4, elevation: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2,
  },
  zonaHeaderTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  zonaBadgeLarge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  zonaBadgeLargeText: { color: Colors.primary, fontSize: 12, fontWeight: '900' },
  zonaHeaderCount: { flex: 1, fontSize: 12, color: Colors.textMuted },
  zonaHeaderTotal: { fontSize: 14, fontWeight: '900' },
  zonaHeaderKms: { flexDirection: 'row', gap: 14 },
  zonaHeaderKm: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },

  // Filas
  row: { borderRadius: 8, marginBottom: 3, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowEven: { backgroundColor: Colors.surface },
  rowOdd: { backgroundColor: '#F9F9F9' },
  rowZonaBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 2 },
  rowZonaText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  rowMain: { flex: 1 },
  rowName: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6, lineHeight: 16 },
  rowKms: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },

  // Chips de km
  chip: { backgroundColor: Colors.background, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, alignItems: 'center', minWidth: 58 },
  chipLabel: { fontSize: 8, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  chipValue: { fontSize: 11, fontWeight: '600', color: Colors.textPrimary },
  chipBold: { fontWeight: '900', color: Colors.accent },

  // Empty
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: Colors.textMuted, fontSize: 15 },
});
