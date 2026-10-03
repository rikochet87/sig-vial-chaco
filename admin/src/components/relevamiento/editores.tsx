'use client'
/**
 * Los campos de cada tipo de relevamiento, para el panel.
 *
 * Los usan dos pantallas: la edición de un relevamiento que llegó del campo
 * (`RelevamientoEditForm`) y la carga de gabinete (`/dashboard/relevamientos/
 * nuevo`). Van en un solo lugar para que las dos pidan lo mismo.
 *
 * **Los nombres de los campos son los de la app móvil** (`types/relevamiento.ts`
 * en la raíz del repo): lo que se guarda en `datos_especificos` tiene que tener
 * la misma forma venga de donde venga, o las pantallas que lo leen —la ficha,
 * la exportación, Hidrología— verían dos esquemas distintos.
 */

// ── Estilos compartidos ──────────────────────────────────────────────────────

export const ZONAS = ['ZI', 'ZII', 'ZIII', 'ZIV', 'ZV']
export const ESTADOS: string[] = ['Bueno', 'Regular', 'Malo']

/*
 * Compactos, como un panel de propiedades de CAD: rótulo chico en mayúsculas,
 * campo de 28 px, monoespaciada, esquinas rectas. Las secciones se separan con
 * una línea y su título lleva el filo amarillo; no van en cajas, que con cinco
 * secciones apiladas eran más marco que contenido.
 */
const MONO = 'ui-monospace, "Roboto Mono", monospace'
export const field: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0,
}
export const label: React.CSSProperties = {
  color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: MONO,
}
export const input: React.CSSProperties = {
  background: '#111', border: '1px solid #2a2a2a', borderRadius: 2,
  color: '#e0e0e0', fontSize: 12, fontFamily: MONO, padding: '5px 8px', height: 28,
  outline: 'none', width: '100%', boxSizing: 'border-box',
}
export const select: React.CSSProperties = { ...input, cursor: 'pointer', padding: '3px 6px' }
export const textarea: React.CSSProperties = {
  ...input, height: 'auto', resize: 'vertical', minHeight: 64, lineHeight: 1.5,
}
export const grid2: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10,
}
export const sectionCard: React.CSSProperties = {
  borderTop: '1px solid #222', padding: '12px 0 14px',
}
export const sectionTitle: React.CSSProperties = {
  color: '#c8c8c8', fontSize: 11, fontWeight: 400, margin: '0 0 10px', fontFamily: MONO,
  textTransform: 'uppercase', letterSpacing: 1.2, borderLeft: '3px solid #F5C300', paddingLeft: 8,
}

/** El selector de tipo y de subtipo: un control segmentado, no botones sueltos */
export function Segmentado<T extends string>({ opciones, valor, onChange }: {
  opciones: readonly T[]; valor: T; onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', border: '1px solid #2a2a2a', borderRadius: 2, width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap' }}>
      {opciones.map(o => (
        <button key={o} type="button" onClick={() => onChange(o)} style={{
          background: valor === o ? '#F5C3001a' : 'transparent', border: 'none',
          borderBottom: `2px solid ${valor === o ? '#F5C300' : 'transparent'}`,
          color: valor === o ? '#F5C300' : '#9a9a9a', padding: '5px 10px', fontSize: 11,
          fontFamily: MONO, letterSpacing: 0.8, textTransform: 'uppercase', cursor: 'pointer',
        }}>{o}</button>
      ))}
    </div>
  )
}

type Datos = Record<string, unknown>
interface EditorProps {
  data: Datos
  onChange: (d: Datos) => void
}

const txt = (v: unknown) => String(v ?? '')

function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div style={field}><span style={label}>{titulo}</span>{children}</div>
}

function Estado({ value, onChange }: { value: unknown; onChange: (v: string) => void }) {
  return (
    <select style={select} value={txt(value) || 'Regular'} onChange={e => onChange(e.target.value)}>
      {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
    </select>
  )
}

function SiNo({ value, onChange }: { value: unknown; onChange: (v: boolean) => void }) {
  return (
    <select style={select} value={value ? 'true' : 'false'} onChange={e => onChange(e.target.value === 'true')}>
      <option value="false">No</option><option value="true">Sí</option>
    </select>
  )
}

// ── Lineal: ripio, tramo o canal ─────────────────────────────────────────────

export const SUBTIPOS_LINEAL = ['Ripio', 'Tramo', 'Canal'] as const
const ESTADOS_LIMPIEZA = ['Limpio', 'Parcialmente obstruido', 'Obstruido'] as const
const OBSTRUCCIONES = ['vegetación', 'sedimento', 'residuos'] as const
const ZONA_NUM: Record<string, number> = { ZI: 1, ZII: 2, ZIII: 3, ZIV: 4, ZV: 5 }

/** Z5C099002 — la misma regla que `buildNomenclatura` de la app */
export function nomenclaturaTramo(zona: string, cc: string, tramo: string): string {
  const zn = ZONA_NUM[zona]
  if (!zn || !cc || !tramo) return ''
  return `Z${zn}C${String(parseInt(cc) || 0).padStart(3, '0')}${String(parseInt(tramo) || 0).padStart(3, '0')}`
}

/**
 * @param longitudM  la medida sobre el dibujo, cuando la hay: se ofrece en vez
 *                   de pedir que se tipee un número que el mapa ya sabe
 */
export function EditLineal({ data, onChange, longitudM }: EditorProps & { longitudM?: number }) {
  // Los relevamientos viejos no tienen subtipo y son todos de ripio
  const subtipo = txt(data.subtipo) || 'Ripio'
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...data, [k]: e.target.value })
  const medida = longitudM && longitudM > 0 ? String(Math.round(longitudM)) : null

  const setTramo = (k: 'zonaTramo' | 'ccNumeroTramo' | 'numTramo', v: string) => {
    const next = { ...data, [k]: v }
    next.nomenclatura = nomenclaturaTramo(txt(next.zonaTramo), txt(next.ccNumeroTramo), txt(next.numTramo))
    onChange(next)
  }
  const obs = (data.tiposObstruccion as string[] | undefined) ?? []

  return (
    <div style={sectionCard}>
      <h3 style={sectionTitle}>Datos lineal</h3>
      <div style={{ marginBottom: 12 }}>
        <Segmentado opciones={SUBTIPOS_LINEAL} valor={subtipo as (typeof SUBTIPOS_LINEAL)[number]}
          onChange={v => onChange({ ...data, subtipo: v })} />
      </div>

      {subtipo === 'Ripio' && (
        <div style={grid2}>
          <Campo titulo="Ancho (m)"><input style={input} value={txt(data.ancho)} onChange={set('ancho')} placeholder="0" /></Campo>
          <Campo titulo="Espesor (m)"><input style={input} value={txt(data.espesor)} onChange={set('espesor')} placeholder="0" /></Campo>
          <Campo titulo="Longitud (m)">
            <input style={input} value={txt(data.longitud)} onChange={set('longitud')} placeholder={medida ?? '0'} />
            {medida && txt(data.longitud) !== medida && (
              <button type="button" onClick={() => onChange({ ...data, longitud: medida })} style={usarMedida}>
                Usar la del dibujo: {Number(medida).toLocaleString('es-AR')} m
              </button>
            )}
          </Campo>
          <Campo titulo="Empresa"><input style={input} value={txt(data.empresa)} onChange={set('empresa')} placeholder="Empresa ejecutora" /></Campo>
          <Campo titulo="Fecha ejecución"><input style={input} value={txt(data.fechaEjecucion)} onChange={set('fechaEjecucion')} placeholder="DD/MM/AAAA" /></Campo>
        </div>
      )}

      {subtipo === 'Tramo' && (
        <div style={grid2}>
          <Campo titulo="Tramo nuevo">
            <SiNo value={data.esNuevo !== false} onChange={v => onChange({ ...data, esNuevo: v })} />
          </Campo>
          {data.esNuevo !== false && (<>
            <Campo titulo="Zona">
              <select style={select} value={txt(data.zonaTramo)} onChange={e => setTramo('zonaTramo', e.target.value)}>
                <option value="">— seleccionar —</option>
                {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </Campo>
            <Campo titulo="N° de CC"><input style={input} value={txt(data.ccNumeroTramo)} onChange={e => setTramo('ccNumeroTramo', e.target.value)} /></Campo>
            <Campo titulo="N° de tramo"><input style={input} value={txt(data.numTramo)} onChange={e => setTramo('numTramo', e.target.value)} /></Campo>
            <Campo titulo="Nomenclatura">
              <div style={{ color: '#F5C300', fontSize: 14, fontFamily: 'monospace', letterSpacing: 2, paddingTop: 8 }}>
                {txt(data.nomenclatura) || '—'}
              </div>
            </Campo>
          </>)}
          {data.esNuevo === false && (
            <div style={{ color: '#8f8f8f', fontSize: 12, gridColumn: '1 / -1' }}>
              La nomenclatura se toma del tramo existente: cargala en Ruta / Tramo.
            </div>
          )}
        </div>
      )}

      {subtipo === 'Canal' && (
        <div style={grid2}>
          <Campo titulo="Ancho (m)"><input style={input} value={txt(data.anchoCanal)} onChange={set('anchoCanal')} /></Campo>
          <Campo titulo="Profundidad (m)"><input style={input} value={txt(data.profundidad)} onChange={set('profundidad')} /></Campo>
          <Campo titulo="Longitud (m)">
            <input style={input} value={txt(data.longitudCanal)} onChange={set('longitudCanal')} placeholder={medida ?? '0'} />
            {medida && txt(data.longitudCanal) !== medida && (
              <button type="button" onClick={() => onChange({ ...data, longitudCanal: medida })} style={usarMedida}>
                Usar la del dibujo: {Number(medida).toLocaleString('es-AR')} m
              </button>
            )}
          </Campo>
          <Campo titulo="Estado de limpieza">
            <select style={select} value={txt(data.estadoLimpieza)}
              onChange={e => onChange({
                ...data, estadoLimpieza: e.target.value || undefined,
                tiposObstruccion: e.target.value === 'Limpio' ? [] : data.tiposObstruccion,
              })}>
              <option value="">— seleccionar —</option>
              {ESTADOS_LIMPIEZA.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </Campo>
          {!!data.estadoLimpieza && data.estadoLimpieza !== 'Limpio' && (
            <Campo titulo="Obstrucción">
              <div style={{ display: 'flex', gap: 12, paddingTop: 6 }}>
                {OBSTRUCCIONES.map(o => (
                  <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#ccc', fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={obs.includes(o)} style={{ accentColor: '#F5C300' }}
                      onChange={e => onChange({ ...data, tiposObstruccion: e.target.checked ? [...obs, o] : obs.filter(x => x !== o) })} />
                    {o}
                  </label>
                ))}
              </div>
            </Campo>
          )}
        </div>
      )}
    </div>
  )
}

const usarMedida: React.CSSProperties = {
  background: 'none', border: 'none', color: '#F5C300', fontSize: 11, cursor: 'pointer',
  padding: '2px 0', textAlign: 'left', fontFamily: 'monospace',
}

// ── Puente ───────────────────────────────────────────────────────────────────

export function EditPuente({ data, onChange }: EditorProps) {
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...data, [k]: e.target.value })
  // N palizadas dejan N−1 vanos, igual que en la app
  const palizadas = Math.max(2, Math.min(10, Number(data.cantidadPalizadas) || 2))
  const luces = (data.lucesPalizadas as string[] | undefined) ?? []
  const setPalizadas = (n: number) => {
    const k = Math.max(2, Math.min(10, n || 2))
    onChange({ ...data, cantidadPalizadas: k, lucesPalizadas: Array.from({ length: k - 1 }, (_, i) => luces[i] ?? '') })
  }
  return (
    <div style={sectionCard}>
      <h3 style={sectionTitle}>Datos puente</h3>
      <div style={grid2}>
        <Campo titulo="Longitud total (m)"><input style={input} value={txt(data.longitudTotal)} onChange={set('longitudTotal')} /></Campo>
        <Campo titulo="H — altura libre (m)"><input style={input} value={txt(data.h)} onChange={set('h')} /></Campo>
        <Campo titulo="J — ancho camino (m)"><input style={input} value={txt(data.j)} onChange={set('j')} /></Campo>
        <Campo titulo="Tipo estructura"><input style={input} value={txt(data.tipoEstructura)} onChange={set('tipoEstructura')} placeholder="Madera, Hormigón, etc." /></Campo>
        <Campo titulo="Estado estructural"><Estado value={data.estadoEstructural} onChange={v => onChange({ ...data, estadoEstructural: v })} /></Campo>
        <Campo titulo="Cantidad palizadas">
          <input style={input} type="number" min={2} max={10} value={palizadas} onChange={e => setPalizadas(Number(e.target.value))} />
        </Campo>
        {Array.from({ length: palizadas - 1 }, (_, i) => (
          <Campo key={i} titulo={`Luz vano ${i + 1} (m)`}>
            <input style={input} value={luces[i] ?? ''}
              onChange={e => onChange({ ...data, cantidadPalizadas: palizadas,
                lucesPalizadas: Array.from({ length: palizadas - 1 }, (_, k) => (k === i ? e.target.value : luces[k] ?? '')) })} />
          </Campo>
        ))}
        <Campo titulo="Guía ruedas"><SiNo value={data.guiaRuedas} onChange={v => onChange({ ...data, guiaRuedas: v })} /></Campo>
        {!!data.guiaRuedas && (
          <Campo titulo="Estado guía ruedas"><Estado value={data.estadoGuiaRuedas} onChange={v => onChange({ ...data, estadoGuiaRuedas: v })} /></Campo>
        )}
        <Campo titulo="Barandas"><SiNo value={data.barandas} onChange={v => onChange({ ...data, barandas: v })} /></Campo>
        {!!data.barandas && (
          <Campo titulo="H barandas (m)"><input style={input} value={txt(data.hBarandas)} onChange={set('hBarandas')} /></Campo>
        )}
      </div>
    </div>
  )
}

// ── Alcantarilla ─────────────────────────────────────────────────────────────

export function EditAlcantarilla({ data, onChange }: EditorProps) {
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...data, [k]: e.target.value })
  return (
    <div style={sectionCard}>
      <h3 style={sectionTitle}>Datos alcantarilla</h3>
      <div style={grid2}>
        <Campo titulo="Longitud total (m)"><input style={input} value={txt(data.longitudTotal)} onChange={set('longitudTotal')} /></Campo>
        <Campo titulo="Cantidad luces"><input style={input} value={txt(data.cantidadLuces)} onChange={set('cantidadLuces')} /></Campo>
        <Campo titulo="Longitud luces (m)"><input style={input} value={txt(data.longitudLuces)} onChange={set('longitudLuces')} /></Campo>
        <Campo titulo="Ancho total (m)"><input style={input} value={txt(data.anchoTotal)} onChange={set('anchoTotal')} /></Campo>
        <Campo titulo="Ancho calzada (m)"><input style={input} value={txt(data.anchoCalzada)} onChange={set('anchoCalzada')} /></Campo>
        <Campo titulo="H — altura (m)"><input style={input} value={txt(data.h)} onChange={set('h')} /></Campo>
        <Campo titulo="Materiales alas"><input style={input} value={txt(data.materialesAlas)} onChange={set('materialesAlas')} /></Campo>
        <Campo titulo="Longitud alas (m)"><input style={input} value={txt(data.longitudAlas)} onChange={set('longitudAlas')} /></Campo>
        <Campo titulo="Tablero — material">
          <select style={select} value={txt(data.tableroMaterial)} onChange={set('tableroMaterial')}>
            <option value="">— seleccionar —</option>
            <option value="Madera">Madera</option>
            <option value="Hº Aº">Hº Aº</option>
          </select>
        </Campo>
        <Campo titulo="Tablero — estado"><Estado value={data.tableroEstado} onChange={v => onChange({ ...data, tableroEstado: v })} /></Campo>
        <Campo titulo="Estado estructural"><Estado value={data.estadoEstructural} onChange={v => onChange({ ...data, estadoEstructural: v })} /></Campo>
        <Campo titulo="Losa de fondo"><Estado value={data.losaFondoEstado} onChange={v => onChange({ ...data, losaFondoEstado: v })} /></Campo>
        <Campo titulo="Situación hidráulica">
          <select style={select} value={txt(data.situacionHidraulica)} onChange={set('situacionHidraulica')}>
            <option value="">— seleccionar —</option>
            <option value="Estiaje">Estiaje</option>
            <option value="Inundación">Inundación</option>
          </select>
        </Campo>
      </div>
    </div>
  )
}

// ── Tubos ────────────────────────────────────────────────────────────────────

export function EditTubos({ data, onChange }: EditorProps) {
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...data, [k]: e.target.value })
  return (
    <div style={sectionCard}>
      <h3 style={sectionTitle}>Datos tubos</h3>
      <div style={grid2}>
        <Campo titulo="J — ancho (m)"><input style={input} value={txt(data.jAncho)} onChange={set('jAncho')} /></Campo>
        <Campo titulo="D — diámetro"><input style={input} value={txt(data.d)} onChange={set('d')} /></Campo>
        <Campo titulo="Cabezales"><input style={input} value={txt(data.cabezales)} onChange={set('cabezales')} /></Campo>
        <Campo titulo="Tapada"><input style={input} value={txt(data.tapada)} onChange={set('tapada')} /></Campo>
        <Campo titulo="Cantidad">
          <input style={input} type="number" min={1} value={txt(data.cantidad)}
            onChange={e => onChange({ ...data, cantidad: Number(e.target.value) || 1 })} />
        </Campo>
      </div>
    </div>
  )
}

// ── Otro ─────────────────────────────────────────────────────────────────────

export function EditOtro({ data, onChange }: EditorProps) {
  return (
    <div style={sectionCard}>
      <h3 style={sectionTitle}>Descripción</h3>
      <textarea
        style={textarea}
        value={txt(data.descripcion)}
        onChange={e => onChange({ ...data, descripcion: e.target.value })}
        placeholder="Descripción libre..."
      />
    </div>
  )
}

// ── Valores iniciales, los mismos que la app ─────────────────────────────────

export const INICIAL: Record<string, Datos> = {
  Puente: {
    longitudTotal: '', cantidadPalizadas: 2, lucesPalizadas: [''], h: '', j: '', tipoEstructura: '',
    guiaRuedas: false, estadoGuiaRuedas: 'Regular', barandas: false, hBarandas: '', estadoEstructural: 'Regular',
  },
  Alcantarilla: {
    longitudTotal: '', cantidadLuces: '', longitudLuces: '', anchoTotal: '', anchoCalzada: '', h: '',
    materialesAlas: '', longitudAlas: '', tableroMaterial: '', tableroEstado: 'Regular',
    estadoEstructural: 'Regular', losaFondoEstado: 'Regular', situacionHidraulica: '',
  },
  Tubos: { jAncho: '', d: '', cabezales: '', tapada: '', cantidad: 1 },
  Lineal: { subtipo: 'Ripio', ancho: '', longitud: '', espesor: '', empresa: '', fechaEjecucion: '' },
  Otro: { descripcion: '' },
}

/** En qué clave de `datos_especificos` va cada tipo — `ripio` es histórico y vale para los tres lineales */
export const CLAVE_DATOS: Record<string, 'puente' | 'alcantarilla' | 'tubos' | 'ripio' | 'otro'> = {
  Puente: 'puente', Alcantarilla: 'alcantarilla', Tubos: 'tubos', Lineal: 'ripio', Otro: 'otro',
}
