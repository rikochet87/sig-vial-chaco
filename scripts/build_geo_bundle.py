#!/usr/bin/env python3
"""
Genera constants/geoBundle.ts a partir de los archivos GeoJSON en assets/geojson/
Ejecutar desde la raiz del proyecto: python3 scripts/build_geo_bundle.py

Fuente autoritativa de red vial: suma de Red Primar + Red Secund + Red Tercia
(el campo Red(Km) tiene inconsistencias entre zonas y un error conocido en CC42)
"""
import json, os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOJSON_DIR = os.path.join(BASE_DIR, 'assets', 'geojson')
OUT_FILE = os.path.join(BASE_DIR, 'constants', 'geoBundle.ts')

# Simplificacion adaptiva: zonas con pocos puntos NO se simplifican
ZONA_STEPS = {'ZI': 2, 'ZII': 1, 'ZIII': 1, 'ZIV': 3, 'ZV': 4}
ZONA_COLORS = {'ZI':'#6baed6','ZII':'#fb6a4a','ZIII':'#fdd44c','ZIV':'#74c476','ZV':'#9e9ac8'}

def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)

def simplify_polygon(coords, step):
    if isinstance(coords[0][0], list):
        return [simplify_polygon(ring, step) for ring in coords]
    return coords[::step] + [coords[-1]]

def simplify_geojson(gj, step):
    for feat in gj.get('features', []):
        geom = feat.get('geometry', {})
        t = geom.get('type', '')
        if t == 'Polygon':
            geom['coordinates'] = simplify_polygon(geom['coordinates'], step)
        elif t == 'MultiPolygon':
            geom['coordinates'] = [simplify_polygon(p, step) for p in geom['coordinates']]
    return gj

def build_bundle():
    lim_dir  = os.path.join(GEOJSON_DIR, 'Limites')
    sede_dir = os.path.join(GEOJSON_DIR, 'Sedes Sociales')
    ruta_dir = os.path.join(GEOJSON_DIR, 'Rutas Nacionales')
    poi_dir  = os.path.join(GEOJSON_DIR, 'Puntos de Interes')

    limite_prov = simplify_geojson(load(os.path.join(lim_dir, 'Limite provincial.geojson')), step=4)
    deptos      = load(os.path.join(lim_dir, 'Departamentos.geojson'))  # sin simplificar

    limites_zonas = {}
    for zona, fname in [
        ('ZI','01 Limite Zona I.geojson'), ('ZII','02 Limite Zona II.geojson'),
        ('ZIII','03 Limite Zona III.geojson'), ('ZIV','04 Limite Zona IV.geojson'),
        ('ZV','05 Limite Zona V.geojson')]:
        limites_zonas[zona] = simplify_geojson(
            load(os.path.join(lim_dir, fname)), step=ZONA_STEPS[zona])

    sedes = []
    total_km = 0
    for zona, fname in [
        ('ZI','01 sede social CC ZI.geojson'), ('ZII','02 sede social CC ZII.geojson'),
        ('ZIII','03 sede social CC ZIII.geojson'), ('ZIV','04 sede social CC ZIV.geojson'),
        ('ZV','05 sede social CC ZV.geojson')]:
        gj = load(os.path.join(sede_dir, fname))
        for feat in gj['features']:
            p = feat.get('properties', {})
            coords = feat['geometry']['coordinates']
            prim = p.get('Red Primar', 0) or 0
            sec  = p.get('Red Secund', 0) or 0
            terc = p.get('Red Tercia', 0) or 0
            km   = prim + sec + terc  # fuente autoritativa (Red(Km) tiene inconsistencias)
            # ZII tiene typo 'Secreterio' en lugar de 'Secretario'
            secretario = p.get('Secretario', '') or p.get('Secreterio', '') or ''
            sedes.append({
                'numero':        p.get('N° Consor', ''),
                'nombre':        p.get('Nombre', ''),
                'zona':          zona,
                'color':         ZONA_COLORS[zona],
                'lat':           round(coords[1], 6),
                'lng':           round(coords[0], 6),
                'redKm':         round(km, 2),
                'redPrimaria':   round(prim, 2),
                'redSecundaria': round(sec, 2),
                'redTerciaria':  round(terc, 2),
                'presidente':    p.get('Presidente', ''),
                'vicepresidente':p.get('Vicepresid', ''),
                'secretario':    secretario,
                'tesorero':      p.get('Tesorero', ''),
            })
            total_km += km

    rutas = {}
    for key, fname in [
        ('RN11','Ruta Nacional N°11.geojson'), ('RN16','Ruta Nacional N°16.geojson'),
        ('RN89','Ruta Nacional N°89.geojson'), ('RN95','Ruta Nacional N°95.geojson')]:
        rutas[key] = load(os.path.join(ruta_dir, fname))

    campamentos = load(os.path.join(poi_dir, 'Campamentos Fijos DVP.geojson'))
    salud       = load(os.path.join(poi_dir, 'Salud.geojson'))

    data = {
        'limite_provincial': limite_prov, 'limites_zonas': limites_zonas,
        'departamentos': deptos, 'sedes': sedes, 'rutas': rutas,
        'campamentos': campamentos, 'salud': salud,
    }

    j = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    ts = ('// AUTO-GENERADO — ejecutar scripts/build_geo_bundle.py para actualizar\n'
          '// Contiene todas las capas GeoJSON de QGIS para uso offline\n\n'
          f'export const GEO_BUNDLE = {j} as const;\n\n'
          'export type GeoBundleKey = keyof typeof GEO_BUNDLE;\n')

    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        f.write(ts)

    print(f'OK - {len(sedes)} sedes, {total_km:.2f} km, bundle {len(j)/1024:.0f} KB')

build_bundle()
