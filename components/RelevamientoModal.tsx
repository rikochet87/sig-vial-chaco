import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { CONSORCIOS } from '@/constants/realData';
import type {
  Relevamiento, EstadoCalzada, TipoInfraestructura,
  DatosPuente, DatosAlcantarilla, DatosTubos,
} from '@/types/relevamiento';
import {
  ESTADO_COLORS, DEFAULT_PUENTE, DEFAULT_ALCANTARILLA, DEFAULT_TUBOS,
} from '@/types/relevamiento';

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

// ── Props & main component ────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  coords: { lat: number; lng: number } | null;
  onSave: (r: Relevamiento) => void;
  onClose: () => void;
}

const TIPOS: TipoInfraestructura[] = ['Puente', 'Alcantarilla', 'Tubos', 'Otro'];
const TIPO_ICONS: Record<TipoInfraestructura, string> = {
  Puente: 'PTE', Alcantarilla: 'ALC', Tubos: 'TUB', Otro: '?',
};
const ESTADOS: EstadoCalzada[] = ['Bueno', 'Regular', 'Malo'];

export default function RelevamientoModal({ visible, coords, onSave, onClose }: Props) {
  const [estadoCalzada, setEstadoCalzada] = useState<EstadoCalzada>('Regular');
  const [tipo, setTipo] = useState<TipoInfraestructura>('Puente');
  const [datosPuente, setDatosPuente] = useState<DatosPuente>({ ...DEFAULT_PUENTE });
  const [datosAlcantarilla, setDatosAlcantarilla] = useState<DatosAlcantarilla>({ ...DEFAULT_ALCANTARILLA });
  const [datosTubos, setDatosTubos] = useState<DatosTubos>({ ...DEFAULT_TUBOS });
  const [otroDesc, setOtroDesc] = useState('');
  const [rutaTramo, setRutaTramo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [tecnico, setTecnico] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [fechaModal] = useState(() => new Date().toISOString());

  const autoCC = useMemo(() => {
    if (!coords) return null;
    return nearestCC(coords.lat, coords.lng);
  }, [coords]);

  const reset = () => {
    setEstadoCalzada('Regular');
    setTipo('Puente');
    setDatosPuente({ ...DEFAULT_PUENTE });
    setDatosAlcantarilla({ ...DEFAULT_ALCANTARILLA });
    setDatosTubos({ ...DEFAULT_TUBOS });
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
    if (!coords) {
      Alert.alert('Sin ubicación', 'Activá el GPS en el mapa antes de registrar.');
      return;
    }
    const r: Relevamiento = {
      id: Date.now().toString(),
      fecha: new Date().toISOString(),
      coords,
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
              <Text style={s.title}>📋 Nuevo Relevamiento</Text>
              <Text style={s.fechaHora}>{formatFechaHora(fechaModal)}</Text>
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
                <Ionicons name="location" size={13} color={coords ? activeColor : Colors.danger} />
                <Text style={[s.gpsText, !coords && { color: Colors.danger }]}>
                  {coords
                    ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                    : 'Sin GPS — activá la ubicación en el mapa'}
                </Text>
              </View>
              {autoCC && coords && (
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
              {autoCC && coords && (
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

            {/* Estado calzada — oculto para Puente (tiene su propio estado estructural) */}
            {tipo !== 'Puente' && (
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
              {tipo === 'Puente' && (
                <PuenteForm data={datosPuente} onChange={setDatosPuente} />
              )}
              {tipo === 'Alcantarilla' && (
                <AlcantarillaForm data={datosAlcantarilla} onChange={setDatosAlcantarilla} />
              )}
              {tipo === 'Tubos' && (
                <TubosForm data={datosTubos} onChange={setDatosTubos} />
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
              <Text style={s.fotoBtnTxt}>
                {ImagePicker ? 'Tomar foto' : 'Requiere expo-image-picker'}
              </Text>
            </TouchableOpacity>

            {/* Guardar */}
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: activeColor }]}
              onPress={handleSave}
            >
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={s.saveBtnTxt}>Guardar Relevamiento</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
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

  // Tipo estructura puente
  estructuraRow: { flexDirection: 'row', gap: 6, marginBottom: 2, flexWrap: 'wrap' },
  estructuraBtn: {
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface,
    marginBottom: 4,
  },
  estructuraBtnOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  estructuraBtnTxt: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  estructuraBtnTxtOn: { color: '#fff' },

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
});
