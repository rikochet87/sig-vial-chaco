import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { Relevamiento } from '@/types/relevamiento';

function escXml(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function row(label: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  return `<tr><td><b>${escXml(label)}</b></td><td>${escXml(String(value))}</td></tr>`;
}

function buildDescription(r: Relevamiento): string {
  const rows: string[] = [
    row('Fecha', r.fecha ? new Date(r.fecha).toLocaleString('es-AR') : ''),
    row('Tipo', r.tipo),
    row('Estado calzada', r.estadoCalzada),
    row('Ruta / Tramo', r.rutaTramo),
    row('Técnico', r.tecnico),
    row('Zona', r.autoDeteccion?.zona),
    row('CC N°', r.autoDeteccion?.ccNumero != null ? String(r.autoDeteccion.ccNumero) : ''),
    row('Consorcio', r.autoDeteccion?.ccNombre),
    row('Red CC (km)', r.autoDeteccion?.redKm != null ? String(r.autoDeteccion.redKm) : ''),
  ];

  if (r.datosPuente) {
    const d = r.datosPuente;
    rows.push(
      row('Long. total', d.longitudTotal ? d.longitudTotal + ' m' : ''),
      row('Palizadas', String(d.cantidadPalizadas)),
      ...(d.lucesPalizadas ?? []).map((l, i) => row(`Vano ${i + 1}`, l ? l + ' m' : '')),
      row('H libre', d.h ? d.h + ' m' : ''),
      row('J camino', d.j ? d.j + ' m' : ''),
      row('Estructura', d.tipoEstructura),
      row('Guía ruedas', d.guiaRuedas ? 'Sí' : 'No'),
      d.guiaRuedas ? row('Est. guía ruedas', d.estadoGuiaRuedas) : '',
      row('Barandas', d.barandas ? 'Sí' : 'No'),
      d.barandas ? row('H barandas', d.hBarandas ? d.hBarandas + ' m' : '') : '',
      row('Est. estructural', d.estadoEstructural),
    );
  }

  if (r.datosAlcantarilla) {
    const d = r.datosAlcantarilla;
    rows.push(
      row('Long. total', d.longitudTotal ? d.longitudTotal + ' m' : ''),
      row('Cant. luces', d.cantidadLuces),
      row('Long. luces', d.longitudLuces ? d.longitudLuces + ' m' : ''),
      row('Ancho total', d.anchoTotal ? d.anchoTotal + ' m' : ''),
      row('Ancho calzada', d.anchoCalzada ? d.anchoCalzada + ' m' : ''),
      row('H', d.h ? d.h + ' m' : ''),
      row('Mat. alas', d.materialesAlas),
      row('Long. alas', d.longitudAlas ? d.longitudAlas + ' m' : ''),
      row('Est. estructural', d.estadoEstructural),
      row('Sit. hidráulica', d.situacionHidraulica),
    );
  }

  if (r.datosTubos) {
    const d = r.datosTubos;
    rows.push(
      row('J ancho', d.jAncho ? d.jAncho + ' m' : ''),
      row('Diámetro', d.d ? d.d + ' m' : ''),
      row('Cabezales', d.cabezales),
      row('Tapada', d.tapada ? d.tapada + ' m' : ''),
      row('Cantidad', String(d.cantidad)),
    );
  }

  if (r.datosRipio) {
    const d = r.datosRipio;
    const ancho = parseFloat(d.ancho) || 0;
    const longitud = parseFloat(d.longitud) || 0;
    const espesor = parseFloat(d.espesor) || 0;
    const toneladas = ancho > 0 && longitud > 0 && espesor > 0
      ? (ancho * longitud * espesor * 2.1).toFixed(2)
      : null;
    rows.push(
      row('Ancho', d.ancho ? d.ancho + ' m' : ''),
      row('Longitud', d.longitud ? d.longitud + ' m' : ''),
      row('Espesor', d.espesor ? d.espesor + ' m' : ''),
      toneladas ? row('Toneladas estimadas', toneladas + ' t') : '',
      row('Empresa', d.empresa),
      row('Fecha ejecución', d.fechaEjecucion),
    );
  }

  if (r.datosOtro?.descripcion) {
    rows.push(row('Descripción', r.datosOtro.descripcion));
  }

  if (r.observaciones) {
    rows.push(row('Observaciones', r.observaciones));
  }

  if (r.fotos.length > 0) {
    rows.push(row('Fotos', String(r.fotos.length)));
  }

  const tableRows = rows.filter(Boolean).join('\n');
  return `<![CDATA[<table border="1" cellpadding="4" style="border-collapse:collapse;font-family:sans-serif;font-size:12px">${tableRows}</table>]]>`;
}

function buildGeometry(r: Relevamiento): string {
  if (r.tipo === 'Ripio' && r.coordsLinea && r.coordsLinea.length >= 2) {
    const coords = r.coordsLinea.map(p => `${p.lng},${p.lat},0`).join(' ');
    return `<LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString>`;
  }
  return `<Point><coordinates>${r.coords.lng},${r.coords.lat},0</coordinates></Point>`;
}

const TIPO_STYLE: Record<string, string> = {
  Puente: 'stylePuente',
  Alcantarilla: 'styleAlcantarilla',
  Tubos: 'styleTubos',
  Ripio: 'styleRipio',
  Otro: 'styleOtro',
};

function buildStyles(): string {
  const defs: Array<{ id: string; color: string; label: string }> = [
    { id: 'stylePuente',      color: 'ff4444cc', label: 'PTE' },
    { id: 'styleAlcantarilla',color: 'ff44cc44', label: 'ALC' },
    { id: 'styleTubos',       color: 'ffcc4444', label: 'TUB' },
    { id: 'styleRipio',       color: 'ff22aaee', label: 'RIP' },
    { id: 'styleOtro',        color: 'ff888888', label: '?'   },
  ];
  return defs.map(({ id, color, label }) => `
  <Style id="${id}">
    <IconStyle>
      <color>${color}</color>
      <scale>1.0</scale>
      <Icon><href>http://maps.google.com/mapfiles/kml/paddle/${label === '?' ? 'wht-blank' : label.toLowerCase()}.png</href></Icon>
    </IconStyle>
    <LabelStyle><scale>0.8</scale></LabelStyle>
    <LineStyle><color>${color}</color><width>4</width></LineStyle>
    <PolyStyle><fill>0</fill></PolyStyle>
  </Style>`).join('\n');
}

function buildKML(items: Relevamiento[]): string {
  const placemarks = items.map(r => {
    const name = escXml(r.rutaTramo || r.ccAsociado || r.tipo || r.id);
    const styleUrl = TIPO_STYLE[r.tipo] ?? 'styleOtro';
    return `
  <Placemark>
    <name>${name}</name>
    <description>${buildDescription(r)}</description>
    <styleUrl>#${styleUrl}</styleUrl>
    ${buildGeometry(r)}
  </Placemark>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Relevamientos SIG Vial Chaco</name>
  <open>1</open>
  ${buildStyles()}
  ${placemarks}
</Document>
</kml>`;
}

export async function exportarKMZ(items: Relevamiento[], filename?: string): Promise<void> {
  if (items.length === 0) return;

  const kml = buildKML(items);
  const zip = new JSZip();
  zip.file('doc.kml', kml);

  const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  const name = filename ?? `relevamientos_${items.length}`;
  const fileUri = (FileSystem.cacheDirectory ?? '') + `${name}.kmz`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/vnd.google-earth.kmz',
    UTI: 'com.google.earth.kmz',
    dialogTitle: `Exportar como KMZ`,
  });
}
