import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { CONSORCIOS } from '@/constants/realData';
const REPORTES: any[] = [];

const TIPO_CONFIG = {
  mensual: { color: Colors.primaryLight, icon: 'calendar', label: 'Informe Mensual' },
  trimestral: { color: Colors.success, icon: 'stats-chart', label: 'Informe Trimestral' },
  anual: { color: Colors.primary, icon: 'trophy', label: 'Informe Anual' },
  incidente: { color: Colors.danger, icon: 'warning', label: 'Reporte de Incidente' },
};

export default function ReporteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const reporte = REPORTES.find(r => r.id === id);
  const consorcio = CONSORCIOS.find(c => String(c.numero) === reporte?.consorcioId);

  if (!reporte) {
    return (
      <View style={styles.notFound}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.notFoundText}>Reporte no encontrado</Text>
      </View>
    );
  }

  const tipo = (reporte.tipo ?? "mensual") as keyof typeof TIPO_CONFIG;
  const config = TIPO_CONFIG[tipo] ?? TIPO_CONFIG.mensual;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.header, { backgroundColor: config.color }]}>
        <Ionicons name={config.icon as any} size={32} color={Colors.white} />
        <Text style={styles.headerType}>{config.label}</Text>
        <Text style={styles.headerTitle}>{reporte.titulo}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.infoLabel}>Fecha</Text>
          <Text style={styles.infoValue}>{reporte.fecha}</Text>
        </View>
        <View style={[styles.infoRow, styles.infoRowBorder]}>
          <Ionicons name="business-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.infoLabel}>Consorcio</Text>
          <Text style={styles.infoValue} numberOfLines={2}>{consorcio?.nombre ?? '-'}</Text>
        </View>
        {reporte.monto && (
          <View style={styles.infoRow}>
            <Ionicons name="cash-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.infoLabel}>Monto</Text>
            <Text style={[styles.infoValue, { color: Colors.secondary, fontWeight: 'bold' }]}>
              ${reporte.monto.toLocaleString('es-AR')}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Descripción</Text>
      <View style={styles.card}>
        <Text style={styles.description}>{reporte.descripcion}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { fontSize: 16, color: Colors.textMuted },
  header: { borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16, gap: 6 },
  headerType: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.white, textAlign: 'center' },
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  infoRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLabel: { fontSize: 13, color: Colors.textMuted, flex: 1 },
  infoValue: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600', flex: 2, textAlign: 'right' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
    description: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },
});
