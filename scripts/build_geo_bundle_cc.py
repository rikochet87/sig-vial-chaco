"""
Genera constants/geoBundleCC.ts con la red bajo convenio de cada consorcio.
Organizado por zona, con simplificación step=4 para reducir tamaño.
Preserva propiedades clave: CC (número consorcio), Zona, Jerarq, Mat_Calzad, Nombre.
"""
import json, os

BASE_DIR  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR   = os.path.join(BASE_DIR, 'assets', 'geojson', 'Red bajo convenio Consorcios Camineros')
OUT_FILE  = os.path.join(BASE_DIR, 'constants', 'geoBundleCC.ts')
STEP      = 4

ZONA_MAP = {
    'Zona I Red CC':   'ZI',
    'Zona II Red CC':  'ZII',
    'Zona III Red CC': 'ZIII',
    'Zona IV Red CC':  'ZIV',
    'Zona V Red CC':   'ZV',
}

def simplify(coords, step):
    if len(coords) <= 2:
        return coords
    result = coords[::step]
    if result[-1] != coords[-1]:
        result.append(coords[-1])
    return result

def simplify_geojson(gj, step):
    out = {'type': 'FeatureCollection', 'features': []}
    for f in gj['features']:
        g   = f['geometry']
        p   = f.get('properties') or {}
        # Solo preservamos propiedades relevantes
        props = {
            'CC':  p.get('CC', ''),
            'Z':   p.get('Zona', ''),
            'J':   p.get('Jerarq', ''),       # PRIMARIA / SECUNDARIA / TERCIARIA
            'M':   p.get('Mat_Calzad', ''),    # TIERRA / PAVIMENTO / MEJORA
            'N':   p.get('Nombre', ''),        # número de ruta
            'Mn':  p.get('Mantenim', ''),      # CC / DVP
        }
        if g['type'] == 'MultiLineString':
            new_coords = [simplify(line, step) for line in g['coordinates']]
        elif g['type'] == 'LineString':
            new_coords = simplify(g['coordinates'], step)
        else:
            continue
        out['features'].append({
            'type': 'Feature',
            'properties': props,
            'geometry': {'type': g['type'], 'coordinates': new_coords}
        })
    return out

# ── Procesar ──────────────────────────────────────────────────────────────────
bundles = {}
stats   = {}

for zona_dir, zona_key in ZONA_MAP.items():
    zona_path = os.path.join(SRC_DIR, zona_dir)
    merged = {'type': 'FeatureCollection', 'features': []}
    for fn in sorted(os.listdir(zona_path)):
        if not fn.endswith('.geojson'):
            continue
        with open(os.path.join(zona_path, fn), encoding='utf-8') as f:
            gj = json.load(f)
        simp = simplify_geojson(gj, STEP)
        merged['features'].extend(simp['features'])
    bundles[zona_key] = merged
    kb = len(json.dumps(merged, separators=(',', ':'))) / 1024
    stats[zona_key] = (len(merged['features']), kb)
    print(f'  {zona_key}: {len(merged["features"])} features, {kb:.0f} KB')

# ── Escribir TS ───────────────────────────────────────────────────────────────
with open(OUT_FILE, 'w', encoding='utf-8') as f:
    f.write('// AUTO-GENERATED por build_geo_bundle_cc.py — NO EDITAR\n')
    f.write('// Red bajo convenio Consorcios Camineros — step=4 simplification\n\n')
    f.write('export type CCBundle = Record<string, any>;\n\n')
    f.write('export const GEO_BUNDLE_CC: Record<string, CCBundle> = {\n')
    for zona_key, gj in bundles.items():
        serialized = json.dumps(gj, separators=(',', ':'), ensure_ascii=False)
        f.write(f'  {zona_key}: {serialized},\n')
    f.write('};\n')

total_kb = sum(v[1] for v in stats.values())
print(f'\nTotal: {total_kb:.0f} KB → {OUT_FILE}')
