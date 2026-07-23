import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/context/ThemeContext';
import type { ColorPalette } from '@/constants/Colors';
import { GEO_BUNDLE } from '@/constants/geoBundle';

const SEDES = GEO_BUNDLE.sedes as unknown as any[];

const ZONAS_DEF = [
  { id: 'ZI',   label: 'Zona I',   color: '#6baed6' },
  { id: 'ZII',  label: 'Zona II',  color: '#fb6a4a' },
  { id: 'ZIII', label: 'Zona III', color: '#fdd44c' },
  { id: 'ZIV',  label: 'Zona IV',  color: '#74c476' },
  { id: 'ZV',   label: 'Zona V',   color: '#9e9ac8' },
];

const ZONA_DATA = ZONAS_DEF.map(z => {
  const sedes    = SEDES.filter((c: any) => c.zona === z.id);
  const total      = sedes.reduce((a: number, c: any) => a + c.redKm,         0);
  const primaria   = sedes.reduce((a: number, c: any) => a + c.redPrimaria,   0);
  const secundaria = sedes.reduce((a: number, c: any) => a + c.redSecundaria, 0);
  const terciaria  = sedes.reduce((a: number, c: any) => a + c.redTerciaria,  0);
  return { ...z, total, primaria, secundaria, terciaria, count: sedes.length };
});

const TOTAL_KM = ZONA_DATA.reduce((a, z) => a + z.total, 0);

function pct(val: number) { return ((val / TOTAL_KM) * 100).toFixed(1); }
function fmt(km: number)  { return km.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

type ChartType = 'pie' | 'doughnut' | 'bar' | 'stacked';

const CHART_OPTS: { id: ChartType; label: string }[] = [
  { id: 'pie',      label: 'Circular' },
  { id: 'doughnut', label: 'Anillo'   },
  { id: 'bar',      label: 'Barras'   },
  { id: 'stacked',  label: 'Apilado'  },
];

function buildChartHtml(type: ChartType): string {
  const labels = JSON.stringify(ZONA_DATA.map(z => z.label));
  const colors = JSON.stringify(ZONA_DATA.map(z => z.color));
  const totals = JSON.stringify(ZONA_DATA.map(z => parseFloat(z.total.toFixed(2))));
  const prims  = JSON.stringify(ZONA_DATA.map(z => parseFloat(z.primaria.toFixed(2))));
  const secs   = JSON.stringify(ZONA_DATA.map(z => parseFloat(z.secundaria.toFixed(2))));
  const tercs  = JSON.stringify(ZONA_DATA.map(z => parseFloat(z.terciaria.toFixed(2))));
  const pcts   = JSON.stringify(ZONA_DATA.map(z => parseFloat(pct(z.total))));

  const isPie   = type === 'pie' || type === 'doughnut';
  const isStack = type === 'stacked';

  const datasets = isPie
    ? `[{ data: ${pcts}, backgroundColor: ${colors}, borderColor: '#0d0d0d', borderWidth: 2, hoverOffset: 12 }]`
    : isStack
    ? `[
        { label: 'Primaria',   data: ${prims}, backgroundColor: '#E74C3C', stack: 'a' },
        { label: 'Secundaria', data: ${secs},  backgroundColor: '#E67E22', stack: 'a' },
        { label: 'Terciaria',  data: ${tercs}, backgroundColor: '#27AE60', stack: 'a' },
      ]`
    : `[{ label: 'Red Vial (km)', data: ${totals}, backgroundColor: ${colors}, borderColor: '#0d0d0d', borderWidth: 1, borderRadius: 6 }]`;

  const chartType = type === 'stacked' ? 'bar' : type;

  const options = isPie ? `{
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#e0e0e0', font: { size: 12, weight: 'bold' }, padding: 14, boxWidth: 14 } },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + ctx.parsed + '%' } },
      datalabels: {
        color: '#fff', font: { weight: 'bold', size: 13 },
        formatter: (val) => val + '%',
        display: ctx => ctx.dataset.data[ctx.dataIndex] > 3,
      }
    }
  }` : isStack ? `{
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#e0e0e0', font: { size: 11 }, padding: 12 } },
      datalabels: { display: false },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString('es-AR') + ' km' } }
    },
    scales: {
      x: { stacked: true, ticks: { color: '#ccc', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.07)' } },
      y: { stacked: true, ticks: { color: '#ccc', font: { size: 10 }, callback: v => v.toLocaleString('es-AR') }, grid: { color: 'rgba(255,255,255,0.07)' } }
    }
  }` : `{
    indexAxis: 'y',
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      datalabels: {
        color: '#fff', anchor: 'end', align: 'start', offset: 4,
        font: { weight: 'bold', size: 11 },
        formatter: (val) => val.toLocaleString('es-AR') + ' km',
      },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.parsed.x.toLocaleString('es-AR') + ' km' } }
    },
    scales: {
      x: { ticks: { color: '#ccc', font: { size: 10 }, callback: v => v.toLocaleString('es-AR') }, grid: { color: 'rgba(255,255,255,0.07)' } },
      y: { ticks: { color: '#e0e0e0', font: { size: 12, weight: 'bold' } }, grid: { display: false } }
    }
  }`;

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#0d0d0d;display:flex;align-items:center;justify-content:center}
.wrap{width:100%;height:100%;padding:16px}
</style>
</head>
<body>
<div class="wrap"><canvas id="c"></canvas></div>
<script>
Chart.register(ChartDataLabels);
new Chart(document.getElementById('c'), {
  type: '${chartType}',
  data: { labels: ${labels}, datasets: ${datasets} },
  options: ${options}
});
<\/script>
</body>
</html>`;
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },

    // Header
    header: {
      backgroundColor: c.primary,
      paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16,
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderBottomWidth: 3, borderBottomColor: c.accent,
    },
    backBtn:     { padding: 4 },
    headerText:  { flex: 1 },
    headerTitle: { color: c.white, fontSize: 17, fontWeight: '900' },
    headerSub:   { color: c.textSecondary, fontSize: 11, marginTop: 1 },

    // Selector de tipo de gráfico
    selectorWrap: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      paddingHorizontal: 12, paddingVertical: 10, gap: 8,
      borderBottomWidth: 1, borderBottomColor: c.border,
      elevation: 2,
    },
    selectorBtn: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      paddingVertical: 10, borderRadius: 10,
      borderWidth: 1.5, borderColor: c.border,
      backgroundColor: c.background,
    },
    selectorBtnActive: { backgroundColor: c.accent, borderColor: c.accentDark },
    selectorLabel:       { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    selectorLabelActive: { color: c.primary },

    // Gráfico
    chartWrap: { height: 300, backgroundColor: c.background },
    chart:     { flex: 1, backgroundColor: c.background },

    // Tabla
    table:        { flex: 1, backgroundColor: c.surface },
    tableContent: { paddingBottom: 20 },
    tableHead: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.primary,
      paddingHorizontal: 14, paddingVertical: 8,
      borderBottomWidth: 2, borderBottomColor: c.accent,
    },
    thCell: {
      flex: 1, fontSize: 10, fontWeight: '800',
      color: c.accent, textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'right',
    },
    tableRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 14, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    tableTotal: {
      backgroundColor: c.background,
      borderTopWidth: 2, borderTopColor: c.accent,
    },
    tdZona:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
    zonaDot:  { width: 10, height: 10, borderRadius: 5 },
    tdText:   { fontSize: 13, fontWeight: '600', color: c.textPrimary },
    tdCell:   { flex: 1, fontSize: 12, color: c.textSecondary, textAlign: 'right' },
    tdPct:    { color: c.accent, fontWeight: '800' },
    tdCenter: { textAlign: 'center' },
    tdBold:   { fontWeight: '900', color: c.textPrimary },
  });
}

export default function DistribucionScreen() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [chartType, setChartType] = useState<ChartType>('pie');

  return (
    <View style={styles.container}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={c.white} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Distribucion Porcentual</Text>
          <Text style={styles.headerSub}>de la Red Bajo Convenio</Text>
        </View>
      </View>

      {/* ── Selector ───────────────────────────────────────────────────────── */}
      <View style={styles.selectorWrap}>
        {CHART_OPTS.map(opt => {
          const active = chartType === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.selectorBtn, active && styles.selectorBtnActive]}
              onPress={() => setChartType(opt.id)}
            >
              <Text style={[styles.selectorLabel, active && styles.selectorLabelActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Gráfico ────────────────────────────────────────────────────────── */}
      <View style={styles.chartWrap}>
        <WebView
          key={chartType}
          source={{ html: buildChartHtml(chartType) }}
          style={styles.chart}
          originWhitelist={['*']}
          javaScriptEnabled
          scrollEnabled={false}
          backgroundColor={c.background}
        />
      </View>

      {/* ── Tabla ──────────────────────────────────────────────────────────── */}
      <ScrollView style={styles.table} contentContainerStyle={styles.tableContent}>
        <View style={styles.tableHead}>
          <Text style={[styles.thCell, { flex: 2, textAlign: 'left' }]}>Zona</Text>
          <Text style={styles.thCell}>%</Text>
          <Text style={styles.thCell}>km</Text>
          <Text style={styles.thCell}>Cons.</Text>
        </View>
        {ZONA_DATA.map(z => (
          <View key={z.id} style={styles.tableRow}>
            <View style={[styles.tdZona, { flex: 2 }]}>
              <View style={[styles.zonaDot, { backgroundColor: z.color }]} />
              <Text style={styles.tdText}>{z.label}</Text>
            </View>
            <Text style={[styles.tdCell, styles.tdPct]}>{pct(z.total)}%</Text>
            <Text style={styles.tdCell}>{fmt(z.total)}</Text>
            <Text style={[styles.tdCell, styles.tdCenter]}>{z.count}</Text>
          </View>
        ))}
        <View style={[styles.tableRow, styles.tableTotal]}>
          <View style={[styles.tdZona, { flex: 2 }]}>
            <Text style={styles.tdBold}>Total</Text>
          </View>
          <Text style={[styles.tdCell, styles.tdBold]}>100%</Text>
          <Text style={[styles.tdCell, styles.tdBold]}>{fmt(TOTAL_KM)}</Text>
          <Text style={[styles.tdCell, styles.tdBold, styles.tdCenter]}>
            {ZONA_DATA.reduce((a, z) => a + z.count, 0)}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
