import React, { useState, useMemo, useEffect, useRef, createContext, useContext } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/context/ThemeContext';
import type { ColorPalette } from '@/constants/Colors';
import { CONSORCIOS } from '@/constants/realData';
import type {
  Relevamiento, EstadoCalzada, TipoInfraestructura,
  DatosPuente, DatosAlcantarilla, DatosTubos, DatosRipio,
} from '@/types/relevamiento';
import {
  ESTADO_COLORS, DEFAULT_PUENTE, DEFAULT_ALCANTARILLA, DEFAULT_TUBOS, DEFAULT_RIPIO, DEFAULT_OTRO,
} from '@/types/relevamiento';
import { formatFechaHora } from '@/utils/formatDate';
import * as ImagePicker from 'expo-image-picker';

// expo-location: importación condicional para captura GPS en formulario ripio
let Location: any = null;
try { Location = require('expo-location'); } catch (_) {}

// ── Contexto interno de estilos y colores ─────────────────────────────────────
type SType = ReturnType<typeof makeStyles>;
const SCtx = createContext<SType | null>(null);
const useS = () => useContext(SCtx)!;
const CCtx = createContext<ColorPalette | null>(null);
const useC = () => useContext(CCtx)!;

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcPolylineM(pts: LatLngPunto[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += haversineM(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
  return Math.round(total);
}

function nearestCC(lat: number, lng: number) {
  let best = CONSORCIOS[0];
  let minD = Infinity;
  for (const cc of CONSORCIOS) {
    const d = (cc.latitude - lat) ** 2 + (cc.longitude - lng) ** 2;
    if (d < minD) { minD = d; best = cc; }
  }
  return best;
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function FLabel({ text }: { text: string }) {
  const s = useS();
  return <Text style={s.fLabel}>{text}</Text>;
}

function FInput({
  value, onChange, placeholder, numeric, multiline, unit,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; numeric?: boolean; multiline?: boolean; unit?: string;
}) {
  const s = useS();
  const Colors = useC();
  return (
    <View style={s.fInputWrap}>
      <TextInput
        style={[s.fInput, multiline && s.fInputMulti]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? (numeric ? '0.00' : '...')}
        placeholderTextColor={Colors.textMuted}
        keyboardType={numeric ? 'numeric' : 'default'}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
      {unit ? <Text style={s.fUnit}>{unit}</Text> : null}
    </View>
  );
}

function FRow({ children }: { children: React.ReactNode }) {
  const s = useS();
  return <View style={s.fRow}>{children}</View>;
}

function FGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const s = useS();
  return (
    <View style={s.fGroup}>
      <Text style={s.fGroupTitle}>{label}</Text>
      {children}
    </View>
  );
}

function EstadoEstructuralBtns({
  value,
  onChange,
}: {
  value: EstadoCalzada;
  onChange: (v: EstadoCalzada) => void;
}) {
  const s = useS();
  return (
    <View style={s.estadoRow}>
      {(['Bueno', 'Regular', 'Malo'] as EstadoCalzada[]).map(e => (
        <TouchableOpacity
          key={e}
          style={[s.estadoBtn, value === e && { backgroundColor: ESTADO_COLORS[e], borderColor: ESTADO_COLORS[e] }]}
          onPress={() => onChange(e)}
        >
          <Text style={[s.estadoBtnTxt, value === e && s.estadoBtnTxtOn]}>{e}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Formulario Puente ─────────────────────────────────────────────────────────

function PuenteForm({ data, onChange }: {
  data: DatosPuente;
  onChange: (d: DatosPuente) => void;
}) {
  const s = useS();
  const set = (k: keyof DatosPuente) => (v: any) => onChange({ ...data, [k]: v });

  const setCantidadPalizadas = (n: number) => {
    const cantidad = Math.max(1, Math.min(10, n));
    const vanos = cantidad - 1;
    const luces = Array.from({ length: vanos }, (_, i) => data.lucesPalizadas[i] ?? '');
    onChange({ ...data, cantidadPalizadas: cantidad, lucesPalizadas: luces });
  };

  const setLuzVano = (idx: number, val: string) => {
    const luces = [...data.lucesPalizadas];
    luces[idx] = val;
    onChange({ ...data, lucesPalizadas: luces });
  };

  return (
    <>
      <FGroup label="Dimensiones">
        <FLabel text="L (m) — Longitud total" />
        <FInput value={data.longitudTotal} onChange={set('longitudTotal')} numeric unit="m" />

        <FLabel text="Cantidad de palizadas" />
        <View style={s.cantidadRow}>
          <TouchableOpacity style={s.cantBtn} onPress={() => setCantidadPalizadas(data.cantidadPalizadas - 1)}>
            <Text style={s.cantBtnTxt}>−</Text>
          </TouchableOpacity>
          <Text style={s.cantValue}>{data.cantidadPalizadas}</Text>
          <TouchableOpacity style={s.cantBtn} onPress={() => setCantidadPalizadas(data.cantidadPalizadas + 1)}>
            <Text style={s.cantBtnTxt}>+</Text>
          </TouchableOpacity>
        </View>

        {data.lucesPalizadas.map((luz, idx) => (
          <View key={idx}>
            <FLabel text={`Luz vano ${idx + 1} (m)`} />
            <FInput value={luz} onChange={(v) => setLuzVano(idx, v)} numeric unit="m" />
          </View>
        ))}

        <FLabel text="H (m) — Altura libre" />
        <FInput value={data.h} onChange={set('h')} numeric unit="m" />

        <FLabel text="J (m) — Ancho de camino" />
        <FInput value={data.j} onChange={set('j')} numeric unit="m" />
      </FGroup>

      <FGroup label="Estructura">
        <FLabel text="Tipo de estructura" />
        <FInput
          value={data.tipoEstructura}
          onChange={set('tipoEstructura')}
          placeholder="Ej: Madera, Hormigón, Metálico..."
        />
      </FGroup>

      <FGroup label="Guía ruedas">
        <View style={s.siNoRow}>
          <TouchableOpacity
            style={[s.siNoBtn, data.guiaRuedas && s.siNoBtnOn]}
            onPress={() => set('guiaRuedas')(true)}
          >
            <Text style={[s.siNoBtnTxt, data.guiaRuedas && s.siNoBtnTxtOn]}>Sí</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.siNoBtn, !data.guiaRuedas && s.siNoBtnOn]}
            onPress={() => set('guiaRuedas')(false)}
          >
            <Text style={[s.siNoBtnTxt, !data.guiaRuedas && s.siNoBtnTxtOn]}>No</Text>
          </TouchableOpacity>
        </View>
        {data.guiaRuedas && (
          <>
            <FLabel text="Estado guía ruedas" />
            <EstadoEstructuralBtns value={data.estadoGuiaRuedas} onChange={set('estadoGuiaRuedas')} />
          </>
        )}
      </FGroup>

      <FGroup label="Barandas">
        <View style={s.siNoRow}>
          <TouchableOpacity
            style={[s.siNoBtn, data.barandas && s.siNoBtnOn]}
            onPress={() => set('barandas')(true)}
          >
            <Text style={[s.siNoBtnTxt, data.barandas && s.siNoBtnTxtOn]}>Sí</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.siNoBtn, !data.barandas && s.siNoBtnOn]}
            onPress={() => set('barandas')(false)}
          >
            <Text style={[s.siNoBtnTxt, !data.barandas && s.siNoBtnTxtOn]}>No</Text>
          </TouchableOpacity>
        </View>
        {data.barandas && (
          <>
            <FLabel text="Altura (m)" />
            <FInput value={data.hBarandas} onChange={set('hBarandas')} numeric unit="m" />
          </>
        )}
      </FGroup>

      <FGroup label="Estado">
        <FLabel text="Estado estructural" />
        <EstadoEstructuralBtns value={data.estadoEstructural} onChange={set('estadoEstructural')} />
      </FGroup>
    </>
  );
}

// ── Formulario Alcantarilla ───────────────────────────────────────────────────

function AlcantarillaForm({ data, onChange }: {
  data: DatosAlcantarilla;
  onChange: (d: DatosAlcantarilla) => void;
}) {
  const s = useS();
  const set = (k: keyof DatosAlcantarilla) => (v: any) => onChange({ ...data, [k]: v });
  return (
    <>
      <FGroup label="Dimensiones">
        <FLabel text="Longitud total" />
        <FInput value={data.longitudTotal} onChange={set('longitudTotal')} numeric unit="m" />
        <FRow>
          <View style={{ flex: 1 }}>
            <FLabel text="Ancho total" />
            <FInput value={data.anchoTotal} onChange={set('anchoTotal')} numeric unit="m" />
          </View>
          <View style={{ width: 10 }} />
          <View style={{ flex: 1 }}>
            <FLabel text="Ancho calzada" />
            <FInput value={data.anchoCalzada} onChange={set('anchoCalzada')} numeric unit="m" />
          </View>
        </FRow>
        <FLabel text="H" />
        <FInput value={data.h} onChange={set('h')} numeric unit="m" />
      </FGroup>

      <FGroup label="Luces">
        <FRow>
          <View style={{ flex: 1 }}>
            <FLabel text="Cantidad" />
            <FInput value={data.cantidadLuces} onChange={set('cantidadLuces')} numeric />
          </View>
          <View style={{ width: 10 }} />
          <View style={{ flex: 1 }}>
            <FLabel text="Longitud" />
            <FInput value={data.longitudLuces} onChange={set('longitudLuces')} numeric unit="m" />
          </View>
        </FRow>
      </FGroup>

      <FGroup label="Alas">
        <FLabel text="Materiales" />
        <FInput value={data.materialesAlas} onChange={set('materialesAlas')} placeholder="Ej: Hormigón, Piedra..." />
        <FLabel text="Longitud de alas" />
        <FInput value={data.longitudAlas} onChange={set('longitudAlas')} numeric unit="m" />
      </FGroup>

      <FGroup label="Estado">
        <FLabel text="Estado estructural" />
        <EstadoEstructuralBtns value={data.estadoEstructural} onChange={set('estadoEstructural')} />
        <FLabel text="Situación hidráulica" />
        <FInput value={data.situacionHidraulica} onChange={set('situacionHidraulica')} placeholder="Descripción..." multiline />
      </FGroup>
    </>
  );
}

// ── Formulario Tubos ──────────────────────────────────────────────────────────

function TubosForm({ data, onChange }: {
  data: DatosTubos;
  onChange: (d: DatosTubos) => void;
}) {
  const s = useS();
  const set = (k: keyof DatosTubos) => (v: any) => onChange({ ...data, [k]: v });
  return (
    <>
      <FGroup label="Medidas">
        <FRow>
          <View style={{ flex: 1 }}>
            <FLabel text="J ancho" />
            <FInput value={data.jAncho} onChange={set('jAncho')} numeric unit="m" />
          </View>
          <View style={{ width: 10 }} />
          <View style={{ flex: 1 }}>
            <FLabel text="D diámetro" />
            <FInput value={data.d} onChange={set('d')} numeric unit="m" />
          </View>
        </FRow>
        <FLabel text="Tapada" />
        <FInput value={data.tapada} onChange={set('tapada')} numeric unit="m" />
      </FGroup>

      <FGroup label="Detalles">
        <FLabel text="Cabezales" />
        <FInput value={data.cabezales} onChange={set('cabezales')} placeholder="Ej: Hormigón, Sin cabezal..." />
        <FLabel text="Cantidad (1–20)" />
        <View style={s.cantidadRow}>
          <TouchableOpacity
            style={s.cantBtn}
            onPress={() => set('cantidad')(Math.max(1, data.cantidad - 1))}
          >
            <Text style={s.cantBtnTxt}>−</Text>
          </TouchableOpacity>
          <Text style={s.cantValue}>{data.cantidad}</Text>
          <TouchableOpacity
            style={s.cantBtn}
            onPress={() => set('cantidad')(Math.min(20, data.cantidad + 1))}
          >
            <Text style={s.cantBtnTxt}>+</Text>
          </TouchableOpacity>
        </View>
      </FGroup>
    </>
  );
}

// ── Formulario Ripio ──────────────────────────────────────────────────────────

type LatLngPunto = { lat: number; lng: number };

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Haversine: distancia en metros entre dos coordenadas
function haversine(a: LatLngPunto, b: LatLngPunto): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180) * Math.cos(b.lat*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}
function totalMetros(pts: LatLngPunto[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversine(pts[i-1], pts[i]);
  return d;
}

function RipioForm({ data, onChange, puntos, onCoordsChange, onRequestDraw }: {
  data: DatosRipio;
  onChange: (d: DatosRipio) => void;
  puntos: LatLngPunto[];
  onCoordsChange: (pts: LatLngPunto[]) => void;
  onRequestDraw?: () => void;
}) {
  const s = useS();
  const Colors = useC();
  const set = (k: keyof DatosRipio) => (v: string) => onChange({ ...data, [k]: v });

  // ── GPS Track inline ───────────────────────────────────────────────────────
  const [trackPhase, setTrackPhase] = useState<'idle'|'recording'>('idle');
  const [trackPts,   setTrackPts]   = useState<LatLngPunto[]>([]);
  const trackSubRef = useRef<any>(null);
  const trackPtsRef = useRef<LatLngPunto[]>([]);

  const startTrack = async () => {
    if (!Location) { Alert.alert('GPS no disponible', 'expo-location no está instalado.'); return; }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permiso denegado', 'Se necesita GPS para grabar el track.'); return; }
    trackPtsRef.current = [];
    setTrackPts([]);
    setTrackPhase('recording');
    trackSubRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 4000 },
      (loc: any) => {
        const next = [...trackPtsRef.current, { lat: loc.coords.latitude, lng: loc.coords.longitude }];
        trackPtsRef.current = next;
        setTrackPts(next);
      }
    );
  };

  const stopTrack = () => {
    trackSubRef.current?.remove();
    trackSubRef.current = null;
    setTrackPhase('idle');
    const pts = trackPtsRef.current;
    if (pts.length >= 2) {
      onCoordsChange(pts);
    } else {
      Alert.alert('Track muy corto', 'Se necesitan al menos 2 puntos GPS para definir el tramo.');
    }
  };

  const cancelTrack = () => {
    trackSubRef.current?.remove();
    trackSubRef.current = null;
    trackPtsRef.current = [];
    setTrackPhase('idle');
    setTrackPts([]);
  };

  // ── Date stepper ──────────────────────────────────────────────────────────
  // Inicializa desde data.fechaEjecucion (formato DD/MM/AAAA) si existe, si no desde hoy
  const _initDate = (() => {
    if (data.fechaEjecucion) {
      const [dd, mm, yy] = data.fechaEjecucion.split('/').map(Number);
      if (dd && mm && yy) return { d: dd, m: mm, y: yy };
    }
    const t = new Date();
    return { d: t.getDate(), m: t.getMonth() + 1, y: t.getFullYear() };
  })();
  const [dDay,   setDDay]   = useState(_initDate.d);
  const [dMonth, setDMonth] = useState(_initDate.m);
  const [dYear,  setDYear]  = useState(_initDate.y);

  const daysInMonth = (m: number, y: number) => new Date(y, m, 0).getDate();
  const clampDay = (d: number, m: number, y: number) => Math.min(d, daysInMonth(m, y));

  const changeDay   = (n: number) => { const d = clampDay(n, dMonth, dYear); setDDay(d);   syncFecha(d, dMonth, dYear);   };
  const changeMonth = (n: number) => { const m = ((n-1+12)%12)+1; const d = clampDay(dDay, m, dYear); setDMonth(m); setDDay(d); syncFecha(d, m, dYear);   };
  const changeYear  = (n: number) => { const d = clampDay(dDay, dMonth, n); setDYear(n);  setDDay(d); syncFecha(d, dMonth, n); };
  const syncFecha   = (d: number, m: number, y: number) =>
    onChange({ ...data, fechaEjecucion: `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}` });

  // ── Toneladas ─────────────────────────────────────────────────────────────
  const ancho    = parseFloat(data.ancho)    || 0;
  const longitud = parseFloat(data.longitud) || 0;
  const espesor  = parseFloat(data.espesor)  || 0;
  const toneladas = ancho > 0 && longitud > 0 && espesor > 0
    ? (ancho * longitud * espesor * 2.1).toFixed(2) : null;

  const metros = trackPts.length >= 2 ? totalMetros(trackPts) : 0;

  return (
    <>
      {/* ── TRAMO ─────────────────────────────────────────────────────────── */}
      <FGroup label="Tramo enripiado">
        {puntos.length >= 2 ? (
          // Tramo ya definido
          <View style={s.tramoOk}>
            <Text style={s.tramoOkTitle}>✓ Tramo definido — {puntos.length} puntos</Text>
            <Text style={s.tramoOkPt}>▶ Inicio: {puntos[0].lat.toFixed(5)}, {puntos[0].lng.toFixed(5)}</Text>
            <Text style={s.tramoOkPt}>⏹ Final:  {puntos[puntos.length-1].lat.toFixed(5)}, {puntos[puntos.length-1].lng.toFixed(5)}</Text>
          </View>
        ) : trackPhase === 'recording' ? (
          // Panel GPS Track activo
          <View style={s.trackPanel}>
            <View style={s.trackPanelHeader}>
              <View style={s.trackDot} />
              <Text style={s.trackPanelTitle}>Grabando track GPS…</Text>
            </View>
            <Text style={s.trackStat}>
              {trackPts.length} punto{trackPts.length !== 1 ? 's' : ''} registrado{trackPts.length !== 1 ? 's' : ''}
              {metros > 0 ? `  ·  ≈ ${metros >= 1000 ? (metros/1000).toFixed(2)+' km' : Math.round(metros)+' m'}` : ''}
            </Text>
            {trackPts.length > 0 && (
              <Text style={s.trackCoord}>
                Última pos.: {trackPts[trackPts.length-1].lat.toFixed(5)}, {trackPts[trackPts.length-1].lng.toFixed(5)}
              </Text>
            )}
            <View style={s.trackPanelBtns}>
              <TouchableOpacity style={[s.trackPanelBtn, s.trackBtnStop]} onPress={stopTrack}>
                <Text style={s.trackPanelBtnTxt}>■  FIN — guardar tramo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.trackPanelBtn, s.trackBtnCancelSm]} onPress={cancelTrack}>
                <Text style={s.trackPanelBtnTxt}>✕  Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          // Sin tramo: dos tarjetas de método
          <View style={s.metodoCards}>
            {/* Tarjeta: Dibujar en mapa */}
            <View style={s.metodoCard}>
              <Text style={s.metodoCardIcon}>✏️</Text>
              <View style={s.metodoCardBody}>
                <Text style={s.metodoCardTitle}>Dibujar en mapa</Text>
                <Text style={s.metodoCardDesc}>
                  Trazá el tramo tocando puntos sobre el mapa OSM. Útil para trabajar desde gabinete o cuando no estás en el lugar.
                </Text>
                <TouchableOpacity style={s.metodoCardBtn} onPress={onRequestDraw}>
                  <Text style={s.metodoCardBtnTxt}>Ir al mapa →</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={s.metodoDivider} />

            {/* Tarjeta: GPS Track */}
            <View style={s.metodoCard}>
              <Text style={s.metodoCardIcon}>📍</Text>
              <View style={s.metodoCardBody}>
                <Text style={s.metodoCardTitle}>GPS Track</Text>
                <Text style={s.metodoCardDesc}>
                  Grabá el recorrido automáticamente mientras conducís por el tramo. El GPS registra la ruta real cada 10 m.
                </Text>
                <TouchableOpacity style={[s.metodoCardBtn, s.metodoCardBtnGps]} onPress={startTrack}>
                  <Text style={s.metodoCardBtnTxt}>▶ Iniciar grabación</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </FGroup>

      {/* ── DIMENSIONES ────────────────────────────────────────────────────── */}
      <FGroup label="Dimensiones">
        <FRow>
          <View style={{ flex: 1 }}>
            <FLabel text="Ancho" />
            <FInput value={data.ancho} onChange={set('ancho')} numeric unit="m" />
          </View>
          <View style={{ width: 10 }} />
          <View style={{ flex: 1 }}>
            <FLabel text="Longitud" />
            <FInput value={data.longitud} onChange={set('longitud')} numeric unit="m" />
          </View>
        </FRow>
        <FLabel text="Espesor del ripio" />
        <FInput value={data.espesor} onChange={set('espesor')} numeric unit="m" />

        {toneladas !== null && (
          <View style={s.tonesBox}>
            <Text style={s.tonesLabel}>Toneladas estimadas</Text>
            <Text style={s.tonesValue}>{toneladas} t</Text>
            <Text style={s.tonesNote}>Densidad 2,1 t/m³ · {ancho}m × {longitud}m × {espesor}m</Text>
          </View>
        )}
      </FGroup>

      {/* ── OBRA ───────────────────────────────────────────────────────────── */}
      <FGroup label="Obra">
        <FLabel text="Empresa ejecutora" />
        <FInput value={data.empresa} onChange={set('empresa')} placeholder="Nombre de la empresa..." />

        <FLabel text="Fecha de ejecución" />
        <View style={s.dateRow}>
          {/* Día */}
          <View style={s.dateCol}>
            <TouchableOpacity style={s.dateBtn} onPress={() => changeDay(dDay - 1 < 1 ? daysInMonth(dMonth, dYear) : dDay - 1)}>
              <Text style={s.dateBtnTxt}>−</Text>
            </TouchableOpacity>
            <Text style={s.dateValue}>{String(dDay).padStart(2,'0')}</Text>
            <TouchableOpacity style={s.dateBtn} onPress={() => changeDay(dDay + 1 > daysInMonth(dMonth, dYear) ? 1 : dDay + 1)}>
              <Text style={s.dateBtnTxt}>+</Text>
            </TouchableOpacity>
            <Text style={s.dateUnit}>Día</Text>
          </View>
          <Text style={s.dateSep}>/</Text>
          {/* Mes */}
          <View style={s.dateCol}>
            <TouchableOpacity style={s.dateBtn} onPress={() => changeMonth(dMonth - 1)}>
              <Text style={s.dateBtnTxt}>−</Text>
            </TouchableOpacity>
            <Text style={s.dateValue}>{MESES[dMonth - 1]}</Text>
            <TouchableOpacity style={s.dateBtn} onPress={() => changeMonth(dMonth + 1)}>
              <Text style={s.dateBtnTxt}>+</Text>
            </TouchableOpacity>
            <Text style={s.dateUnit}>Mes</Text>
          </View>
          <Text style={s.dateSep}>/</Text>
          {/* Año */}
          <View style={[s.dateCol, { flex: 1.4 }]}>
            <TouchableOpacity style={s.dateBtn} onPress={() => changeYear(dYear - 1)}>
              <Text style={s.dateBtnTxt}>−</Text>
            </TouchableOpacity>
            <Text style={s.dateValue}>{dYear}</Text>
            <TouchableOpacity style={s.dateBtn} onPress={() => changeYear(dYear + 1)}>
              <Text style={s.dateBtnTxt}>+</Text>
            </TouchableOpacity>
            <Text style={s.dateUnit}>Año</Text>
          </View>
        </View>
      </FGroup>
    </>
  );
}

// ── Sección de ubicación puntual (Puente / Alcantarilla / Tubos / Otro) ──────

function UbicacionPuntualSection({
  pointCoord, gpsCoord, onPickFromMap, onUseGPS, onClear,
}: {
  pointCoord: LatLngPunto | null;
  gpsCoord: LatLngPunto | null;
  onPickFromMap?: () => void;
  onUseGPS: () => void;
  onClear: () => void;
}) {
  const s = useS();
  return (
    <FGroup label="Ubicación de la obra">
      {pointCoord ? (
        <View style={s.tramoOk}>
          <Text style={s.tramoOkTitle}>✓ Ubicación definida</Text>
          <Text style={s.tramoOkPt}>📍 {pointCoord.lat.toFixed(5)}, {pointCoord.lng.toFixed(5)}</Text>
          <TouchableOpacity onPress={onClear} style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 11, color: '#9aaac0', textDecorationLine: 'underline' }}>Cambiar ubicación</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.metodoCards}>
          {onPickFromMap && (
            <>
              <View style={s.metodoCard}>
                <Text style={s.metodoCardIcon}>🗺️</Text>
                <View style={s.metodoCardBody}>
                  <Text style={s.metodoCardTitle}>Colocar en mapa</Text>
                  <Text style={s.metodoCardDesc}>
                    Tocá el punto exacto de la obra sobre el mapa OSM. Ideal para trabajar desde gabinete o verificar la ubicación.
                  </Text>
                  <TouchableOpacity style={s.metodoCardBtn} onPress={onPickFromMap}>
                    <Text style={s.metodoCardBtnTxt}>Ir al mapa →</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={s.metodoDivider} />
            </>
          )}

          <View style={s.metodoCard}>
            <Text style={s.metodoCardIcon}>📍</Text>
            <View style={s.metodoCardBody}>
              <Text style={s.metodoCardTitle}>Ubicación GPS</Text>
              <Text style={s.metodoCardDesc}>
                {gpsCoord
                  ? `Usá tu posición GPS actual como ubicación de la obra.`
                  : 'Activá el GPS en el mapa (botón 🧭) para usar tu posición actual.'}
              </Text>
              <TouchableOpacity
                style={[s.metodoCardBtn, s.metodoCardBtnGps, !gpsCoord && { opacity: 0.45 }]}
                onPress={onUseGPS}
              >
                <Text style={s.metodoCardBtnTxt}>
                  {gpsCoord ? '📍 Usar mi ubicación' : 'GPS no disponible'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </FGroup>
  );
}

// ── Props & main component ────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  coords: { lat: number; lng: number } | null;
  /** Relevamiento a editar — activa el modo edición con todos los campos precargados */
  editando?: Relevamiento;
  /** Callback para guardar cambios en modo edición */
  onUpdate?: (r: Relevamiento) => void;
  /** Puntos pre-dibujados desde el mapa — activa automáticamente el tipo Ripio */
  initialCoordsLinea?: LatLngPunto[];
  /** Coordenada puntual pre-colocada desde el mapa para obras puntuales */
  initialCoord?: { lat: number; lng: number } | null;
  /** Propiedades del segmento CC/RP al que snapeó el pin manual (null si no snapeó) */
  snapInfo?: Record<string, any> | null;
  /** Nombre del técnico logueado para auto-completar el campo */
  tecnicoNombre?: string;
  /** Zona asignada al técnico logueado — sobreescribe la auto-detección geográfica */
  tecnicoZona?: string;
  /** Llamado cuando el usuario elige "Dibujar en mapa" para Ripio */
  onRequestDraw?: () => void;
  /** Llamado cuando el usuario elige "Ir al mapa" para colocar un punto puntual */
  onRequestPickPoint?: () => void;
  onSave?: (r: Relevamiento) => void;
  onClose: () => void;
}

const TIPOS: TipoInfraestructura[] = ['Puente', 'Alcantarilla', 'Tubos', 'Ripio', 'Otro'];
const TIPO_ICONS: Record<TipoInfraestructura, string> = {
  Puente: 'PTE', Alcantarilla: 'ALC', Tubos: 'TUB', Ripio: 'RIP', Otro: '?',
};
const ESTADOS: EstadoCalzada[] = ['Bueno', 'Regular', 'Malo'];

export default function RelevamientoModal({ visible, coords, editando, onUpdate, initialCoordsLinea, initialCoord, snapInfo, tecnicoNombre, tecnicoZona, onRequestDraw, onRequestPickPoint, onSave, onClose }: Props) {
  const Colors = useColors();
  const s = useMemo(() => makeStyles(Colors), [Colors]);
  const [estadoCalzada, setEstadoCalzada] = useState<EstadoCalzada>('Regular');
  const [tipo, setTipo] = useState<TipoInfraestructura>('Puente');
  const [datosPuente, setDatosPuente] = useState<DatosPuente>({ ...DEFAULT_PUENTE });
  const [datosAlcantarilla, setDatosAlcantarilla] = useState<DatosAlcantarilla>({ ...DEFAULT_ALCANTARILLA });
  const [datosTubos, setDatosTubos] = useState<DatosTubos>({ ...DEFAULT_TUBOS });
  const [datosRipio, setDatosRipio] = useState<DatosRipio>({ ...DEFAULT_RIPIO });
  const [coordsLinea, setCoordsLinea] = useState<LatLngPunto[]>([]);
  // Coordenada explícita para obras puntuales (desde mapa o GPS)
  const [pointCoord, setPointCoord] = useState<LatLngPunto | null>(null);
  const [otroDesc, setOtroDesc] = useState('');
  const [rutaTramo, setRutaTramo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [tecnico, setTecnico] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [fechaModal] = useState(() => new Date().toISOString());

  // Pre-carga campos al abrir el modal (modo edición o nuevo con tramo/punto pre-dibujado)
  useEffect(() => {
    if (!visible) return;
    if (editando) {
      // Modo edición: precarga todos los campos del relevamiento existente
      setEstadoCalzada(editando.estadoCalzada ?? 'Regular');
      setTipo(editando.tipo ?? 'Puente');
      if (editando.datosPuente)      setDatosPuente({ ...editando.datosPuente });
      if (editando.datosAlcantarilla) setDatosAlcantarilla({ ...editando.datosAlcantarilla });
      if (editando.datosTubos)       setDatosTubos({ ...editando.datosTubos });
      if (editando.datosRipio)       setDatosRipio({ ...editando.datosRipio });
      setCoordsLinea(editando.coordsLinea ? [...editando.coordsLinea] : []);
      setOtroDesc(editando.datosOtro?.descripcion ?? DEFAULT_OTRO.descripcion);
      setRutaTramo(editando.rutaTramo ?? '');
      setObservaciones(editando.observaciones ?? '');
      setTecnico(editando.tecnico || tecnicoNombre || '');
      setFotos([...editando.fotos]);
      setPointCoord(editando.tipo !== 'Ripio' ? (editando.coords ?? null) : null);
    } else {
      setTecnico(tecnicoNombre || '');
      if (initialCoordsLinea && initialCoordsLinea.length >= 2) {
        setCoordsLinea([...initialCoordsLinea]);
        setTipo('Ripio');
        const longM = calcPolylineM(initialCoordsLinea);
        if (longM > 0) setDatosRipio(prev => ({ ...prev, longitud: String(longM) }));
      }
      if (initialCoord) setPointCoord(initialCoord);
      if (snapInfo) {
        const p = snapInfo;
        let autoRuta = '';
        if (p._rpLabel && p.Nombre) {
          autoRuta = `${p._rpLabel} N° ${p.Nombre}`;
        } else if (p.Nc) {
          autoRuta = p.Nc;
        } else if (p.CC && p.T) {
          autoRuta = `CC N°${p.CC} - Tramo N°${p.T}`;
        } else if (p.CC) {
          autoRuta = `CC N°${p.CC}`;
        }
        if (autoRuta) setRutaTramo(autoRuta);
      }
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Para Ripio: primer punto del tramo. Para puntuales: pointCoord explícito o GPS del mapa.
  const effectiveCoords = useMemo(() => {
    if (tipo === 'Ripio' && coordsLinea.length > 0) return coordsLinea[0];
    return pointCoord ?? coords;
  }, [tipo, coords, coordsLinea, pointCoord]);

  const autoCC = useMemo(() => {
    if (!effectiveCoords) return null;
    return nearestCC(effectiveCoords.lat, effectiveCoords.lng);
  }, [effectiveCoords]);

  const reset = () => {
    setEstadoCalzada('Regular');
    setTipo('Puente');
    setDatosPuente({ ...DEFAULT_PUENTE });
    setDatosAlcantarilla({ ...DEFAULT_ALCANTARILLA });
    setDatosTubos({ ...DEFAULT_TUBOS });
    setDatosRipio({ ...DEFAULT_RIPIO });
    setCoordsLinea([]);
    setPointCoord(null);
    setOtroDesc(DEFAULT_OTRO.descripcion);
    setRutaTramo('');
    setObservaciones('');
    setFotos([]);
  };

  const takeFoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso denegado', 'Habilitá el acceso a la cámara en Configuración → Aplicaciones → SIG Vial → Permisos.');
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.6,
        allowsEditing: false,
        exif: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        setFotos(prev => [...prev, result.assets[0].uri]);
      }
    } catch (e) {
      Alert.alert('Error de cámara', 'No se pudo abrir la cámara. Intentá de nuevo.');
    }
  };

  const handleSave = () => {
    if (tipo === 'Ripio') {
      if (coordsLinea.length < 2) {
        Alert.alert('Tramo incompleto', 'Agregá al menos el punto de inicio y final del tramo.');
        return;
      }
    } else if (!effectiveCoords) {
      Alert.alert('Sin ubicación', 'Seleccioná la ubicación desde el mapa o activá el GPS.');
      return;
    }

    const baseCoords = tipo === 'Ripio' ? coordsLinea[0] : effectiveCoords!;

    const r: Relevamiento = {
      id: editando ? editando.id : Date.now().toString(),
      fecha: editando ? editando.fecha : new Date().toISOString(),
      coords: baseCoords,
      coordsLinea: tipo === 'Ripio' ? [...coordsLinea] : undefined,
      tecnicoZona: tecnicoZona || editando?.tecnicoZona,
      autoDeteccion: autoCC
        ? {
            zona: autoCC.zona,
            ccNumero: autoCC.numero,
            ccNombre: autoCC.nombre,
            redKm: autoCC.redKm,
          }
        : undefined,
      rutaTramo: rutaTramo.trim(),
      estadoCalzada,
      tipo,
      datosPuente: tipo === 'Puente' ? { ...datosPuente } : undefined,
      datosAlcantarilla: tipo === 'Alcantarilla' ? { ...datosAlcantarilla } : undefined,
      datosTubos: tipo === 'Tubos' ? { ...datosTubos } : undefined,
      datosOtro: tipo === 'Otro' ? { descripcion: otroDesc.trim() } : undefined,
      datosRipio: tipo === 'Ripio' ? { ...datosRipio } : undefined,
      observaciones: observaciones.trim(),
      tecnico: tecnico.trim(),
      fotos,
    };
    if (editando && onUpdate) {
      onUpdate(r);
    } else {
      onSave?.(r);
    }
    reset();
    onClose();
  };

  const activeColor = ESTADO_COLORS[estadoCalzada];

  return (
    <SCtx.Provider value={s}>
    <CCtx.Provider value={Colors}>
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.sheet}>
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{editando ? '✏️ Editar Relevamiento' : '📋 Nuevo Relevamiento'}</Text>
              <Text style={s.fechaHora}>{formatFechaHora(editando ? editando.fecha : fechaModal)}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.body}
            keyboardShouldPersistTaps="handled"
          >
            {/* GPS + auto-detección */}
            <View style={s.gpsBlock}>
              <View style={s.gpsRow}>
                <Ionicons
                  name="location"
                  size={13}
                  color={tipo === 'Ripio'
                    ? (coordsLinea.length >= 2 ? activeColor : Colors.textMuted)
                    : (effectiveCoords ? activeColor : Colors.danger)}
                />
                {tipo === 'Ripio' ? (
                  <Text style={[s.gpsText, coordsLinea.length < 2 && { color: Colors.textMuted }]}>
                    {coordsLinea.length === 0
                      ? 'Tramo sin puntos — agregá inicio y final en el formulario'
                      : coordsLinea.length === 1
                        ? 'Tramo: 1 punto — falta el punto final'
                        : `Tramo: ${coordsLinea.length} puntos capturados`}
                  </Text>
                ) : effectiveCoords ? (
                  <Text style={s.gpsText}>
                    {effectiveCoords.lat.toFixed(5)}, {effectiveCoords.lng.toFixed(5)}
                    {pointCoord ? '  📍' : coords ? '  🧭' : ''}
                  </Text>
                ) : (
                  <Text style={[s.gpsText, { color: Colors.textMuted }]}>
                    Sin ubicación
                  </Text>
                )}
              </View>

              {autoCC && effectiveCoords && (
                <View style={s.autoRow}>
                  <View style={s.autoChip}>
                    <Text style={s.autoChipLabel}>ZONA</Text>
                    <Text style={s.autoChipValue}>{autoCC.zona}</Text>
                  </View>
                  <View style={s.autoChip}>
                    <Text style={s.autoChipLabel}>CC N°</Text>
                    <Text style={s.autoChipValue}>{autoCC.numero}</Text>
                  </View>
                  <View style={[s.autoChip, { flex: 2 }]}>
                    <Text style={s.autoChipLabel}>RED</Text>
                    <Text style={s.autoChipValue} numberOfLines={1}>{autoCC.redKm} km</Text>
                  </View>
                </View>
              )}
              {autoCC && effectiveCoords && (
                <Text style={s.autoNombre} numberOfLines={2}>{autoCC.nombre}</Text>
              )}
            </View>

            {/* Ruta / Tramo */}
            <Text style={s.label}>Ruta / Tramo</Text>
            <TextInput
              style={s.input}
              placeholder="Ej: RP 6 km 34, Camino vecinal..."
              placeholderTextColor={Colors.textMuted}
              value={rutaTramo}
              onChangeText={setRutaTramo}
            />

            {/* Estado calzada — oculto para Puente y Ripio (tienen campos propios) */}
            {tipo !== 'Puente' && tipo !== 'Ripio' && (
              <>
                <Text style={s.label}>Estado de la calzada</Text>
                <View style={s.estadoRow}>
                  {ESTADOS.map(e => (
                    <TouchableOpacity
                      key={e}
                      style={[s.estadoBtn, estadoCalzada === e && { backgroundColor: ESTADO_COLORS[e], borderColor: ESTADO_COLORS[e] }]}
                      onPress={() => setEstadoCalzada(e)}
                    >
                      <Text style={[s.estadoBtnTxt, estadoCalzada === e && s.estadoBtnTxtOn]}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Tipo de infraestructura */}
            <Text style={s.label}>Tipo de infraestructura</Text>
            <View style={s.tipoRow}>
              {TIPOS.map(t => {
                const on = tipo === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[s.tipoBtn, on && { backgroundColor: activeColor, borderColor: activeColor }]}
                    onPress={() => setTipo(t)}
                  >
                    <Text style={[s.tipoBtnTag, on && { color: '#fff' }]}>{TIPO_ICONS[t]}</Text>
                    <Text style={[s.tipoBtnTxt, on && s.tipoBtnTxtOn]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Sub-formulario dinámico */}
            <View style={s.subform}>
              {/* Sección de ubicación para obras puntuales */}
              {tipo !== 'Ripio' && (
                <UbicacionPuntualSection
                  pointCoord={pointCoord}
                  gpsCoord={coords}
                  onPickFromMap={onRequestPickPoint}
                  onUseGPS={() => {
                    if (coords) {
                      setPointCoord(coords);
                    } else {
                      Alert.alert('GPS no activo', 'Activá el GPS en el mapa (botón 🧭) y volvé a intentarlo.');
                    }
                  }}
                  onClear={() => setPointCoord(null)}
                />
              )}

              {tipo === 'Puente' && (
                <PuenteForm data={datosPuente} onChange={setDatosPuente} />
              )}
              {tipo === 'Alcantarilla' && (
                <AlcantarillaForm data={datosAlcantarilla} onChange={setDatosAlcantarilla} />
              )}
              {tipo === 'Tubos' && (
                <TubosForm data={datosTubos} onChange={setDatosTubos} />
              )}
              {tipo === 'Ripio' && (
                <RipioForm
                  data={datosRipio}
                  onChange={setDatosRipio}
                  puntos={coordsLinea}
                  onCoordsChange={setCoordsLinea}
                  onRequestDraw={onRequestDraw}
                />
              )}
              {tipo === 'Otro' && (
                <>
                  <Text style={s.label}>Descripción del problema</Text>
                  <TextInput
                    style={[s.input, s.textArea]}
                    placeholder="Describí el problema detalladamente..."
                    placeholderTextColor={Colors.textMuted}
                    value={otroDesc}
                    onChangeText={setOtroDesc}
                    multiline
                    numberOfLines={5}
                    textAlignVertical="top"
                  />
                </>
              )}
            </View>

            {/* Inspector */}
            <Text style={s.label}>Inspector / Técnico</Text>
            <TextInput
              style={s.input}
              placeholder="Nombre del técnico..."
              placeholderTextColor={Colors.textMuted}
              value={tecnico}
              onChangeText={setTecnico}
            />

            {/* Observaciones */}
            <Text style={s.label}>Observaciones generales</Text>
            <TextInput
              style={[s.input, s.textArea]}
              placeholder="Observaciones adicionales..."
              placeholderTextColor={Colors.textMuted}
              value={observaciones}
              onChangeText={setObservaciones}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Fotos */}
            <View style={s.fotosHeader}>
              <Text style={s.label}>Fotos</Text>
              {fotos.length > 0 && (
                <Text style={s.fotosCount}>{fotos.length} adjunta{fotos.length !== 1 ? 's' : ''}</Text>
              )}
            </View>
            <TouchableOpacity style={s.fotoBtn} onPress={takeFoto}>
              <Ionicons name="camera-outline" size={18} color={Colors.accent} />
              <Text style={s.fotoBtnTxt}>Tomar foto</Text>
            </TouchableOpacity>

            {/* Guardar */}
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: activeColor }]}
              onPress={handleSave}
            >
              <Ionicons name={editando ? 'checkmark-outline' : 'save-outline'} size={18} color="#fff" />
              <Text style={s.saveBtnTxt}>{editando ? 'Guardar cambios' : 'Guardar Relevamiento'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </CCtx.Provider>
    </SCtx.Provider>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(Colors: ColorPalette) { return StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '95%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  fechaHora: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  closeBtn: { padding: 4 },
  body: { padding: 16, paddingBottom: 8 },

  // GPS block
  gpsBlock: {
    backgroundColor: Colors.background, borderRadius: 10,
    padding: 10, marginBottom: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  gpsText: { fontSize: 12, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  autoRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  autoChip: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 7,
    paddingHorizontal: 8, paddingVertical: 5, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  autoChipLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.8 },
  autoChipValue: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  autoNombre: { fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },

  // Form fields
  label: {
    fontSize: 11, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 2,
  },
  input: {
    backgroundColor: Colors.background, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12,
  },
  textArea: { minHeight: 70, paddingTop: 9 },

  // Estado buttons
  estadoRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  estadoBtn: {
    flex: 1, paddingVertical: 9, alignItems: 'center',
    borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  estadoBtnTxt: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  estadoBtnTxtOn: { color: '#fff' },

  // Tipo buttons
  tipoRow: { flexDirection: 'row', gap: 7, marginBottom: 14 },
  tipoBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 9,
    borderRadius: 9, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  tipoBtnTag: { fontSize: 11, fontWeight: '900', color: Colors.textMuted, letterSpacing: 0.5 },
  tipoBtnTxt: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, marginTop: 2 },
  tipoBtnTxtOn: { color: '#fff' },

  // Sub-form
  subform: {
    backgroundColor: Colors.background, borderRadius: 10,
    padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  fGroup: { marginBottom: 10 },
  fGroupTitle: {
    fontSize: 10, fontWeight: '700', color: Colors.accent,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
    borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 4,
  },
  fLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', marginBottom: 4, marginTop: 6 },
  fInputWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  fInput: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 7,
    paddingHorizontal: 10, paddingVertical: 7,
    fontSize: 13, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  fInputMulti: { minHeight: 60, textAlignVertical: 'top', paddingTop: 7 },
  fUnit: { fontSize: 11, color: Colors.textMuted, marginLeft: 6, minWidth: 16 },
  fRow: { flexDirection: 'row', alignItems: 'flex-start' },

  // Si/No buttons
  siNoRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  siNoBtn: {
    flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  siNoBtnOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  siNoBtnTxt: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  siNoBtnTxtOn: { color: '#fff' },

  // Cantidad stepper (shared)
  cantidadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  cantBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cantBtnTxt: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  cantValue: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, minWidth: 36, textAlign: 'center' },

  // Fotos
  fotosHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, marginTop: 2 },
  fotosCount: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  fotoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.background, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', marginBottom: 18,
  },
  fotoBtnTxt: { fontSize: 13, color: Colors.accent, fontWeight: '600' },

  // Save
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 10, marginTop: 4,
  },
  saveBtnTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Ripio — tramo definido
  tramoOk: {
    backgroundColor: '#122a14', borderRadius: 9, padding: 12,
    borderWidth: 1, borderColor: '#27ae60', marginBottom: 4,
  },
  tramoOkTitle: { fontSize: 13, fontWeight: '800', color: '#27ae60', marginBottom: 6 },
  tramoOkPt: {
    fontSize: 11, color: '#9aaac0', marginBottom: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  // Ripio — tarjetas de método (sin tramo)
  metodoCards: { gap: 10 },
  metodoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.surface, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  metodoCardIcon: { fontSize: 24, marginTop: 2 },
  metodoCardBody: { flex: 1 },
  metodoCardTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  metodoCardDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 10 },
  metodoCardBtn: {
    backgroundColor: '#1a4a7a', borderRadius: 7, paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'flex-start',
  },
  metodoCardBtnGps: { backgroundColor: '#27ae60' },
  metodoCardBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  metodoDivider: { height: 1, backgroundColor: Colors.border },

  // GPS Track — panel inline
  trackPanel: {
    backgroundColor: '#0d1f0d', borderRadius: 10, padding: 14,
    borderWidth: 1.5, borderColor: '#27ae60',
  },
  trackPanelHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  trackDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#e74c3c', marginRight: 8 },
  trackPanelTitle: { fontSize: 14, fontWeight: '800', color: '#27ae60' },
  trackStat: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
  trackCoord: { fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 12 },
  trackPanelBtns: { gap: 8 },
  trackPanelBtn: {
    borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center',
  },
  trackBtnStop: { backgroundColor: '#e74c3c' },
  trackBtnCancelSm: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  trackPanelBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Toneladas
  tonesBox: {
    backgroundColor: '#1a2a1a', borderRadius: 8, padding: 12, marginTop: 8,
    borderWidth: 1, borderColor: '#27ae60', alignItems: 'center',
  },
  tonesLabel: { fontSize: 10, fontWeight: '700', color: '#27ae60', textTransform: 'uppercase', letterSpacing: 0.8 },
  tonesValue: { fontSize: 28, fontWeight: '900', color: '#27ae60', marginVertical: 4 },
  tonesNote: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
  // Date stepper
  dateRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 4, marginBottom: 8 },
  dateCol: { flex: 1, alignItems: 'center' },
  dateBtn: {
    width: 30, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  dateBtnTxt: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, lineHeight: 20 },
  dateValue: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginVertical: 3, textAlign: 'center' },
  dateUnit: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  dateSep: { fontSize: 18, color: Colors.textMuted, marginTop: 28, paddingHorizontal: 2 },

}); }
