import { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Platform,
} from 'react-native';
import MapView, { Marker, Polygon, Callout, Region } from 'react-native-maps';
import { CONSORCIOS, CHACO_BOUNDARY, ZONAS_CONFIG } from '@/constants/realData';
import type { ConsorcioDato } from '@/types';

const { width } = Dimensions.get('window');

// ── Initial region — centres on Chaco province ────────────────────────────────
const CHACO_REGION: Region = {
  latitude: -26.2,
  longitude: -60.5,
  latitudeDelta: 5.2,
  longitudeDelta: 5.0,
};

export default function MapaScreen() {
  const mapRef = useRef<MapView>(null);
  const [zonaFiltro, setZonaFiltro] = useState<string>('TODAS');
  const [showLegend, setShowLegend] = useState(true);
  const [selected, setSelected] = useState<ConsorcioDato | null>(null);

  const zonasVisibles = ZONAS_CONFIG.reduce<Record<string, boolean>>((acc, z) => {
    acc[z.id] = true;
    return acc;
  }, {});

  const consorcisFiltrados = zonaFiltro === 'TODAS'
    ? CONSORCIOS
    : CONSORCIOS.filter(c => c.zona === zonaFiltro);

  const handleMarkerPress = useCallback((c: ConsorcioDato) => {
    setSelected(c);
  }, []);

  const handleMapPress = useCallback(() => {
    setSelected(null);
  }, []);

  return (
    <View style={styles.container}>
      {/* ── MAP ──────────────────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={CHACO_REGION}
        mapType="hybrid"
        onPress={handleMapPress}
      >
        {/* Chaco province boundary */}
        <Polygon
          coordinates={CHACO_BOUNDARY}
          strokeColor="#4ecf8a"
          strokeWidth={2}
          fillColor="rgba(46,127,79,0.08)"
        />

        {/* Consortium markers */}
        {consorcisFiltrados.map((c, idx) => (
          <Marker
            key={`${c.zona}-${c.numero}-${idx}`}
            coordinate={{ latitude: c.latitude, longitude: c.longitude }}
            onPress={() => handleMarkerPress(c)}
            tracksViewChanges={false}
          >
            {/* Custom circle marker matching HTML style */}
            <View style={[styles.marker, { backgroundColor: c.color }]}>
              <Text style={styles.markerText} numberOfLines={1}>
                {String(c.numero)}
              </Text>
            </View>

            <Callout tooltip style={styles.calloutWrapper}>
              <View style={styles.calloutContainer}>
                {/* Header */}
                <View style={[styles.calloutHeader, { backgroundColor: c.color }]}>
                  <View style={styles.calloutNumBadge}>
                    <Text style={styles.calloutNumText}>{c.numero}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.calloutLocalidad} numberOfLines={2}>
                      {c.localidad}
                    </Text>
                    <Text style={styles.calloutZona}>
                      {ZONAS_CONFIG.find(z => z.id === c.zona)?.label} · Consorcio Nº {c.numero}
                    </Text>
                  </View>
                </View>

                {/* Body */}
                <View style={styles.calloutBody}>
                  {/* Authorities */}
                  <Text style={styles.calloutSection}>👥 Autoridades</Text>
                  <View style={styles.calloutTable}>
                    {[
                      ['Presidente', c.presidente],
                      ['Vicepresidente', c.vicepresidente],
                      ['Secretario', c.secretario],
                      ['Tesorero', c.tesorero],
                    ].map(([label, val]) => (
                      <View key={label} style={styles.calloutRow}>
                        <Text style={styles.calloutLabel}>{label}</Text>
                        <Text style={styles.calloutVal} numberOfLines={1}>{val}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Road network */}
                  <Text style={[styles.calloutSection, { marginTop: 8 }]}>🛣️ Red vial a cargo</Text>
                  <View style={styles.kmGrid}>
                    {[
                      ['Total', c.redKm],
                      ['Terciaria', c.redTerciaria],
                      ['Secundaria', c.redSecundaria],
                      ['Primaria', c.redPrimaria],
                    ].map(([label, val]) => (
                      <View key={String(label)} style={styles.kmCell}>
                        <Text style={[styles.kmVal, { color: c.color }]}>
                          {Number(val).toFixed(0)} km
                        </Text>
                        <Text style={styles.kmLabel}>{label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* ── ZONE FILTER BAR ──────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterContent}
      >
        <TouchableOpacity
          style={[styles.filterBtn, zonaFiltro === 'TODAS' && styles.filterBtnActive]}
          onPress={() => setZonaFiltro('TODAS')}
        >
          <Text style={[styles.filterLabel, zonaFiltro === 'TODAS' && styles.filterLabelActive]}>
            Todas ({CONSORCIOS.length})
          </Text>
        </TouchableOpacity>
        {ZONAS_CONFIG.map(z => {
          const count = CONSORCIOS.filter(c => c.zona === z.id).length;
          const active = zonaFiltro === z.id;
          return (
            <TouchableOpacity
              key={z.id}
              style={[styles.filterBtn, active && { backgroundColor: z.color }]}
              onPress={() => setZonaFiltro(z.id)}
            >
              <View style={[styles.zoneDot, { backgroundColor: active ? '#fff' : z.color }]} />
              <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
                {z.id} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── LEGEND TOGGLE ────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.legendToggle}
        onPress={() => setShowLegend(!showLegend)}
      >
        <Text style={styles.legendToggleText}>{showLegend ? '✕' : '⬡'}</Text>
      </TouchableOpacity>

      {showLegend && (
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>Zonas — {consorcisFiltrados.length} sedes</Text>
          {ZONAS_CONFIG.map(z => {
            const count = CONSORCIOS.filter(c => c.zona === z.id).length;
            return (
              <TouchableOpacity
                key={z.id}
                style={styles.legendRow}
                onPress={() => setZonaFiltro(zonaFiltro === z.id ? 'TODAS' : z.id)}
              >
                <View style={[styles.legendDot, { backgroundColor: z.color }]} />
                <Text style={styles.legendLabel}>{z.label}</Text>
                <Text style={styles.legendCount}>{count}</Text>
              </TouchableOpacity>
            );
          })}
          {/* Province boundary indicator */}
          <View style={[styles.legendRow, { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#2a3045' }]}>
            <View style={[styles.legendLine, { borderColor: '#4ecf8a' }]} />
            <Text style={styles.legendLabel}>Límite Chaco</Text>
          </View>
        </View>
      )}

      {/* ── BOTTOM COUNTER ───────────────────────────────────────────────── */}
      <View style={styles.counter}>
        <Text style={styles.counterText}>
          {consorcisFiltrados.length} consorcio{consorcisFiltrados.length !== 1 ? 's' : ''} visibles
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141824' },
  map: { flex: 1 },

  // Marker
  marker: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
    elevation: 3,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
  },
  markerText: {
    color: '#fff', fontSize: 9, fontWeight: '800', textAlign: 'center',
  },

  // Callout
  calloutWrapper: { width: 270 },
  calloutContainer: {
    backgroundColor: '#1e2436',
    borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: '#2a3045',
    elevation: 8,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  calloutHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10,
  },
  calloutNumBadge: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  calloutNumText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  calloutLocalidad: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 16 },
  calloutZona: { color: 'rgba(255,255,255,0.8)', fontSize: 10, marginTop: 1 },
  calloutBody: { padding: 10 },
  calloutSection: { fontSize: 10, color: '#7a8aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  calloutTable: { marginBottom: 6 },
  calloutRow: { flexDirection: 'row', paddingVertical: 2 },
  calloutLabel: { fontSize: 11, color: '#7a8aaa', width: 100 },
  calloutVal: { fontSize: 11, color: '#e0e6f0', fontWeight: '600', flex: 1 },
  kmGrid: { flexDirection: 'row', gap: 4 },
  kmCell: {
    flex: 1, backgroundColor: '#252d40', borderRadius: 5, padding: 5, alignItems: 'center',
  },
  kmVal: { fontSize: 11, fontWeight: '800' },
  kmLabel: { fontSize: 9, color: '#7a8aaa', marginTop: 1 },

  // Filter bar
  filterBar: {
    position: 'absolute', top: 8, left: 0, right: 0, maxHeight: 46,
  },
  filterContent: {
    paddingHorizontal: 10, gap: 6, flexDirection: 'row', alignItems: 'center',
  },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: 'rgba(20,24,36,0.85)', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  filterBtnActive: { backgroundColor: '#1B4F72', borderColor: '#2e7db5' },
  filterLabel: { fontSize: 12, color: '#9aa5bb', fontWeight: '600' },
  filterLabelActive: { color: '#fff' },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },

  // Legend
  legendToggle: {
    position: 'absolute', bottom: 90, right: 12,
    backgroundColor: '#1e2436', borderRadius: 22, width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center', elevation: 4,
    borderWidth: 1, borderColor: '#2a3045',
  },
  legendToggleText: { color: '#e0e6f0', fontSize: 16 },
  legend: {
    position: 'absolute', bottom: 136, right: 12,
    backgroundColor: '#1e2436', borderRadius: 12, padding: 12,
    minWidth: 170, elevation: 5,
    borderWidth: 1, borderColor: '#2a3045',
  },
  legendTitle: { fontSize: 11, fontWeight: '700', color: '#e0e6f0', marginBottom: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendLine: { width: 22, height: 0, borderWidth: 1.5, borderStyle: 'dashed' },
  legendLabel: { flex: 1, fontSize: 12, color: '#b0bdd0' },
  legendCount: { fontSize: 12, color: '#7a8aaa', fontWeight: '600' },

  // Counter
  counter: {
    position: 'absolute', bottom: 12, left: 12,
    backgroundColor: 'rgba(20,24,36,0.85)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#2a3045',
  },
  counterText: { color: '#e0e6f0', fontSize: 12, fontWeight: '600' },
});
