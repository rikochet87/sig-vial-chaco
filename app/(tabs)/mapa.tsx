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
  basemap: boolean;
  zonaBoundaries: boolean;
  limiteProv: boolean;
  departamentos: boolean;
  rutasNacionales: boolean;
  campamentos: boolean;
  salud: boolean;
};

type SedesZonas = Record<string, boolean>;

// ── HTML Leaflet (mínimo UI, sin controles propios) ──────────────────────────
function buildMapHtml(sedesZonas: SedesZonas, layers: Layers): string {
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
.dark-popup .leaflet-popup-content-wrapper{background:#1e2436;border:1px solid #2a3045;border-radius:8px;padding:0;box-shadow:0 4px 12px rgba(0,0,0,.5)}
.dark-popup .leaflet-popup-tip{background:#1e2436}
.dark-popup .leaflet-popup-content{margin:0}
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
    SEDES_ZONAS=${JSON.stringify(sedesZonas)},LAYERS=${JSON.stringify(layers)};

var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([-26.2,-60.5],7);
var baseTile=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19});
if(LAYERS.basemap) baseTile.addTo(map);

// atribución compacta
L.control.attribution({position:'bottomright',prefix:false}).addTo(map);

// ── Límite provincial ─────────────────────────────────────────────
if(LAYERS.limiteProv)
  L.geoJSON(LIMITE_PROV,{style:{color:'#555',weight:2,fillOpacity:0,dashArray:'6 4'}}).addTo(map);

// ── Departamentos ─────────────────────────────────────────────────
var DEPTO_COLORS=['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c',
  '#3498db','#9b59b6','#e91e63','#00bcd4','#8bc34a',
  '#ff5722','#607d8b','#795548','#ff9800','#4caf50',
  '#2196f3','#673ab7','#f44336','#009688','#cddc39',
  '#ffc107','#03a9f4','#8d6e63','#78909c','#66bb6a'];
if(LAYERS.departamentos)
  L.geoJSON(DEPTOS,{
    style:function(f,idx){
      var i=DEPTOS.features.indexOf(f);
      var c=DEPTO_COLORS[i%DEPTO_COLORS.length];
      return {color:c,weight:1,fillColor:c,fillOpacity:0.25};
    },
    onEachFeature:function(f,layer){
      var nombre=(f.properties||{}).Departamen||'Departamento';
      layer.bindPopup(
        '<div style="background:#1e2436;border-radius:8px;padding:10px 14px;min-width:140px">'
        +'<div style="font-size:10px;color:#7a8aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Departamento</div>'
        +'<div style="font-size:14px;font-weight:800;color:#e0e6f0">'+nombre+'<\/div>'
        +'<\/div>',
        {className:'dark-popup',closeButton:false}
      );
      layer.on('mouseover',function(){layer.setStyle({fillOpacity:0.28,weight:1.5});});
      layer.on('mouseout',function(){layer.setStyle({fillOpacity:0.12,weight:1});});
    }
  }).addTo(map);

// ── Zonas ─────────────────────────────────────────────────────────
if(LAYERS.zonaBoundaries)
  Object.entries(LIMITES_ZONAS).forEach(function([zona,gj]){
    var c=ZONA_COLORS[zona]||'#aaa';
    L.geoJSON(gj,{
      style:{color:c,weight:2,fillColor:c,fillOpacity:0.07,dashArray:'4 3'},
      onEachFeature:function(f,layer){
        var p=f.properties||{};
        var nombre=p.NOMBRE||p.Nombre||'';
        var zonaLabel=p.ZONA||p.Zona||zona;
        layer.bindPopup(
          '<div style="background:#1e2436;border-radius:8px;padding:10px 14px;min-width:140px">'
          +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
          +'<div style="width:12px;height:12px;border-radius:50%;background:'+c+'"><\/div>'
          +'<div style="font-size:13px;font-weight:800;color:#e0e6f0">'+zonaLabel+'<\/div>'
          +'<\/div>'
          +(nombre?'<div style="font-size:11px;color:#9aaac0">Sede: '+nombre+'<\/div>':'')
          +'<\/div>',
          {className:'dark-popup',closeButton:false}
        );
        layer.on('mouseover',function(){layer.setStyle({fillOpacity:0.22,weight:2.5});});
        layer.on('mouseout',function(){layer.setStyle({fillOpacity:0.07,weight:2});});
      }
    }).addTo(map);
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
var sedesFiltradas=SEDES.filter(function(c){return SEDES_ZONAS[c.zona];});
if(sedesFiltradas.length>0){
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
} // end if LAYERS.sedes

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
  const [sedesZonas, setSedesZonas] = useState<SedesZonas>(
    Object.fromEntries(ZONAS_LIST.map(z => [z, true]))
  );
  const [tracking, setTracking] = useState(false);
  const locationSub = useRef<any>(null);

  const [layers, setLayers] = useState<Layers>({
    basemap: true,
    zonaBoundaries: true,
    limiteProv: true,
    departamentos: false,
    rutasNacionales: true,
    campamentos: true,
    salud: false,
  });

  const mapHtml = useMemo(
    () => buildMapHtml(sedesZonas, layers),
    [sedesZonas, layers]
  );

  const toggleZona = useCallback((zona: string) =>
    setSedesZonas(prev => ({ ...prev, [zona]: !prev[zona] })), []);

  const todasActivas = ZONAS_LIST.every(z => sedesZonas[z]);
  const ningunaActiva = ZONAS_LIST.every(z => !sedesZonas[z]);

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

  const sedesCount = useMemo(
    () => GEO_BUNDLE.sedes.filter((c: any) => sedesZonas[c.zona]).length,
    [sedesZonas]
  );

  const LAYER_CONFIG: { key: keyof Layers; label: string; icon: string }[] = [
    { key: 'basemap',         label: 'Mapa base (OSM)',    icon: '🌍' },
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
          <Text style={styles.drawerTitle}>SIG Vial</Text>
          <TouchableOpacity onPress={closeDrawer} style={styles.drawerClose}>
            <Text style={styles.drawerCloseText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.drawerScroll} showsVerticalScrollIndicator={false}>
          {/* ── Sedes Sociales ──────────────────────────────────────────── */}
          <Text style={styles.drawerSection}>Sedes Sociales — {sedesCount} visibles</Text>
          <View style={styles.sedesActions}>
            <TouchableOpacity
              style={[styles.sedesActionBtn, todasActivas && styles.sedesActionBtnActive]}
              onPress={() => setSedesZonas(Object.fromEntries(ZONAS_LIST.map(z => [z, true])))}
            >
              <Text style={[styles.sedesActionText, todasActivas && styles.sedesActionTextActive]}>Todas</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sedesActionBtn, ningunaActiva && styles.sedesActionBtnActive]}
              onPress={() => setSedesZonas(Object.fromEntries(ZONAS_LIST.map(z => [z, false])))}
            >
              <Text style={[styles.sedesActionText, ningunaActiva && styles.sedesActionTextActive]}>Ninguna</Text>
            </TouchableOpacity>
          </View>
          {ZONAS_LIST.map(zona => {
            const count = GEO_BUNDLE.sedes.filter((c: any) => c.zona === zona).length;
            const active = sedesZonas[zona];
            const color = ZONA_COLORS[zona];
            return (
              <TouchableOpacity key={zona} style={styles.layerRow} onPress={() => toggleZona(zona)}>
                <View style={[styles.layerCheck, active && { backgroundColor: color, borderColor: color }]}>
                  {active && <Text style={styles.layerCheckMark}>✓</Text>}
                </View>
                <View style={[styles.zonaDot, { backgroundColor: color }]} />
                <Text style={[styles.layerLabel, !active && styles.layerLabelOff]}>
                  {zona} — {count} sedes
                </Text>
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

      {/* ── ZOOM (right-center) ───────────────────────────────────────────── */}
      <View style={styles.zoomGroup}>
        <TouchableOpacity style={styles.zoomBtn} onPress={() => webviewRef.current?.injectJavaScript('map.zoomIn(); true;')}>
          <Text style={styles.zoomText}>+</Text>
        </TouchableOpacity>
        <View style={styles.zoomDivider} />
        <TouchableOpacity style={styles.zoomBtn} onPress={() => webviewRef.current?.injectJavaScript('map.zoomOut(); true;')}>
          <Text style={styles.zoomText}>−</Text>
        </TouchableOpacity>
      </View>

      {/* ── BOTÓN GPS (bottom-right) ─────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.btnGps, tracking && styles.btnGpsActive]}
        onPress={toggleGPS}
      >
        <Text style={styles.btnGpsIcon}>{tracking ? '📍' : '🧭'}</Text>
      </TouchableOpacity>

    </View>
  );
}

// ── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // ── Overlay ────────────────────────────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 10,
  },

  // ── Drawer ─────────────────────────────────────────────────────────────────
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: DRAWER_WIDTH,
    height: '100%',
    backgroundColor: '#2C2C2C',
    zIndex: 20,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  drawerHeader: {
    backgroundColor: '#1A1A1A',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 52,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#F5C300',
  },
  drawerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  drawerClose: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerCloseText: {
    color: '#999999',
    fontSize: 18,
    fontWeight: '600',
  },
  drawerScroll: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  drawerSection: {
    color: '#F5C300',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
  },

  // ── Sedes actions ──────────────────────────────────────────────────────────
  sedesActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  sedesActionBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#3C3C3C',
    backgroundColor: '#3A3A3A',
    alignItems: 'center',
  },
  sedesActionBtnActive: {
    backgroundColor: '#F5C300',
    borderColor: '#D4A900',
  },
  sedesActionText: {
    color: '#DDDDDD',
    fontSize: 12,
    fontWeight: '700',
  },
  sedesActionTextActive: {
    color: '#2C2C2C',
  },

  // ── Layer rows ─────────────────────────────────────────────────────────────
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#3C3C3C',
    gap: 10,
  },
  layerCheck: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#555555',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  layerCheckOn: {
    backgroundColor: '#F5C300',
    borderColor: '#D4A900',
  },
  layerCheckMark: {
    color: '#2C2C2C',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
  layerIcon: {
    fontSize: 15,
    width: 22,
    textAlign: 'center',
  },
  layerLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  layerLabelOff: {
    color: '#666666',
  },
  zonaDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // ── Hamburger button ───────────────────────────────────────────────────────
  btnHamburger: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 44,
    left: 12,
    width: 42,
    height: 42,
    backgroundColor: '#2C2C2C',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    zIndex: 5,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#F5C300',
  },
  hamburgerLine: {
    width: 20,
    height: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },

  // ── Zoom group ─────────────────────────────────────────────────────────────
  zoomGroup: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 44,
    right: 12,
    backgroundColor: '#2C2C2C',
    borderRadius: 8,
    overflow: 'hidden',
    zIndex: 5,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#F5C300',
  },
  zoomBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 26,
  },
  zoomDivider: {
    height: 1,
    backgroundColor: '#3C3C3C',
    marginHorizontal: 6,
  },

  // ── GPS button ─────────────────────────────────────────────────────────────
  btnGps: {
    position: 'absolute',
    bottom: 32,
    right: 12,
    width: 50,
    height: 50,
    backgroundColor: '#2C2C2C',
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    borderWidth: 2,
    borderColor: '#444444',
  },
  btnGpsActive: {
    backgroundColor: '#F5C300',
    borderColor: '#D4A900',
  },
  btnGpsIcon: {
    fontSize: 22,
  },
});
