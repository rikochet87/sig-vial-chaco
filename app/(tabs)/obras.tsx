import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, LayoutAnimation, UIManager, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useColors } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { CONSORCIOS } from '@/constants/realData';

// ── Android layout animation ──────────────────────────────────────────────────
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Obra {
  id: string;
  tipo: string;
  jurisdiccion: string | null;
  consorcio_numero: number | null;
  ubicacion: string | null;
  descripcion: string | null;
  estado: string | null;
  fecha_inicio: string | null;
  fecha_fin_estimada: string | null;
  cantidad: number | null;
  unidad: string | null;
  presupuesto_total: number | null;
  aporte_dvp: number | null;
  aporte_ccc: number | null;
  precio_unitario: number | null;
  visible_para: string | null;
  lat: number | null;
  lng: number | null;
  coords_linea: Array<{lat: number; lng: number}> | null;
  created_at: string;
}

export interface ObraHighlight {
  lat?: number;
  lng?: number;
  coordsLinea?: Array<{lat: number; lng: number}>;
  label: string;
  color: string;
}

// ── Constantes ────────────────────────────────────────────────────────────────
export const OBRA_HIGHLIGHT_KEY = 'sig_vial_obra_highlight';
const CACHE_KEY = 'sig_vial_obras_cache';

const TIPO_LABEL: Record<string, string> = {
  terraplen: 'Terraplén', excavacion: 'Excavación',
  ripio: 'Ripio', canal: 'Canal', limpieza: 'Limpieza Vial',
};
const TIPO_COLOR: Record<string, string> = {
  terraplen: '#8D6E63', excavacion: '#FF7043',
  ripio: '#90A4AE', canal: '#29B6F6', limpieza: '#66BB6A',
};
const ESTADO_LABEL: Record<string, string> = {
  planificada: 'Planificada', en_curso: 'En curso', ejecutada: 'Ejecutada',
};
const ESTADO_COLOR: Record<string, string> = {
  planificada: '#F5C300', en_curso: '#66BB6A', ejecutada: '#90A4AE',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtPesos = (n: number | null) =>
  n != null ? `$ ${Math.round(n).toLocaleString('es-AR')}` : '—';

const fmtFecha = (s: string | null) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

const getConsorcio = (numero: number | null) =>
  numero != null ? (CONSORCIOS.find(c => Number(c.numero) === numero) ?? null) : null;

// ── Fila de campo ─────────────────────────────────────────────────────────────
function Campo({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={s.campo}>
      <Text style={s.campoLabel}>{label}</Text>
      <Text style={[s.campoValue, accent ? { color: accent, fontWeight: '700', fontSize: 14 } : {}]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// ── Card expandible ───────────────────────────────────────────────────────────
function ObraCard({ obra, expanded, onToggle }: {
  obra: Obra;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = TIPO_COLOR[obra.tipo] ?? '#888';
  const estadoColor = ESTADO_COLOR[obra.estado ?? ''] ?? '#555';
  const consorcio = getConsorcio(obra.consorcio_numero);
  const ubicLabel = consorcio
    ? consorcio.nombre.replace(/Consorcio Caminero N[°º]?\s*/i, 'CC ')
    : (obra.ubicacion ?? '—');

  // Geometría: polilínea primero, fallback a punto, fallback a consorcio
  const hasLinea = obra.coords_linea && obra.coords_linea.length >= 2;
  const mapLat = !hasLinea ? (obra.lat ?? consorcio?.latitude ?? null) : null;
  const mapLng = !hasLinea ? (obra.lng ?? consorcio?.longitude ?? null) : null;
  const hasLocation = hasLinea || (mapLat != null && mapLng != null);

  const handleVerEnMapa = async () => {
    if (!hasLocation) return;
    const label = ubicLabel + (obra.descripcion ? ` — ${obra.descripcion}` : '');
    const highlight: ObraHighlight = hasLinea
      ? { coordsLinea: obra.coords_linea!, label, color }
      : { lat: mapLat!, lng: mapLng!, label, color };
    await AsyncStorage.setItem(OBRA_HIGHLIGHT_KEY, JSON.stringify(highlight));
    router.push('/(tabs)/mapa');
  };

  return (
    <View style={[s.card, expanded && s.cardExpanded]}>
      {/* Accent bar */}
      <View style={[s.accent, { backgroundColor: color }]} />

      {/* Header — siempre visible */}
      <TouchableOpacity style={s.cardHeader} onPress={onToggle} activeOpacity={0.75}>
        <View style={s.cardHeaderLeft}>
          <Text style={[s.cardTipo, { color }]}>
            {expanded ? '▾ ' : '▸ '}{TIPO_LABEL[obra.tipo] ?? obra.tipo}
          </Text>
          <Text style={s.cardUbic} numberOfLines={1}>{ubicLabel}</Text>
          {!expanded && obra.descripcion ? (
            <Text style={s.cardDesc} numberOfLines={1}>{obra.descripcion}</Text>
          ) : null}
        </View>
        <View style={s.cardHeaderRight}>
          <View style={[s.estadoBadge, { borderColor: estadoColor }]}>
            <Text style={[s.estadoText, { color: estadoColor }]}>
              {ESTADO_LABEL[obra.estado ?? ''] ?? obra.estado ?? '—'}
            </Text>
          </View>
          {!expanded && (
            <Text style={s.cardPres}>{fmtPesos(obra.presupuesto_total)}</Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Detalle — solo expandido */}
      {expanded && (
        <View style={s.detalle}>
          <View style={s.divider} />

          {/* Presupuesto */}
          <Text style={s.seccion}>Presupuesto</Text>
          <Campo label="Total" value={fmtPesos(obra.presupuesto_total)} accent={color} />
          <Campo label="Aporte Provincial" value={fmtPesos(obra.aporte_dvp)} />
          <Campo label="Aporte Consorcio"  value={fmtPesos(obra.aporte_ccc)} />
          {obra.cantidad != null && (
            <>
              <Campo label="Cantidad"    value={`${Number(obra.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 2 })} ${obra.unidad ?? ''}`} />
              <Campo label="P. unitario" value={fmtPesos(obra.precio_unitario)} />
            </>
          )}

          {/* Tramo / Descripción */}
          {obra.descripcion ? (
            <>
              <Text style={s.seccion}>Tramo / Descripción</Text>
              <Text style={s.detalleText}>{obra.descripcion}</Text>
            </>
          ) : null}

          {/* Fechas — solo si hay alguna */}
          {(obra.fecha_inicio || obra.fecha_fin_estimada) && (
            <>
              <Text style={s.seccion}>Fechas</Text>
              {obra.fecha_inicio      && <Campo label="Inicio"   value={fmtFecha(obra.fecha_inicio)} />}
              {obra.fecha_fin_estimada && <Campo label="Fin est." value={fmtFecha(obra.fecha_fin_estimada)} />}
            </>
          )}

          {/* Consorcio */}
          {consorcio && (
            <>
              <Text style={s.seccion}>Consorcio</Text>
              <Campo label="Nombre"   value={consorcio.nombre.replace(/Consorcio Caminero N[°º]?\s*/i, 'CC ')} />
              <Campo label="Zona"     value={consorcio.zona} />
              <Campo label="Red vial" value={`${consorcio.redKm.toLocaleString('es-AR')} km`} />
            </>
          )}
          {!consorcio && obra.ubicacion && (
            <>
              <Text style={s.seccion}>Ubicación</Text>
              <Campo label="Descripción" value={obra.ubicacion} />
            </>
          )}

          {/* Botón Ver en mapa */}
          {hasLocation && (
            <TouchableOpacity style={[s.btnMapa, { borderColor: color + '66' }]} onPress={handleVerEnMapa} activeOpacity={0.8}>
              <Text style={[s.btnMapaText, { color }]}>🗺  Ver en mapa</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function ObrasScreen() {
  const colors = useColors();
  const { user, session, offlineMode } = useAuth();

  const [obras,      setObras]      = useState<Obra[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(prev => (prev === id ? null : id));
  };

  const fetchObras = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      if (!session || offlineMode) {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) setObras(JSON.parse(raw));
        else setError('Sin conexión. Conectate a internet para ver las obras.');
        return;
      }

      const userId = user!.id;

      const { data: destRows } = await supabase
        .from('obra_destinatarios')
        .select('obra_id')
        .eq('user_id', userId);

      const myIds: string[] = destRows?.map((r: { obra_id: string }) => r.obra_id) ?? [];

      let query = supabase.from('obras').select('*');
      if (myIds.length > 0) {
        query = query.or(`visible_para.eq.todos,id.in.(${myIds.join(',')})`);
      } else {
        query = query.eq('visible_para', 'todos');
      }

      const { data, error: qErr } = await query.order('created_at', { ascending: false });
      if (qErr) throw new Error(qErr.message);

      const rows = (data ?? []) as Obra[];
      setObras(rows);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(rows));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) setObras(JSON.parse(raw));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, user, offlineMode]);

  useEffect(() => { fetchObras(); }, [fetchObras]);

  return (
    <View style={[s.container, { backgroundColor: colors.primary }]}>

      {(offlineMode || error) && (
        <View style={s.banner}>
          <Text style={s.bannerText}>
            {offlineMode
              ? '📵 Modo sin conexión — datos guardados'
              : `⚠ ${error}`}
          </Text>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={s.center}>
          <ActivityIndicator color="#F5C300" size="large" />
          <Text style={s.loadingText}>Cargando obras...</Text>
        </View>
      ) : obras.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyIcon}>🏗</Text>
          <Text style={s.emptyText}>No hay obras publicadas{'\n'}para tu usuario.</Text>
        </View>
      ) : (
        <FlatList
          data={obras}
          keyExtractor={o => o.id}
          renderItem={({ item }) => (
            <ObraCard
              obra={item}
              expanded={expandedId === item.id}
              onToggle={() => toggle(item.id)}
            />
          )}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchObras(true)}
              tintColor="#F5C300"
              colors={['#F5C300']}
            />
          }
          ListHeaderComponent={
            <Text style={s.listHeader}>
              {obras.length} obra{obras.length !== 1 ? 's' : ''} asignada{obras.length !== 1 ? 's' : ''}
            </Text>
          }
        />
      )}
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   { flex: 1 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#555', fontSize: 12, fontFamily: 'monospace' },
  emptyIcon:   { fontSize: 40 },
  emptyText:   { color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 20, fontFamily: 'monospace' },
  banner:      { backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#222', padding: 8, paddingHorizontal: 14 },
  bannerText:  { color: '#555', fontSize: 11, fontFamily: 'monospace' },
  list:        { padding: 12, gap: 8, paddingBottom: 32 },
  listHeader:  { color: '#333', fontSize: 9, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, paddingHorizontal: 2 },

  // Card
  card:         { flexDirection: 'row', backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e', borderRadius: 4, overflow: 'hidden' },
  cardExpanded: { borderColor: '#2a2a2a' },
  accent:       { width: 3 },
  cardHeader:   { flex: 1, flexDirection: 'row', padding: 12, gap: 8, alignItems: 'flex-start' },
  cardHeaderLeft:  { flex: 1, gap: 2 },
  cardHeaderRight: { alignItems: 'flex-end', gap: 4 },
  cardTipo:     { fontSize: 11, fontWeight: '700', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardUbic:     { fontSize: 11, color: '#777', fontFamily: 'monospace' },
  cardDesc:     { fontSize: 10, color: '#444', fontFamily: 'monospace' },
  cardPres:     { fontSize: 13, fontWeight: '700', color: '#bbb', fontFamily: 'monospace', marginTop: 2 },
  estadoBadge:  { borderWidth: 1, borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2 },
  estadoText:   { fontSize: 8, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },

  // Detalle
  detalle:     { paddingHorizontal: 14, paddingBottom: 16 },
  divider:     { height: 1, backgroundColor: '#1e1e1e', marginBottom: 10 },
  seccion:     { fontSize: 8, color: '#333', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 10, marginBottom: 4 },
  campo:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#161616' },
  campoLabel:  { fontSize: 10, color: '#444', fontFamily: 'monospace', flexShrink: 0 },
  campoValue:  { fontSize: 12, color: '#aaa', fontFamily: 'monospace', textAlign: 'right', flexShrink: 1 },
  detalleText: { fontSize: 12, color: '#888', fontFamily: 'monospace', lineHeight: 18, marginBottom: 4 },

  btnMapa:     { marginTop: 16, borderWidth: 1, borderRadius: 3, paddingVertical: 10, alignItems: 'center' },
  btnMapaText: { fontSize: 12, fontFamily: 'monospace', fontWeight: '700', letterSpacing: 0.5 },
});
