'use client'
/**
 * Usuarios: una sola lista con filtros, y los enlaces públicos aparte.
 *
 * Antes eran dos pestañas —«Panel web» y «App de campo»— y un técnico con
 * permisos de panel salía en las dos. Lo que las separaba ahora es el filtro
 * «Acceso». La lógica de filtros y orden está en `lib/usuarios.ts`.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import EditTecnicoButton from './EditTecnicoButton'
import DeleteTecnicoButton from './DeleteTecnicoButton'
import ResendInviteButton from './ResendInviteButton'
import EnlacesPublicos from './EnlacesPublicos'
import { PERMISOS_OPCIONES } from '@/lib/permisos'
import {
  ROLES, ZONAS, FILTROS_INICIALES, filtrar, contar, accesoDe, seccionesDe, entraAlPanel,
  type UsuarioFila, type Filtros, type Rol, type Periodo,
} from '@/lib/usuarios'

const MONO = 'ui-monospace, "Roboto Mono", monospace'

// Quita acceso al panel sin eliminar el usuario (limpia permisos)
function RemovePanelButton({ id }: { id: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  async function handle() {
    if (!confirm('¿Quitar acceso al panel para este usuario?')) return
    setLoading(true)
    await fetch(`/api/tecnicos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permisos: [] }),
    })
    setLoading(false)
    router.refresh()
  }
  return (
    <button
      onClick={handle}
      disabled={loading}
      title="Quitar acceso al panel, sin borrar el usuario"
      style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#a0a0a0', padding: '4px 10px', fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
      onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = '#f44336'; e.currentTarget.style.color = '#f44336' } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#a0a0a0' }}
    >
      {loading ? '...' : 'Quitar panel'}
    </button>
  )
}

/** Color de cada tipo de usuario: va como filo y texto, no como fondo */
const ROL_COLOR: Record<Rol, string> = {
  admin: '#F5C300',
  panel: '#CE93D8',
  tecnico: '#64B5F6',
  usuario: '#4DB6AC',
}
const ROL_LABEL = Object.fromEntries(ROLES.map(r => [r.key, r.label])) as Record<Rol, string>

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a.slice(2)}`
}

interface Props {
  usuarios: UsuarioFila[]
  /** Si no se pudieron contar los relevamientos, se dice en vez de mostrar ceros */
  errorRelevamientos: string | null
}

export default function UsuariosTabs({ usuarios, errorRelevamientos }: Props) {
  const [tab, setTab] = useState<'usuarios' | 'enlaces'>('usuarios')
  const [f, setF] = useState<Filtros>(FILTROS_INICIALES)
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setF(prev => ({ ...prev, [k]: v }))

  const lista = useMemo(() => filtrar(usuarios, f), [usuarios, f])

  // Los conteos de cada opción son sobre la lista entera, no sobre lo filtrado:
  // dicen cuántos hay, no cuántos quedan
  const porRol = useMemo(() => contar(usuarios, u => u.rol), [usuarios])
  const porZona = useMemo(() => contar(usuarios, u => u.rol === 'tecnico' ? (u.zona ?? 'sin') : null), [usuarios])
  const porAcceso = useMemo(() => {
    const c = contar(usuarios, u => accesoDe(u))
    return {
      panel: (c.panel ?? 0) + (c.ambos ?? 0),
      app: (c.app ?? 0) + (c.ambos ?? 0),
      ambos: c.ambos ?? 0,
    }
  }, [usuarios])

  const maxRel = Math.max(1, ...lista.map(u => u.relevamientos[f.periodo]))
  const hayFiltro = JSON.stringify({ ...f, orden: '', periodo: '' }) !== JSON.stringify({ ...FILTROS_INICIALES, orden: '', periodo: '' })

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '9px 20px', fontSize: 12, fontWeight: 700, letterSpacing: 1, fontFamily: MONO,
    textTransform: 'uppercase', background: 'transparent', border: 'none',
    borderBottom: active ? '2px solid #F5C300' : '2px solid transparent',
    color: active ? '#F5C300' : '#8f8f8f', cursor: 'pointer',
  })

  return (
    <div style={{ fontFamily: MONO }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>Usuarios</h1>
        <Link
          href="/dashboard/tecnicos/nuevo"
          className="glow-y"
          style={{ background: '#F5C300', color: '#111', fontWeight: 700, padding: '9px 18px', textDecoration: 'none', fontSize: 12, letterSpacing: 1 }}
        >
          + NUEVO
        </Link>
      </div>

      <div style={{ borderBottom: '1px solid #1e1e1e', display: 'flex' }}>
        <button style={tabStyle(tab === 'usuarios')} onClick={() => setTab('usuarios')}>
          Usuarios <span style={{ opacity: 0.6 }}>({usuarios.length})</span>
        </button>
        <button style={tabStyle(tab === 'enlaces')} onClick={() => setTab('enlaces')}>
          Enlaces públicos
        </button>
      </div>

      {tab === 'enlaces' && <EnlacesPublicos />}

      {tab === 'usuarios' && (
        <>
          {/* ── Filtros ── */}
          <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderTop: 'none', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text" value={f.texto} onChange={e => set('texto', e.target.value)}
                placeholder="Buscar por nombre o correo..."
                style={{ ...inp, width: 280 }}
              />
              <Grupo titulo="Orden">
                <Opcion activa={f.orden === 'nombre'} onClick={() => set('orden', 'nombre')}>Nombre</Opcion>
                <Opcion activa={f.orden === 'relevamientos'} onClick={() => set('orden', 'relevamientos')}>Más relevamientos</Opcion>
              </Grupo>
              <Grupo titulo="Relevamientos">
                {([['total', 'Total'], ['d90', '90 días'], ['d30', '30 días']] as [Periodo, string][]).map(([k, t]) => (
                  <Opcion key={k} activa={f.periodo === k} onClick={() => set('periodo', k)}>{t}</Opcion>
                ))}
              </Grupo>
              <span style={{ marginLeft: 'auto', color: '#8f8f8f', fontSize: 11 }}>
                {lista.length} de {usuarios.length}
                {hayFiltro && (
                  <button type="button" onClick={() => setF(prev => ({ ...FILTROS_INICIALES, orden: prev.orden, periodo: prev.periodo }))}
                    style={{ marginLeft: 10, background: 'transparent', border: '1px solid #2a2a2a', color: '#c8c8c8', padding: '3px 8px', fontSize: 11, fontFamily: MONO, cursor: 'pointer' }}>
                    ✕ Limpiar filtros
                  </button>
                )}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <Grupo titulo="Tipo">
                <Opcion activa={f.rol === 'todos'} onClick={() => set('rol', 'todos')}>Todos</Opcion>
                {ROLES.map(r => (
                  <Opcion key={r.key} activa={f.rol === r.key} onClick={() => set('rol', r.key)} color={ROL_COLOR[r.key]} n={porRol[r.key] ?? 0}>
                    {r.label}
                  </Opcion>
                ))}
              </Grupo>
              <Grupo titulo="Zona">
                <Opcion activa={f.zona === 'todas'} onClick={() => set('zona', 'todas')}>Todas</Opcion>
                {ZONAS.map(z => (
                  <Opcion key={z} activa={f.zona === z} onClick={() => set('zona', z)} n={porZona[z] ?? 0}>{z}</Opcion>
                ))}
                {(porZona.sin ?? 0) > 0 && (
                  <Opcion activa={f.zona === 'sin'} onClick={() => set('zona', 'sin')} n={porZona.sin}>Sin zona</Opcion>
                )}
              </Grupo>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <Grupo titulo="Acceso">
                <Opcion activa={f.acceso === 'todos'} onClick={() => set('acceso', 'todos')}>Todos</Opcion>
                <Opcion activa={f.acceso === 'panel'} onClick={() => set('acceso', 'panel')} n={porAcceso.panel}>Panel web</Opcion>
                <Opcion activa={f.acceso === 'app'} onClick={() => set('acceso', 'app')} n={porAcceso.app}>App de campo</Opcion>
                <Opcion activa={f.acceso === 'ambos'} onClick={() => set('acceso', 'ambos')} n={porAcceso.ambos}>Panel y app</Opcion>
              </Grupo>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={rotulo}>Sección</span>
                <select value={f.seccion} onChange={e => set('seccion', e.target.value as Filtros['seccion'])} style={{ ...inp, width: 220, cursor: 'pointer' }}>
                  <option value="todas">Todas</option>
                  {PERMISOS_OPCIONES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </label>
            </div>
          </div>

          {errorRelevamientos && (
            <div style={{ background: '#191919', border: '1px solid #2a2a2a', borderLeft: '3px solid #ff9800', borderTop: 'none', padding: '8px 14px', color: '#e0e0e0', fontSize: 12 }}>
              No se pudieron contar los relevamientos ({errorRelevamientos}). La columna puede estar incompleta.
            </div>
          )}

          {/* ── Lista ── */}
          <div style={{ background: '#191919', border: '1px solid #1e1e1e', borderTop: 'none', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
              <thead>
                <tr style={{ background: '#141414' }}>
                  {['Nombre', 'Tipo', 'Zona', 'Acceso', `Relevamientos${f.periodo === 'total' ? '' : f.periodo === 'd90' ? ' · 90 días' : ' · 30 días'}`, 'Acciones'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map(u => <Fila key={u.id} u={u} periodo={f.periodo} maxRel={maxRel} resaltar={f.orden === 'relevamientos'} />)}
                {lista.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#a0a0a0', fontSize: 12 }}>
                    Ningún usuario con esos filtros
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Fila({ u, periodo, maxRel, resaltar }: { u: UsuarioFila; periodo: Periodo; maxRel: number; resaltar: boolean }) {
  const secciones = seccionesDe(u)
  const panel = entraAlPanel(u)
  const app = u.rol === 'tecnico' || u.rol === 'usuario'
  const n = u.relevamientos[periodo]
  return (
    <tr style={{ borderBottom: '1px solid #1e1e1e' }}>
      <td style={td}>
        <div style={{ color: '#e0e0e0', fontSize: 13 }}>{u.nombre || '(sin nombre)'}</div>
        <div style={{ color: '#8f8f8f', fontSize: 11, marginTop: 2 }}>{u.email}</div>
      </td>
      <td style={td}>
        <span style={{ borderLeft: `3px solid ${ROL_COLOR[u.rol]}`, background: '#141414', color: ROL_COLOR[u.rol], padding: '2px 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>
          {ROL_LABEL[u.rol]}
        </span>
      </td>
      <td style={td}>
        {u.zona
          ? <span style={{ color: '#e0e0e0', fontSize: 12, border: '1px solid #2a2a2a', padding: '2px 8px' }}>{u.zona}</span>
          : u.rol === 'tecnico'
            ? <span style={{ color: '#ff9800', fontSize: 11 }} title="Un técnico sin zona no carga maquinaria en ningún consorcio">sin zona</span>
            : <span style={{ color: '#8f8f8f' }}>—</span>}
      </td>
      <td style={td}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
          {panel && (
            <span title={u.rol === 'admin' ? 'Todas las secciones' : secciones.map(s => PERMISOS_OPCIONES.find(p => p.key === s)?.label).join(' · ') || 'Sin secciones'}
              style={{ color: '#c8c8c8', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#8f8f8f' }}>PANEL</span>{' '}
              {u.rol === 'admin'
                ? <span style={{ color: '#F5C300' }}>acceso total</span>
                : secciones.length === 0
                  ? <span style={{ color: '#ff9800' }}>sin secciones</span>
                  : <span style={{ color: '#4caf50' }}>{secciones.length} {secciones.length === 1 ? 'sección' : 'secciones'}</span>}
            </span>
          )}
          {app && <span style={{ color: '#8f8f8f' }}>APP DE CAMPO</span>}
          {!panel && !app && <span style={{ color: '#8f8f8f' }}>—</span>}
        </div>
      </td>
      <td style={{ ...td, minWidth: 170 }}>
        {u.relevamientos.total === 0 ? (
          <span style={{ color: '#8f8f8f', fontSize: 11 }}>ninguno</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: n ? '#e0e0e0' : '#8f8f8f', fontSize: 14, fontWeight: 700, minWidth: 28, textAlign: 'right' }}>{n}</span>
              {resaltar && (
                <span style={{ flex: 1, height: 4, background: '#222', maxWidth: 100 }}>
                  <span style={{ display: 'block', height: 4, width: `${(n / maxRel) * 100}%`, background: '#F5C300' }} />
                </span>
              )}
            </div>
            <span style={{ color: '#8f8f8f', fontSize: 11, whiteSpace: 'nowrap' }}>
              {periodo !== 'total' && `${u.relevamientos.total} en total · `}
              {u.relevamientos.ultimo ? `último ${fechaCorta(u.relevamientos.ultimo)}` : 'sin fecha'}
            </span>
          </div>
        )}
      </td>
      <td style={{ ...td, whiteSpace: 'nowrap' }}>
        <ResendInviteButton id={u.id} nombre={u.nombre} />
        <EditTecnicoButton id={u.id} nombre={u.nombre} zona={u.zona} rol={u.rol} permisos={u.permisos} />
        {/* A un usuario de la app con permisos se le puede sacar el panel sin borrarlo */}
        {app && u.permisos.length > 0 && <RemovePanelButton id={u.id} />}
        <DeleteTecnicoButton id={u.id} nombre={u.nombre} />
      </td>
    </tr>
  )
}

// ── Piezas ────────────────────────────────────────────────────────────────

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={rotulo}>{titulo}</span>
      <div style={{ display: 'flex', border: '1px solid #2a2a2a', flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function Opcion({ activa, onClick, children, n, color }: {
  activa: boolean; onClick: () => void; children: React.ReactNode; n?: number; color?: string
}) {
  return (
    <button type="button" onClick={onClick} style={{
      background: activa ? '#F5C3001a' : 'transparent', border: 'none',
      borderBottom: `2px solid ${activa ? '#F5C300' : 'transparent'}`,
      color: activa ? '#F5C300' : color ?? '#a0a0a0', padding: '5px 10px', fontSize: 11,
      fontFamily: MONO, letterSpacing: 0.6, cursor: 'pointer', whiteSpace: 'nowrap',
    }}>
      {children}
      {n != null && <span style={{ color: activa ? '#F5C300' : '#8f8f8f', marginLeft: 5 }}>{n}</span>}
    </button>
  )
}

const rotulo: React.CSSProperties = {
  color: '#8f8f8f', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1,
}
const inp: React.CSSProperties = {
  background: '#111', border: '1px solid #2a2a2a', borderRadius: 2, color: '#e0e0e0',
  fontSize: 12, fontFamily: MONO, padding: '5px 8px', height: 28, outline: 'none', boxSizing: 'border-box',
}
const th: React.CSSProperties = {
  padding: '9px 14px', color: '#8f8f8f', fontSize: 11, fontWeight: 400, textAlign: 'left',
  textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1e1e1e', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '9px 14px', verticalAlign: 'middle',
}
