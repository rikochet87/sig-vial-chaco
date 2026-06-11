import { useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { GEO_BUNDLE } from '@/constants/geoBundle';

const { width, height } = Dimensions.get('window');

const ZONA_COLORS: Record<string, string> = {
  ZI: '#6baed6', ZII: '#fb6a4a', ZIII: '#fdd44c', ZIV: '#74c476', ZV: '#9e9ac8',
};
const ZONA_LABELS: Record<string, string> = {
  ZI: 'Zona I', ZII: 'Zona II', ZIII: 'Zona III', ZIV: 'Zona IV', ZV: 'Zona V',
};
const RUTAS_COLORS: Record<string, string> = {
  RN11: '#e74c3c', RN16: '#c0392b', RN89: '#e67e22', RN95: '#d35400',
};
const ZONAS_LIST = ['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV'];

// ── Serializar una vez, fuera del render ─────────────────────────────────────
const SEDES_JSON = JSON.stringify(GEO_BUNDLE.sedes);
const LIMITES_ZONAS_JSON = JSON.stringify(GEO_BUNDLE.limites_zonas);
const LIMITE_PROV_JSON = JSON.stringify(GEO_BUNDLE.limite_provincial);
const DEPTOS_JSON = JSON.stringify(GEO_BUNDLE.departamentos);
const RUTAS_JSON = JSON.stringify(GEO_BUNDLE.rutas);
const CAMPAMENTOS_JSON = JSON.stringify(GEO_BUNDLE.campamentos);
const SALUD_JSON = JSON.stringify(GEO_BUNDLE.salud);

// ── Tipos de capas ───────────────────────────────────────────────────────────
type Layers = {
  zonaBoundaries: boolean;
  limiteProv: boolean;
  departamentos: boolean;
  rutasNacionales: boolean;
  campamentos: boolean;
  salud: boolean;
};

// ── HTML con Leaflet embebido ────────────────────────────────────────────────
function buildMapHtml(filtroZona: string, layers: Layers): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body,#map { width:100%; height:100vh; }
.custom-marker {
  width:26px; height:26px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  border:2px solid #fff; font-size:9px; font-weight:800; color:#fff;
  box-shadow:0 1px 4px rgba(0,0,0,0.5);
}
.leaflet-popup-content-wrapper {
  background:#1e2436; border:1px solid #2a3045;
  border-radius:10px; padding:0; overflow:hidden;
  box-shadow:0 4px 12px rgba(0,0,0,0.5);
}
.leaflet-popup-tip { background:#1e2436; }
.leaflet-popup-content { margin:0; width:260px !important; }
.popup-header { padding:10px; display:flex; align-items:center; gap:8px; }
.popup-num {
  width:34px; height:34px; border-radius:50%; background:rgba(0,0,0,0.25);
  display:flex; align-items:center; justify-content:center;
  font-size:14px; font-weight:800; color:#fff; flex-shrink:0;
}
.popup-localidad { color:#fff; font-size:12px; font-weight:700; line-height:1.3; }
.popup-zona { color:rgba(255,255,255,0.8); font-size:10px; margin-top:2px; }
.popup-body { padding:10px; }
.popup-section { font-size:10px; color:#7a8aaa; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px; }
.popup-row { display:flex; padding:2px 0; }
.popup-label { font-size:11px; color:#7a8aaa; width:100px; }
.popup-val { font-size:11px; color:#e0e6f0; font-weight:600; flex:1; }
.km-grid { display:flex; gap:4px; margin-top:8px; }
.km-cell { flex:1; background:#252d40; border-radius:5px; padding:5px; text-align:center; }
.km-val { font-size:11px; font-weight:800; }
.km-label { font-size:9px; color:#7a8aaa; margin-top:1px; }
.poi-popup { background:#1e2436; border:1px solid #2a3045; border-radius:8px; padding:8px 10px; }
.poi-name { color:#e0e6f0; font-size:12px; font-weight:700; }
.poi-type { color:#7a8aaa; font-size:10px; margin-top:2px; }
</style>
</head>
<body>
<div id="map"></div>
<script>
const SEDES = ${SEDES_JSON};
const LIMITES_ZONAS = ${LIMITES_ZONAS_JSON};
const LIMITE_PROV = ${LIMITE_PROV_JSON};
const DEPTOS = ${DEPTOS_JSON};
const RUTAS = ${RUTAS_JSON};
const CAMPAMENTOS = ${CAMPAMENTOS_JSON};
const SALUD = ${SALUD_JSON};
const ZONA_COLORS = ${JSON.stringify(ZONA_COLORS)};
const RUTAS_COLORS = ${JSON.stringify(RUTAS_COLORS)};
const FILTRO = '${filtroZona}';
const LAYERS = ${JSON.stringify(layers)};

const map = L.map('map', { zoomControl:true }).setView([-26.2, -60.5], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:'© OpenStreetMap', maxZoom:18
}).addTo(map);

// ── Límite provincial ─────────────────────────────────────────────────────
if (LAYERS.limiteProv) {
  L.geoJSON(LIMITE_PROV, {
    style:{ color:'#fff', weight:2.5, fillOpacity:0, dashArray:'6 4' }
  }).addTo(map);
}

// ── Departamentos ─────────────────────────────────────────────────────────
if (LAYERS.departamentos) {
  L.geoJSON(DEPTOS, {
    style:{ color:'#8899bb', weight:0.7, fillOpacity:0, dashArray:'3 3' }
  }).addTo(map);
}

// ── Límites de zona ───────────────────────────────────────────────────────
if (LAYERS.zonaBoundaries) {
  Object.entries(LIMITES_ZONAS).forEach(([zona, gj]) => {
    const color = ZONA_COLORS[zona] || '#aaa';
    L.geoJSON(gj, {
      style:{ color, weight:2, fillColor:color, fillOpacity:0.07, dashArray:'4 3' }
    }).bindTooltip(zona, { permanent:false, className:'', direction:'center' }).addTo(map);
  });
}

// ── Rutas Nacionales ──────────────────────────────────────────────────────
if (LAYERS.rutasNacionales) {
  Object.entries(RUTAS).forEach(([ruta, gj]) => {
    const color = RUTAS_COLORS[ruta] || '#e74c3c';
    L.geoJSON(gj, {
      style:{ color, weight:3, opacity:0.85 },
      onEachFeature:(feat, layer) => {
        const p = feat.properties || {};
        const nombre = p.Nombre || p.nombre || ruta;
        layer.bindTooltip(nombre, { direction:'center' });
      }
    }).addTo(map);
  });
}

// ── Campamentos ───────────────────────────────────────────────────────────
if (LAYERS.campamentos) {
  const campIcon = L.divIcon({
    className:'', iconSize:[18,18], iconAnchor:[9,9],
    html:'<div style="width:18px;height:18px;border-radius:3px;background:#f39c12;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:800;box-shadow:0 1px 3px rgba(0,0,0,.5)">⛺</div>'
  });
  L.geoJSON(CAMPAMENTOS, {
    pointToLayer:(feat, latlng) => L.marker(latlng, { icon:campIcon }),
    onEachFeature:(feat, layer) => {
      const p = feat.properties || {};
      const name = p.Nombre || p.nombre || p.name || 'Campamento';
      layer.bindPopup('<div class="poi-popup"><div class="poi-name">' + name + '</div><div class="poi-type">Campamento DVP</div></div>');
    }
  }).addTo(map);
}

// ── Salud ─────────────────────────────────────────────────────────────────
if (LAYERS.salud) {
  const saludIcon = L.divIcon({
    className:'', iconSize:[16,16], iconAnchor:[8,8],
    html:'<div style="width:16px;height:16px;border-radius:50%;background:#e74c3c;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:800;box-shadow:0 1px 3px rgba(0,0,0,.5)">+</div>'
  });
  L.geoJSON(SALUD, {
    pointToLayer:(feat, latlng) => L.marker(latlng, { icon:saludIcon }),
    onEachFeature:(feat, layer) => {
      const p = feat.properties || {};
      const name = p.fna || p.nam || p.name || 'Centro de salud';
      const type = p.gna || '';
      layer.bindPopup('<div class="poi-popup"><div class="poi-name">' + name + '</div><div class="poi-type">' + type + '</div></div>');
    }
  }).addTo(map);
}

// ── Sedes Sociales (consorcios) ───────────────────────────────────────────
const sedesFiltradas = FILTRO === 'TODAS' ? SEDES : SEDES.filter(c => c.zona === FILTRO);

sedesFiltradas.forEach(c => {
  const icon = L.divIcon({
    className:'',
    html:'<div class="custom-marker" style="background:' + c.color + '">' + c.numero + '</div>',
    iconSize:[26,26], iconAnchor:[13,13], popupAnchor:[0,-14],
  });
  const popup =
    '<div>' +
    '<div class="popup-header" style="background:' + c.color + '">' +
      '<div class="popup-num">' + c.numero + '</div>' +
      '<div><div class="popup-localidad">' + (c.nombre||c.numero) + '</div>' +
      '<div class="popup-zona">' + c.zona + ' · Consorcio N° ' + c.numero + '</div></div>' +
    '</div>' +
    '<div class="popup-body">' +
      '<div class="popup-section">Autoridades</div>' +
      '<div class="popup-row"><span class="popup-label">Presidente</span><span class="popup-val">' + (c.presidente||'—') + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Vicepresidente</span><span class="popup-val">' + (c.vicepresidente||'—') + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Secretario</span><span class="popup-val">' + (c.secretario||'—') + '</span></div>' +
      '<div class="popup-row"><span class="popup-label">Tesorero</span><span class="popup-val">' + (c.tesorero||'—') + '</span></div>' +
      '<div class="km-grid">' +
        '<div class="km-cell"><div class="km-val" style="color:' + c.color + '">' + Math.round(c.redKm||0) + ' km</div><div class="km-label">Total</div></div>' +
        '<div class="km-cell"><div class="km-val">' + Math.round(c.redTerciaria||0) + ' km</div><div class="km-label">Terciaria</div></div>' +
        '<div class="km-cell"><div class="km-val" style="color:#27ae60">' + Math.round(c.redSecundaria||0) + ' km</div><div class="km-label">Secundaria</div></div>' +
        '<div class="km-cell"><div class="km-val" style="color:#e67e22">' + Math.round(c.redPrimaria||0) + ' km</div><div class="km-label">Primaria</div></div>' +
      '</div>' +
    '</div></div>';
  L.marker([c.lat, c.lng], { icon }).bindPopup(popup, { maxWidth:270 }).addTo(map);
});
<\/script>
</body>
</html>`;
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function MapaScreen() {
  const [zonaFiltro, setZonaFiltro] = useState('TODAS');
  const [showLegend, setShowLegend] = useState(true);
  const [showLayers, setShowLayers] = useState(false);
  const [layers, setLayers] = useState<Layers>({
    zonaBoundaries: true,
    limiteProv: true,
    departamentos: false,
    rutasNacionales: true,
    campamentos: true,
    salud: false,
  });

  const sedesFiltradas = useMemo(
    () => zonaFiltro === 'TODAS'
      ? GEO_BUNDLE.sedes
      : GEO_BUNDLE.sedes.filter((c: any) => c.zona === zonaFiltro),
    [zonaFiltro]
  );

  const mapHtml = useMemo(
    () => buildMapHtml(zonaFiltro, layers),
    [zonaFiltro, layers]
  );

  const toggleLayer = (key: keyof Layers) =>
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));

  const LAYER_CONFIG: { key: keyof Layers; label: string; color: string }[] = [
    { key: 'limiteProv',      label: 'Límite Provincial', color: '#fff' },
    { key: 'zonaBoundaries',  label: 'Zonas (I–V)',        color: '#74c476' },
    { key: 'departamentos',   label: 'Departamentos',      color: '#8899bb' },
    { key: 'rutasNacionales', label: 'Rutas Nacionales',   color: '#e74c3c' },
    { key: 'campamentos',     label: 'Campamentos DVP',    color: '#f39c12' },
    { key: 'salud',           label: 'Salud',              color: '#e74c3c' },
  ];

  return (
    <View style={styles.container}>
      {/* ── MAPA LEAFLET ─────────────────────────────────────────────────── */}
      <WebView
        style={styles.map}
        source={{ html: mapHtml }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        scrollEnabled={false}
      />

      {/* ── FILTRO DE ZONAS ───────────────────────────────────────────────── */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.filterBar} contentContainerStyle={styles.filterContent}
      >
        <TouchableOpacity
          style={[styles.filterBtn, zonaFiltro === 'TODAS' && styles.filterBtnActive]}
          onPress={() => setZonaFiltro('TODAS')}
        >
          <Text style={[styles.filterLabel, zonaFiltro === 'TODAS' && styles.filterLabelActive]}>
            Todas ({GEO_BUNDLE.sedes.length})
          </Text>
        </TouchableOpacity>
        {ZONAS_LIST.map(zona => {
          const count = GEO_BUNDLE.sedes.filter((c: any) => c.zona === zona).length;
          const active = zonaFiltro === zona;
          const color = ZONA_COLORS[zona];
          return (
            <TouchableOpacity key={zona}
              style={[styles.filterBtn, active && { backgroundColor: color }]}
              onPress={() => setZonaFiltro(zona)}
            >
              <View style={[styles.zoneDot, { backgroundColor: active ? '#fff' : color }]} />
              <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
                {zona} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── PANEL DE CAPAS ────────────────────────────────────────────────── */}
      <TouchableOpacity style={styles.layersToggle} onPress={() => setShowLayers(!showLayers)}>
        <Text style={styles.layersToggleText}>⊞</Text>
      </TouchableOpacity>

      {showLayers && (
        <View style={styles.layersPanel}>
          <Text style={styles.layersPanelTitle}>Capas</Text>
          {LAYER_CONFIG.map(({ key, label, color }) => (
            <TouchableOpacity key={key} style={styles.layerRow} onPress={() => toggleLayer(key)}>
              <View style={[
                styles.layerCheck,
                { borderColor: color, backgroundColor: layers[key] ? color : 'transparent' }
              ]}>
                {layers[key] && <Text style={styles.checkMark}>✓</Text>}
              </View>
              <Text style={[styles.layerLabel, !layers[key] && styles.layerLabelOff]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── LEYENDA ───────────────────────────────────────────────────────── */}
      <TouchableOpacity style={styles.legendToggle} onPress={() => setShowLegend(!showLegend)}>
        <Text style={styles.legendToggleText}>{showLegend ? '✕' : '⬡'}</Text>
      </TouchableOpacity>

      {showLegend && (
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>Zonas — {sedesFiltradas.length} sedes</Text>
          {ZONAS_LIST.map(zona => {
            const count = GEO_BUNDLE.sedes.filter((c: any) => c.zona === zona).length;
            const color = ZONA_COLORS[zona];
            return (
              <TouchableOpacity key={zona} style={styles.legendRow}
                onPress={() => setZonaFiltro(zonaFiltro === zona ? 'TODAS' : zona)}
              >
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendLabel}>{ZONA_LABELS[zona]}</Text>
                <Text style={styles.legendCount}>{count}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── CONTADOR ──────────────────────────────────────────────────────── */}
      <View style={styles.counter}>
        <Text style={styles.counterText}>
          {sedesFiltradas.length} consorcio{sedesFiltradas.length !== 1 ? 's' : ''} visibles
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  filterBar: { position:'absolute', top:8, left:0, right:0, maxHeight:46 },
  filterContent: { paddingHorizontal:10, gap:6, flexDirection:'row', alignItems:'center' },
  filterBtn: {
    flexDirection:'row', alignItems:'center', gap:5,
    paddingHorizontal:10, paddingVertical:7,
    backgroundColor:'rgba(20,24,36,0.85)', borderRadius:20,
    borderWidth:1, borderColor:'rgba(255,255,255,0.15)',
  },
  filterBtnActive: { backgroundColor:'#1B4F72', borderColor:'#2e7db5' },
  filterLabel: { fontSize:12, color:'#9aa5bb', fontWeight:'600' },
  filterLabelActive: { color:'#fff' },
  zoneDot: { width:8, height:8, borderRadius:4 },

  layersToggle: {
    position:'absolute', top:60, right:12,
    backgroundColor:'#1e2436', borderRadius:22, width:40, height:40,
    alignItems:'center', justifyContent:'center', elevation:4,
    borderWidth:1, borderColor:'#2a3045',
  },
  layersToggleText: { color:'#e0e6f0', fontSize:18 },
  layersPanel: {
    position:'absolute', top:106, right:12,
    backgroundColor:'#1e2436', borderRadius:12, padding:12,
    minWidth:180, elevation:5, borderWidth:1, borderColor:'#2a3045',
  },
  layersPanelTitle: { fontSize:11, fontWeight:'700', color:'#e0e6f0', marginBottom:8 },
  layerRow: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:7 },
  layerCheck: {
    width:16, height:16, borderRadius:3, borderWidth:1.5,
    alignItems:'center', justifyContent:'center',
  },
  checkMark: { color:'#fff', fontSize:10, fontWeight:'800', lineHeight:12 },
  layerLabel: { fontSize:12, color:'#b0bdd0' },
  layerLabelOff: { color:'#4a5568' },

  legendToggle: {
    position:'absolute', bottom:90, right:12,
    backgroundColor:'#1e2436', borderRadius:22, width:40, height:40,
    alignItems:'center', justifyContent:'center', elevation:4,
    borderWidth:1, borderColor:'#2a3045',
  },
  legendToggleText: { color:'#e0e6f0', fontSize:16 },
  legend: {
    position:'absolute', bottom:136, right:12,
    backgroundColor:'#1e2436', borderRadius:12, padding:12,
    minWidth:170, elevation:5, borderWidth:1, borderColor:'#2a3045',
  },
  legendTitle: { fontSize:11, fontWeight:'700', color:'#e0e6f0', marginBottom:8 },
  legendRow: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:5 },
  legendDot: { width:12, height:12, borderRadius:6 },
  legendLabel: { flex:1, fontSize:12, color:'#b0bdd0' },
  legendCount: { fontSize:12, color:'#7a8aaa', fontWeight:'600' },

  counter: {
    position:'absolute', bottom:12, left:12,
    backgroundColor:'rgba(20,24,36,0.85)', borderRadius:10,
    paddingHorizontal:12, paddingVertical:6,
    borderWidth:1, borderColor:'#2a3045',
  },
  counterText: { color:'#e0e6f0', fontSize:12, fontWeight:'600' },
});
