import { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { CONSORCIOS, ZONAS_CONFIG } from '@/constants/realData';
import type { ConsorcioDato } from '@/types';

function ConsorcioCard({ item }: { item: ConsorcioDato }) {
  return (
    <View style={[styles.card, { borderLeftColor: item.color, borderLeftWidth: 4 }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={[styles.numBadge, { backgroundColor: item.color }]}>
          <Text style={styles.numText}>{item.numero}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.localidad}</Text>
          <View style={styles.zonaPill}>
            <View style={[styles.zonaCircle, { backgroundColor: item.color }]} />
            <Text style={styles.zonaText}>
              {ZONAS_CONFIG.find(z => z.id === item.zona)?.label} · Chaco
            </Text>
          </View>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: item.color }]}>
            {item.redKm.toFixed(0)}
          </Text>
          <Text style={styles.statLabel}>km totales</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{item.redTerciaria.toFixed(0)}</Text>
          <Text style={styles.statLabel}>km terciaria</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{item.redSecundaria.toFixed(0)}</Text>
          <Text style={styles.statLabel}>km secundaria</Text>
        </View>
        {item.redPrimaria > 0 && (
          <>
            <View style={styles.divider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{item.redPrimaria.toFixed(0)}</Text>
              <Text style={styles.statLabel}>km primaria</Text>
            </View>
          </>
        )}
      </View>

      {/* Authorities */}
      <View style={styles.authRow}>
        <Ionicons name="person-outline" size={12} color={Colors.textMuted} />
        <Text style={styles.authText} numberOfLines={1}>
          Pte: {item.presidente}
        </Text>
      </View>
    </View>
  );
}

export default function ConsorciosScreen() {
  const [search, setSearch] = useState('');
  const [zonaFiltro, setZonaFiltro] = useState<string>('TODAS');

  const filtrados = CONSORCIOS.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      c.nombre.toLowerCase().includes(q) ||
      c.localidad.toLowerCase().includes(q) ||
      String(c.numero).includes(q) ||
      c.presidente.toLowerCase().includes(q);
    const matchZona = zonaFiltro === 'TODAS' || c.zona === zonaFiltro;
    return matchSearch && matchZona;
  });

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre, localidad o Nº..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Zone filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <TouchableOpacity
          style={[styles.filterChip, zonaFiltro === 'TODAS' && styles.filterChipActive]}
          onPress={() => setZonaFiltro('TODAS')}
        >
          <Text style={[styles.filterChipText, zonaFiltro === 'TODAS' && styles.filterChipTextActive]}>
            Todas ({CONSORCIOS.length})
          </Text>
        </TouchableOpacity>
        {ZONAS_CONFIG.map(z => {
          const count = CONSORCIOS.filter(c => c.zona === z.id).length;
          const active = zonaFiltro === z.id;
          return (
            <TouchableOpacity
              key={z.id}
              style={[styles.filterChip, active && { backgroundColor: z.color, borderColor: z.color }]}
              onPress={() => setZonaFiltro(z.id)}
            >
              <View style={[styles.zonaCircle, { backgroundColor: active ? '#fff' : z.color }]} />
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {z.id} · {count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.countText}>
        {filtrados.length} consorcio{filtrados.length !== 1 ? 's' : ''} encontrado{filtrados.length !== 1 ? 's' : ''}
      </Text>

      <FlatList
        data={filtrados}
        keyExtractor={(item, idx) => `${item.zona}-${item.numero}-${idx}`}
        renderItem={({ item }) => <ConsorcioCard item={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No se encontraron consorcios</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    margin: 12, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  filterRow: { paddingHorizontal: 12, paddingRight: 24, gap: 6, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  countText: { fontSize: 12, color: Colors.textMuted, paddingHorizontal: 16, marginBottom: 4 },
  list: { padding: 12, paddingTop: 4 },

  // Card
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  cardHeader: { flexDirection: 'row', gap: 10, marginBottom: 10, alignItems: 'flex-start' },
  numBadge: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  numText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, lineHeight: 19 },
  zonaPill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  zonaCircle: { width: 8, height: 8, borderRadius: 4 },
  zonaText: { fontSize: 11, color: Colors.textMuted },
  statsRow: { flexDirection: 'row', backgroundColor: Colors.background, borderRadius: 8, padding: 10, marginBottom: 8, alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  divider: { width: 1, height: 28, backgroundColor: Colors.border },
  authRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  authText: { fontSize: 12, color: Colors.textMuted, flex: 1 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textMuted },
});
