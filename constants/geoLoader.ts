/**
 * geoLoader.ts
 * Convierte capas GeoJSON exportadas desde QGIS al formato
 * que necesita react-native-maps (latLng objects).
 *
 * Archivos esperados en assets/geojson/:
 *   - limite_chaco.geojson  → polígono del límite provincial
 *   - consorcios.geojson    → puntos con atributos de cada consorcio
 *   - red_vial.geojson      → líneas de la red vial (opcional)
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface ConsorcioFeature {
  numero: string | number;
  nombre: string;
  localidad: string;
  zona: 'ZI' | 'ZII' | 'ZIII' | 'ZIV' | 'ZV';
  latitude: number;
  longitude: number;
  redKm: number;
  redPrimaria: number;
  redSecundaria: number;
  redTerciaria: number;
  presidente: string;
  vicepresidente: string;
  secretario: string;
  tesorero: string;
  color: string;
}

export interface RedVialFeature {
  tipo: 'primaria' | 'secundaria' | 'terciaria';
  nombre: string;
  coordinates: LatLng[];
  color: string;
}

// ── Colores por zona ──────────────────────────────────────────────────────────

export const ZONA_COLORS: Record<string, string> = {
  ZI:   '#6baed6',
  ZII:  '#fb6a4a',
  ZIII: '#fdd44c',
  ZIV:  '#74c476',
  ZV:   '#9e9ac8',
};

const RED_VIAL_COLORS: Record<string, string> = {
  primaria:   '#e67e22',
  secundaria: '#27ae60',
  terciaria:  '#95a5a6',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convierte [lng, lat] de GeoJSON a { latitude, longitude } */
function posToLatLng([lng, lat]: number[]): LatLng {
  return { latitude: lat, longitude: lng };
}

/** Extrae el anillo exterior de un polígono GeoJSON */
function polygonToLatLng(coordinates: number[][][]): LatLng[] {
  return coordinates[0].map(posToLatLng);
}

// ── Parsers principales ───────────────────────────────────────────────────────

/**
 * Parsea limite_chaco.geojson → array de LatLng para react-native-maps Polygon
 * Espera un Feature de tipo Polygon o MultiPolygon.
 */
export function parseLimiteChaco(geojson: GeoJSON.FeatureCollection): LatLng[] {
  if (!geojson?.features?.length) return [];
  const feature = geojson.features[0];
  const geom = feature.geometry;

  if (geom.type === 'Polygon') {
    return polygonToLatLng(geom.coordinates as number[][][]);
  }
  if (geom.type === 'MultiPolygon') {
    // Toma el polígono más grande (mayor cantidad de puntos)
    const rings = (geom.coordinates as number[][][][]);
    const biggest = rings.reduce((a, b) => (b[0].length > a[0].length ? b : a));
    return polygonToLatLng(biggest);
  }
  return [];
}

/**
 * Parsea consorcios.geojson → array de ConsorcioFeature
 * Las propiedades del GeoJSON deben incluir los campos del consorcio.
 * Nombres de campo flexibles (mayúsculas/minúsculas).
 */
export function parseConsorcios(geojson: GeoJSON.FeatureCollection): ConsorcioFeature[] {
  if (!geojson?.features?.length) return [];

  return geojson.features
    .filter(f => f.geometry?.type === 'Point')
    .map(f => {
      const p = f.properties ?? {};
      const coords = (f.geometry as GeoJSON.Point).coordinates;
      const zona = (p.zona ?? p.ZONA ?? p.zone ?? 'ZI') as ConsorcioFeature['zona'];

      return {
        numero:        p.numero ?? p.NUMERO ?? p.id ?? '',
        nombre:        p.nombre ?? p.NOMBRE ?? p.name ?? '',
        localidad:     p.localidad ?? p.LOCALIDAD ?? p.locality ?? '',
        zona,
        latitude:      coords[1],
        longitude:     coords[0],
        redKm:         Number(p.red_km ?? p.redKm ?? p.RED_KM ?? 0),
        redPrimaria:   Number(p.red_primaria ?? p.redPrimaria ?? 0),
        redSecundaria: Number(p.red_secundaria ?? p.redSecundaria ?? 0),
        redTerciaria:  Number(p.red_terciaria ?? p.redTerciaria ?? 0),
        presidente:    p.presidente ?? p.PRESIDENTE ?? '',
        vicepresidente:p.vicepresidente ?? p.VICEPRESIDENTE ?? '',
        secretario:    p.secretario ?? p.SECRETARIO ?? '',
        tesorero:      p.tesorero ?? p.TESORERO ?? '',
        color:         ZONA_COLORS[zona] ?? '#888',
      };
    });
}

/**
 * Parsea red_vial.geojson → array de RedVialFeature
 * Espera features de tipo LineString con propiedad 'tipo'.
 */
export function parseRedVial(geojson: GeoJSON.FeatureCollection): RedVialFeature[] {
  if (!geojson?.features?.length) return [];

  return geojson.features
    .filter(f => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString')
    .map(f => {
      const p = f.properties ?? {};
      const tipo = (p.tipo ?? p.TIPO ?? p.type ?? 'terciaria') as RedVialFeature['tipo'];
      const geom = f.geometry;

      let coordinates: LatLng[] = [];
      if (geom.type === 'LineString') {
        coordinates = (geom.coordinates as number[][]).map(posToLatLng);
      } else if (geom.type === 'MultiLineString') {
        coordinates = (geom.coordinates as number[][][]).flat().map(posToLatLng);
      }

      return {
        tipo,
        nombre:      p.nombre ?? p.NOMBRE ?? '',
        coordinates,
        color:       RED_VIAL_COLORS[tipo] ?? '#888',
      };
    });
}
