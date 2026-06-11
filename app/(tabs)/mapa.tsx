import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Animated, Dimensions, StatusBar, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { GEO_BUNDLE } from '@/constants/geoBundle';

// expo-location: importación condicional para evitar crash si no está instalado aún
let Location: any = null;
try { Location = require('expo-location'); } catch (_) {}

const { width, height } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(width * 0.78, 300);

const ZONA_COLORS: Record<string, string> = {
  ZI: '#6baed6', ZII: '#fb6a4a', ZIII: '#fdd44c', ZIV: '#74c476', ZV: '#9e9ac8',
};
const ZONAS_LIST = ['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV'];

// ── Serializar datos una sola vez ────────────────────────────────────────────
const SEDES_JSON         = JSON.stringify(GEO_BUNDLE.sedes);
const LIMITES_ZONAS_JSON = JSON.stringify(GEO_BUNDLE.limites_zonas);
const LIMITE_PROV_JSON   = JSON.stringify(GEO_BUNDLE.limite_provincial);
const DEPTOS_JSON        = JSON.stringify(GEO_BUNDLE.departamentos);
const RUTAS_JSON         = JSON.stringify(GEO_BUNDLE.rutas);
const CAMPAMENTOS_JSON   = JSON.stringify(GEO_BUNDLE.campamentos);
const SALUD_JSON         = JSON.stringify(GEO_BUNDLE.salud);

type Layers = {
  zonaBoundaries: boolean;
  limiteProv: boolean;
  departamentos: boolean;
  rutasNacionales: boolean;
  campamentos: boolean;
  salud: boolean;
};

// ── HTML Leaflet (mínimo UI, sin controles propios) ──────────────────────────
function buildMapHtml(filtroZona: string, layers: Layers): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100vh;background:#f0ebe3}
.leaflet-control-zoom{display:none}
.custom-marker{
  width:26px;height:26px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  border:2px solid #fff;font-size:9px;font-weight:800;color:#fff;
  box-shadow:0 1px 4px rgba(0,0,0,.5);
}
.leaflet-popup-content-wrapper{
  background:#1e2436;border:1px solid #2a3045;
  border-radius:10px;padding:0;overflow:hidden;
  box-shadow:0 4px 12px rgba(0,0,0,.5);
}
.leaflet-popup-tip{background:#1e2436}
.leaflet-popup-content{margin:0;width:260px!important}
.ph{padding:10px;display:flex;align-items:center;gap:8px}
.pn{width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;flex-shrink:0}
.pl{color:#fff;font-size:12px;font-weight:700;line-height:1.3}
.pz{color:rgba(255,255,255,.8);font-size:10px;margin-top:2px}
.pb{padding:10px}
.ps{font-size:10px;color:#7a8aaa;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.pr{display:flex;padding:2px 0}
.plb{font-size:11px;color:#7a8aaa;width:100px}
.pv{font-size:11px;color:#e0e6f0;font-weight:600;flex:1}
.kg{display:flex;gap:4px;margin-top:8px}
.kc{flex:1;background:#252d40;border-radius:5px;padding:5px;text-align:center}
.kv{font-size:11px;font-weight:800}
.kl{font-size:9px;color:#7a8aaa;margin-top:1px}
.poi-popup{background:#1e2436;border:1px solid #2a3045;border-radius:8px;padding:8px 10px}
.poi-name{color:#e0e6f0;font-size:12px;font-weight:700}
.poi-type{color:#7a8aaa;font-size:10px;margin-top:2px}
</style>
</head>
<body>
<div id="map"></div>
<script>
var SEDES=${SEDES_JSON},LIMITES_ZONAS=${LIMITES_ZONAS_JSON},
    LIMITE_PROV=${LIMITE_PROV_JSON},DEPTOS=${DEPTOS_JSON},
    RUTAS=${RUTAS_JSON},CAMPAMENTOS=${CAMPAMENTOS_JSON},SALUD=${SALUD_JSON},
    ZONA_COLORS=${JSON.stringify(ZONA_COLORS)},
    RUTAS_COLORS={RN11:'#e74c3c',RN16:'#c0392b',RN89:'#e67e22',RN95:'#d35400'},
    FILTRO='${filtroZona}',LAYERS=${JSON.stringify(layers)};

var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([-26.2,-60.5],7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);

// atribución compacta
L.control.attribution({position:'bottomright',prefix:false}).addTo(map);

// ── Límite provincial ─────────────────────────────────────────────
if(LAYERS.limiteProv)
  L.geoJSON(LIMITE_PROV,{style:{color:'#555',weight:2,fillOpacity:0,dashArray:'6 4'}}).addTo(map);

// ── Departamentos ─────────────────────────────────────────────────
if(LAYERS.departamentos)
  L.geoJSON(DEPTOS,{style:{color:'#aaa',weight:0.7,fillOpacity:0,dashArray:'3 3'}}).addTo(map);

// ── Zonas ─────────────────────────────────────────────────────────
if(LAYERS.zonaBoundaries)
  Object.entries(LIMITES_ZONAS).forEach(function([zona,gj]){
    var c=ZONA_COLORS[zona]||'#aaa';
    L.geoJSON(gj,{style:{color:c,weight:1.8,fillColor:c,fillOpacity:0.06,dashArray:'4 3'}}).addTo(map);
  });

// ── Rutas Nacionales ──────────────────────────────────────────────
if(LAYERS.rutasNacionales)
  Object.entries(RUTAS).forEach(function([ruta,gj]){
    var c=RUTAS_COLORS[ruta]||'#e74c3c';
    L.geoJSON(gj,{
      style:{color:c,weight:3.5,opacity:.9},
      onEachFeature:function(f,l){
        var n=(f.properties||{}).Nombre||(f.properties||{}).nombre||ruta;
        l.bindTooltip(n,{direction:'center',className:''});
      }
    }).addTo(map);
  });

// ── Campamentos ───────────────────────────────────────────────────
if(LAYERS.campamentos){
  var campIcon=L.divIcon({className:'',iconSize:[22,22],iconAnchor:[11,11],
    html:'<div style="width:22px;height:22px;border-radius:4px;background:#f39c12;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;box-shadow:0 1px 3px rgba(0,0,0,.5)">⛺<\/div>'});
  L.geoJSON(CAMPAMENTOS,{
    pointToLayer:function(f,ll){return L.marker(ll,{icon:campIcon})},
    onEachFeature:function(f,l){
      var p=f.properties||{},n=p.Nombre||p.nombre||p.name||'Campamento';
      l.bindPopup('<div class="poi-popup"><div class="poi-name">'+n+'<\/div><div class="poi-type">Campamento DVP<\/div><\/div>');
    }
  }).addTo(map);
}

// ── Salud ─────────────────────────────────────────────────────────
if(LAYERS.salud){
  var saludIcon=L.divIcon({className:'',iconSize:[18,18],iconAnchor:[9,9],
    html:'<div style="width:18px;height:18px;border-radius:50%;background:#e74c3c;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,.5)">+<\/div>'});
  L.geoJSON(SALUD,{
    pointToLayer:function(f,ll){return L.marker(ll,{icon:saludIcon})},
    onEachFeature:function(f,l){
      var p=f.properties||{},n=p.fna||p.nam||p.name||'Salud',t=p.gna||'';
      l.bindPopup('<div class="poi-popup"><div class="poi-name">'+n+'<\/div><div class="poi-type">'+t+'<\/div><\/div>');
    }
  }).addTo(map);
}

// ── Sedes Sociales ────────────────────────────────────────────────
var sedesFiltradas=FILTRO==='TODAS'?SEDES:SEDES.filter(function(c){return c.zona===FILTRO});
sedesFiltradas.forEach(function(c){
  var icon=L.divIcon({className:'',
    html:'<div class="custom-marker" style="background:'+c.color+'">'+c.numero+'<\/div>',
    iconSize:[26,26],iconAnchor:[13,13],popupAnchor:[0,-14]});
  var popup=
    '<div><div class="ph" style="background:'+c.color+'">'
    +'<div class="pn">'+c.numero+'<\/div>'
    +'<div><div class="pl">'+(c.nombre||c.numero)+'<\/div>'
    +'<div class="pz">'+c.zona+' · Consorcio N° '+c.numero+'<\/div><\/div><\/div>'
    +'<div class="pb"><div class="ps">Autoridades<\/div>'
    +'<div class="pr"><span class="plb">Presidente<\/span><span class="pv">'+(c.presidente||'—')+'<\/span><\/div>'
    +'<div class="pr"><span class="plb">Vicepresidente<\/span><span class="pv">'+(c.vicepresidente||'—')+'<\/span><\/div>'
    +'<div class="pr"><span class="plb">Secretario<\/span><span class="pv">'+(c.secretario||'—')+'<\/span><\/div>'
    +'<div class="pr"><span class="plb">Tesorero<\/span><span class="pv">'+(c.tesorero||'—')+'<\/span><\/div>'
    +'<div class="kg">'
    +'<div class="kc"><div class="kv" style="color:'+c.color+'">'+Math.round(c.redKm||0)+' km<\/div><div class="kl">Total<\/div><\/div>'
    +'<div class="kc"><div class="kv">'+Math.round(c.redTerciaria||0)+' km<\/div><div class="kl">Terciaria<\/div><\/div>'
    +'<div class="kc"><div class="kv" style="color:#27ae60">'+Math.round(c.redSecundaria||0)+' km<\/div><div class="kl">Secundaria<\/div><\/div>'
    +'<div class="kc"><div class="kv" style="color:#e67e22">'+Math.round(c.redPrimaria||0)+' km<\/div><div class="kl">Primaria<\/div><\/div>'
    +'<\/div><\/div><\/div>';
  L.marker([c.lat,c.lng],{icon:icon}).bindPopup(popup,{maxWidth:270}).addTo(map);
});

// ── GPS: ubicación del usuario ────────────────────────────────────
var userMarker=null,userCircle=null;
function updateUserLocation(lat,lng,acc){
  if(userMarker){map.removeLayer(userMarker);map.removeLayer(userCircle);}
  userCircle=L.circle([lat,lng],{radius:acc||20,fillColor:'#4285f4',fillOpacity:.15,color:'#4285f4',weight:1}).addTo(map);
  userMarker=L.circleMarker([lat,lng],{radius:8,fillColor:'#4285f4',color:'#fff',fillOpacity:1,weight:2.5}).addTo(map);
  map.setView([lat,lng],Math.max(map.getZoom(),14));
}
<\/script>
</body>
</html>`;
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function MapaScreen() {
  const webviewRef = useRef<WebView>(null);
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [zonaFiltro, setZonaFiltro] = useState('TODAS');
  const [tracking, setTracking] = useState(false);
  const locationSub = useRef<any>(null);

  const [layers, setLayers] = useState<Layers>({
    zonaBoundaries: true,
    limiteProv: true,
    departamentos: false,
    rutasNacionales: true,
    campamentos: true,
    salud: false,
  });

  const mapHtml = useMemo(
    () => buildMapHtml(zonaFiltro, layers),
    [zonaFiltro, layers]
  );

  // ── Drawer ────────────────────────────────────────────────────────────────
  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
    Animated.parallel([
      Animated.spring(drawerAnim, { toValue: 0, useNativeDriver: true, bounciness: 0 }),
      Animated.timing(overlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, []);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.spring(drawerAnim, { toValue: -DRAWER_WIDTH, useNativeDriver: true, bounciness: 0 }),
      Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setDrawerOpen(false));
  }, []);

  const toggleLayer = useCallback((key: keyof Layers) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ── GPS ───────────────────────────────────────────────────────────────────
  const toggleGPS = useCallback(async () => {
    if (!Location) {
      // expo-location no instalado aún
      return;
    }
    if (tracking) {
      locationSub.current?.remove?.();
      setTracking(false);
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    setTracking(true);
    locationSub.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 3000,
        distanceInterval: 5,
      },
      (loc: any) => {
        const { latitude, longitude, accuracy } = loc.coords;
        webviewRef.current?.injectJavaScript(
          `updateUserLocation(${latitude}, ${longitude}, ${accuracy ?? 20}); true;`
        );
      }
    );
  }, [tracking]);

  useEffect(() => {
    return () => { locationSub.current?.remove?.(); };
  }, []);

  // ── Sedes filtradas (para contador) ──────────────────────────────────────
  const sedesCount = useMemo(
    () => zonaFiltro === 'TODAS'
      ? GEO_BUNDLE.sedes.length
      : GEO_BUNDLE.sedes.filter((c: any) => c.zona === zonaFiltro).length,
    [zonaFiltro]
  );

  const LAYER_CONFIG: { key: keyof Layers; label: string; icon: string }[] = [
    { key: 'limiteProv',      label: 'Límite Provincial',  icon: '⬜' },
    { key: 'zonaBoundaries',  label: 'Límites de Zona',    icon: '🗺' },
    { key: 'departamentos',   label: 'Departamentos',      icon: '▦' },
    { key: 'rutasNacionales', label: 'Rutas Nacionales',   icon: '🛣' },
    { key: 'campamentos',     label: 'Campamentos DVP',    icon: '⛺' },
    { key: 'salud',           label: 'Establecimientos de Salud', icon: '🏥' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* ── MAPA COMPLETO ─────────────────────────────────────────────────── */}
      <WebView
        ref={webviewRef}
        style={StyleSheet.absoluteFill}
        source={{ html: mapHtml }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        scrollEnabled={false}
        overScrollMode="never"
      />

      {/* ── OVERLAY del drawer ────────────────────────────────────────────── */}
      {drawerOpen && (
        <Animated.View
          style={[styles.overlay, { opacity: overlayAnim }]}
          pointerEvents="auto"
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeDrawer} activeOpacity={1} />
        </Animated.View>
      )}

      {/* ── DRAWER IZQUIERDO ──────────────────────────────────────────────── */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX: drawerAnim }] }]}>
        {/* Header */}
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>SIG Vial Chaco</Text>
          <TouchableOpacity onPress={closeDrawer} style={styles.drawerClose}>
            <Text style={styles.drawerCloseText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.drawerScroll} showsVerticalScrollIndicator={false}>
          {/* ── Filtro zona ─────────────────────────────────────────────── */}
          <Text style={styles.drawerSection}>Sedes — {sedesCount} visibles</Text>
          <TouchableOpacity
            style={[styles.zonaBtn, zonaFiltro === 'TODAS' && styles.zonaBtnActive]}
            onPress={() => setZonaFiltro('TODAS')}
          >
            <Text style={[styles.zonaBtnText, zonaFiltro === 'TODAS' && styles.zonaBtnTextActive]}>
              Todas las zonas ({GEO_BUNDLE.sedes.length})
            </Text>
          </TouchableOpacity>
          {ZONAS_LIST.map(zona => {
            const count = GEO_BUNDLE.sedes.filter((c: any) => c.zona === zona).length;
            const active = zonaFiltro === zona;
            const color = ZONA_COLORS[zona];
            return (
              <TouchableOpacity
                key={zona}
                style={[styles.zonaBtn, active && { backgroundColor: color + '22', borderColor: color }]}
                onPress={() => setZonaFiltro(zona)}
              >
                <View style={[styles.zonaDot, { backgroundColor: color }]} />
                <Text style={[styles.zonaBtnText, active && { color: '#fff' }]}>
                  {zona} — {count} consorcios
                </Text>
                {active && <Text style={styles.checkIcon}>✓</Text>}
              </TouchableOpacity>
            );
          })}

          {/* ── Capas ───────────────────────────────────────────────────── */}
          <Text style={[styles.drawerSection, { marginTop: 20 }]}>Capas</Text>
          {LAYER_CONFIG.map(({ key, label, icon }) => (
            <TouchableOpacity key={key} style={styles.layerRow} onPress={() => toggleLayer(key)}>
              <View style={[styles.layerCheck, layers[key] && styles.layerCheckOn]}>
                {layers[key] && <Text style={styles.layerCheckMark}>✓</Text>}
              </View>
              <Text style={styles.layerIcon}>{icon}</Text>
              <Text style={[styles.layerLabel, !layers[key] && styles.layerLabelOff]}>{label}</Text>
            </TouchableOpacity>
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>
      </Animated.View>

      {/* ── BOTÓN HAMBURGER (top-left) ────────────────────────────────────── */}
      <TouchableOpacity style={styles.btnHamburger} onPress={openDrawer}>
        <View style={styles.hamburgerLine} />
        <View style={styles.hamburgerLine} />
        <View style={styles.hamburgerLine} />
      </TouchableOpacity>

      {/* ── BOTÓN GPS (bottom-right) ──────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.btnGps, tracking && styles.btnGpsActive]}
        onPress={toggleGPS}
      >
        <Text style={styles.btnGpsIcon}>{tracking ? '📍' : '◎'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0ebe3' },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 10,
  },

  drawer: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#1a1f2e',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 20,
  },
  drawerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#2a3045',
    backgroundColor: '#151a27',
  },
  drawerTitle: { fontSize: 17, fontWeight: '800', color: '#e0e6f0', letterSpacing: 0.3 },
  drawerClose: { padding: 4 },
  drawerCloseText: { color: '#7a8aaa', fontSize: 16 },
  drawerScroll: { flex: 1, paddingHorizontal: 14 },
  drawerSection: {
    fontSize: 10, fontWeight: '700', color: '#5a6a88',
    textTransform: 'uppercase', letterSpacing: 1,
    marginTop: 18, marginBottom: 8,
  },

  zonaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 8, marginBottom: 5,
    backgroundColor: '#232b3e',
    borderWidth: 1, borderColor: 'transparent',
  },
  zonaBtnActive: { backgroundColor: '#1B4F72', borderColor: '#2e7db5' },
  zonaBtnText: { flex: 1, fontSize: 13, color: '#8a9ab8', fontWeight: '500' },
  zonaBtnTextActive: { color: '#fff' },
  zonaDot: { width: 10, height: 10, borderRadius: 5 },
  checkIcon: { color: '#fff', fontSize: 12, fontWeight: '800' },

  layerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#1f2738',
  },
  layerCheck: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 1.5, borderColor: '#3a4a65',
    alignItems: 'center', justifyContent: 'center',
  },
  layerCheckOn: { backgroundColor: '#2e7db5', borderColor: '#2e7db5' },
  layerCheckMark: { color: '#fff', fontSize: 11, fontWeight: '800', lineHeight: 14 },
  layerIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  layerLabel: { flex: 1, fontSize: 13, color: '#c0cce0' },
  layerLabelOff: { color: '#4a5568' },

  btnHamburger: {
    position: 'absolute', top: 44, left: 14,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#1a1f2e',
    alignItems: 'center', justifyContent: 'center', gap: 4,
    elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35, shadowRadius: 6,
    zIndex: 5,
  },
  hamburgerLine: {
    width: 20, height: 2.5, backgroundColor: '#e0e6f0', borderRadius: 2,
  },

  btnGps: {
    position: 'absolute', bottom: 44, right: 16,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#1a1f2e',
    alignItems: 'center', justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35, shadowRadius: 6,
    zIndex: 5,
  },
  btnGpsActive: { backgroundColor: '#1B4F72' },
  btnGpsIcon: { fontSize: 22 },
});
