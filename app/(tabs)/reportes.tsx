import { useState, useCallback, useMemo, createContext, useContext } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, Share, Alert, Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/context/ThemeContext';
import type { ColorPalette } from '@/constants/Colors';
import { useRelevamientos } from '@/hooks/useRelevamientos';
import type { Relevamiento, EstadoCalzada } from '@/types/relevamiento';
import { ESTADO_COLORS } from '@/types/relevamiento';
import { formatFechaHora } from '@/utils/formatDate';
import { exportarKMZ } from '@/utils/exportKMZ';

// Contexto interno para distribuir estilos a subcomponentes sin prop drilling
type StylesType = ReturnType<typeof makeStyles>;
const StylesCtx = createContext<StylesType | null>(null);
const useStyles = () => useContext(StylesCtx)!;

function buildGeoJSON(items: Relevamiento[]) {
  return {
    type: 'FeatureCollection',
    features: items.map(r => {
      // Ripio → LineString; el resto → Point
      const geometry = r.tipo === 'Ripio' && r.coordsLinea && r.coordsLinea.length >= 2
        ? { type: 'LineString', coordinates: r.coordsLinea.map(p => [p.lng, p.lat]) }
        : { type: 'Point', coordinates: [r.coords.lng, r.coords.lat] };

      const ancho = parseFloat(r.datosRipio?.ancho ?? '') || 0;
      const longitud = parseFloat(r.datosRipio?.longitud ?? '') || 0;
      const espesor = parseFloat(r.datosRipio?.espesor ?? '') || 0;
      const toneladas = ancho > 0 && longitud > 0 && espesor > 0
        ? parseFloat((ancho * longitud * espesor * 2.1).toFixed(2))
        : null;

      return {
        type: 'Feature',
        geometry,
        properties: {
          id: r.id,
          fecha: r.fecha,
          zona: r.autoDeteccion?.zona ?? '',
          cc_numero: r.autoDeteccion?.ccNumero ?? '',
          cc_nombre: r.autoDeteccion?.ccNombre ?? '',
          ruta_tramo: r.rutaTramo || r.ccAsociado || '',
          estado_calzada: r.estadoCalzada,
          tipo: r.tipo ?? '',
          tecnico: r.tecnico,
          observaciones: r.observaciones,
          // sub-form data flattened
          ...(r.datosPuente ?? {}),
          ...(r.datosAlcantarilla ?? {}),
          ...(r.datosTubos ?? {}),
          descripcion_otro: r.datosOtro?.descripcion ?? '',
          ...(r.datosRipio ?? {}),
          toneladas_estimadas: toneladas,
          fotos: r.fotos.length,
        },
      };
    }),
  };
}

async function exportarRelevamiento(r: Relevamiento) {
  const geojson = JSON.stringify(buildGeoJSON([r]), null, 2);
  const fecha = new Date(r.fecha).toLocaleDateString('es-AR').replace(/\//g, '-');
  const id = r.rutaTramo || r.ccAsociado || r.id;
  await Share.share({
    message: geojson,
    title: `Relevamiento_${id}_${fecha}.geojson`,
  });
}

async function exportarTodos(items: Relevamiento[]) {
  if (items.length === 0) return;
  const geojson = JSON.stringify(buildGeoJSON(items), null, 2);
  await Share.share({
    message: geojson,
    title: `Relevamientos_SIG_Vial_${items.length}.geojson`,
  });
}

// ── Sub-form summary ──────────────────────────────────────────────────────────

function SubFormDetail({ r }: { r: Relevamiento }) {
  const tipo = r.tipo;
  if (!tipo) return null;

  if (tipo === 'Puente' && r.datosPuente) {
    const d = r.datosPuente;
    const vanos = d.lucesPalizadas?.map((l, i) => l ? `Vano ${i + 1}: ${l} m` : null).filter(Boolean) ?? [];
    const items = [
      d.longitudTotal && `Long. total: ${d.longitudTotal} m`,
      d.cantidadPalizadas && `Palizadas: ${d.cantidadPalizadas}`,
      ...vanos,
      d.h && `H libre: ${d.h} m`,
      d.j && `J camino: ${d.j} m`,
      d.tipoEstructura && `Estructura: ${d.tipoEstructura}`,
      d.guiaRuedas !== undefined && `Guía ruedas: ${d.guiaRuedas ? 'Sí' : 'No'}`,
      d.guiaRuedas && d.estadoGuiaRuedas && `Est. guía ruedas: ${d.estadoGuiaRuedas}`,
      d.barandas !== undefined && `Barandas: ${d.barandas ? 'Sí' : 'No'}`,
      d.barandas && d.hBarandas && `H barandas: ${d.hBarandas} m`,
      d.estadoEstructural && `Est. estructural: ${d.estadoEstructural}`,
    ].filter(Boolean) as string[];
    return <FieldList items={items} />;
  }

  if (tipo === 'Alcantarilla' && r.datosAlcantarilla) {
    const d = r.datosAlcantarilla;
    const items = [
      d.longitudTotal && `Long. total: ${d.longitudTotal} m`,
      d.cantidadLuces && `Luces: ${d.cantidadLuces}`,
      d.longitudLuces && `Long. luces: ${d.longitudLuces} m`,
      d.anchoTotal && `Ancho total: ${d.anchoTotal} m`,
      d.anchoCalzada && `Ancho calzada: ${d.anchoCalzada} m`,
      d.h && `H: ${d.h} m`,
      d.materialesAlas && `Mat. alas: ${d.materialesAlas}`,
      d.longitudAlas && `Long. alas: ${d.longitudAlas} m`,
      d.estadoEstructural && `Est. estructural: ${d.estadoEstructural}`,
      d.situacionHidraulica && `Situación hidr.: ${d.situacionHidraulica}`,
    ].filter(Boolean) as string[];
    return <FieldList items={items} />;
  }

  if (tipo === 'Tubos' && r.datosTubos) {
    const d = r.datosTubos;
    const items = [
      d.jAncho && `J ancho: ${d.jAncho} m`,
      d.d && `Diámetro: ${d.d} m`,
      d.cabezales && `Cabezales: ${d.cabezales}`,
      d.tapada && `Tapada: ${d.tapada} m`,
      `Cantidad: ${d.cantidad}`,
    ].filter(Boolean) as string[];
    return <FieldList items={items} />;
  }

  if (tipo === 'Otro' && r.datosOtro?.descripcion) {
    return <FieldList items={[r.datosOtro.descripcion]} />;
  }

  if (tipo === 'Ripio' && r.datosRipio) {
    const d = r.datosRipio;
    const ancho = parseFloat(d.ancho) || 0;
    const longitud = parseFloat(d.longitud) || 0;
    const espesor = parseFloat(d.espesor) || 0;
    const toneladas = ancho > 0 && longitud > 0 && espesor > 0
      ? (ancho * longitud * espesor * 2.1).toFixed(2)
      : null;
    const items = [
      r.coordsLinea && `Tramo: ${r.coordsLinea.length} puntos GPS`,
      d.ancho && `Ancho: ${d.ancho} m`,
      d.longitud && `Longitud: ${d.longitud} m`,
      d.espesor && `Espesor: ${d.espesor} m`,
      toneladas && `Toneladas estimadas: ${toneladas} t`,
      d.empresa && `Empresa: ${d.empresa}`,
      d.fechaEjecucion && `Fecha ejecución: ${d.fechaEjecucion}`,
    ].filter(Boolean) as string[];
    return <FieldList items={items} />;
  }

  return null;
}

function FieldList({ items }: { items: string[] }) {
  const styles = useStyles();
  return (
    <View style={styles.fieldList}>
      {items.map((item, i) => (
        <View key={i} style={styles.fieldRow}>
          <View style={styles.fieldDot} />
          <Text style={styles.fieldText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  Puente: 'PTE', Alcantarilla: 'ALC', Tubos: 'TUB', Ripio: 'RIP', Otro: '?',
};

function RelevamientoCard({
  item,
  onDelete,
}: {
  item: Relevamiento;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const styles = useStyles();
  const Colors = useColors();
  const color = ESTADO_COLORS[item.estadoCalzada as EstadoCalzada] ?? '#888';
  const tipo = item.tipo ?? (item.estructura ?? '');
  const rutaLabel = item.rutaTramo || item.ccAsociado || 'Sin ruta/tramo';

  const confirmDelete = () => {
    Alert.alert('Eliminar relevamiento', '¿Seguro que querés eliminarlo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => onDelete(item.id) },
    ]);
  };

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      {/* Header */}
      <TouchableOpacity style={styles.cardHeader} onPress={() => setExpanded(v => !v)}>
        <View style={[styles.estadoBadge, { backgroundColor: color }]}>
          <Text style={styles.estadoBadgeText}>{item.estadoCalzada}</Text>
        </View>
        {tipo ? (
          <View style={styles.tipoBadge}>
            <Text style={styles.tipoBadgeText}>{TIPO_LABELS[tipo] ?? tipo}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {rutaLabel}{item.tecnico ? ` · ${item.tecnico}` : ''}
          </Text>
          <View style={styles.cardMeta}>
            {item.autoDeteccion && (
              <Text style={styles.cardZona}>{item.autoDeteccion.zona} · CC {item.autoDeteccion.ccNumero}</Text>
            )}
            <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
            <Text style={styles.cardMetaText}>{formatFechaHora(item.fecha)}</Text>
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={Colors.textMuted}
        />
      </TouchableOpacity>

      {/* Expanded detail */}
      {expanded && (
        <View style={styles.detail}>
          {/* Coords */}
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.detailMono}>
              {item.coords.lat.toFixed(5)}, {item.coords.lng.toFixed(5)}
            </Text>
          </View>

          {/* Auto-detección */}
          {item.autoDeteccion && (
            <View style={styles.detailRow}>
              <Ionicons name="business-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.detailText} numberOfLines={2}>{item.autoDeteccion.ccNombre}</Text>
            </View>
          )}

          {/* Tipo + sub-form */}
          {tipo ? (
            <View style={styles.tipoSection}>
              <Text style={styles.tipoSectionLabel}>{tipo}</Text>
              <SubFormDetail r={item} />
            </View>
          ) : null}

          {/* Observaciones */}
          {item.observaciones?.length > 0 && (
            <View style={[styles.detailRow, { alignItems: 'flex-start' }]}>
              <Ionicons name="document-text-outline" size={13} color={Colors.textMuted} style={{ marginTop: 2 }} />
              <Text style={styles.detailText}>{item.observaciones}</Text>
            </View>
          )}

          {/* Fotos */}
          {item.fotos.length > 0 && (
            <View style={styles.detailRow}>
              <Ionicons name="camera-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.detailText}>{item.fotos.length} foto{item.fotos.length !== 1 ? 's' : ''}</Text>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => exportarRelevamiento(item)}>
              <Ionicons name="share-outline" size={15} color={Colors.accent} />
              <Text style={[styles.actionText, { color: Colors.accent }]}>Exportar GeoJSON</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={confirmDelete}>
              <Ionicons name="trash-outline" size={15} color={Colors.danger} />
              <Text style={[styles.actionText, { color: Colors.danger }]}>Eliminar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

const FILTROS: Array<EstadoCalzada | 'Todos'> = ['Todos', 'Bueno', 'Regular', 'Malo'];

export default function RelevamientosScreen() {
  const { relevamientos, loading, remove, reload } = useRelevamientos();
  const [filtro, setFiltro] = useState<EstadoCalzada | 'Todos'>('Todos');
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const filtrados = filtro === 'Todos'
    ? relevamientos
    : relevamientos.filter(r => r.estadoCalzada === filtro);

  const conteos = relevamientos.reduce<Record<string, number>>((acc, r) => {
    acc[r.estadoCalzada] = (acc[r.estadoCalzada] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <StylesCtx.Provider value={styles}>
    <View style={styles.container}>
      {/* Resumen */}
      <View style={styles.summary}>
        {(['Bueno', 'Regular', 'Malo'] as EstadoCalzada[]).map(e => (
          <View key={e} style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: ESTADO_COLORS[e] }]}>
              {conteos[e] ?? 0}
            </Text>
            <Text style={styles.summaryLabel}>{e}</Text>
          </View>
        ))}
      </View>

      {/* Filtros */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {FILTROS.map(f => {
          const active = filtro === f;
          const bgColor = f === 'Todos' ? Colors.primary : ESTADO_COLORS[f as EstadoCalzada];
          return (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, active && { backgroundColor: bgColor, borderColor: bgColor }]}
              onPress={() => setFiltro(f)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {f === 'Todos' ? `Todos (${relevamientos.length})` : `${f} (${conteos[f] ?? 0})`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Count + export */}
      <View style={styles.topBar}>
        <Text style={styles.countText}>
          {filtrados.length} relevamiento{filtrados.length !== 1 ? 's' : ''}
        </Text>
        {filtrados.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity style={styles.exportAllBtn} onPress={() => exportarTodos(filtrados)}>
              <Ionicons name="cloud-download-outline" size={14} color={Colors.accent} />
              <Text style={styles.exportAllText}>GeoJSON</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.exportAllBtn} onPress={() => exportarKMZ(filtrados)}>
              <Ionicons name="earth-outline" size={14} color="#27ae60" />
              <Text style={[styles.exportAllText, { color: '#27ae60' }]}>KMZ</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <RelevamientoCard item={item} onDelete={remove} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{'📋'}</Text>
            <Text style={styles.emptyTitle}>
              {loading ? 'Cargando...' : 'Sin relevamientos'}
            </Text>
            <Text style={styles.emptyText}>
              {loading ? '' : 'Andá al mapa y tocá el botón 📋 para registrar un relevamiento de campo.'}
            </Text>
          </View>
        }
      />
    </View>
    </StylesCtx.Provider>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },

    summary: {
      flexDirection: 'row', backgroundColor: C.primary,
      paddingVertical: 14, paddingHorizontal: 8, justifyContent: 'space-around',
    },
    summaryItem: { alignItems: 'center' },
    summaryValue: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
    summaryLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 },

    filterScroll: { flexShrink: 0, flexGrow: 0 },
    filterRow: {
      paddingHorizontal: 12, paddingRight: 24, paddingVertical: 8,
      gap: 6, flexDirection: 'row', alignItems: 'center',
    },
    filterChip: {
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    },
    filterChipText: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
    filterChipTextActive: { color: '#fff' },

    topBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingBottom: 4,
    },
    countText: { fontSize: 12, color: C.textMuted },
    exportAllBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    },
    exportAllText: { fontSize: 12, color: C.accent, fontWeight: '600' },

    list: { padding: 12, paddingTop: 4 },

    card: {
      backgroundColor: C.surface, borderRadius: 12, marginBottom: 10,
      borderLeftWidth: 4, elevation: 2, shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3,
      overflow: 'hidden',
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
    estadoBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, flexShrink: 0 },
    estadoBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
    tipoBadge: {
      backgroundColor: C.background, borderRadius: 6,
      paddingHorizontal: 6, paddingVertical: 4, flexShrink: 0,
      borderWidth: 1, borderColor: C.border,
    },
    tipoBadgeText: { fontSize: 10, fontWeight: '900', color: C.textSecondary },
    cardTitle: { fontSize: 13, fontWeight: '700', color: C.textPrimary },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' },
    cardZona: { fontSize: 10, color: C.accent, fontWeight: '700', marginRight: 4 },
    cardMetaText: { fontSize: 11, color: C.textMuted },

    detail: {
      backgroundColor: C.background, paddingHorizontal: 14,
      paddingTop: 10, paddingBottom: 4, borderTopWidth: 1, borderTopColor: C.border,
    },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    detailText: { fontSize: 12, color: C.textSecondary, flex: 1 },
    detailMono: {
      fontSize: 12, color: C.textSecondary,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },

    tipoSection: {
      backgroundColor: C.surface, borderRadius: 8,
      padding: 10, marginBottom: 10,
      borderWidth: 1, borderColor: C.border,
    },
    tipoSectionLabel: {
      fontSize: 10, fontWeight: '800', color: C.accent,
      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
    },
    fieldList: { gap: 3 },
    fieldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    fieldDot: {
      width: 4, height: 4, borderRadius: 2,
      backgroundColor: C.textMuted, marginTop: 5, flexShrink: 0,
    },
    fieldText: { fontSize: 11, color: C.textSecondary, flex: 1, lineHeight: 16 },

    actions: {
      flexDirection: 'row', gap: 8, paddingVertical: 10,
      borderTopWidth: 1, borderTopColor: C.border, marginTop: 4,
    },
    actionBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 5, paddingVertical: 8, borderRadius: 8,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    },
    actionBtnDanger: {
      borderColor: C.danger + '40',
      backgroundColor: C.danger + '08',
    },
    actionText: { fontSize: 12, fontWeight: '700' },

    empty: { alignItems: 'center', paddingTop: 70, gap: 10, paddingHorizontal: 32 },
    emptyIcon: { fontSize: 48 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textSecondary },
    emptyText: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 19 },
  });
}
