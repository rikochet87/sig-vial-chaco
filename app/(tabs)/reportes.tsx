import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { CONSORCIOS } from '@/constants/realData';
import type { Reporte } from '@/types';

const REPORTES: Reporte[] = [];

const TIPO_CONFIG = {
  mensual: { color: Colors.primaryLight, icon: 'calendar', label: 'Mensual' },
  trimestral: { color: Colors.success, icon: 'stats-chart', label: 'Trimestral' },
  anual: { color: Colors.primary, icon: 'trophy', label: 'Anual' },
  incidente: { color: Colors.danger, icon: 'warning', label: 'Incidente' },
} as const;

function ReporteCard({ item }: { item: Reporte }) {
  const config = TIPO_CONFIG[item.tipo];
  const consorcio = CONSORCIOS.find(c => String(c.numero) === item.consorcioId);

  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/reporte/${item.id}` as any)}>
      <View style={[styles.iconContainer, { backgroundColor: config.color + '20' }]}>
        <Ionicons name={config.icon as any} size={22} color={config.color} />
      </View>
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.titulo}</Text>
          <View style={[styles.tipoBadge, { backgroundColor: config.color }]}>
            <Text style={styles.tipoBadgeText}>{config.label}</Text>
          </View>
        </View>
        <Text style={styles.consorcioName} numberOfLines={1}>{consorcio?.nombre ?? 'Consorcio'}</Text>
        <View style={styles.cardFooter}>
          <View style={styles.footerItem}>
            <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.footerText}>{item.fecha}</Text>
          </View>
          {item.monto && (
            <View style={styles.footerItem}>
              <Ionicons name="cash-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.footerText}>${(item.monto / 1000).toFixed(0)}K</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={14} color={Colors.primary} style={{ marginLeft: 'auto' }} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ReportesScreen() {
  const [filtro, setFiltro] = useState<'todos' | 'mensual' | 'incidente' | 'trimestral' | 'anual'>('todos');

  const filtrados = REPORTES.filter(r => filtro === 'todos' || r.tipo === filtro);

  const totalMonto = filtrados.reduce((acc, r) => acc + (r.monto ?? 0), 0);

  return (
    <View style={styles.container}>
      {/* Resumen */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{filtrados.length}</Text>
          <Text style={styles.summaryLabel}>Reportes</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>${(totalMonto / 1e6).toFixed(2)}M</Text>
          <Text style={styles.summaryLabel}>Monto total</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: Colors.danger }]}>
            {filtrados.filter(r => r.tipo === 'incidente').length}
          </Text>
          <Text style={styles.summaryLabel}>Incidentes</Text>
        </View>
      </View>

      {/* Filtros */}
      <View style={styles.filterRow}>
        {(['todos', 'mensual', 'trimestral', 'anual', 'incidente'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filtro === f && { backgroundColor: TIPO_CONFIG[f === 'todos' ? 'mensual' : f]?.color ?? Colors.primary }]}
            onPress={() => setFiltro(f)}
          >
            <Text style={[styles.filterChipText, filtro === f && styles.filterChipTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <ReporteCard item={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No hay reportes en esta categoría</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  summary: {
    flexDirection: 'row', backgroundColor: Colors.primary, padding: 16,
    justifyContent: 'space-around', alignItems: 'center',
  },
  summaryItem: { alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: 'bold', color: Colors.white },
  summaryLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  summaryDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.3)' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 6 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: Colors.white },
  list: { padding: 12, paddingTop: 4 },
  card: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 14, padding: 14,
    marginBottom: 10, elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3,
  },
  iconContainer: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardContent: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  tipoBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  tipoBadgeText: { fontSize: 10, fontWeight: 'bold', color: Colors.white },
  consorcioName: { fontSize: 12, color: Colors.textSecondary, marginBottom: 8 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  footerText: { fontSize: 11, color: Colors.textMuted },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textMuted },
});
