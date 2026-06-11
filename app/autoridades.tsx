import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, TextInput, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { GEO_BUNDLE } from '@/constants/geoBundle';

const SEDES = GEO_BUNDLE.sedes as any[];

const ZONAS = ['Todas', 'ZI', 'ZII', 'ZIII', 'ZIV', 'ZV'];
const ZONA_LABELS: Record<string, string> = {
  ZI: 'Zona I', ZII: 'Zona II', ZIII: 'Zona III', ZIV: 'Zona IV', ZV: 'Zona V',
};
const ZONA_COLORS: Record<string, string> = {
  ZI: '#6baed6', ZII: '#fb6a4a', ZIII: '#fdd44c', ZIV: '#74c476', ZV: '#9e9ac8',
};

const ROLES = [
  { key: 'presidente',     label: 'Presidente',     icon: '👤' },
  { key: 'vicepresidente', label: 'Vicepresidente',  icon: '👤' },
  { key: 'secretario',     label: 'Secretario/a',    icon: '📋' },
  { key: 'tesorero',       label: 'Tesorero/a',      icon: '💰' },
];

// ── Tarjeta de consorcio ─────────────────────────────────────────────────────
function ConsorciCard({ item }: { item: any }) {
  const color = ZONA_COLORS[item.zona] ?? '#aaa';

  // Normalizar nombre: quitar comillas dobles extra, acortar
  const nombre = item.nombre
    .replace(/"/g, '')
    .replace(/Consorcio Caminero Nº?\s*/i, 'CC ')
    .trim();

  return (
    <View style={styles.card}>
      {/* Cabecera de la tarjeta */}
      <View style={[styles.cardHeader, { borderLeftColor: color }]}>
        <View style={[styles.zonaBadge, { backgroundColor: color + '25', borderColor: color }]}>
          <Text style={[styles.zonaBadgeText, { color }]}>{item.zona}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{nombre}</Text>
      </View>

      {/* Autoridades */}
      <View style={styles.rolesGrid}>
        {ROLES.map(r => {
          const valor = item[r.key];
          if (!valor) return null;
          return (
            <View key={r.key} style={styles.roleRow}>
              <Text style={styles.roleLabel}>{r.label}</Text>
              <Text style={styles.roleValue}>{valor}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function AutoridadesScreen() {
  const [zonaFiltro, setZonaFiltro] = useState('Todas');
  const [search, setSearch] = useState('');

  const filtrados = useMemo(() => {
    let list = SEDES;
    if (zonaFiltro !== 'Todas') list = list.filter(c => c.zona === zonaFiltro);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c =>
        c.nombre.toLowerCase().includes(q) ||
        (c.presidente  ?? '').toLowerCase().includes(q) ||
        (c.vicepresidente ?? '').toLowerCase().includes(q) ||
        (c.secretario  ?? '').toLowerCase().includes(q) ||
        (c.tesorero    ?? '').toLowerCase().includes(q)
      );
    }
    // Ordenar: por zona luego por número
    return [...list].sort((a, b) =>
      a.zona.localeCompare(b.zona) || (a.numero ?? 0) - (b.numero ?? 0)
    );
  }, [zonaFiltro, search]);

  return (
    <View style={styles.container}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Autoridades</Text>
          <Text style={styles.headerSub}>
            {filtrados.length} de {SEDES.length} consorcios
          </Text>
        </View>
      </View>

      {/* ── Filtros ────────────────────────────────────────────────────────── */}
      <View style={styles.filtersWrap}>
        {/* Búsqueda */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={Colors.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar consorcio o nombre de autoridad..."
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

        {/* Chips de zona */}
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
                  <View style={[styles.zonaChipDot, { backgroundColor: active ? Colors.primary : color }]} />
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
        data={filtrados}
        keyExtractor={item => String(item.numero ?? item.nombre)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <ConsorciCard item={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Sin resultados</Text>
          </View>
        }
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
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
  headerSub: { color: '#aaaaaa', fontSize: 11, marginTop: 1 },

  // Filtros
  filtersWrap: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    elevation: 2,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    marginBottom: 8,
    height: 38,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  zonaScroll: { marginBottom: 4 },
  zonaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginRight: 8,
    backgroundColor: Colors.background,
  },
  zonaChipDot: { width: 8, height: 8, borderRadius: 4 },
  zonaChipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  zonaChipTextActive: { color: Colors.primary },

  // Lista
  listContent: { padding: 12, paddingBottom: 40 },

  // Tarjeta consorcio
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderLeftWidth: 4,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  zonaBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: 'center',
  },
  zonaBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  cardTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
    lineHeight: 18,
  },

  // Roles
  rolesGrid: { padding: 12, gap: 6 },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  roleLabel: {
    width: 110,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingTop: 1,
  },
  roleValue: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '500',
  },

  // Empty
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: Colors.textMuted, fontSize: 15 },
});
