import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { CONSORCIOS } from '@/constants/realData';
import type {
  Relevamiento, EstadoCalzada, TipoInfraestructura,
  DatosPuente, DatosAlcantarilla, DatosTubos, DatosRipio,
} from '@/types/relevamiento';
import {
  ESTADO_COLORS, DEFAULT_PUENTE, DEFAULT_ALCANTARILLA, DEFAULT_TUBOS, DEFAULT_RIPIO,
} from '@/types/relevamiento';

// expo-location: importación condicional para captura GPS en formulario ripio
let Location: any = null;
try { Location = require('expo-location'); } catch (_) {}

// Importación condicional de expo-image-picker
let ImagePicker: any = null;
try { ImagePicker = require('expo-image-picker'); } catch (_) {}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nearestCC(lat: number, lng: number) {
  let best = CONSORCIOS[0];
  let minD = Infinity;
  for (const cc of CONSORCIOS) {
    const d = (cc.latitude - lat) ** 2 + (cc.longitude - lng) ** 2;
    if (d < minD) { minD = d; best = cc; }
  }
  return best;
}

function formatFechaHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function FLabel({ text }: { text: string }) {
  return <Text style={s.fLabel}>{text}</Text>;
}

function FInput({
  value, onChange, placeholder, numeric, multiline, unit,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; numeric?: boolean; multiline?: boolean; unit?: string;
}) {
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
  return <View style={s.fRow}>{children}</View>;
}

function FGroup({ label, children }: { label: string; children: React.ReactNode }) {
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
  const set = (k: keyof DatosRipio) => (v: string) => onChange({ ...data, [k]: v });

  // ── GPS Track inline ───────────────────────────────────────────────────────
  const [trackPhase, setTrackPhase] = useState<'idle'|'recording'>('idle');
  const [trackPts,   setTrackPts]   = useState<LatLngPunto[]>([]);
  const trackSubRef = useRef<any>(null);

  const startTrack = async () => {
    if (!Location) { Alert.alert('GPS no disponible', 'expo-location no está instalado.'); return; }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permiso denegado', 'Se necesita GPS para grabar el track.'); return; }
    setTrackPts([]);
    setTrackPhase('recording');
    trackSubRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 4000 },
      (loc: any) => {
        setTrackPts(prev => [...prev, { lat: loc.coords.latitude, lng: loc.coords.longitude }]);
      }
    );
  };

  const stopTrack = () => {
    trackSubRef.current?.remove();
    trackSubRef.current = null;
    setTrackPhase('idle');
    setTrackPts(prev => {
      if (prev.length >= 2) {
        onCoordsChange(prev);
      } else {
        Alert.alert('Track muy corto', 'Se necesitan al menos 2 puntos GPS para definir el tramo.');
      }
      return prev; // no limpiar — el usuario ve los datos
    });
  };

  const cancelTrack = () => {
    trackSubRef.current?.remove();
    trackSubRef.current = null;
    setTrackPhase('idle');
    setTrackPts([]);
  };

  // ── Date stepper ──────────────────────────────────────────────────────────
  const today = new Date();
  const [dDay,   setDDay]   = useState(today.getDate());
  const [dMonth, setDMonth] = useState(today.getMonth() + 1);
  const [dYear,  setDYear]  = useState(today.getFullYear());

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

// ── Props & main component ────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  coords: { lat: number; lng: number } | null;
  /** Puntos pre-dibujados desde el mapa — activa automáticamente el tipo Ripio */
  initialCoordsLinea?: LatLngPunto[];
  /** Llamado cuando el usuario elige "Dibujar en mapa" desde el formulario */
  onRequestDraw?: () => void;
  onSave: (r: Relevamiento) => void;
  onClose: () => void;
}

const TIPOS: TipoInfraestructura[] = ['Puente', 'Alcantarilla', 'Tubos', 'Ripio', 'Otro'];
const TIPO_ICONS: Record<TipoInfraestructura, string> = {
  Puente: 'PTE', Alcantarilla: 'ALC', Tubos: 'TUB', Ripio: 'RIP', Otro: '?',
};
const ESTADOS: EstadoCalzada[] = ['Bueno', 'Regular', 'Malo'];

export default function RelevamientoModal({ visible, coords, initialCoordsLinea, onRequestDraw, onSave, onClose }: Props) {
  const [estadoCalzada, setEstadoCalzada] = useState<EstadoCalzada>('Regular');
  const [tipo, setTipo] = useState<TipoInfraestructura>('Puente');
  const [datosPuente, setDatosPuente] = useState<DatosPuente>({ ...DEFAULT_PUENTE });
  const [datosAlcantarilla, setDatosAlcantarilla] = useState<DatosAlcantarilla>({ ...DEFAULT_ALCANTARILLA });
  const [datosTubos, setDatosTubos] = useState<DatosTubos>({ ...DEFAULT_TUBOS });
  const [datosRipio, setDatosRipio] = useState<DatosRipio>({ ...DEFAULT_RIPIO });
  const [coordsLinea, setCoordsLinea] = useState<LatLngPunto[]>([]);
  const [otroDesc, setOtroDesc] = useState('');
  const [rutaTramo, setRutaTramo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [tecnico, setTecnico] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [fechaModal] = useState(() => new Date().toISOString());

  // Pre-carga el tramo dibujado desde el mapa y activa el tipo Ripio automáticamente
  useEffect(() => {
    if (visible && initialCoordsLinea && initialCoordsLinea.length >= 2) {
      setCoordsLinea([...initialCoordsLinea]);
      setTipo('Ripio');
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Para Ripio usamos el primer punto del tramo; para los demás, el GPS del mapa
  const effectiveCoords = useMemo(() => {
    if (tipo === 'Ripio' && coordsLinea.length > 0) return coordsLinea[0];
    return coords;
  }, [tipo, coords, coordsLinea]);

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
    setOtroDesc('');
    setRutaTramo('');
    setObservaciones('');
    setFotos([]);
  };

  const takeFoto = async () => {
    if (!ImagePicker) {
      Alert.alert('No disponible', 'Instalá expo-image-picker para usar fotos.');
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
    });
    if (!result.canceled && result.assets?.[0]) {
      setFotos(prev => [...prev, result.assets[0].uri]);
    }
  };

  const handleSave = () => {
    // Para Ripio, la ubicación viene de los puntos del tramo
    if (tipo === 'Ripio') {
      if (coordsLinea.length < 2) {
        Alert.alert('Tramo incompleto', 'Agregá al menos el punto de inicio y final del tramo.');
        return;
      }
    } else if (!coords) {
      Alert.alert('Sin ubicación', 'Activá el GPS en el mapa antes de registrar.');
      return;
    }

    const baseCoords = tipo === 'Ripio' ? coordsLinea[0] : coords!;

    const r: Relevamiento = {
      id: Date.now().toString(),
      fecha: new Date().toISOString(),
      coords: baseCoords,
      coordsLinea: tipo === 'Ripio' ? [...coordsLinea] : undefined,
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
    onSave(r);
    reset();
    onClose();
  };

  const activeColor = ESTADO_COLORS[estadoCalzada];

  return (
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
              <Text style={s.titl