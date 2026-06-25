/**
 * Exportador de Shapefiles ESRI (.shp + .shx + .dbf + .prj + .cpg)
 * Genera dos shapefiles separados (puntos y polilíneas) dentro de un .zip.
 */
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { Relevamiento } from '@/types/relevamiento';

// ── Utilidades binarias ───────────────────────────────────────────────────────

function dv(b: Uint8Array) {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}
const i32be = (b: Uint8Array, o: number, v: number) => dv(b).setInt32(o, v, false);
const i32le = (b: Uint8Array, o: number, v: number) => dv(b).setInt32(o, v, true);
const f64le = (b: Uint8Array, o: number, v: number) => dv(b).setFloat64(o, v, true);

const TE = new TextEncoder();

// ── DBF builder ───────────────────────────────────────────────────────────────

interface DbfField { name: string; type: 'C' | 'N'; len: number; dec: number; }

function buildDbf(fields: DbfField[], rows: Record<string, any>[]): Uint8Array {
  const hdr = 32 + fields.length * 32 + 1;
  const recLen = 1 + fields.reduce((s, f) => s + f.len, 0);
  const buf = new Uint8Array(hdr + rows.length * recLen);
  const v = dv(buf);
  const now = new Date();

  buf[0] = 0x03;
  buf[1] = now.getFullYear() - 1900;
  buf[2] = now.getMonth() + 1;
  buf[3] = now.getDate();
  v.setUint32(4, rows.length, true);
  v.setUint16(8, hdr, true);
  v.setUint16(10, recLen, true);
  buf[29] = 0x69; // UTF-8

  let pos = 32;
  for (const f of fields) {
    buf.set(TE.encode(f.name.substring(0, 11)), pos);
    buf[pos + 11] = f.type.charCodeAt(0);
    buf[pos + 16] = f.len;
    buf[pos + 17] = f.dec;
    pos += 32;
  }
  buf[pos++] = 0x0d;

  for (const row of rows) {
    buf[pos++] = 0x20;
    for (const f of fields) {
      const raw = row[f.name] ?? '';
      let val: string;
      if (f.type === 'N') {
        const n = parseFloat(String(raw)) || 0;
        val = f.dec > 0 ? n.toFixed(f.dec) : Math.round(n).toString();
        val = val.length > f.len ? val.substring(0, f.len) : val.padStart(f.len);
      } else {
        val = String(raw).substring(0, f.len).padEnd(f.len);
      }
      const vb = TE.encode(val);
      for (let i = 0; i < f.len; i++) buf[pos + i] = i < vb.length ? vb[i] : 0x20;
      pos += f.len;
    }
  }
  return buf;
}

// ── SHP/SHX builders ─────────────────────────────────────────────────────────

interface ShpResult { shp: Uint8Array; shx: Uint8Array; }

function shpHeader(buf: Uint8Array, fileBytes: number, type: number,
                   xn: number, yn: number, xx: number, yx: number) {
  i32be(buf, 0, 9994);
  i32be(buf, 24, fileBytes / 2);
  i32le(buf, 28, 1000);
  i32le(buf, 32, type);
  f64le(buf, 36, xn); f64le(buf, 44, yn);
  f64le(buf, 52, xx); f64le(buf, 60, yx);
}

/** Shape type 1 — Point */
function buildPointShp(pts: Array<{ x: number; y: number }>): ShpResult {
  const empty = () => {
    const b = new Uint8Array(100); shpHeader(b, 100, 1, 0, 0, 0, 0); return b;
  };
  if (!pts.length) return { shp: empty(), shx: empty() };

  const REC_CONTENT = 20; // 4+8+8
  const fileLen = 100 + pts.length * (8 + REC_CONTENT);
  const shp = new Uint8Array(fileLen);
  const shx = new Uint8Array(100 + pts.length * 8);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  shpHeader(shp, fileLen, 1, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  shpHeader(shx, 100 + pts.length * 8, 1, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));

  let so = 100, xo = 100;
  for (let i = 0; i < pts.length; i++) {
    i32be(shx, xo, so / 2); i32be(shx, xo + 4, REC_CONTENT / 2); xo += 8;
    i32be(shp, so, i + 1);  i32be(shp, so + 4, REC_CONTENT / 2); so += 8;
    i32le(shp, so, 1);
    f64le(shp, so + 4, pts[i].x);
    f64le(shp, so + 12, pts[i].y);
    so += REC_CONTENT;
  }
  return { shp, shx };
}

/** Shape type 3 — PolyLine */
function buildPolylineShp(lines: Array<Array<{ x: number; y: number }>>): ShpResult {
  const empty = () => {
    const b = new Uint8Array(100); shpHeader(b, 100, 3, 0, 0, 0, 0); return b;
  };
  if (!lines.length) return { shp: empty(), shx: empty() };

  // content bytes per record = 4+32+4+4+4 + npts*16 = 48 + npts*16
  const recContents = lines.map(l => 48 + l.length * 16);
  const fileLen = 100 + lines.reduce((s, _, i) => s + 8 + recContents[i], 0);
  const allPts = lines.flat();
  const xs = allPts.map(p => p.x), ys = allPts.map(p => p.y);

  const shp = new Uint8Array(fileLen);
  const shx = new Uint8Array(100 + lines.length * 8);
  shpHeader(shp, fileLen, 3, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  shpHeader(shx, 100 + lines.length * 8, 3, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));

  let so = 100, xo = 100;
  for (let i = 0; i < lines.length; i++) {
    const pts = lines[i];
    const cl = recContents[i];
    i32be(shx, xo, so / 2); i32be(shx, xo + 4, cl / 2); xo += 8;
    i32be(shp, so, i + 1);  i32be(shp, so + 4, cl / 2); so += 8;

    const lx = pts.map(p => p.x), ly = pts.map(p => p.y);
    i32le(shp, so, 3);
    f64le(shp, so + 4, Math.min(...lx));  f64le(shp, so + 12, Math.min(...ly));
    f64le(shp, so + 20, Math.max(...lx)); f64le(shp, so + 28, Math.max(...ly));
    i32le(shp, so + 36, 1);
    i32le(shp, so + 40, pts.length);
    i32le(shp, so + 44, 0);
    let pp = so + 48;
    for (const p of pts) { f64le(shp, pp, p.x); f64le(shp, pp + 8, p.y); pp += 16; }
    so += cl;
  }
  return { shp, shx };
}

// ── Atributos comunes ─────────────────────────────────────────────────────────

function commonRow(r: Relevamiento): Record<string, any> {
  return {
    id:       r.id,
    fecha:    r.fecha ? new Date(r.fecha).toLocaleString('es-AR') : '',
    zona:     r.autoDeteccion?.zona ?? '',
    cc_num:   r.autoDeteccion?.ccNumero != null ? String(r.autoDeteccion.ccNumero) : '',
    cc_nom:   r.autoDeteccion?.ccNombre ?? '',
    ruta:     r.rutaTramo || r.ccAsociado || '',
    estado:   r.estadoCalzada ?? '',
    tipo:     r.tipo ?? '',
    tecnico:  r.tecnico ?? '',
    obs:      (r.observaciones ?? '').substring(0, 120),
    fotos:    r.fotos?.length ?? 0,
  };
}

const PRJ = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

// ── Export principal ──────────────────────────────────────────────────────────

export async function exportarSHP(items: Relevamiento[]): Promise<void> {
  if (!items.length) return;

  const puntuales = items.filter(r => r.tipo !== 'Ripio');
  const ripios    = items.filter(r => r.tipo === 'Ripio' && (r.coordsLinea?.length ?? 0) >= 2);

  const zip = new JSZip();

  // ── Obras puntuales ───────────────────────────────────────────────────────
  if (puntuales.length > 0) {
    const FIELDS: DbfField[] = [
      { name: 'id',        type: 'C', len: 40, dec: 0 },
      { name: 'fecha',     type: 'C', len: 30, dec: 0 },
      { name: 'zona',      type: 'C', len: 10, dec: 0 },
      { name: 'cc_num',    type: 'C', len: 10, dec: 0 },
      { name: 'cc_nom',    type: 'C', len: 60, dec: 0 },
      { name: 'ruta',      type: 'C', len: 60, dec: 0 },
      { name: 'estado',    type: 'C', len: 10, dec: 0 },
      { name: 'tipo',      type: 'C', len: 20, dec: 0 },
      { name: 'tecnico',   type: 'C', len: 60, dec: 0 },
      { name: 'obs',       type: 'C', len: 120, dec: 0 },
      { name: 'fotos',     type: 'N', len: 3,  dec: 0 },
      // Puente
      { name: 'pte_long',  type: 'C', len: 15, dec: 0 },
      { name: 'pte_pal',   type: 'N', len: 3,  dec: 0 },
      { name: 'pte_h',     type: 'C', len: 15, dec: 0 },
      { name: 'pte_j',     type: 'C', len: 15, dec: 0 },
      { name: 'pte_estru', type: 'C', len: 40, dec: 0 },
      { name: 'pte_est',   type: 'C', len: 10, dec: 0 },
      // Alcantarilla
      { name: 'alc_long',  type: 'C', len: 15, dec: 0 },
      { name: 'alc_luces', type: 'C', len: 10, dec: 0 },
      { name: 'alc_atot',  type: 'C', len: 15, dec: 0 },
      { name: 'alc_acal',  type: 'C', len: 15, dec: 0 },
      { name: 'alc_mat',   type: 'C', len: 40, dec: 0 },
      { name: 'alc_hid',   type: 'C', len: 60, dec: 0 },
      { name: 'alc_est',   type: 'C', len: 10, dec: 0 },
      // Tubos
      { name: 'tub_janch', type: 'C', len: 15, dec: 0 },
      { name: 'tub_diam',  type: 'C', len: 15, dec: 0 },
      { name: 'tub_cab',   type: 'C', len: 40, dec: 0 },
      { name: 'tub_tap',   type: 'C', len: 15, dec: 0 },
      { name: 'tub_cant',  type: 'N', len: 3,  dec: 0 },
      // Otro
      { name: 'descrip',   type: 'C', len: 120, dec: 0 },
    ];

    const pts = puntuales.map(r => ({ x: r.coords.lng, y: r.coords.lat }));
    const rows = puntuales.map(r => ({
      ...commonRow(r),
      pte_long:  r.datosPuente?.longitudTotal ?? '',
      pte_pal:   r.datosPuente?.cantidadPalizadas ?? 0,
      pte_h:     r.datosPuente?.h ?? '',
      pte_j:     r.datosPuente?.j ?? '',
      pte_estru: r.datosPuente?.tipoEstructura ?? '',
      pte_est:   r.datosPuente?.estadoEstructural ?? '',
      alc_long:  r.datosAlcantarilla?.longitudTotal ?? '',
      alc_luces: r.datosAlcantarilla?.cantidadLuces ?? '',
      alc_atot:  r.datosAlcantarilla?.anchoTotal ?? '',
      alc_acal:  r.datosAlcantarilla?.anchoCalzada ?? '',
      alc_mat:   r.datosAlcantarilla?.materialesAlas ?? '',
      alc_hid:   r.datosAlcantarilla?.situacionHidraulica ?? '',
      alc_est:   r.datosAlcantarilla?.estadoEstructural ?? '',
      tub_janch: r.datosTubos?.jAncho ?? '',
      tub_diam:  r.datosTubos?.d ?? '',
      tub_cab:   r.datosTubos?.cabezales ?? '',
      tub_tap:   r.datosTubos?.tapada ?? '',
      tub_cant:  r.datosTubos?.cantidad ?? 0,
      descrip:   r.datosOtro?.descripcion ?? '',
    }));

    const { shp, shx } = buildPointShp(pts);
    const dbf = buildDbf(FIELDS, rows);
    zip.file('obras_puntuales.shp', shp);
    zip.file('obras_puntuales.shx', shx);
    zip.file('obras_puntuales.dbf', dbf);
    zip.file('obras_puntuales.prj', PRJ);
    zip.file('obras_puntuales.cpg', 'UTF-8');
  }

  // ── Ripio (polilíneas) ────────────────────────────────────────────────────
  if (ripios.length > 0) {
    const FIELDS: DbfField[] = [
      { name: 'id',        type: 'C', len: 40, dec: 0 },
      { name: 'fecha',     type: 'C', len: 30, dec: 0 },
      { name: 'zona',      type: 'C', len: 10, dec: 0 },
      { name: 'cc_num',    type: 'C', len: 10, dec: 0 },
      { name: 'cc_nom',    type: 'C', len: 60, dec: 0 },
      { name: 'ruta',      type: 'C', len: 60, dec: 0 },
      { name: 'estado',    type: 'C', len: 10, dec: 0 },
      { name: 'tecnico',   type: 'C', len: 60, dec: 0 },
      { name: 'obs',       type: 'C', len: 120, dec: 0 },
      { name: 'fotos',     type: 'N', len: 3,  dec: 0 },
      { name: 'ancho',     type: 'N', len: 10, dec: 2 },
      { name: 'longitud',  type: 'N', len: 10, dec: 2 },
      { name: 'espesor',   type: 'N', len: 10, dec: 3 },
      { name: 'toneladas', type: 'N', len: 15, dec: 2 },
      { name: 'empresa',   type: 'C', len: 60, dec: 0 },
      { name: 'fecha_ej',  type: 'C', len: 15, dec: 0 },
    ];

    const lines = ripios.map(r => r.coordsLinea!.map(p => ({ x: p.lng, y: p.lat })));
    const rows = ripios.map(r => {
      const d = r.datosRipio;
      const an = parseFloat(d?.ancho ?? '') || 0;
      const lo = parseFloat(d?.longitud ?? '') || 0;
      const es = parseFloat(d?.espesor ?? '') || 0;
      const ton = an > 0 && lo > 0 && es > 0
        ? parseFloat((an * lo * es * 2.1).toFixed(2)) : 0;
      return {
        ...commonRow(r),
        ancho: an, longitud: lo, espesor: es, toneladas: ton,
        empresa:  d?.empresa ?? '',
        fecha_ej: d?.fechaEjecucion ?? '',
      };
    });

    const { shp, shx } = buildPolylineShp(lines);
    const dbf = buildDbf(FIELDS, rows);
    zip.file('ripio.shp', shp);
    zip.file('ripio.shx', shx);
    zip.file('ripio.dbf', dbf);
    zip.file('ripio.prj', PRJ);
    zip.file('ripio.cpg', 'UTF-8');
  }

  const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  const uri = (FileSystem.cacheDirectory ?? '') + `relevamientos_${items.length}.zip`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/zip',
    UTI: 'public.zip-archive',
    dialogTitle: `Exportar ${items.length} relevamiento${items.length !== 1 ? 's' : ''} como SHP (ESRI)`,
  });
}
