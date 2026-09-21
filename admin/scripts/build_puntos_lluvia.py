"""
Genera los puntos donde se consulta la lluvia de cada consorcio.

Por qué varios puntos y no uno: la red de un consorcio se extiende 45 km de
mediana y toca 13 celdas de la grilla de 9 km del servicio meteorológico.
Cualquier punto único —la sede o el centroide— colapsa esas 13 celdas en una, y
justo las tormentas que importan, las convectivas de verano, son las que mojan
disparejo. Además la sede está en el pueblo, que suele estar en el borde: en 68
de 101 consorcios ni siquiera cae en la celda donde está el grueso del camino.

Cómo se eligen: se parte la red en celdas de 9 km —más fino no aporta, es la
resolución del modelo— y se toman las celdas con más kilómetros de camino hasta
cubrir el 80 % de la red, con un tope de 10. Cada punto es el centro de gravedad
del camino dentro de su celda, y pesa los kilómetros que representa. Así un
consorcio compacto sale con 3 puntos y uno desparramado con 10.

Salida: src/data/puntosLluvia.ts

    python3 scripts/build_puntos_lluvia.py
"""

import json, math
from collections import defaultdict

ENTRADA    = 'public/geo/geo_cc.json'
CENTROIDES = '../docs/geo/centroides-red-cc.geojson'
SALIDA     = 'src/data/puntosLluvia.ts'
CEL_KM   = 9.0     # resolución del modelo
COBERTURA = 0.80   # fracción de la red que se busca cubrir
TOPE     = 10      # puntos por consorcio

R = 6371.0
def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*R*math.asin(math.sqrt(h))

def en_chaco(lo, la): return -63.5 < lo < -58 and -28.5 < la < -24

cc = json.load(open(ENTRADA))

# Centroides calculados en QGIS sobre la red de cada consorcio. Se usan de
# respaldo: el CC 96 declara 138,8 km de red pero no tiene ni una traza en el
# bundle, asi que sin esto quedaba sin dato de lluvia. Ademas sirvieron de
# control cruzado — coinciden con el centroide ponderado por km a 2,1 km de
# mediana, bien por debajo de la celda de 9 km.
centroides = {}
for f in json.load(open(CENTROIDES))['features']:
    try:
        n = int(float(f['properties'].get('CC')))
    except (TypeError, ValueError):
        continue
    lo, la = f['geometry']['coordinates'][:2]
    if en_chaco(lo, la):
        centroides[n] = (la, lo)

# CC -> celda -> acumulado ponderado por km
red = defaultdict(lambda: defaultdict(lambda: {'lat': 0.0, 'lng': 0.0, 'km': 0.0}))
paso_lat = CEL_KM / 111.0

for zona, fc in cc.items():
    if not isinstance(fc, dict) or fc.get('type') != 'FeatureCollection':
        continue
    for f in fc['features']:
        try:
            n = int(float(f['properties'].get('CC')))
        except (TypeError, ValueError):
            continue
        g = f['geometry']
        lineas = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
        for linea in lineas:
            for i in range(1, len(linea)):
                lo1, la1 = linea[i-1][0], linea[i-1][1]
                lo2, la2 = linea[i][0],   linea[i][1]
                if not (en_chaco(lo1, la1) and en_chaco(lo2, la2)):
                    continue
                km = hav((la1, lo1), (la2, lo2))
                if km <= 0:
                    continue
                mla, mlo = (la1+la2)/2, (lo1+lo2)/2
                paso_lng = paso_lat / math.cos(math.radians(mla))
                celda = (round(mla/paso_lat), round(mlo/paso_lng))
                a = red[n][celda]
                a['lat'] += mla*km; a['lng'] += mlo*km; a['km'] += km

filas, total_puntos, sin_red = [], 0, []

# Consorcios sin traza en el bundle: van con su centroide de QGIS, un solo punto
for n in sorted(set(centroides) - set(red)):
    la, lo = centroides[n]
    filas.append(f"  {{ cc: {n}, lat: {la:.5f}, lng: {lo:.5f}, peso: 1.0000 }},")
    total_puntos += 1
    sin_red.append(n)

for n in sorted(red):
    celdas = sorted(red[n].values(), key=lambda a: -a['km'])
    km_red = sum(a['km'] for a in celdas)
    if km_red <= 0:
        continue

    elegidas, acum = [], 0.0
    for a in celdas:
        elegidas.append(a); acum += a['km']
        if acum >= COBERTURA*km_red or len(elegidas) >= TOPE:
            break

    km_sel = sum(a['km'] for a in elegidas)
    total_puntos += len(elegidas)
    for a in elegidas:
        filas.append(
            f"  {{ cc: {n}, lat: {a['lat']/a['km']:.5f}, lng: {a['lng']/a['km']:.5f}, "
            f"peso: {a['km']/km_sel:.4f} }},"
        )

cab = f'''/**
 * Puntos donde se consulta la lluvia de cada consorcio — GENERADO, no editar.
 *
 * Uno por celda de {CEL_KM:.0f} km de la grilla del servicio meteorológico, tomando las
 * celdas con más camino hasta cubrir el {COBERTURA*100:.0f} % de la red (tope {TOPE}). `peso` es la
 * fracción de camino que representa el punto: los mm del consorcio son el
 * promedio de sus puntos ponderado por ese peso.
 *
 * Se usa esto y no la sede porque la sede está en el pueblo, y en 68 de 101
 * consorcios ni siquiera cae en la celda donde está el grueso del camino.
 *
 * Regenerar:  python3 scripts/build_puntos_lluvia.py
 */

export interface PuntoLluvia {{
  /** Número de consorcio */
  cc: number
  lat: number
  lng: number
  /** Fracción de la red que representa; los pesos de un consorcio suman 1 */
  peso: number
}}

export const PUNTOS_LLUVIA: PuntoLluvia[] = [
'''
open(SALIDA, 'w', encoding='utf-8').write(cab + '\n'.join(filas) + '\n]\n')

filas.sort(key=lambda f: int(f.split('cc: ')[1].split(',')[0]))

cubiertos = len(red) + len(sin_red)
print(f'consorcios: {cubiertos}  ·  puntos: {total_puntos}  ·  promedio {total_puntos/cubiertos:.1f} por consorcio')
print(f'por centroide de QGIS (sin traza en el bundle): {sin_red or "ninguno"}')
print(f'llamadas a la API en lotes de 40: {math.ceil(total_puntos/40)}')
