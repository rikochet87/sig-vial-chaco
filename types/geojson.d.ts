// Permite importar archivos .geojson como módulos TypeScript
declare module '*.geojson' {
  const value: GeoJSON.FeatureCollection;
  export default value;
}

// Tipos GeoJSON básicos (sin dependencia externa)
declare namespace GeoJSON {
  type Position = [number, number] | [number, number, number];

  interface Point {
    type: 'Point';
    coordinates: Position;
  }
  interface MultiPoint {
    type: 'MultiPoint';
    coordinates: Position[];
  }
  interface LineString {
    type: 'LineString';
    coordinates: Position[];
  }
  interface MultiLineString {
    type: 'MultiLineString';
    coordinates: Position[][];
  }
  interface Polygon {
    type: 'Polygon';
    coordinates: Position[][];
  }
  interface MultiPolygon {
    type: 'MultiPolygon';
    coordinates: Position[][][];
  }

  type Geometry = Point | MultiPoint | LineString | MultiLineString | Polygon | MultiPolygon;

  interface Feature<G extends Geometry = Geometry> {
    type: 'Feature';
    geometry: G;
    properties: Record<string, any> | null;
  }

  interface FeatureCollection<G extends Geometry = Geometry> {
    type: 'FeatureCollection';
    features: Feature<G>[];
  }
}
