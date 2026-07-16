import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useColors } from '@/context/ThemeContext';
import type { ColorPalette } from '@/constants/Colors';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Animated, useWindowDimensions, StatusBar, Platform, Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { GEO_BUNDLE } from '@/constants/geoBundle';
import { RP_BUNDLE } from '@/constants/geoBundleRP';
import { GEO_BUNDLE_CC } from '@/constants/geoBundleCC';
import { useRelevamientos } from '@/hooks/useRelevamientos';
import RelevamientoModal from '@/components/RelevamientoModal';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Relevamiento } from '@/types/relevamiento';

// expo-location: importación condicional para evitar crash si no está instalado aún
let Location: any = null;
try { Location = require('expo-location'); } catch (_) {}

// expo-sensors: importación condicional para brújula (Magnetometer)
let Magnetometer: any = null;
try { Magnetometer = require('expo-sensors').Magnetometer; } catch (_) {}


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

// ── Tipos para control de visibilidad de relevamientos ───────────────────────
type RelevLayers = {
  all: boolean; Puente: boolean; Alcantarilla: boolean;
  Tubos: boolean; Lineal: boolean; Otro: boolean;
};
const RELEV_TIPOS = ['Puente', 'Alcantarilla', 'Tubos', 'Lineal', 'Otro'] as const;

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
.rn-popup .leaflet-popup-content-wrapper{background:transparent!important;border:none!important;box-shadow:none!important;padding:0!important;min-width:0!important;}
.rn-popup .leaflet-popup-tip-container{display:none!important;}
.rn-popup .leaflet-popup-content{margin:0!important;width:auto!important;}
/* En modo dibujo, los paths interactivos no capturan clicks */
.draw-mode .leaflet-interactive{pointer-events:none!important;}
</style>
</head>
<body>
<div id="map"></div>

<!-- ── Panel de dibujo de tramo Lineal ──────────────────────────────── -->
<div id="draw-ctrl" style="display:none;position:fixed;bottom:110px;left:50%;transform:translateX(-50%);
  background:#1e2436;border-radius:14px;padding:14px 16px;z-index:2000;
  border:1.5px solid #e67e22;box-shadow:0 6px 24px rgba(0,0,0,0.65);min-width:290px;max-width:90vw">
  <div style="color:#e67e22;font-size:11px;font-weight:700;text-align:center;letter-spacing:0.6px;margin-bottom:5px">
    ✏️ MODO DIBUJO — Tocá el mapa para agregar puntos
  </div>
  <div id="draw-count" style="color:#e0e6f0;font-size:18px;font-weight:900;text-align:center;margin-bottom:12px">
    0 puntos
  </div>
  <div style="display:flex;gap:8px">
    <button onclick="undoDrawPoint()" style="flex:1;background:#252d40;border:1px solid #3a4060;color:#e0e6f0;border-radius:9px;padding:10px 4px;font-size:12px;font-weight:600;cursor:pointer">↩ Deshacer</button>
    <button onclick="cancelDraw()" style="flex:1;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.4);color:#e74c3c;border-radius:9px;padding:10px 4px;font-size:12px;font-weight:600;cursor:pointer">✗ Cancelar</button>
    <button onclick="confirmDraw()" style="flex:1;background:#e67e22;border:none;color:#fff;border-radius:9px;padding:10px 4px;font-size:13px;font-weight:700;cursor:pointer">✓ Confirmar</button>
  </div>
</div>

<!-- ── Panel de colocación de punto puntual ─────────────────────────── -->
<div id="point-pick-ctrl" style="display:none;position:fixed;bottom:110px;left:50%;transform:translateX(-50%);
  background:#1e2436;border-radius:14px;padding:14px 16px;z-index:2000;
  border:1.5px solid #27ae60;box-shadow:0 6px 24px rgba(0,0,0,0.65);min-width:260px;max-width:90vw">
  <div style="color:#27ae60;font-size:11px;font-weight:700;text-align:center;letter-spacing:0.6px;margin-bottom:10px">
    📍 COLOCAR PUNTO — Tocá el mapa para ubicar la obra
  </div>
  <button onclick="cancelPointPick()" style="width:100%;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.4);color:#e74c3c;border-radius:9px;padding:10px;font-size:12px;font-weight:600;cursor:pointer">✗ Cancelar</button>
</div>

<!-- ── Panel de medición de distancias ──────────────────────────────── -->
<div id="measure-ctrl" style="display:none;position:fixed;bottom:110px;left:50%;transform:translateX(-50%);background:#1e2436;border-radius:14px;padding:14px 16px;z-index:2000;border:1.5px solid #F5C300;box-shadow:0 6px 24px rgba(0,0,0,0.65);min-width:290px;max-width:90vw">
  <div style="color:#F5C300;font-size:11px;font-weight:700;text-align:center;letter-spacing:0.6px;margin-bottom:5px">
    📏 MEDICIÓN — Tocá el mapa para agregar puntos
  </div>
  <div id="measure-dist" style="color:#e0e6f0;font-size:20px;font-weight:900;text-align:center;margin-bottom:12px;min-height:28px">
    Tocá el mapa para medir
  </div>
  <div style="display:flex;gap:8px">
    <button onclick="undoMeasurePoint()" style="flex:1;background:#252d40;border:1px solid #3a4060;color:#e0e6f0;border-radius:9px;padding:10px 4px;font-size:12px;font-weight:600;cursor:pointer">↩ Deshacer</button>
    <button onclick="clearMeasure()" style="flex:1;background:#252d40;border:1px solid #3a4060;color:#aaa;border-radius:9px;padding:10px 4px;font-size:12px;font-weight:600;cursor:pointer">🗑 Limpiar</button>
    <button onclick="exitMeasureMode()" style="flex:1;background:rgba(231,76,60,0.15);border:1px solid rgba(231,76,60,0.4);color:#e74c3c;border-radius:9px;padding:10px 4px;font-size:12px;font-weight:600;cursor:pointer">✗ Cerrar</button>
  </div>
</div>

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
    // Capa de relleno sin borde (evita doble stroke entre zonas adyacentes)
    var fillLayer=L.geoJSON(gj,{
      style:{color:'transparent',weight:0,fillColor:c,fillOpacity:0.12},
      smoothFactor:0,
      interactive:false
    }).addTo(map);
    // Capa de borde separada + interacción
    L.geoJSON(gj,{
      style:{color:'#888',weight:1,fillOpacity:0},
      smoothFactor:0,
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
          +(nombre?'<div style="font-size:11px;color:#9aaac0">'+nombre+'<\/div>':'')
          +'<\/div>',
          {className:'dark-popup',closeButton:false}
        );
        layer.on('mouseover',function(){fillLayer.setStyle({fillOpacity:0.25});});
        layer.on('mouseout',function(){fillLayer.setStyle({fillOpacity:0.12});});
      }
    }).addTo(map);
  });

// ── Rutas Nacionales ──────────────────────────────────────────────
function hexToRgba(h,a){
  var r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);
  return 'rgba('+r+','+g+','+b+','+a+')';
}
if(LAYERS.rutasNacionales)
  Object.entries(RUTAS).forEach(function([ruta,gj]){
    var c=RUTAS_COLORS[ruta]||'#e74c3c';
    L.geoJSON(gj,{
      style:{color:c,weight:3.5,opacity:.9},
      interactive:false
    }).addTo(map);
    L.geoJSON(gj,{
      style:function(){return{color:'#000',weight:22,opacity:0.001};},
      onEachFeature:function(f,l){
        var n=(f.properties||{}).Nombre||(f.properties||{}).nombre||ruta;
        l.bindPopup(
          '<div style="background:'+hexToRgba(c,0.88)+';border-radius:5px;padding:4px 10px;font-family:sans-serif;white-space:nowrap;display:inline-block">'
          +'<div style="font-size:7px;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1px">Ruta Nacional<\/div>'
          +'<div style="font-size:14px;font-weight:900;color:#fff;line-height:1.3">'+n+'<\/div>'
          +'<\/div>',
          {className:'rn-popup',closeButton:false,maxWidth:300}
        );
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
  var cc=p.CC?(' N\u00b0 '+String(parseInt(p.CC)||p.CC)):'';  var mant=p.Mantenim==='DVP'?'Vialidad Provincial':p.Mantenim==='CC'?('Consorcio Caminero'+cc):p.Mantenim||'—';
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
      l.bindPopup('<div class="poi-popup"><div class="poi-name">'+n+'<\/div><div class="poi-type">Campamento Vial<\/div><\/div>');
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
    +'<button onclick="calcRoute(SEDES_MAP['+c.numero+'].lat,SEDES_MAP['+c.numero+'].lng,SEDES_MAP['+c.numero+'].nombre)" style="margin-top:10px;width:100%;background:linear-gradient(135deg,#1a5fc4,#0e3d8a);border:none;color:#fff;padding:9px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:.3px">📍 Cómo llegar<\/button>'
    +'<\/div><\/div>';
  L.marker([c.lat,c.lng],{icon:icon}).bindPopup(popup,{maxWidth:270}).addTo(map);
});
} // end if LAYERS.sedes

// ── GPS: ubicación del usuario ────────────────────────────────────
var userMarker=null,userCircle=null,manualMode=false;

function _attachMarkerClick(isManual){
  if(!userMarker)return;
  userMarker.on('click',function(){
    map.closePopup();
    var ll=userMarker.getLatLng();
    var btns=isManual
      ? '<div style="display:flex;gap:8px;margin-top:10px">'
        +'<button onclick="enterManualMode()" style="flex:1;background:#2a3450;border:none;color:#e0e6f0;padding:6px 0;border-radius:7px;font-size:11px;cursor:pointer">📍 Mover<\/button>'
        +'<button onclick="exitManualMode()" style="flex:1;background:#2a3450;border:none;color:#9aaac0;padding:6px 0;border-radius:7px;font-size:11px;cursor:pointer">🧭 GPS real<\/button>'
        +'<\/div>'
      : '<button onclick="enterManualMode()" style="margin-top:10px;width:100%;background:#2a3450;border:none;color:#e0e6f0;padding:6px 0;border-radius:7px;font-size:11px;cursor:pointer">📍 Mover ubicación<\/button>';
    L.popup({closeButton:true,maxWidth:220,className:'dark-popup'})
      .setLatLng(ll)
      .setContent('<div style="background:#1e2436;border-radius:8px;padding:10px 14px">'
        +'<div style="font-size:10px;color:#7a8aaa;text-transform:uppercase;letter-spacing:1px">'+(isManual?'Ubicación manual':'Tu ubicación')+'<\/div>'
        +'<div style="font-size:12px;color:#e0e6f0;margin-top:4px">'+ll.lat.toFixed(5)+', '+ll.lng.toFixed(5)+'<\/div>'
        +btns+'<\/div>')
      .openOn(map);
  });
}

function updateUserLocation(lat,lng,acc){
  if(manualMode)return;
  if(userMarker){map.removeLayer(userMarker);map.removeLayer(userCircle);}
  userCircle=L.circle([lat,lng],{radius:acc||20,fillColor:'#4285f4',fillOpacity:.15,color:'#4285f4',weight:1}).addTo(map);
  userMarker=L.circleMarker([lat,lng],{radius:8,fillColor:'#4285f4',color:'#fff',fillOpacity:1,weight:2.5}).addTo(map);
  _attachMarkerClick(false);
  map.setView([lat,lng],Math.max(map.getZoom(),14));
}

var _manualClickFn=null;
function enterManualMode(){
  map.closePopup();
  manualMode=true;
  showRouteToast('📍 Tocá el mapa para mover la ubicación');
  _manualClickFn=function(e){
    map.getContainer().removeEventListener('click',_manualClickFn,true);
    _manualClickFn=null;
    var pt=map.mouseEventToContainerPoint(e);
    var ll=map.containerPointToLatLng(pt);
    hideRouteToast();
    _placeManualPin(ll.lat,ll.lng);
    e.stopPropagation();
  };
  map.getContainer().addEventListener('click',_manualClickFn,true);
}

function snapToRoad(lat,lng){
  var SNAP_DEG=0.0009;
  var best=null,bestDist=Infinity,bestProps=null;
  function _checkFeatures(features,extraProps){
    if(!features)return;
    for(var fi=0;fi<features.length;fi++){
      var feat=features[fi];
      var geom=feat&&feat.geometry;
      if(!geom)continue;
      var lines=geom.type==='LineString'?[geom.coordinates]:geom.type==='MultiLineString'?geom.coordinates:[];
      for(var li=0;li<lines.length;li++){
        var coords=lines[li];
        for(var ci=0;ci<coords.length-1;ci++){
          var ax=coords[ci][0],ay=coords[ci][1];
          var bx=coords[ci+1][0],by=coords[ci+1][1];
          var dx=bx-ax,dy=by-ay;
          var lenSq=dx*dx+dy*dy;
          var t=lenSq>0?Math.max(0,Math.min(1,((lng-ax)*dx+(lat-ay)*dy)/lenSq)):0;
          var px=ax+t*dx,py=ay+t*dy;
          var dist=Math.sqrt((lng-px)*(lng-px)+(lat-py)*(lat-py));
          if(dist<bestDist){
            bestDist=dist;best={lat:py,lng:px};
            bestProps=Object.assign({},feat.properties||{},extraProps||{});
          }
        }
      }
    }
  }
  // Capas CC activas
  var ccKeys=Object.keys(CC_DATA_CC);
  for(var ki=0;ki<ccKeys.length;ki++){
    var gj=CC_DATA_CC[ccKeys[ki]];
    if(gj&&gj.features)_checkFeatures(gj.features,null);
  }
  // Capas RP (siempre disponibles en memoria)
  var rpSets=[
    {gj:RP_PAV,label:'RP Pavimentada'},
    {gj:RP_MEJ,label:'RP Mejorada'},
    {gj:RP_OBR,label:'RP En Obra'},
    {gj:RP_TIE,label:'RP Tierra'}
  ];
  for(var ri=0;ri<rpSets.length;ri++){
    var rpGJ=rpSets[ri].gj;
    if(rpGJ&&rpGJ.features)_checkFeatures(rpGJ.features,{_rpLabel:rpSets[ri].label});
  }
  if(best&&bestDist<SNAP_DEG)return{lat:best.lat,lng:best.lng,snapped:true,snapProps:bestProps};
  return{lat:lat,lng:lng,snapped:false,snapProps:null};
}

function _placeManualPin(lat,lng){
  var snap=snapToRoad(lat,lng);
  var finalLat=snap.lat,finalLng=snap.lng;
  if(userMarker)map.removeLayer(userMarker);
  if(userCircle)map.removeLayer(userCircle);
  userCircle=L.circle([finalLat,finalLng],{radius:60,fillColor:'#ff8c00',fillOpacity:.18,color:'#ff8c00',weight:1.5}).addTo(map);
  var pinColor=snap.snapped?'#F5C300':'#ff8c00';
  var borderColor=snap.snapped?'#F5C300':'#fff';
  userMarker=L.circleMarker([finalLat,finalLng],{radius:9,fillColor:pinColor,color:borderColor,fillOpacity:1,weight:snap.snapped?3:2.5}).addTo(map);
  _attachMarkerClick(true);
  if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'manualPos',lat:finalLat,lng:finalLng,snapped:snap.snapped,snapProps:snap.snapProps}));
}

function exitManualMode(){
  manualMode=false;
  if(_manualClickFn){map.getContainer().removeEventListener('click',_manualClickFn,true);_manualClickFn=null;}
  map.closePopup();
  if(userMarker){map.removeLayer(userMarker);userMarker=null;}
  if(userCircle){map.removeLayer(userCircle);userCircle=null;}
  showRouteToast('🧭 GPS restaurado');
  setTimeout(hideRouteToast,1800);
}

// ── Red bajo convenio CC (inyección por consorcio individual) ─────
var CC_DATA_CC={};
var CC_LAYERS_CC={};
var CC_COLORS={ZI:'#4a85a0',ZII:'#b05a3a',ZIII:'#9a8630',ZIV:'#4a845a',ZV:'#6a649a'};
var JERARQ_COLOR={PRIMARIA:'#c0392b',SECUNDARIA:'#2980b9',TERCIARIA:'#7f8c8d'};
var routeGraph=null,routeLayer=null;
var CC_NOMBRES={};
(SEDES||[]).forEach(function(s){CC_NOMBRES[parseInt(s.numero,10)]=s.nombre||s.localidad||'';});

var _ccHL=null,_ccHLStyle=null;
function ccHighlight(visLayer,baseStyle){
  if(_ccHL){_ccHL.setStyle(_ccHLStyle);}
  _ccHL=visLayer;_ccHLStyle=baseStyle;
  visLayer.setStyle({color:'#F5C300',weight:(baseStyle.weight||2)+5,opacity:1});
  if(visLayer.bringToFront)visLayer.bringToFront();
}
function ccReset(){if(_ccHL){_ccHL.setStyle(_ccHLStyle);_ccHL=null;_ccHLStyle=null;}}

function addCCData(cc,zona,gj){
  if(CC_LAYERS_CC[cc])return;
  CC_DATA_CC[cc]=gj;
  routeGraph=null;
  var zColor=CC_COLORS[zona]||'#999';
  var visLayers=[],hi=0;
  var visLayer=L.geoJSON(gj,{
    interactive:false,
    style:function(f){
      var j=(f.properties&&f.properties.J)||'TERCIARIA';
      var w=j==='PRIMARIA'?2.5:j==='SECUNDARIA'?1.8:1.2;
      return{color:zColor,weight:w,opacity:0.85};
    },
    onEachFeature:function(f,l){visLayers.push(l);}
  });
  var hitLayer=L.geoJSON(gj,{
    style:function(){return{color:'#000',weight:22,opacity:0.001};},
    onEachFeature:function(f,l){
      var vi=hi++;
      var p=f.properties||{};
      var ccNum=parseInt(p.CC,10)||p.CC||'—';
      var j=p.J||'TERCIARIA';
      var jLabel=j.charAt(0)+j.slice(1).toLowerCase();
      var jColor=JERARQ_COLOR[j]||zColor;
      var m=p.M?p.M.charAt(0)+p.M.slice(1).toLowerCase():'—';
      var esRuta=!p.T&&p.Nm;
      var vialLabel=esRuta?'Ruta N°':'Tramo N°';
      var vialNum=esRuta?('N° '+p.Nm):p.T?('N° '+p.T):'—';
      var mn=p.Mn||'—';
      var nomenclatura=CC_NOMBRES[parseInt(p.CC,10)]||'';
      var nc=p.Nc||'';
      var baseStyle={color:zColor,weight:j==='PRIMARIA'?2.5:j==='SECUNDARIA'?1.8:1.2,opacity:0.85};
      l.bindPopup(
        '<div style="background:#1e2436;border-radius:10px;overflow:hidden;font-family:sans-serif;min-width:210px;max-width:250px">'
        +'<div style="background:'+zColor+';padding:10px 14px">'
        +'<div style="font-size:10px;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1px">Red bajo Convenio CC<\/div>'
        +'<div style="font-size:20px;font-weight:900;color:#fff;margin-top:2px">CC N° '+ccNum+'<\/div>'
        +(nomenclatura?'<div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:2px">'+nomenclatura+'<\/div>':'')
        +'<\/div>'
        +'<div style="padding:10px 14px">'
        +'<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #2a3045">'
        +'<span style="font-size:10px;color:#7a8aaa;width:90px">'+vialLabel+'<\/span>'
        +'<span style="font-size:12px;color:#e0e6f0;font-weight:600">'+vialNum+'<\/span>'
        +'<\/div>'
        +(nc?'<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #2a3045">'
        +'<span style="font-size:10px;color:#7a8aaa;width:90px">Nomenclatura<\/span>'
        +'<span style="font-size:11px;color:#e0e6f0;font-weight:600;font-family:monospace">'+nc+'<\/span>'
        +'<\/div>':'')
        +'<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #2a3045">'
        +'<span style="font-size:10px;color:#7a8aaa;width:90px">Jerarquía<\/span>'
        +'<span style="font-size:12px;color:#e0e6f0;font-weight:600">'+jLabel+'<\/span>'
        +'<\/div>'
        +'<div style="display:flex;align-items:center;gap:8px;padding:5px 0">'
        +'<span style="font-size:10px;color:#7a8aaa;width:90px">Mantenimiento<\/span>'
        +'<span style="font-size:12px;color:#e0e6f0;font-weight:600">'+mn+'<\/span>'
        +'<\/div>'
        +'<\/div>'
        +'<\/div>',
        {className:'dark-popup',closeButton:true,maxWidth:260}
      );
      l.on('click',function(){if(visLayers[vi])ccHighlight(visLayers[vi],baseStyle);});
      l.on('popupclose',function(){ccReset();});
    }
  });
  CC_LAYERS_CC[cc]=L.layerGroup([visLayer,hitLayer]);
}
function showCCNum(cc){if(CC_LAYERS_CC[cc])CC_LAYERS_CC[cc].addTo(map);}
function hideCCNum(cc){if(CC_LAYERS_CC[cc])map.removeLayer(CC_LAYERS_CC[cc]);}
function removeCCAll(){
  Object.keys(CC_LAYERS_CC).forEach(function(cc){map.removeLayer(CC_LAYERS_CC[Number(cc)]);});
  CC_LAYERS_CC={};CC_DATA_CC={};
  routeGraph=null;clearRoute();
}

// ── Tramos DVP (mantenidos por Dir. Vialidad Provincial) ───────────
var DVP_LAYERS={ZIV:null,ZV:null};
var DVP_ZONA_LABEL={ZIV:'Zona IV',ZV:'Zona V'};
function addDVPLayer(zona,gj){
  if(DVP_LAYERS[zona])return;
  var visLayers=[],hi=0;
  var visLayer=L.geoJSON(gj,{
    interactive:false,
    style:function(){return{color:'#8b5cf6',weight:2,opacity:0.9};},
    onEachFeature:function(f,l){visLayers.push(l);}
  });
  var hitLayer=L.geoJSON(gj,{
    style:function(){return{color:'#000',weight:22,opacity:0.001};},
    onEachFeature:function(f,l){
      var vi=hi++;
      var p=f.properties||{};
      var nc=p.Nc||'';
      var zonaLabel=DVP_ZONA_LABEL[zona]||zona;
      l.bindPopup(
        '<div style="background:#1e2436;border-radius:10px;overflow:hidden;font-family:sans-serif;min-width:210px;max-width:250px">'
        +'<div style="background:#6d28d9;padding:10px 14px">'
        +'<div style="font-size:10px;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1px">Tramo Vialidad · '+zonaLabel+'<\/div>'
        +'<div style="font-size:16px;font-weight:900;color:#fff;margin-top:2px">Red Vial Provincial<\/div>'
        +'<\/div>'
        +'<div style="padding:10px 14px">'
        +(nc?'<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #2a3045">'
        +'<span style="font-size:10px;color:#7a8aaa;width:90px">Identificación<\/span>'
        +'<span style="font-size:11px;color:#e0e6f0;font-weight:600;font-family:monospace">'+nc+'<\/span>'
        +'<\/div>':'')
        +'<div style="display:flex;align-items:center;gap:8px;padding:5px 0">'
        +'<span style="font-size:10px;color:#7a8aaa;width:90px">Mantenimiento<\/span>'
        +'<span style="font-size:12px;color:#e0e6f0;font-weight:600">DVP<\/span>'
        +'<\/div>'
        +'<\/div><\/div>',
        {className:'dark-popup',closeButton:true,maxWidth:250}
      );
      l.on('click',function(){if(visLayers[vi])ccHighlight(visLayers[vi],{color:'#8b5cf6',weight:2,opacity:0.9});});
      l.on('popupclose',function(){ccReset();});
    }
  });
  DVP_LAYERS[zona]=L.layerGroup([visLayer,hitLayer]).addTo(map);
}
function showDVP(zona){if(DVP_LAYERS[zona])DVP_LAYERS[zona].addTo(map);}
function hideDVP(zona){if(DVP_LAYERS[zona])map.removeLayer(DVP_LAYERS[zona]);}

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

// Velocidades por tipo de capa (km/h)
var SPEED={CC:80, RN:110, RP:110, ACCESS:50};

function buildRouteGraph(){
  routeGraph={};
  routeNodes=[];
  var nodeMap={},nId=0;
  function snap(c){return c[0].toFixed(3)+','+c[1].toFixed(3);}
  function getNode(c){
    var k=snap(c);
    if(nodeMap[k]===undefined){nodeMap[k]=nId;routeNodes.push([c[1],c[0]]);routeGraph[nId]=[];nId++;}
    return nodeMap[k];
  }
  function addLayer(gj,kmh){
    if(!gj||!gj.features)return;
    gj.features.forEach(function(f){
      var geom=f.geometry;
      if(!geom)return;
      var lines=geom.type==='MultiLineString'?geom.coordinates:
                geom.type==='LineString'?[geom.coordinates]:null;
      if(!lines)return;
      lines.forEach(function(line){
        for(var i=0;i<line.length-1;i++){
          var a=line[i],b=line[i+1];
          var na=getNode(a),nb=getNode(b);
          if(na===nb)continue;
          var d=haversineM(a[1],a[0],b[1],b[0]);
          var t=d/(kmh/3.6); // segundos
          routeGraph[na].push({id:nb,dist:d,time:t,a:a,b:b});
          routeGraph[nb].push({id:na,dist:d,time:t,a:b,b:a});
        }
      });
    });
  }
  Object.values(CC_DATA_CC).forEach(function(gj){addLayer(gj,SPEED.CC);});
  Object.values(RUTAS).forEach(function(gj){addLayer(gj,SPEED.RN);});
  [RP_PAV,RP_MEJ,RP_OBR,RP_TIE].forEach(function(gj){addLayer(gj,SPEED.RP);});
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
  var time=new Array(n).fill(INF);  // optimizar por tiempo
  var distM=new Array(n).fill(0);   // acumular distancia real
  var prev=new Array(n).fill(-1);
  var prevEdge=new Array(n).fill(null);
  time[startId]=0;
  var pq=new MinHeap();
  pq.push([0,startId]);
  while(pq.size()>0){
    var top=pq.pop(),t=top[0],u=top[1];
    if(u===endId)break;
    if(t>time[u])continue;
    var nb=routeGraph[u]||[];
    for(var i=0;i<nb.length;i++){
      var e=nb[i],nt=t+e.time;
      if(nt<time[e.id]){
        time[e.id]=nt;
        distM[e.id]=distM[u]+e.dist;
        prev[e.id]=u;
        prevEdge[e.id]=[e.a,e.b];
        pq.push([nt,e.id]);
      }
    }
  }
  if(time[endId]===INF)return null;
  var segs=[];
  var cur=endId;
  while(cur!==startId&&cur!==-1){
    var edge=prevEdge[cur];
    if(edge)segs.unshift([[edge[0][1],edge[0][0]],[edge[1][1],edge[1][0]]]);
    cur=prev[cur];
  }
  return{segs:segs,distM:distM[endId],timeS:time[endId]};
}

function clearRoute(){
  if(routeLayer){map.removeLayer(routeLayer);routeLayer=null;}
}

var _routeToast=null;
function showRouteToast(msg){
  if(_routeToast)map.removeLayer(_routeToast);
  _routeToast=L.popup({closeButton:false,className:'dark-popup',maxWidth:220})
    .setLatLng(map.getCenter())
    .setContent('<div style="background:#1e2436;border-radius:8px;padding:10px 14px;text-align:center;color:#e0e6f0;font-size:13px">'+msg+'<\/div>')
    .openOn(map);
}
function hideRouteToast(){if(_routeToast){map.closePopup(_routeToast);_routeToast=null;}}

// ── Popup de resultado de ruta ────────────────────────────────────
function _showRoutePopup(sedeLat,sedeLng,nombre,km,mins,tag){
  L.popup({closeButton:true,maxWidth:260})
    .setLatLng([sedeLat,sedeLng])
    .setContent('<div style="background:#1e2436;border-radius:8px;padding:12px 16px">'
      +'<div style="font-size:10px;color:#7a8aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Cómo llegar · '+nombre+'<\/div>'
      +'<div style="font-size:20px;font-weight:900;color:#00d4ff;margin-bottom:2px">'+km+' km<\/div>'
      +'<div style="font-size:12px;color:#9aaac0">≈ '+mins+' min<\/div>'
      +(tag?'<div style="font-size:10px;color:#7a8aaa;margin-top:5px">'+tag+'<\/div>':'')
      +'<button onclick="clearRoute()" style="margin-top:10px;background:#2a3450;border:none;color:#9aaac0;padding:6px 14px;border-radius:7px;font-size:11px;cursor:pointer">✕ Limpiar ruta<\/button>'
      +'<\/div>')
    .openOn(map);
}

// ── Ruta online con OSRM ──────────────────────────────────────────
function _drawOSRMRoute(uLL,route,sedeLat,sedeLng,nombre){
  clearRoute();
  var coords=route.geometry.coordinates;
  var allLL=coords.map(function(c){return[c[1],c[0]];});
  routeLayer=L.layerGroup([
    L.polyline(allLL,{color:'#000',weight:7,opacity:0.2}),
    L.polyline(allLL,{color:'#00d4ff',weight:4,opacity:1})
  ]).addTo(map);
  var km=(route.distance/1000).toFixed(1);
  var mins=Math.round(route.duration/60);
  _showRoutePopup(sedeLat,sedeLng,nombre,km,mins,'🌐 Ruta OSM · velocidades reales por tipo de vía');
  try{map.fitBounds(L.latLngBounds(allLL),{padding:[50,50]});}catch(e){}
}

// ── Ruta offline con Dijkstra ─────────────────────────────────────
function _execOfflineRoute(uLL,sedeLat,sedeLng,nombre){
  if(!routeGraph){buildRouteGraph();}
  var startN=findNearestNode(uLL.lat,uLL.lng);
  var endN=findNearestNode(sedeLat,sedeLng);
  clearRoute();
  var startNode=routeNodes[startN.id];
  var endNode=routeNodes[endN.id];
  var layers=[],totalDist=0;

  if(startN.dist>30){
    layers.push(L.polyline([[uLL.lat,uLL.lng],[startNode[0],startNode[1]]],
      {color:'#00d4ff',weight:2.5,dashArray:'7 6',opacity:0.75}));
    totalDist+=startN.dist;
  }
  var result=dijkstra(startN.id,endN.id);
  if(result&&result.segs.length>0){
    var allLL=[];
    result.segs.forEach(function(s){allLL=allLL.concat(s);});
    layers.push(L.polyline(allLL,{color:'#000',weight:7,opacity:0.2}));
    layers.push(L.polyline(allLL,{color:'#00d4ff',weight:4,opacity:1}));
    totalDist+=result.distM;
  } else {
    layers.push(L.polyline([[startNode[0],startNode[1]],[endNode[0],endNode[1]]],
      {color:'#00d4ff',weight:3,dashArray:'10 7',opacity:0.7}));
    totalDist+=haversineM(startNode[0],startNode[1],endNode[0],endNode[1]);
  }
  if(endN.dist>30){
    layers.push(L.polyline([[endNode[0],endNode[1]],[sedeLat,sedeLng]],
      {color:'#00d4ff',weight:2.5,dashArray:'7 6',opacity:0.75}));
    totalDist+=endN.dist;
  }
  routeLayer=L.layerGroup(layers).addTo(map);
  // Tiempo de acceso urbano (50 km/h) + tiempo en red vial (velocidad del segmento)
  var accessTimeS=(startN.dist>30?startN.dist/(SPEED.ACCESS/3.6):0)
                 +(endN.dist>30?endN.dist/(SPEED.ACCESS/3.6):0);
  var roadTimeS=result&&result.timeS?result.timeS
    :haversineM(startNode[0],startNode[1],endNode[0],endNode[1])/(SPEED.CC/3.6);
  var totalTimeS=accessTimeS+roadTimeS;
  var km=(totalDist/1000).toFixed(1);
  var mins=Math.round(totalTimeS/60);
  var sinRed=(!result||result.segs.length===0);
  var tag=sinRed?'⚠ Ruta aproximada · sin conexión en red':'📡 Modo offline · red vial provincial';
  _showRoutePopup(sedeLat,sedeLng,nombre,km,mins,tag);
  try{
    var allPts=[[uLL.lat,uLL.lng],[sedeLat,sedeLng]];
    if(result&&result.segs.length>0){result.segs.forEach(function(s){allPts=allPts.concat(s);});}
    map.fitBounds(L.latLngBounds(allPts),{padding:[50,50]});
  }catch(e){}
}

// ── calcRoute: intenta OSRM online, cae a offline si falla ────────
function calcRoute(sedeLat,sedeLng,nombre){
  if(!userMarker){
    alert('Activá el GPS (botón ubicación) para conocer tu posición.');
    return;
  }
  var uLL=userMarker.getLatLng();
  showRouteToast('⏳ Calculando ruta...');
  var ctrl=new AbortController();
  var timer=setTimeout(function(){ctrl.abort();},5000);
  var osrmUrl='https://router.project-osrm.org/route/v1/driving/'
    +uLL.lng+','+uLL.lat+';'+sedeLng+','+sedeLat
    +'?overview=full&geometries=geojson';
  fetch(osrmUrl,{signal:ctrl.signal})
    .then(function(r){clearTimeout(timer);return r.json();})
    .then(function(data){
      hideRouteToast();
      if(data.code==='Ok'&&data.routes&&data.routes[0]){
        _drawOSRMRoute(uLL,data.routes[0],sedeLat,sedeLng,nombre);
      } else {
        _execOfflineRoute(uLL,sedeLat,sedeLng,nombre);
      }
    })
    .catch(function(){
      clearTimeout(timer);
      hideRouteToast();
      _execOfflineRoute(uLL,sedeLat,sedeLng,nombre);
    });
}

// ── Relevamiento markers ─────────────────────────────────────────────────────
var RELEV_MARKERS={};
var RIPIO_LAYERS={};
var RELEV_TIPO_MAP={};
var RELEV_TIPOS_VISIBLE={Puente:true,Alcantarilla:true,Tubos:true,Lineal:true,Otro:true};
var RELEV_COLORS={Bueno:'#27ae60',Regular:'#f39c12',Malo:'#e67e22','Crítico':'#e74c3c'};
var RELEV_LABELS={Puente:'PTE',Alcantarilla:'ALC',Tubos:'TUB',Lineal:'LIN',Otro:'?'};
function setRelevTipoVisible(tipo,visible){
  RELEV_TIPOS_VISIBLE[tipo]=visible;
  Object.keys(RELEV_MARKERS).forEach(function(id){
    if(RELEV_TIPO_MAP[id]===tipo){
      if(visible){if(!map.hasLayer(RELEV_MARKERS[id]))RELEV_MARKERS[id].addTo(map);}
      else{if(map.hasLayer(RELEV_MARKERS[id]))map.removeLayer(RELEV_MARKERS[id]);}
    }
  });
  if(tipo==='Lineal'){
    Object.keys(RIPIO_LAYERS).forEach(function(id){
      if(visible){if(!map.hasLayer(RIPIO_LAYERS[id]))RIPIO_LAYERS[id].addTo(map);}
      else{if(map.hasLayer(RIPIO_LAYERS[id]))map.removeLayer(RIPIO_LAYERS[id]);}
    });
  }
}
function escHtml(s){return s?s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'):'';}
function _relevColor(estado){
  return RELEV_COLORS[estado]||RELEV_COLORS[estado.replace('\u00ed','i')]||'#888';
}
function _relevLabel(estructura){
  return RELEV_LABELS[estructura]||'?';
}
function _relevDivIcon(estructura,c){
  var lbl=_relevLabel(estructura);
  var fs=lbl.length>1?'11':'15';
  var html='<div style="background:'+c+';color:#fff;border:2.5px solid #fff;border-radius:50%;'
    +'width:34px;height:34px;line-height:30px;text-align:center;font-size:'+fs+'px;font-weight:900;'
    +'box-shadow:0 2px 6px rgba(0,0,0,0.45)">'+lbl+'<\/div>';
  return L.divIcon({html:html,className:'',iconSize:[34,34],iconAnchor:[17,17],popupAnchor:[0,-18]});
}
function addRelevMarker(id,lat,lng,estado,tipo,ccAsociado,fecha,obs){
  if(RELEV_MARKERS[id])return;
  var c=_relevColor(estado);
  var m=L.marker([lat,lng],{icon:_relevDivIcon(tipo,c),zIndexOffset:600});
  var d=new Date(fecha);
  var fechaStr=d.toLocaleDateString('es-AR')+' '+d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  var tipoTxt=(tipo&&tipo!=='Ninguna')?'<div style="font-size:11px;color:#b0bec5;margin-bottom:3px">Tipo: '+escHtml(tipo)+'<\/div>':'';
  var ccTxt=ccAsociado?'<div style="font-size:11px;color:#b0bec5;margin-bottom:3px">'+escHtml(ccAsociado)+'<\/div>':'';
  var obsTxt=obs?'<div style="font-size:11px;color:#cdd4de;border-top:1px solid #2a3450;padding-top:5px;margin-top:5px">'+escHtml(obs)+'<\/div>':'';
  m.bindPopup(
    '<div style="background:#1e2436;border-radius:10px;padding:12px 14px;min-width:180px">'
    +'<div style="font-size:10px;color:#7a8aaa;text-transform:uppercase;letter-spacing:1px">Relevamiento<\/div>'
    +'<div style="font-size:15px;font-weight:900;color:'+c+';margin:3px 0">'+estado+'<\/div>'
    +tipoTxt+ccTxt
    +'<div style="font-size:10px;color:#7a8aaa;margin-bottom:8px">'+fechaStr+'<\/div>'
    +obsTxt
    +'<button class="rdel-btn" data-rid="'+id+'" '
    +'style="margin-top:8px;width:100%;background:rgba(192,57,43,0.15);border:1px solid rgba(192,57,43,0.5);color:#e74c3c;'
    +'padding:6px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer">Eliminar relevamiento<\/button>'
    +'<\/div>',
    {closeButton:true,maxWidth:260}
  );
  m.on('popupopen',function(){
    setTimeout(function(){
      var btn=document.querySelector('.rdel-btn[data-rid="'+id+'"]');
      if(btn)btn.onclick=function(){
        if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'deleteRelev',id:id}));
      };
    },80);
  });
  RELEV_TIPO_MAP[id]=tipo;
  RELEV_MARKERS[id]=m;
  if(RELEV_TIPOS_VISIBLE[tipo]!==false)m.addTo(map);
}
function removeRelevMarker(id){
  if(RELEV_MARKERS[id]){map.removeLayer(RELEV_MARKERS[id]);delete RELEV_MARKERS[id];delete RELEV_TIPO_MAP[id];}
}
function addLinealLine(id,latlngs,empresa,ruta,fecha){
  if(RIPIO_LAYERS[id])return;
  var c='#e67e22';
  var pts=latlngs.map(function(p){return[p.lat,p.lng];});
  var line=L.polyline(pts,{color:c,weight:6,opacity:0.85,lineCap:'round',lineJoin:'round'});
  var d=new Date(fecha);
  var fechaStr=d.toLocaleDateString('es-AR')+' '+d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  line.bindPopup(
    '<div style="background:#1e2436;border-radius:10px;padding:12px 14px;min-width:180px">'
    +'<div style="font-size:10px;color:#e67e22;text-transform:uppercase;letter-spacing:1px;font-weight:700">Tramo lineal<\/div>'
    +(ruta?'<div style="font-size:13px;font-weight:800;color:#e0e6f0;margin:3px 0">'+ruta+'<\/div>':'')
    +(empresa?'<div style="font-size:11px;color:#b0bec5;margin-bottom:3px">Empresa: '+empresa+'<\/div>':'')
    +'<div style="font-size:10px;color:#7a8aaa;margin-bottom:8px">'+fechaStr+'<\/div>'
    +'<div style="font-size:10px;color:#7a8aaa">'+pts.length+' puntos capturados<\/div>'
    +'<\/div>',
    {closeButton:true,maxWidth:260}
  );
  RIPIO_LAYERS[id]=line;
  if(RELEV_TIPOS_VISIBLE['Lineal']!==false)line.addTo(map);
}
function clearRelevMarkers(){
  Object.keys(RELEV_MARKERS).forEach(function(id){
    map.removeLayer(RELEV_MARKERS[id]);delete RELEV_MARKERS[id];
  });
  Object.keys(RIPIO_LAYERS).forEach(function(id){
    map.removeLayer(RIPIO_LAYERS[id]);delete RIPIO_LAYERS[id];
  });
  RELEV_TIPO_MAP={};
}
function removeRipioLayer(id){
  if(RIPIO_LAYERS[id]){map.removeLayer(RIPIO_LAYERS[id]);delete RIPIO_LAYERS[id];}
}

// ── GPS Track preview ─────────────────────────────────────────────────────────
var _trackLine=null,_trackPtsPreview=[];
function _addTrackPt(lat,lng){
  _trackPtsPreview.push([lat,lng]);
  if(_trackLine){map.removeLayer(_trackLine);_trackLine=null;}
  if(_trackPtsPreview.length>=2){
    _trackLine=L.polyline(_trackPtsPreview,{color:'#e67e22',weight:5,opacity:0.85}).addTo(map);
  }
  map.panTo([lat,lng]);
}
function _clearTrackPrev(){
  if(_trackLine){map.removeLayer(_trackLine);_trackLine=null;}
  _trackPtsPreview=[];
}

// ── Modo dibujo de tramo Ripio ────────────────────────────────────────────────
var _drawMode=false,_drawPts=[],_drawLine=null,_drawCircles=[],_drawSnapInfo=null;
function _rn(msg){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(msg));}
function enterDrawMode(){
  _drawMode=true;_drawPts=[];
  map.getContainer().style.cursor='crosshair';
  map.getContainer().classList.add('draw-mode');
  map.closePopup();
  document.getElementById('draw-ctrl').style.display='block';
  map.on('click',_onDrawClick);
  _updateDrawPreview();
}
function _onDrawClick(e){
  if(!_drawMode)return;
  var snap=snapToRoad(e.latlng.lat,e.latlng.lng);
  _drawPts.push({lat:snap.lat,lng:snap.lng});
  if(snap.snapped&&!_drawSnapInfo)_drawSnapInfo=snap.snapProps;
  _updateDrawPreview();
}
function _updateDrawPreview(){
  if(_drawLine){map.removeLayer(_drawLine);_drawLine=null;}
  _drawCircles.forEach(function(c){map.removeLayer(c);});_drawCircles=[];
  if(_drawPts.length>=2){
    _drawLine=L.polyline(_drawPts.map(function(p){return[p.lat,p.lng];}),
      {color:'#e67e22',weight:6,opacity:0.9,dashArray:'10 6'}).addTo(map);
  }
  _drawPts.forEach(function(p,i){
    var n=_drawPts.length,isFirst=i===0,isLast=i===n-1&&n>1;
    var fc=isFirst?'#27ae60':isLast?'#e74c3c':'#f39c12';
    var c=L.circleMarker([p.lat,p.lng],
      {radius:8,color:'#fff',weight:2.5,fillColor:fc,fillOpacity:1}).addTo(map);
    _drawCircles.push(c);
  });
  var n=_drawPts.length;
  document.getElementById('draw-count').textContent=n+' punto'+(n!==1?'s':'')
    +(n>=2?' ✓':' — necesitás al menos 2');
}
function undoDrawPoint(){
  if(_drawPts.length>0){_drawPts.pop();_updateDrawPreview();}
}
function confirmDraw(){
  if(_drawPts.length<2){alert('Necesitás al menos 2 puntos para definir el tramo.');return;}
  var pts=_drawPts.slice();
  var si=_drawSnapInfo;
  _exitDrawMode();
  _rn({type:'ripioDrawn',coordsLinea:pts,snapProps:si});
}
function cancelDraw(){
  _exitDrawMode();
  _rn({type:'drawModeCancelled'});
}
function _exitDrawMode(){
  _drawMode=false;_drawSnapInfo=null;
  setNonRelevLayersInteractive(true);
  map.getContainer().style.cursor='';
  map.getContainer().classList.remove('draw-mode');
  map.off('click',_onDrawClick);
  if(_drawLine){map.removeLayer(_drawLine);_drawLine=null;}
  _drawCircles.forEach(function(c){map.removeLayer(c);});_drawCircles=[];
  _drawPts=[];
  document.getElementById('draw-ctrl').style.display='none';
}

// ── Herramienta de medición de distancias ────────────────────────────────────
var _mMode=false,_mPts=[],_mLines=[],_mCircles=[],_mLabels=[];
function _fmtDist(m){if(m<1000)return Math.round(m)+' m';return (m/1000).toFixed(2)+' km';}
function _segDist(p1,p2){return L.latLng(p1.lat,p1.lng).distanceTo(L.latLng(p2.lat,p2.lng));}
function enterMeasureMode(){
  _mMode=true;_mPts=[];_mLines=[];_mCircles=[];_mLabels=[];
  map.getContainer().style.cursor='crosshair';
  map.closePopup();
  document.getElementById('measure-ctrl').style.display='block';
  document.getElementById('measure-dist').textContent='Tocá el mapa para medir';
  map.on('click',_onMeasureClick);
}
function _onMeasureClick(e){if(!_mMode)return;_mPts.push({lat:e.latlng.lat,lng:e.latlng.lng});_updateMeasure();}
function _updateMeasure(){
  _mLines.forEach(function(l){map.removeLayer(l);});_mLines=[];
  _mCircles.forEach(function(c){map.removeLayer(c);});_mCircles=[];
  _mLabels.forEach(function(lb){map.removeLayer(lb);});_mLabels=[];
  var n=_mPts.length;
  if(n===0)return;
  // Puntos
  _mPts.forEach(function(p,i){
    var fc=i===0?'#27ae60':(i===n-1&&n>1)?'#F5C300':'#fff';
    _mCircles.push(L.circleMarker([p.lat,p.lng],{radius:6,color:'#111',weight:2,fillColor:fc,fillOpacity:1,zIndexOffset:500}).addTo(map));
  });
  // Líneas + etiquetas
  var total=0;
  for(var i=1;i<n;i++){
    var p1=_mPts[i-1],p2=_mPts[i],d=_segDist(p1,p2);total+=d;
    _mLines.push(L.polyline([[p1.lat,p1.lng],[p2.lat,p2.lng]],{color:'#F5C300',weight:2.5,opacity:0.9,dashArray:'8 5'}).addTo(map));
    var icon=L.divIcon({className:'',
      html:'<div style="background:#1e2436;color:#F5C300;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;border:1px solid rgba(245,195,0,0.4);white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.5)">'+_fmtDist(d)+'</div>',
      iconAnchor:[0,8]});
    _mLabels.push(L.marker([(p1.lat+p2.lat)/2,(p1.lng+p2.lng)/2],{icon:icon,interactive:false,zIndexOffset:1000}).addTo(map));
  }
  // Panel
  var el=document.getElementById('measure-dist');
  if(n===1){el.textContent='1 punto — seguí tocando';}
  else{el.innerHTML='<span style="color:#F5C300">'+_fmtDist(total)+'</span>';}
  _rn({type:'measureUpdate',total:total,pts:n});
}
function undoMeasurePoint(){if(_mPts.length>0){_mPts.pop();_updateMeasure();}if(_mPts.length===0){document.getElementById('measure-dist').textContent='Tocá el mapa para medir';}}
function clearMeasure(){_mPts=[];_updateMeasure();document.getElementById('measure-dist').textContent='Tocá el mapa para medir';}
function exitMeasureMode(){
  _mMode=false;
  map.getContainer().style.cursor='';
  map.off('click',_onMeasureClick);
  _mLines.forEach(function(l){map.removeLayer(l);});_mLines=[];
  _mCircles.forEach(function(c){map.removeLayer(c);});_mCircles=[];
  _mLabels.forEach(function(lb){map.removeLayer(lb);});_mLabels=[];
  _mPts=[];
  document.getElementById('measure-ctrl').style.display='none';
  _rn({type:'measureClosed'});
}

// ── Modo colocación de punto puntual ─────────────────────────────────────────
var _ppMode=false,_ppMarker=null,_ppClickFn=null;
function enterPointPickMode(){
  _ppMode=true;
  map.getContainer().style.cursor='crosshair';
  document.getElementById('point-pick-ctrl').style.display='block';
  if(_ppMarker){map.removeLayer(_ppMarker);_ppMarker=null;}
  _ppClickFn=function(e){
    if(!_ppMode)return;
    var raw=e.latlng;
    var snap=snapToRoad(raw.lat,raw.lng);
    var lat=snap.lat,lng=snap.lng;
    if(_ppMarker){map.removeLayer(_ppMarker);}
    var fillColor=snap.snapped?'#F5C300':'#27ae60';
    _ppMarker=L.circleMarker([lat,lng],{radius:10,fillColor:fillColor,color:'#fff',fillOpacity:1,weight:snap.snapped?3:2.5}).addTo(map);
    _exitPointPickMode();
    _rn({type:'pointPicked',lat:lat,lng:lng,snapped:snap.snapped,snapProps:snap.snapProps});
  };
  map.on('click',_ppClickFn);
}
function cancelPointPick(){
  _exitPointPickMode();
  _rn({type:'pointPickCancelled'});
}
function _exitPointPickMode(){
  _ppMode=false;
  map.getContainer().style.cursor='';
  if(_ppClickFn){map.off('click',_ppClickFn);_ppClickFn=null;}
  document.getElementById('point-pick-ctrl').style.display='none';
}
function clearPickedPointMarker(){
  if(_ppMarker){map.removeLayer(_ppMarker);_ppMarker=null;}
}
<\/script>
</body>
</html>`;
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function MapaScreen() {
  const webviewRef = useRef<WebView>(null);
  const C = useColors();
  const { width, height } = useWindowDimensions();
  const DRAWER_WIDTH = useMemo(() => Math.min(width * 0.78, 300), [width]);
  const styles = useMemo(() => makeStyles(C, DRAWER_WIDTH), [C, DRAWER_WIDTH]);
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  // Ref para la orientación actual — leído dentro del listener del Magnetómetro
  const isLandscapeRef = useRef(width > height);
  useEffect(() => { isLandscapeRef.current = width > height; }, [width, height]);
  const overlayAnim = useRef(new Animated.Value(0)).current;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sedesZonas, setSedesZonas] = useState<SedesZonas>(
    Object.fromEntries(ZONAS_LIST.map(z => [z, false]))
  );
  const [tracking, setTracking] = useState(false);
  const locationSub = useRef<any>(null);
  const gpsCoords = useRef<{ lat: number; lng: number } | null>(null);

  // ── Brújula ───────────────────────────────────────────────────────────────
  const [compassActive,  setCompassActive]  = useState(false);
  const [compassHeading, setCompassHeading] = useState(0);
  const [measureMode, setMeasureMode] = useState(false);

  // ── Relevamientos ─────────────────────────────────────────────────────────
  const { relevamientos, add: addRelevamiento, remove: removeRelevamiento, reload: reloadRelevamientos } = useRelevamientos();
  const [relevModalVisible, setRelevModalVisible] = useState(false);
  const [drawnCoordsLinea, setDrawnCoordsLinea] = useState<{lat:number;lng:number}[]>([]);
  const [pickedPointCoord, setPickedPointCoord] = useState<{lat:number;lng:number}|null>(null);
  const snapInfoRef = useRef<Record<string,any>|null>(null);
  const [tecnicoNombre, setTecnicoNombre] = useState('');
  const [tecnicoZona, setTecnicoZona] = useState('');

  // Resetear posición del drawer al rotar el dispositivo (cuando está cerrado)
  useEffect(() => {
    if (!drawerOpen) drawerAnim.setValue(-DRAWER_WIDTH);
  }, [DRAWER_WIDTH]);

  // Brújula: suscripción al Magnetómetro (5 Hz, solo cuando está activa)
  useEffect(() => {
    if (!compassActive || !Magnetometer) return;
    Magnetometer.setUpdateInterval(200);
    const sub = Magnetometer.addListener(({ x, y }: { x: number; y: number }) => {
      // Portrait: atan2(-x, y) → 0° cuando el tope del cel apunta al norte
      // Landscape 90°CW: atan2(y, x) → los ejes físicos ya están alineados
      const raw = isLandscapeRef.current
        ? Math.atan2(y, x) * (180 / Math.PI)
        : Math.atan2(-x, y) * (180 / Math.PI);
      setCompassHeading((raw + 360) % 360);
    });
    return () => sub.remove();
  }, [compassActive]);

  // Auto-detectar técnico logueado — con caché offline en AsyncStorage
  useEffect(() => {
    // Cargar caché primero (disponible offline)
    AsyncStorage.multiGet(['tecnico_nombre', 'tecnico_zona']).then(pairs => {
      const nombre = pairs[0][1]; const zona = pairs[1][1];
      if (nombre) setTecnicoNombre(nombre);
      if (zona)   setTecnicoZona(zona);
    });
    // Luego actualizar desde Supabase (cuando hay red)
    supabase.auth.getUser().then(({ data }) => {
      const uid = data?.user?.id;
      if (!uid) return;
      supabase.from('profiles').select('nombre,zona').eq('id', uid).single()
        .then(({ data: p }) => {
          if (p?.nombre) { setTecnicoNombre(p.nombre); AsyncStorage.setItem('tecnico_nombre', p.nombre); }
          if (p?.zona)   { setTecnicoZona(p.zona);   AsyncStorage.setItem('tecnico_zona',   p.zona);   }
        });
    });
  }, []);
  const [webViewLoadCount, setWebViewLoadCount] = useState(0);

  // Recargar relevamientos al volver al tab (sincroniza eliminaciones desde Reportes)
  useFocusEffect(useCallback(() => { reloadRelevamientos(); }, [reloadRelevamientos]));

  // ── Ripio: "Dibujar en mapa" iniciado desde el modal ────────────────────────
  const handleRequestDraw = useCallback(() => {
    setRelevModalVisible(false);
    setDrawnCoordsLinea([]);
    setTimeout(() => {
      webviewRef.current?.injectJavaScript('enterDrawMode(); true;');
    }, 300);
  }, []);

  // ── Obras puntuales: "Ir al mapa" para colocar un punto ─────────────────────
  const handleRequestPickPoint = useCallback(() => {
    setRelevModalVisible(false);
    setPickedPointCoord(null);
    setTimeout(() => {
      webviewRef.current?.injectJavaScript('enterPointPickMode(); true;');
    }, 300);
  }, []);

  const [layers, setLayers] = useState<Layers>({
    basemap: true,
    zonaBoundaries: false,
    limiteProv: true,
    departamentos: false,
    rutasNacionales: false,
    campamentos: false,
    salud: false,
    rpPavimentada: false,
    rpMejorada: false,
    rpEnObra: false,
    rpTierra: false,
  });

  const [dvpZIVOn, setDvpZIVOn] = useState(false);
  const [dvpZVOn,  setDvpZVOn]  = useState(false);
  const dvpZIVLoaded = useRef(false);
  const dvpZVLoaded  = useRef(false);

  useEffect(() => {
    if (webViewLoadCount === 0) return;
    if (dvpZIVOn) {
      if (!dvpZIVLoaded.current) {
        const gj = JSON.stringify((GEO_BUNDLE_CC as any)['ZIV_DVP']);
        webviewRef.current?.injectJavaScript(`addDVPLayer('ZIV',${gj}); true;`);
        dvpZIVLoaded.current = true;
      } else {
        webviewRef.current?.injectJavaScript(`showDVP('ZIV'); true;`);
      }
    } else {
      webviewRef.current?.injectJavaScript(`hideDVP('ZIV'); true;`);
    }
  }, [dvpZIVOn, webViewLoadCount]);

  useEffect(() => {
    if (webViewLoadCount === 0) return;
    if (dvpZVOn) {
      if (!dvpZVLoaded.current) {
        const gj = JSON.stringify((GEO_BUNDLE_CC as any)['ZV_DVP']);
        webviewRef.current?.injectJavaScript(`addDVPLayer('ZV',${gj}); true;`);
        dvpZVLoaded.current = true;
      } else {
        webviewRef.current?.injectJavaScript(`showDVP('ZV'); true;`);
      }
    } else {
      webviewRef.current?.injectJavaScript(`hideDVP('ZV'); true;`);
    }
  }, [dvpZVOn, webViewLoadCount]);

  // ── Capa Relevamientos: visibilidad por tipo ──────────────────────────────
  const [relevLayers, setRelevLayers] = useState<RelevLayers>({
    all: true, Puente: true, Alcantarilla: true, Tubos: true, Lineal: true, Otro: true,
  });
  const relevLayersRef = useRef(relevLayers);
  useEffect(() => { relevLayersRef.current = relevLayers; }, [relevLayers]);

  const toggleAllRelev = useCallback(() => {
    setRelevLayers(prev => {
      const newAll = !prev.all;
      return { all: newAll, Puente: newAll, Alcantarilla: newAll, Tubos: newAll, Lineal: newAll, Otro: newAll };
    });
  }, []);

  const toggleRelevTipo = useCallback((tipo: keyof Omit<RelevLayers, 'all'>) => {
    setRelevLayers(prev => {
      const updated = { ...prev, [tipo]: !prev[tipo] };
      updated.all = RELEV_TIPOS.every(t => updated[t]);
      return updated;
    });
  }, []);

  // Sincronizar visibilidad de subcapas → WebView
  useEffect(() => {
    if (webViewLoadCount === 0) return;
    const js = RELEV_TIPOS.map(t => `setRelevTipoVisible(${JSON.stringify(t)},${relevLayers[t]});`).join('') + ' true;';
    webviewRef.current?.injectJavaScript(js);
  }, [relevLayers, webViewLoadCount]);

  // ── Relevamiento markers ──────────────────────────────────────────────────
  useEffect(() => {
    if (webViewLoadCount === 0) return; // WebView not ready yet
    // Limpiar marcadores viejos y re-agregar los actuales; luego restaurar visibilidad
    const layers = relevLayersRef.current;
    const markerJs = 'clearRelevMarkers();' + relevamientos.map(r => {
      let s = `addRelevMarker(${JSON.stringify(r.id)},${r.coords.lat},${r.coords.lng},${JSON.stringify(r.estadoCalzada)},${JSON.stringify(r.tipo)},${JSON.stringify(r.rutaTramo || r.ccAsociado || '')},${JSON.stringify(r.fecha)},${JSON.stringify(r.observaciones.slice(0,80))});`;
      if (r.tipo === 'Lineal' && r.coordsLinea && r.coordsLinea.length >= 2) {
        s += `addLinealLine(${JSON.stringify(r.id)},${JSON.stringify(r.coordsLinea)},${JSON.stringify(r.datosLineal?.empresa ?? '')},${JSON.stringify(r.rutaTramo || '')},${JSON.stringify(r.fecha)});`;
      }
      return s;
    }).join('');
    const visJs = RELEV_TIPOS.map(t => `setRelevTipoVisible(${JSON.stringify(t)},${layers[t]});`).join('');
    webviewRef.current?.injectJavaScript(markerJs + visJs + ' true;');
  }, [relevamientos, webViewLoadCount]);

  const handleSaveRelevamiento = useCallback(async (r: Relevamiento) => {
    try {
      await addRelevamiento(r);
    } catch {
      Alert.alert('Error al guardar', 'No se pudo guardar el relevamiento. Verificá el almacenamiento del dispositivo.');
      return;
    }
    let js = `addRelevMarker(${JSON.stringify(r.id)},${r.coords.lat},${r.coords.lng},${JSON.stringify(r.estadoCalzada)},${JSON.stringify(r.tipo)},${JSON.stringify(r.rutaTramo || r.ccAsociado || '')},${JSON.stringify(r.fecha)},${JSON.stringify(r.observaciones.slice(0,80))});`;
    if (r.tipo === 'Lineal' && r.coordsLinea && r.coordsLinea.length >= 2) {
      js += `addLinealLine(${JSON.stringify(r.id)},${JSON.stringify(r.coordsLinea)},${JSON.stringify(r.datosLineal?.empresa ?? '')},${JSON.stringify(r.rutaTramo || '')},${JSON.stringify(r.fecha)});`;
    }
    webviewRef.current?.injectJavaScript(js + ' true;');
    setDrawnCoordsLinea([]);
  }, [addRelevamiento]);


  const onWebViewMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'manualPos' && msg.lat !== undefined) {
        gpsCoords.current = { lat: msg.lat, lng: msg.lng };
        snapInfoRef.current = msg.snapped ? (msg.snapProps ?? null) : null;
      }
      if (msg.type === 'deleteRelev' && msg.id) {
        Alert.alert('Eliminar relevamiento', '¿Seguro que querés eliminarlo?', [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar', style: 'destructive',
            onPress: async () => {
              await removeRelevamiento(msg.id);
              // Limpia tanto el marcador como la línea de ripio
              webviewRef.current?.injectJavaScript(
                `removeRelevMarker(${JSON.stringify(msg.id)});removeRipioLayer(${JSON.stringify(msg.id)}); true;`
              );
            },
          },
        ]);
      }
      // Confirmación del dibujo de tramo ripio desde Leaflet
      if (msg.type === 'ripioDrawn' && Array.isArray(msg.coordsLinea) && msg.coordsLinea.length >= 2) {
        snapInfoRef.current = msg.snapProps ?? null;
        setDrawnCoordsLinea(msg.coordsLinea);
        setRelevModalVisible(true);
      }
      if (msg.type === 'drawModeCancelled') {
        setDrawnCoordsLinea([]);
        setRelevModalVisible(true);
      }
      // Punto puntual colocado desde el mapa
      if (msg.type === 'pointPicked' && msg.lat !== undefined) {
        setPickedPointCoord({ lat: msg.lat, lng: msg.lng });
        snapInfoRef.current = msg.snapped ? (msg.snapProps ?? null) : null;
        setRelevModalVisible(true);
      }
      if (msg.type === 'measureClosed') {
        setMeasureMode(false);
      }
      if (msg.type === 'pointPickCancelled') {
        setPickedPointCoord(null);
        setRelevModalVisible(true);
      }
    } catch (_) {}
  }, [removeRelevamiento]);

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

  // Cuando el WebView recarga (por cambio de mapHtml), reseteamos los refs
  // para que el efecto de CC re-inyecte todas las capas activas
  const onWebViewLoad = useCallback(() => {
    prevCCRef.current = {};
    ccLoadedNums.current = new Set();
    dvpZIVLoaded.current = false;
    dvpZVLoaded.current  = false;
    setWebViewLoadCount(c => c + 1);
    setCCState(s => ({ ...s }));
  }, []);

  const mapHtml = useMemo(
    () => buildMapHtml(sedesZonas, layers),
    [sedesZonas, layers]
  );

  const toggleZona = useCallback((zona: string) =>
    setSedesZonas(prev => ({ ...prev, [zona]: !prev[zona] })), []);

  const todasActivas = useMemo(() => ZONAS_LIST.every(z => sedesZonas[z]), [sedesZonas]);
  const ningunaActiva = useMemo(() => ZONAS_LIST.every(z => !sedesZonas[z]), [sedesZonas]);

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
      gpsCoords.current = null;
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    // Salir del modo manual en el WebView antes de reactivar GPS
    webviewRef.current?.injectJavaScript(`exitManualMode(); true;`);
    setTracking(true);
    locationSub.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 3000,
        distanceInterval: 5,
      },
      (loc: any) => {
        const { latitude, longitude, accuracy } = loc.coords;
        gpsCoords.current = { lat: latitude, lng: longitude };
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
    { key: 'campamentos',     label: 'Campamentos Viales',  icon: '⛺' },
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
        onLoad={onWebViewLoad}
        onMessage={onWebViewMessage}
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

          {/* ── Tramos DVP ──────────────────────────────────────────────── */}
          <TouchableOpacity style={styles.layerRow} onPress={() => setDvpZIVOn(v => !v)}>
            <View style={[styles.layerCheck, dvpZIVOn && styles.layerCheckOn]}>
              {dvpZIVOn && <Text style={styles.layerCheckMark}>✓</Text>}
            </View>
            <View style={{ width: 24, height: 2, borderStyle: 'dashed', borderColor: '#8b5cf6', borderWidth: 1, marginRight: 6 }} />
            <Text style={[styles.layerLabel, !dvpZIVOn && styles.layerLabelOff]}>Tramos Vialidad Zona IV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.layerRow} onPress={() => setDvpZVOn(v => !v)}>
            <View style={[styles.layerCheck, dvpZVOn && styles.layerCheckOn]}>
              {dvpZVOn && <Text style={styles.layerCheckMark}>✓</Text>}
            </View>
            <View style={{ width: 24, height: 2, borderStyle: 'dashed', borderColor: '#8b5cf6', borderWidth: 1, marginRight: 6 }} />
            <Text style={[styles.layerLabel, !dvpZVOn && styles.layerLabelOff]}>Tramos Vialidad Zona V</Text>
          </TouchableOpacity>

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

          {/* ── Relevamientos ───────────────────────────────────────────── */}
          <Text style={[styles.drawerSection, { marginTop: 20 }]}>
            Relevamientos — {relevamientos.length}
          </Text>
          {/* Toggle general */}
          <TouchableOpacity style={styles.layerRow} onPress={toggleAllRelev}>
            <View style={[styles.layerCheck, relevLayers.all && styles.layerCheckOn]}>
              {relevLayers.all && <Text style={styles.layerCheckMark}>✓</Text>}
            </View>
            <Text style={styles.layerIcon}>📋</Text>
            <Text style={[styles.layerLabel, !relevLayers.all && styles.layerLabelOff]}>
              Todos los relevamientos
            </Text>
          </TouchableOpacity>
          {/* Subcapas por tipo */}
          {(
            [
              { tipo: 'Puente',       icon: '🌉', color: '#4444cc' },
              { tipo: 'Alcantarilla', icon: '🏗️', color: '#44cc44' },
              { tipo: 'Tubos',        icon: '⭕',  color: '#cc4444' },
              { tipo: 'Lineal',        icon: '🛣️', color: '#22aaee' },
              { tipo: 'Otro',         icon: '❓',  color: '#888888' },
            ] as Array<{ tipo: keyof Omit<RelevLayers,'all'>; icon: string; color: string }>
          ).map(({ tipo, icon, color }) => {
            const count = relevamientos.filter(r => r.tipo === tipo).length;
            const on = relevLayers[tipo];
            return (
              <TouchableOpacity
                key={tipo}
                style={[styles.layerRow, { paddingLeft: 14 }]}
                onPress={() => toggleRelevTipo(tipo)}
              >
                <View style={[styles.layerCheck, { width: 16, height: 16, borderRadius: 3 }, on && { backgroundColor: color, borderColor: color }]}>
                  {on && <Text style={[styles.layerCheckMark, { fontSize: 10, lineHeight: 12 }]}>✓</Text>}
                </View>
                <Text style={[styles.layerIcon, { fontSize: 13 }]}>{icon}</Text>
                <Text style={[styles.layerLabel, { fontSize: 12 }, !on && styles.layerLabelOff]}>
                  {tipo}
                </Text>
                {count > 0 && (
                  <Text style={{ fontSize: 11, color: on ? color : '#555', fontWeight: '700', marginLeft: 'auto' }}>
                    {count}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}

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

      {/* ── BRÚJULA: widget indicador de heading ─────────────────────────── */}
      {compassActive && (
        <View style={styles.compassWidget} pointerEvents="none">
          <View style={[styles.compassNeedle, { transform: [{ rotate: `${-compassHeading}deg` }] }]}>
            <Text style={styles.compassN}>N</Text>
          </View>
          <Text style={styles.compassDeg}>{Math.round(compassHeading)}°</Text>
        </View>
      )}

      {/* ── BOTÓN MEDICIÓN (bottom-left) ──────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.btnMeasure, measureMode && styles.btnMeasureActive]}
        onPress={() => {
          if (measureMode) {
            webviewRef.current?.injectJavaScript('exitMeasureMode(); true;');
            setMeasureMode(false);
          } else {
            setMeasureMode(true);
            webviewRef.current?.injectJavaScript('enterMeasureMode(); true;');
          }
        }}
      >
        <Text style={styles.btnMeasureIcon}>📏</Text>
      </TouchableOpacity>

      {/* ── BOTÓN RELEVAR (bottom-right, encima del GPS) ─────────────────── */}
      <TouchableOpacity
        style={styles.btnRelevar}
        onPress={() => setRelevModalVisible(true)}
      >
        <Text style={styles.btnRelevarIcon}>📋</Text>
      </TouchableOpacity>

      {/* ── BOTÓN GPS (bottom-right) ─────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.btnGps, tracking && styles.btnGpsActive]}
        onPress={toggleGPS}
      >
        <Text style={styles.btnGpsIcon}>{tracking ? '📍' : '🧭'}</Text>
      </TouchableOpacity>

      {/* ── MODAL RELEVAMIENTO ───────────────────────────────────────────── */}
      <RelevamientoModal
        visible={relevModalVisible}
        coords={gpsCoords.current}
        initialCoordsLinea={drawnCoordsLinea}
        initialCoord={pickedPointCoord}
        snapInfo={snapInfoRef.current}
        tecnicoNombre={tecnicoNombre}
        tecnicoZona={tecnicoZona}
        onRequestDraw={handleRequestDraw}
        onRequestPickPoint={handleRequestPickPoint}
        onSave={handleSaveRelevamiento}
        onClose={() => {
          setRelevModalVisible(false);
          setDrawnCoordsLinea([]);
          setPickedPointCoord(null);
          snapInfoRef.current = null;
          webviewRef.current?.injectJavaScript('clearPickedPointMarker(); true;');
        }}
      />

    </View>
  );
}

// ── STYLES ──────────────────────────────────────────────────────────────────
function makeStyles(C: ColorPalette, DRAWER_WIDTH: number) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 10 },

  drawer: {
    position: 'absolute', top: 0, left: 0, width: DRAWER_WIDTH, height: '100%',
    backgroundColor: C.primary, zIndex: 20, elevation: 16,
    shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.4, shadowRadius: 12,
  },
  drawerHeader: {
    backgroundColor: C.primaryDark,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 52,
    paddingBottom: 14, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: C.accent,
  },
  drawerTitle: { color: C.white, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  drawerClose: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  drawerCloseText: { color: C.textMuted, fontSize: 18, fontWeight: '600' },
  drawerScroll: { flex: 1, paddingHorizontal: 14, paddingTop: 12 },
  drawerSection: {
    color: C.accent, fontSize: 11, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 4,
  },

  sedesActions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  sedesActionBtn: {
    flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 6,
    borderWidth: 1, borderColor: C.textSecondary, backgroundColor: 'transparent',
  },
  sedesActionBtnActive: { backgroundColor: C.accent, borderColor: C.accentDark },
  sedesActionText: { color: C.textMuted, fontSize: 12, fontWeight: '700' },
  sedesActionTextActive: { color: C.primary },

  layerRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 10,
  },
  layerCheck: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1.5,
    borderColor: C.textSecondary, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  layerCheckOn: { backgroundColor: C.accent, borderColor: C.accentDark },
  layerCheckMark: { color: C.primary, fontSize: 12, fontWeight: '900', lineHeight: 14 },
  layerIcon: { fontSize: 15, width: 22, textAlign: 'center' },
  layerLabel: { color: C.white, fontSize: 13, fontWeight: '600', flex: 1 },
  layerLabelOff: { color: C.textMuted },
  zonaDot: { width: 10, height: 10, borderRadius: 5 },
  layerLine: { width: 22, height: 3, borderRadius: 1.5 },

  btnHamburger: {
    position: 'absolute', top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 2 : 38,
    left: 12, width: 38, height: 38, backgroundColor: C.primary, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center', gap: 4, zIndex: 5, elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4,
    borderWidth: 1, borderColor: C.accent,
  },
  hamburgerLine: { width: 17, height: 2, backgroundColor: C.white, borderRadius: 1 },

  zoomGroup: {
    position: 'absolute', top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 2 : 38,
    right: 12, backgroundColor: C.primary, borderRadius: 7, overflow: 'hidden',
    zIndex: 5, elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4,
    borderWidth: 1, borderColor: C.accent,
  },
  zoomBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  zoomText: { color: C.white, fontSize: 19, fontWeight: '300', lineHeight: 22 },
  zoomDivider: { height: 1, backgroundColor: C.border, marginHorizontal: 6 },

  compassWidget: {
    position: 'absolute', bottom: 32, left: 12, width: 64, height: 64,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 5, elevation: 6,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
  },
  compassNeedle: { alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  compassN: { color: '#F5C300', fontSize: 18, fontWeight: '900', lineHeight: 20 },
  compassDeg: { color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '600' },

  btnCompass: {
    position: 'absolute', bottom: 218, right: 12, width: 50, height: 50,
    backgroundColor: C.primary, borderRadius: 25, alignItems: 'center', justifyContent: 'center',
    zIndex: 5, elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4,
    borderWidth: 2, borderColor: C.primaryLight,
  },
  btnCompassActive: { backgroundColor: '#2196F3', borderColor: '#1565C0' },
  btnCompassIcon: { fontSize: 20 },

  btnMeasure: {
    position: 'absolute', bottom: 32, left: 12, width: 50, height: 50,
    backgroundColor: C.primary, borderRadius: 25, alignItems: 'center', justifyContent: 'center',
    zIndex: 5, elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4,
    borderWidth: 2, borderColor: C.primaryLight,
  },
  btnMeasureActive: { backgroundColor: '#F5C300', borderColor: '#d4a800' },
  btnMeasureIcon: { fontSize: 22 },

  btnLineal: {
    position: 'absolute', bottom: 156, right: 12, width: 50, height: 50,
    backgroundColor: '#e67e22', borderRadius: 25, alignItems: 'center', justifyContent: 'center',
    zIndex: 5, elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4,
    borderWidth: 2, borderColor: '#d35400',
  },
  btnLinealIcon: { fontSize: 22 },

  btnRelevar: {
    position: 'absolute', bottom: 94, right: 12, width: 50, height: 50,
    backgroundColor: C.primary, borderRadius: 25, alignItems: 'center', justifyContent: 'center',
    zIndex: 5, elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4,
    borderWidth: 2, borderColor: C.accent,
  },
  btnRelevarIcon: { fontSize: 22 },

  btnGps: {
    position: 'absolute', bottom: 32, right: 12, width: 50, height: 50,
    backgroundColor: C.primary, borderRadius: 25, alignItems: 'center', justifyContent: 'center',
    zIndex: 5, elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4,
    borderWidth: 2, borderColor: C.primaryLight,
  },
  btnGpsActive: { backgroundColor: C.accent, borderColor: C.accentDark },
  btnGpsIcon: { fontSize: 22 },
}); }
