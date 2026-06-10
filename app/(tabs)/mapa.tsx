import { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { CONSORCIOS, ZONAS_CONFIG } from '@/constants/realData';

const { width, height } = Dimensions.get('window');

// ── Serializar datos para inyectar en Leaflet ─────────────────────────────────
const CONSORCIOS_JSON = JSON.stringify(CONSORCIOS.map(c => ({
  numero: c.numero,
  nombre: c.nombre,
  localidad: c.localidad,
  zona: c.zona,
  color: c.color,
  lat: c.latitude,
  lng: c.longitude,
  redKm: c.redKm,
  redPrimaria: c.redPrimaria,
  redSecundaria: c.redSecundaria,
  redTerciaria: c.redTerciaria,
  presidente: c.presidente,
  vicepresidente: c.vicepresidente,
  secretario: c.secretario,
  tesorero: c.tesorero,
})));

const ZONAS_JSON = JSON.stringify(ZONAS_CONFIG);

// ── HTML con Leaflet embebido ─────────────────────────────────────────────────
function buildMapHtml(filtroZona: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body, #map { width: 100%; height: 100vh; }
  .custom-marker {
    width: 26px; height: 26px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid #fff;
    font-size: 9px; font-weight: 800; color: #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.5);
  }
  .leaflet-popup-content-wrapper {
    background: #1e2436; border: 1px solid #2a3045;
    border-radius: 10px; padding: 0; overflow: hidden;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }
  .leaflet-popup-tip { background: #1e2436; }
  .leaflet-popup-content { margin: 0; width: 260px !important; }
  .popup-header {
    padding: 10px; display: flex; align-items: center; gap: 8px;
  }
  .popup-num {
    width: 34px; height: 34px; border-radius: 50%;
    background: rgba(0,0,0,0.25);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 800; color: #fff; flex-shrink: 0;
  }
  .popup-localidad { color: #fff; font-size: 12px; font-weight: 700; line-height: 1.3; }
  .popup-zona { color: rgba(255,255,255,0.8); font-size: 10px; margin-top: 2px; }
  .popup-body { padding: 10px; }
  .popup-section { font-size: 10px; color: #7a8aaa; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .popup-row { display: flex; padding: 2px 0; }
  .popup-label { font-size: 11px; color: #7a8aaa; width: 100px; }
  .popup-val { font-size: 11px; color: #e0e6f0; font-weight: 600; flex: 1; }
  .km-grid { display: flex; gap: 4px; margin-top: 8px; }
  .km-cell {
    flex: 1; background: #252d40; border-radius: 5px;
    padding: 5px; text-align: center;
  }
  .km-val { font-size: 11px; font-weight: 800; }
  .km-label { font-size: 9px; color: #7a8aaa; margin-top: 1px; }
</style>
</head>
<body>
<div id="map"></div>
<script>
const CONSORCIOS = ${CONSORCIOS_JSON};
const FILTRO = '${filtroZona}';

const map = L.map('map', { zoomControl: true }).setView([-26.2, -60.5], 7);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap',
  maxZoom: 18
}).addTo(map);

const consFiltrados = FILTRO === 'TODAS' ? CONSORCIOS : CONSORCIOS.filter(c => c.zona === FILTRO);

consFiltrados.forEach(c => {
  const icon = L.divIcon({
    className: '',
    html: '<div class="custom-marker" style="background:' + c.color + '">' + c.numero + '</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });

  const popup = '<div>' +
    '<div class="popup-header" style="background:' + c.color + '">' +
      '<div class="popup-num">' + c.numero + '</div>' +
      '<div><div class="popup-localidad">' + c.localidad + '</div>' +
      '<div class="popup-zona">' + c.zona + ' · Consorcio N° ' + c.numero + '</div></div>' +
    '</div>' +
    '<div class="popup-body">' +
      '<div class="popup-section">Autoridades</div>' +
      '<div class="popup-row"><span class="popup-label">Presidente</span><span class="popup-val">' + c.presidente + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Vicepresidente</span><span class="popup-val">' + c.vicepresidente + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Secretario</span><span class="popup-val">' + c.secretario + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Tesorero</span><span class="popup-val">' + c.tesorero + '</span></div>' +
      '<div class="km-grid" style="margin-top:8px">' +
        '<div class="km-cell"><div class="km-val" style="color:' + c.color + '">' + Math.round(c.redKm) + ' km</div><div class="km-label">Total</div></div>' +
        '<div class="km-cell"><div class="km-val">' + Math.round(c.redTerciaria) + ' km</div><div class="km-label">Terciaria</div></div>' +
        '<div class="km-cell"><div class="km-val" style="color:#27ae60">' + Math.round(c.redSecundaria) + ' km</div><div class="km-label">Secundaria</div></div>' +
        '<div class="km-cell"><div class="km-val" style="color:#e67e22">' + Math.round(c.redPrimaria) + ' km</div><div class="km-label">Primaria</div></div>' +
      '</div>' +
    '</div>' +
  '</div>';

  L.marker([c.lat, c.lng], { icon }).bindPopup(popup, { maxWidth: 270 }).addTo(map);
});
</script>
</body>
</html>`;
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function MapaScreen() {
  const [zonaFiltro, setZonaFiltro] = useState('TODAS');
  const [showLegend, setShowLegend] = useState(true);
  const webviewRef = useRef<WebView>(null);

  const consorcisFiltrados = zonaFiltro === 'TODAS'
    ? CONSORCIOS
    : CONSORCIOS.filter(c => c.zona === zonaFiltro);

  return (
    <View style={styles.container}>
      {/* ── MAPA LEAFLET ─────────────────────────────────────────────────── */}
      <WebView
        ref={webviewRef}
        style={styles.map}
        source={{ html: buildMapHtml(zonaFiltro) }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        scrollEnabled={false}
      />

      {/* ── FILTRO DE ZONAS ───────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterContent}
      >
        <TouchableOpacity
          style={[styles.filterBtn, zonaFiltro === 'TODAS' && styles.filterBtnActive]}
          onPress={() => setZonaFiltro('TODAS')}
        >
          <Text style={[styles.filterLabel, zonaFiltro === 'TODAS' && styles.filterLabelActive]}>
            Todas ({CONSORCIOS.length})
          </Text>
        </TouchableOpacity>
        {ZONAS_CONFIG.map(z => {
          const count = CONSORCIOS.filter(c => c.zona === z.id).length;
          const active = zonaFiltro === z.id;
          return (
            <TouchableOpacity
              key={z.id}
              style={[styles.filterBtn, active && { backgroundColor: z.color }]}
              onPress={() => setZonaFiltro(z.id)}
            >
              <View style={[styles.zoneDot, { backgroundColor: active ? '#fff' : z.color }]} />
              <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
                {z.id} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── LEYENDA ───────────────────────────────────────────────────────── */}
      <TouchableOpacity style={styles.legendToggle} onPress={() => setShowLegend(!showLegend)}>
        <Text style={styles.legendToggleText}>{showLegend ? '✕' : '⬡'}</Text>
      </TouchableOpacity>

      {showLegend && (
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>Zonas — {consorcisFiltrados.length} sedes</Text>
          {ZONAS_CONFIG.map(z => {
            const count = CONSORCIOS.filter(c => c.zona === z.id).length;
            return (
              <TouchableOpacity
                key={z.id}
                style={styles.legendRow}
                onPress={() => setZonaFiltro(zonaFiltro === z.id ? 'TODAS' : z.id)}
              >
                <View style={[styles.legendDot, { backgroundColor: z.color }]} />
                <Text style={styles.legendLabel}>{z.label}</Text>
                <Text style={styles.legendCount}>{count}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── CONTADOR ──────────────────────────────────────────────────────── */}
      <View style={styles.counter}>
        <Text style={styles.counterText}>
          {consorcisFiltrados.length} consorcio{consorcisFiltrados.length !== 1 ? 's' : ''} visibles
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  filterBar: { position: 'absolute', top: 8, left: 0, right: 0, maxHeight: 46 },
  filterContent: { paddingHorizontal: 10, gap: 6, flexDirection: 'row', alignItems: 'center' },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: 'rgba(20,24,36,0.85)', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  filterBtnActive: { backgroundColor: '#1B4F72', borderColor: '#2e7db5' },
  filterLabel: { fontSize: 12, color: '#9aa5bb', fontWeight: '600' },
  filterLabelActive: { color: '#fff' },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },

  legendToggle: {
    position: 'absolute', bottom: 90, right: 12,
    backgroundColor: '#1e2436', borderRadius: 22, width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center', elevation: 4,
    borderWidth: 1, borderColor: '#2a3045',
  },
  legendToggleText: { color: '#e0e6f0', fontSize: 16 },
  legend: {
    position: 'absolute', bottom: 136, right: 12,
    backgroundColor: '#1e2436', borderRadius: 12, padding: 12,
    minWidth: 170, elevation: 5, borderWidth: 1, borderColor: '#2a3045',
  },
  legendTitle: { fontSize: 11, fontWeight: '700', color: '#e0e6f0', marginBottom: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendLabel: { flex: 1, fontSize: 12, color: '#b0bdd0' },
  legendCount: { fontSize: 12, color: '#7a8aaa', fontWeight: '600' },

  counter: {
    position: 'absolute', bottom: 12, left: 12,
    backgroundColor: 'rgba(20,24,36,0.85)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#2a3045',
  },
  counterText: { color: '#e0e6f0', fontSize: 12, fontWeight: '600' },
});
