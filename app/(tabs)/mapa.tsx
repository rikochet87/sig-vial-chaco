import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Animated, Dimensions, StatusBar, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { GEO_BUNDLE } from '@/constants/geoBundle';
import { RP_BUNDLE } from '@/constants/geoBundleRP';
import { GEO_BUNDLE_CC } from '@/constants/geoBundleCC';

// expo-location: importación condicional para evitar crash si no está instalado aún
let Location: any = null;
try { Location = require('expo-location'); } catch (_) {}

const { width, height } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(width * 0.78, 300);

const ZONA_COLORS: Record<string, string> = {
  ZI: '#6baed6', ZII: '#fb6a4a', ZIII: '#fdd44c', ZIV: '#74c476', ZV: '#9e9ac8',
};
const ZONAS_LIST = ['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV'];

// ── CC: consorcios por zona (hardcodeado del análisis de archivos GeoJSON) ───
const CC_PER_ZONA: Record<string, number[]> = {
  ZI:   [5, 16, 22, 26, 37, 38, 40, 44, 45, 54, 62, 64, 65, 67, 102],
  ZII:  [7, 9, 12, 13, 15, 24, 25, 29, 30, 36, 41, 43, 46, 47, 51, 52, 53, 61, 68, 69, 74, 77, 84, 105, 109, 110],
  ZIII: [1, 2, 4, 8, 10, 14, 17, 20, 23, 27, 31, 32, 33, 34, 39, 42, 48, 55, 56, 58, 60, 63, 71, 73, 75, 76, 87, 91, 98, 113],
  ZIV:  [3, 18, 21, 49, 50, 59, 72, 78, 79, 80, 81, 83, 85, 86, 88, 89, 90, 95, 100, 101, 103],
  ZV:   [6, 11, 19, 28, 35, 57, 66, 70, 96, 99, 108],
};
const CC_NAMES: Record<number, string> = Object.fromEntries(
  (GEO_BUNDLE.sedes as any[]).map((s: any) => [Number(s.numero), s.nombre || s.localidad || ''])
);
type CCZonaState = { expanded: boolean; allOn: boolean; ccs: Record<number, boolean> };

// ── Serializar datos una sola vez ────────────────────────────────────────────
const SEDES_JSON         = JSON.stringify(GEO_BUNDLE.sedes);
const LIMITES_ZONAS_JSON = JSON.stringify(GEO_BUNDLE.limites_zonas);
const LIMITE_PROV_JSON   = JSON.stringify(GEO_BUNDLE.limite_provincial);
const DEPTOS_JSON        = JSON.stringify(GEO_BUNDLE.departamentos);
const RUTAS_JSON         = JSON.stringify(GEO_BUNDLE.rutas);
const CAMPAMENTOS_JSON   = JSON.stringify(GEO_BUNDLE.campamentos);
const SALUD_JSON         = JSON.stringify(GEO_BUNDLE.salud);
const RP_PAV_JSON = JSON.stringify(RP_BUNDLE.rpPavimentada);
const RP_MEJ_JSON = JSON.stringify(RP_BUNDLE.rpMejorada);
const RP_OBR_JSON = JSON.stringify(RP_BUNDLE.rpEnObra);
const RP_TIE_JSON = JSON.stringify(RP_BUNDLE.rpTierra);

type Layers = {
  basemap: boolean;
  zonaBoundaries: boolean;
  limiteProv: boolean;
  departamentos: boolean;
  rutasNacionales: boolean;
  campamentos: boolean;
  salud: boolean;
  rpPavimentada: boolean;
  rpMejorada: boolean;
  rpEnObra: boolean;
  rpTierra: boolean;
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
.kv{font-size:11px;font-weight:800;color:#e0e6f0}
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
    RP_PAV=${RP_PAV_JSON},RP_MEJ=${RP_MEJ_JSON},RP_OBR=${RP_OBR_JSON},RP_TIE=${RP_TIE_JSON},
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
      style:{color:c,weight:3.5,fillColor:c,fillOpacity:0.10,dashArray:'6 4'},
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
        layer.on('mouseover',function(){layer.setStyle({fillOpacity:0.25,weight:4.5});});
        layer.on('mouseout',function(){layer.setStyle({fillOpacity:0.10,weight:3.5});});
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

// ── Rutas Provinciales ────────────────────────────────────────────────────────
var _rpHL=null, _rpHLStyle=null;
function rpHighlight(layer, baseStyle){
  if(_rpHL){_rpHL.setStyle(_rpHLStyle);}
  _rpHL=layer; _rpHLStyle=baseStyle;
  layer.setStyle({color:'#F5C300',weight:(baseStyle.weight||2)+4,opacity:1,dashArray:null});
  if(layer.bringToFront)layer.bringToFront();
}
function rpReset(){if(_rpHL){_rpHL.setStyle(_rpHLStyle);_rpHL=null;_rpHLStyle=null;}}
// Renderiza capa visual + capa hit invisible ancha para facilitar el toque
function addRPLayer(data, visStyle, categoria){
  var visLayers=[];
  L.geoJSON(data,{style:visStyle,interactive:false,
    onEachFeature:function(f,l){visLayers.push(l);}
  }).addTo(map);
  var hi=0;
  L.geoJSON(data,{
    style:function(){return {color:'#000',weight:22,opacity:0.001};},
    onEachFeature:function(f,l){
      var vi=hi++;
      l.bindPopup(rpPopup(f,categoria),{maxWidth:260,className:'dark-popup',closeButton:true});
      l.on('click',function(){if(visLayers[vi])rpHighlight(visLayers[vi],visStyle);});
      l.on('popupclose',function(){rpReset();});
    }
  }).addTo(map);
}
function rpPopup(f, categoria){
  var p=f.properties||{};
  var num=p.Nombre?'N\u00b0 '+String(parseInt(p.Nombre)||p.Nombre):'—';
  var jer=(p.Jerarq||'').charAt(0)+(p.Jerarq||'').slice(1).toLowerCase();
  var zona=p.Zona?'Zona '+p.Zona:'—';
  var cc=p.CC?(' N\u00b0 '+String(parseInt(p.CC)||p.CC)):'';  var mant=p.Mantenim==='DVP'?'Dir. de Vialidad Provincial':p.Mantenim==='CC'?('Consorcio Caminero'+cc):p.Mantenim||'—';
  var mat=p.Mat_Calzad?p.Mat_Calzad.charAt(0)+p.Mat_Calzad.slice(1).toLowerCase():'—';
  var catColors={pav:'#e74c3c',mej:'#27ae60',obra:'#e74c3c',tie:'#e67e22'};
  var col=catColors[categoria]||'#7a8aaa';
  return '<div style="background:#1e2436;border-radius:10px;overflow:hidden;font-family:sans-serif;min-width:200px;max-width:240px">'
    +'<div style="background:'+col+';padding:10px 14px">'
    +'<div style="font-size:11px;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1px">Ruta Provincial</div>'
    +'<div style="font-size:20px;font-weight:900;color:#fff;margin-top:2px">'+num+'<\/div>'
    +'<\/div>'
    +'<div style="padding:10px 14px">'
    +'<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #2a3045">'
    +'<span style="font-size:10px;color:#7a8aaa;width:80px">Zona<\/span>'
    +'<span style="font-size:12px;color:#e0e6f0;font-weight:600">'+zona+'<\/span>'
    +'<\/div>'
    +'<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #2a3045">'
    +'<span style="font-size:10px;color:#7a8aaa;width:80px">Jerarqu\u00eda<\/span>'
    +'<span style="font-size:12px;color:#e0e6f0;font-weight:600">'+jer+'<\/span>'
    +'<\/div>'
    +'<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #2a3045">'
    +'<span style="font-size:10px;color:#7a8aaa;width:80px">Superficie<\/span>'
    +'<span style="font-size:12px;color:#e0e6f0;font-weight:600">'+mat+'<\/span>'
    +'<\/div>'
    +'<div style="display:flex;align-items:center;gap:8px;padding:5px 0">'
    +'<span style="font-size:10px;color:#7a8aaa;width:80px">Mantenimiento<\/span>'
    +'<span style="font-size:12px;color:#e0e6f0;font-weight:600">'+mant+'<\/span>'
    +'<\/div>'
    +'<\/div><\/div>';
}
if(LAYERS.rpTierra) addRPLayer(RP_TIE,{color:'#e67e22',weight:2,opacity:0.8},'tie');
if(LAYERS.rpPavimentada) addRPLayer(RP_PAV,{color:'#e74c3c',weight:3,opacity:0.9},'pav');
if(LAYERS.rpMejorada) addRPLayer(RP_MEJ,{color:'#27ae60',weight:2.5,opacity:0.9},'mej');
if(LAYERS.rpEnObra) addRPLayer(RP_OBR,{color:'#e74c3c',weight:3,opacity:0.9,dashArray:'10 6'},'obra');

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
var SEDES_MAP={};
if(sedesFiltradas.length>0){
sedesFiltradas.forEach(function(c){
  SEDES_MAP[c.numero]={lat:c.lat,lng:c.lng,nombre:c.nombre||('CC N° '+c.numero)};
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
    +'<\/div>'
    +'<button onclick="calcRoute(SEDES_MAP['+c.numero+'].lat,SEDES_MAP['+c.numero+'].lng,SEDES_MAP['+c.numero+'].nombre)" style="margin-top:10px;width:100%;background:linear-gradient(135deg,#1a5fc4,#0e3d8a);border:none;color:#fff;padding:9px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:.3px">🛤 Ruta por Red CC<\/button>'
    +'<\/div><\/div>';
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

// ── Red bajo convenio CC (inyección por consorcio individual) ─────
var CC_DATA_CC={};
var CC_LAYERS_CC={};
var CC_COLORS={ZI:'#6baed6',ZII:'#fb6a4a',ZIII:'#fdd44c',ZIV:'#74c476',ZV:'#9e9ac8'};
var JERARQ_COLOR={PRIMARIA:'#c0392b',SECUNDARIA:'#2980b9',TERCIARIA:'#7f8c8d'};
var routeGraph=null,routeLayer=null;

function addCCData(cc,zona,gj){
  if(CC_LAYERS_CC[cc])return;
  CC_DATA_CC[cc]=gj;
  routeGraph=null;
  var zColor=CC_COLORS[zona]||'#999';
  CC_LAYERS_CC[cc]=L.geoJSON(gj,{
    style:function(f){
      var j=(f.properties&&f.properties.J)||'TERCIARIA';
      var c=JERARQ_COLOR[j]||zColor;
      var w=j==='PRIMARIA'?2.5:j==='SECUNDARIA'?1.8:1.2;
      return{color:c,weight:w,opacity:0.85};
    },
    onEachFeature:function(f,layer){
      var p=f.properties||{};
      var num=parseInt(p.CC,10)||p.CC||'—';
      var j=p.J||'—';
      var m=p.M||'—';
      var n=p.N?'Ruta '+p.N:'';
      layer.bindPopup(
        '<div style="background:#1e2436;border-radius:8px;padding:10px 14px;min-width:160px">'
        +'<div style="font-size:10px;color:#7a8aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Red bajo convenio<\/div>'
        +'<div style="font-size:13px;font-weight:800;color:#e0e6f0;margin-bottom:4px">CC N° '+num+'<\/div>'
        +(n?'<div style="font-size:11px;color:#9aaac0">'+n+'<\/div>':'')
        +'<div style="font-size:11px;color:#9aaac0">'+j+' · '+m+'<\/div>'
        +'<\/div>',
        {className:'dark-popup',closeButton:false}
      );
    }
  });
}
function showCCNum(cc){if(CC_LAYERS_CC[cc])CC_LAYERS_CC[cc].addTo(map);}
function hideCCNum(cc){if(CC_LAYERS_CC[cc])map.removeLayer(CC_LAYERS_CC[cc]);}
function removeCCAll(){
  Object.keys(CC_LAYERS_CC).forEach(function(cc){map.removeLayer(CC_LAYERS_CC[Number(cc)]);});
  CC_LAYERS_CC={};CC_DATA_CC={};
  routeGraph=null;clearRoute();
}

// ── Routing Dijkstra sobre Red CC ─────────────────────────────────
function haversineM(lat1,lon1,lat2,lon2){
  var R=6371000;
  var p1=lat1*Math.PI/180,p2=lat2*Math.PI/180;
  var dp=(lat2-lat1)*Math.PI/180,dl=(lon2-lon1)*Math.PI/180;
  var a=Math.sin(dp/2)*Math.sin(dp/2)+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)*Math.sin(dl/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function MinHeap(){this.h=[];}
MinHeap.prototype.push=function(item){
  this.h.push(item);
  var i=this.h.length-1;
  while(i>0){var p=Math.floor((i-1)/2);if(this.h[p][0]<=this.h[i][0])break;var t=this.h[p];this.h[p]=this.h[i];this.h[i]=t;i=p;}
};
MinHeap.prototype.pop=function(){
  var top=this.h[0],last=this.h.pop();
  if(this.h.length>0){this.h[0]=last;var i=0,n=this.h.length;
    while(true){var l=2*i+1,r=2*i+2,m=i;
      if(l<n&&this.h[l][0]<this.h[m][0])m=l;
      if(r<n&&this.h[r][0]<this.h[m][0])m=r;
      if(m===i)break;var t=this.h[m];this.h[m]=this.h[i];this.h[i]=t;i=m;}}
  return top;
};
MinHeap.prototype.size=function(){return this.h.length;};

var routeNodes=[];

function buildRouteGraph(){
  routeGraph={};
  routeNodes=[];
  var nodeMap={},nId=0;
  function snap(c){return c[0].toFixed(4)+','+c[1].toFixed(4);}
  function getNode(c){
    var k=snap(c);
    if(nodeMap[k]===undefined){nodeMap[k]=nId;routeNodes.push([c[1],c[0]]);routeGraph[nId]=[];nId++;}
    return nodeMap[k];
  }
  Object.values(CC_DATA_CC).forEach(function(gj){
    (gj.features||[]).forEach(function(f){
      var geom=f.geometry;
      var lines=geom.type==='MultiLineString'?geom.coordinates:[geom.coordinates];
      lines.forEach(function(line){
        for(var i=0;i<line.length-1;i++){
          var a=line[i],b=line[i+1];
          var na=getNode(a),nb=getNode(b);
          if(na===nb)continue;
          var d=haversineM(a[1],a[0],b[1],b[0]);
          routeGraph[na].push({id:nb,dist:d,a:a,b:b});
          routeGraph[nb].push({id:na,dist:d,a:b,b:a});
        }
      });
    });
  });
}

function findNearestNode(lat,lng){
  var best=0,bestDist=Infinity;
  for(var i=0;i<routeNodes.length;i++){
    var n=routeNodes[i];
    var d=haversineM(lat,lng,n[0],n[1]);
    if(d<bestDist){bestDist=d;best=i;}
  }
  return {id:best,dist:bestDist};
}

function dijkstra(startId,endId){
  var INF=Infinity;
  var n=routeNodes.length;
  var dist=new Array(n).fill(INF);
  var prev=new Array(n).fill(-1);
  var prevEdge=new Array(n).fill(null);
  dist[startId]=0;
  var pq=new MinHeap();
  pq.push([0,startId]);
  while(pq.size()>0){
    var top=pq.pop(),d=top[0],u=top[1];
    if(u===endId)break;
    if(d>dist[u])continue;
    var nb=routeGraph[u]||[];
    for(var i=0;i<nb.length;i++){
      var e=nb[i],nd=d+e.dist;
      if(nd<dist[e.id]){dist[e.id]=nd;prev[e.id]=u;prevEdge[e.id]=[e.a,e.b];pq.push([nd,e.id]);}
    }
  }
  if(dist[endId]===INF)return null;
  var segs=[];
  var cur=endId;
  while(cur!==startId&&cur!==-1){
    var edge=prevEdge[cur];
    if(edge)segs.unshift([[edge[0][1],edge[0][0]],[edge[1][1],edge[1][0]]]);
    cur=prev[cur];
  }
  return{segs:segs,distM:dist[endId]};
}

function clearRoute(){
  if(routeLayer){map.removeLayer(routeLayer);routeLayer=null;}
}

function calcRoute(sedeLat,sedeLng,nombre){
  if(Object.keys(CC_DATA_CC).length===0){
    alert('Activá la capa "Red CC" en el menú de capas primero.');
    return;
  }
  if(!userMarker){
    alert('Activá el GPS (botón ubicación) para conocer tu posición.');
    return;
  }
  var uLL=userMarker.getLatLng();
  if(!routeGraph)buildRouteGraph();
  var startN=findNearestNode(uLL.lat,uLL.lng);
  var endN=findNearestNode(sedeLat,sedeLng);
  clearRoute();
  var result=dijkstra(startN.id,endN.id);
  if(!result||result.segs.length===0){
    routeLayer=L.layerGroup([
      L.polyline([[uLL.lat,uLL.lng],[sedeLat,sedeLng]],{color:'#ff6600',weight:3,dashArray:'10 8',opacity:0.85})
    ]).addTo(map);
    L.popup({closeButton:true,maxWidth:240})
      .setLatLng([sedeLat,sedeLng])
      .setContent('<div style="background:#1e2436;border-radius:8px;padding:10px 14px">'
        +'<div style="color:#ff8c00;font-weight:800;font-size:13px">⚠ Sin ruta CC directa<\/div>'
        +'<div style="color:#9aaac0;font-size:11px;margin-top:4px">La red CC no conecta los puntos.<br>Se muestra línea recta.<\/div>'
        +'<button onclick="clearRoute()" style="margin-top:8px;background:#2a3450;border:none;color:#9aaac0;padding:5px 12px;border-radius:6px;font-size:11px;cursor:pointer">✕ Cerrar<\/button>'
        +'<\/div>')
      .openOn(map);
    return;
  }
  var allLL=[];
  result.segs.forEach(function(s){allLL=allLL.concat(s);});
  routeLayer=L.layerGroup([
    L.polyline(allLL,{color:'#000',weight:7,opacity:0.25}),
    L.polyline(allLL,{color:'#00d4ff',weight:4,opacity:1})
  ]).addTo(map);
  var km=(result.distM/1000).toFixed(1);
  var mins=Math.round(result.distM/1000/40*60);
  L.popup({closeButton:true,maxWidth:260})
    .setLatLng([sedeLat,sedeLng])
    .setContent('<div style="background:#1e2436;border-radius:8px;padding:12px 16px">'
      +'<div style="font-size:10px;color:#7a8aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Ruta por Red CC · '+nombre+'<\/div>'
      +'<div style="font-size:20px;font-weight:900;color:#00d4ff;margin-bottom:2px">'+km+' km<\/div>'
      +'<div style="font-size:12px;color:#9aaac0">≈ '+mins+' min a 40 km/h<\/div>'
      +'<button onclick="clearRoute()" style="margin-top:10px;background:#2a3450;border:none;color:#9aaac0;padding:6px 14px;border-radius:7px;font-size:11px;cursor:pointer">✕ Limpiar ruta<\/button>'
      +'<\/div>')
    .openOn(map);
  try{
    var bounds=L.latLngBounds(allLL);
    map.fitBounds(bounds,{padding:[50,50]});
  }catch(e){}
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
    rpPavimentada: true,
    rpMejorada: true,
    rpEnObra: true,
    rpTierra: false,
  });

  // ── Estado CC por zona/consorcio ────────────────────────────────────────────
  const [ccState, setCCState] = useState<Record<string, CCZonaState>>(() =>
    Object.fromEntries(
      ZONAS_LIST.map(zona => [
        zona,
        { expanded: false, allOn: false, ccs: Object.fromEntries((CC_PER_ZONA[zona] || []).map(n => [n, false])) },
      ])
    )
  );
  const ccLoadedNums = useRef<Set<number>>(new Set());
  const ccDataCache = useRef<Record<number, any>>({});
  const prevCCRef = useRef<Record<string, CCZonaState>>({});

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

  const toggleCCExpand = useCallback((zona: string) => {
    setCCState(prev => ({ ...prev, [zona]: { ...prev[zona], expanded: !prev[zona].expanded } }));
  }, []);

  const toggleCCZone = useCallback((zona: string) => {
    setCCState(prev => {
      const s = prev[zona];
      const newOn = !s.allOn;
      return {
        ...prev,
        [zona]: { ...s, allOn: newOn, ccs: Object.fromEntries((CC_PER_ZONA[zona] || []).map(n => [n, newOn])) },
      };
    });
  }, []);

  const toggleCCNum = useCallback((zona: string, ccNum: number) => {
    setCCState(prev => {
      const s = prev[zona];
      const newCCs = { ...s.ccs, [ccNum]: !s.ccs[ccNum] };
      const allOn = (CC_PER_ZONA[zona] || []).every(n => newCCs[n]);
      return { ...prev, [zona]: { ...s, ccs: newCCs, allOn } };
    });
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

  // ── Sincronizar ccState con WebView (inyección por CC individual) ────────────
  useEffect(() => {
    const prev = prevCCRef.current;

    const getCCGeoJSON = (zona: string, ccNum: number): any => {
      if (ccDataCache.current[ccNum]) return ccDataCache.current[ccNum];
      const zoneData = (GEO_BUNDLE_CC as any)[zona];
      if (!zoneData?.features) return null;
      const features = zoneData.features.filter((f: any) =>
        parseInt(f.properties?.CC, 10) === ccNum
      );
      if (!features.length) return null;
      const gj = { type: 'FeatureCollection', features };
      ccDataCache.current[ccNum] = gj;
      return gj;
    };

    for (const zona of ZONAS_LIST) {
      const cur = ccState[zona];
      const prevZ = prev[zona];
      for (const n of CC_PER_ZONA[zona] || []) {
        const curOn = !!cur.ccs[n];
        const prevOn = prevZ ? !!prevZ.ccs[n] : false;
        if (curOn === prevOn) continue;

        if (curOn) {
          if (!ccLoadedNums.current.has(n)) {
            // Primera vez: inyectar datos de este CC y mostrarlo
            const gj = getCCGeoJSON(zona, n);
            if (gj) {
              const json = JSON.stringify(gj);
              webviewRef.current?.injectJavaScript(
                `addCCData(${n},${JSON.stringify(zona)},${json}); showCCNum(${n}); true;`
              );
              ccLoadedNums.current.add(n);
            }
          } else {
            webviewRef.current?.injectJavaScript(`showCCNum(${n}); true;`);
          }
        } else {
          webviewRef.current?.injectJavaScript(`hideCCNum(${n}); true;`);
        }
      }
    }
    prevCCRef.current = ccState;
  }, [ccState]);

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

  const RP_LAYER_CONFIG: { key: keyof Layers; label: string; lineColor: string; dashed?: boolean }[] = [
    { key: 'rpPavimentada', label: 'Pavimentada',  lineColor: '#e74c3c' },
    { key: 'rpMejorada',    label: 'Mejorada',      lineColor: '#27ae60' },
    { key: 'rpEnObra',      label: 'En Obra',       lineColor: '#e74c3c', dashed: true },
    { key: 'rpTierra',      label: 'De Tierra',     lineColor: '#e67e22' },
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

          {/* ── Red bajo convenio CC ────────────────────────────────────── */}
          <Text style={[styles.drawerSection, { marginTop: 20 }]}>Red bajo Convenio CC</Text>
          {ZONAS_LIST.map(zona => {
            const st = ccState[zona];
            const ccs = CC_PER_ZONA[zona] || [];
            const activeCount = ccs.filter(n => st.ccs[n]).length;
            const zColor = ZONA_COLORS[zona];
            return (
              <View key={zona}>
                <View style={styles.layerRow}>
                  <TouchableOpacity onPress={() => toggleCCZone(zona)}>
                    <View style={[styles.layerCheck, st.allOn && styles.layerCheckOn]}>
                      {st.allOn && <Text style={styles.layerCheckMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                  <View style={[styles.zonaDot, { backgroundColor: zColor, width: 10, height: 10, borderRadius: 5 }]} />
                  <Text style={[styles.layerLabel, activeCount === 0 && styles.layerLabelOff]}>
                    {zona} · {activeCount}/{ccs.length} CC
                  </Text>
                  <TouchableOpacity onPress={() => toggleCCExpand(zona)} style={{ padding: 6 }}>
                    <Text style={{ color: '#888', fontSize: 11 }}>{st.expanded ? '▼' : '▶'}</Text>
                  </TouchableOpacity>
                </View>
                {st.expanded && ccs.map(ccNum => {
                  const on = !!st.ccs[ccNum];
                  return (
                    <TouchableOpacity
                      key={ccNum}
                      style={[styles.layerRow, { paddingLeft: 34, paddingVertical: 6 }]}
                      onPress={() => toggleCCNum(zona, ccNum)}
                    >
                      <View style={[styles.layerCheck, { width: 16, height: 16, borderRadius: 3 }, on && styles.layerCheckOn]}>
                        {on && <Text style={[styles.layerCheckMark, { fontSize: 10, lineHeight: 12 }]}>✓</Text>}
                      </View>
                      <Text style={[styles.layerLabel, { fontSize: 12 }, !on && styles.layerLabelOff]}>
                        CC {ccNum}
                      </Text>
                      <Text style={{ fontSize: 10, color: '#666', flex: 1 }} numberOfLines={1}>
                        {'  '}{CC_NAMES[ccNum] || ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}

          {/* ── Rutas Provinciales ──────────────────────────────────────── */}
          <Text style={[styles.drawerSection, { marginTop: 20 }]}>Rutas Provinciales</Text>
          {RP_LAYER_CONFIG.map(({ key, label, lineColor, dashed }) => (
            <TouchableOpacity key={key} style={styles.layerRow} onPress={() => toggleLayer(key)}>
              <View style={[styles.layerCheck, layers[key] && styles.layerCheckOn]}>
                {layers[key] && <Text style={styles.layerCheckMark}>✓</Text>}
              </View>
              <View style={[styles.layerLine, { backgroundColor: dashed ? 'transparent' : lineColor,
                borderWidth: dashed ? 1.5 : 0, borderColor: lineColor, borderStyle: dashed ? 'dashed' : 'solid' }]} />
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
  layerLine: {
    width: 22,
    height: 3,
    borderRadius: 1.5,
  },

  // ── Hamburger button ───────────────────────────────────────────────────────
  btnHamburger: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 2 : 38,
    left: 12,
    width: 38,
    height: 38,
    backgroundColor: '#2C2C2C',
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
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
    width: 17,
    height: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },

  // ── Zoom group ─────────────────────────────────────────────────────────────
  zoomGroup: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 2 : 38,
    right: 12,
    backgroundColor: '#2C2C2C',
    borderRadius: 7,
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
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '300',
    lineHeight: 22,
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
