import { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/context/ThemeContext';
import type { ColorPalette } from '@/constants/Colors';
import { ZONAS_CONFIG } from '@/constants/realData';
import { useConsorcios } from '@/hooks/useConsorcios';
import type { ConsorcioDato } from '@/types';

function ConsorcioCard({ item, C, styles }: {
  item: ConsorcioDato;
  C: ColorPalette;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={[styles.card, { borderLeftColor: item.color }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.numBadge, { backgroundColor: item.color }]}>
          <Text style={styles.numText}>{item.numero}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.localidad}</Text>
          <View style={styles.zonaPill}>
            <View style={[styles.zonaDot, { backgroundColor: item.color }]} />
            <Text style={styles.zonaText}>
              {ZONAS_CONFIG.find((z: any) => z.id === item.zona)?.label} · Chaco
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: item.color }]}>
            {item.redKm.toFixed(0)}
          </Text>
          <Text style={styles.statLabel}>km total</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{item.redTerciaria.toFixed(0)}</Text>
          <Text style={styles.statLabel}>km 3ria</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{item.redSecundaria.toFixed(0)}</Text>
          <Text style={styles.statLabel}>km 2ria</Text>
        </View>
        {item.redPrimaria > 0 && (
          <>
            <View style={styles.divider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{item.redPrimaria.toFixed(0)}</Text>
              <Text style={styles.statLabel}>km 1ria</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.authRow}>
        <Ionicons name="person-outline" size={11} color={C.textMuted} />
        <Text style={styles.authText} numberOfLines={1}>Pte: {item.presidente}</Text>
      </View>
    </View>
  );
}

export default function ConsorciosScreen() {
  const C = useColors();
  const styles = makeStyles(C);
  const { consorcios, source } = useConsorcios();
  const [search, setSearch] = useState('');
  const [zonaFiltro, setZonaFiltro] = useState<string>('TODAS');

  const filtrados = consorcios.filter(c => {
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
      <View style={styles.searchBar}>
        <Ionicons name="search" size={13} color={C.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre, localidad o Nº..."
          placeholderTextColor={C.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={13} color={C.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        <TouchableOpacity
          style={[styles.filterChip, zonaFiltro === 'TODAS' && styles.filterChipActive]}
          onPress={() => setZonaFiltro('TODAS')}
        >
          <Text style={[styles.filterChipText, zonaFiltro === 'TODAS' && styles.filterChipTextActive]}>
            TODAS ({consorcios.length})
          </Text>
        </TouchableOpacity>
        {ZONAS_CONFIG.map(z => {
          const count = consorcios.filter(c => c.zona === z.id).length;
          const active = zonaFiltro === z.id;
          return (
            <TouchableOpacity
              key={z.id}
              style={[styles.filterChip, active && { borderColor: z.color }]}
              onPress={() => setZonaFiltro(z.id)}
            >
              <View style={[styles.zonaDot, { backgroundColor: z.color }]} />
              <Text style={[styles.filterChipText, active && { color: z.color }]}>
                {z.id} · {count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.countText}>
        {filtrados.length} consorcio{filtrados.length !== 1 ? 's' : ''}
      </Text>

      <FlatList
        data={filtrados}
        keyExtractor={(item, idx) => `${item.zona}-${item.numero}-${idx}`}
        renderItem={({ item }) => <ConsorcioCard item={item} C={C} styles={styles} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={32} color={C.textMuted} />
            <Text style={styles.emptyText}>Sin resultados</Text>
          </View>
        }
        ListFooterComponent={
          <Text style={styles.sourceText}>
            {source === 'remoto' ? 'Datos actualizados' : 'Datos locales'}
          </Text>
        }
      />
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },

    searchBar: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
      margin: 12, borderWidth: 1, borderColor: C.border,
      paddingHorizontal: 10, paddingVertical: 8,
    },
    searchInput: { flex: 1, fontSize: 13, color: C.textPrimary, fontFamily: 'monospace' },

    filterScroll: { flexShrink: 0, flexGrow: 0 },
    filterRow: {
      paddingHorizontal: 12, paddingRight: 24, paddingVertical: 4,
      gap: 4, marginBottom: 4, flexDirection: 'row', alignItems: 'center',
    },
    filterChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 10, paddingVertical: 5,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    },
    filterChipActive: { borderColor: C.accent },
    filterChipText: {
      fontSize: 10, color: C.textMuted, fontWeight: '600',
      fontFamily: 'monospace', textTransform: 'uppercase',
    },
    filterChipTextActive: { color: C.accent },

    countText: {
      fontSize: 10, color: C.textMuted, paddingHorizontal: 16, marginBottom: 4,
      fontFamily: 'monospace',
    },
    list: { padding: 12, paddingTop: 4 },

    card: {
      backgroundColor: C.surface, marginBottom: 6,
      borderWidth: 1, borderColor: C.border, borderLeftWidth: 3,
    },
    cardHeader: { flexDirection: 'row', gap: 10, padding: 10, alignItems: 'flex-start' },
    numBadge: {
      width: 30, height: 30,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    numText: { color: '#000', fontSize: 11, fontWeight: '800', fontFamily: 'monospace' },
    cardTitle: { fontSize: 13, fontWeight: '700', color: C.textPrimary, lineHeight: 18 },
    zonaPill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
    zonaDot: { width: 5, height: 5 },
    zonaText: { fontSize: 10, color: C.textMuted, fontFamily: 'monospace' },

    statsRow: {
      flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border,
      padding: 8, alignItems: 'center',
    },
    statItem: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 13, fontWeight: '700', color: C.textPrimary, fontFamily: 'monospace' },
    statLabel: {
      fontSize: 9, color: C.textMuted, marginTop: 1,
      textTransform: 'uppercase', fontFamily: 'monospace',
    },
    divider: { width: 1, height: 22, backgroundColor: C.border },

    authRow: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 10, paddingVertical: 6,
      borderTopWidth: 1, borderTopColor: C.border,
    },
    authText: { fontSize: 10, color: C.textMuted, flex: 1, fontFamily: 'monospace' },

    empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyText: { fontSize: 12, color: C.textMuted, fontFamily: 'monospace' },
    sourceText: {
      fontSize: 9, color: C.textMuted, textAlign: 'center',
      paddingVertical: 12, fontFamily: 'monospace',
    },
  });
}
