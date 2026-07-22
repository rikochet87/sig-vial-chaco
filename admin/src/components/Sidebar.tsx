'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

// Íconos SVG geométricos/técnicos inline
const ICONS = {
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="1" width="6" height="6" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1" y="9" width="6" height="6" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="9" width="6" height="6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  relevamientos: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <polyline points="1,12 5,7 8,10 11,4 15,6" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="5" cy="7" r="1.2" fill="currentColor" />
      <circle cx="8" cy="10" r="1.2" fill="currentColor" />
      <circle cx="11" cy="4" r="1.2" fill="currentColor" />
    </svg>
  ),
  tecnicos: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" />
    </svg>
  ),
  consorcios: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <polygon points="8,1 15,5 15,11 8,15 1,11 1,5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" />
      <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" />
    </svg>
  ),
  herramientas: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M9.5 2a3.5 3.5 0 0 0-3.4 4.2L1.5 10.8a1.5 1.5 0 1 0 2.1 2.1l4.6-4.6A3.5 3.5 0 0 0 9.5 2z" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="9.5" cy="5.5" r="1" fill="currentColor" />
    </svg>
  ),
  obras: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <polyline points="1,13 1,10 5,10 5,7 9,7 9,4 13,4 13,1" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <line x1="1" y1="14" x2="15" y2="14" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
}

const NAV_ITEMS = [
  { href: '/dashboard',               label: 'Dashboard',      icon: ICONS.dashboard,     exact: true },
  { href: '/dashboard/relevamientos', label: 'Relevamientos',  icon: ICONS.relevamientos, exact: false },
  { href: '/dashboard/tecnicos',      label: 'Usuarios',       icon: ICONS.tecnicos,      exact: false },
  { href: '/dashboard/consorcios',    label: 'Consorcios',     icon: ICONS.consorcios,    exact: false },
]

// Sub-herramientas — agregar nuevas acá
const TOOL_ITEMS = [
  { id: 'measure', label: 'Medir', icon: '📏', href: '/dashboard/herramientas?tool=measure' },
]

// Sub-ítems de Obras
const OBRA_ITEMS = [
  { id: 'calculadoras',  label: 'Calculadoras',  icon: '∑',  href: '/dashboard/obras/calculadoras'  },
  { id: 'planta',        label: 'Planta',         icon: '⬛', href: '/dashboard/obras/planta'        },
]

export default function Sidebar() {
  const [collapsed, setCollapsed]     = useState(false)
  const [hoveredHref, setHoveredHref] = useState<string | null>(null)
  const [toolsOpen, setToolsOpen]     = useState(false)
  const [obrasOpen, setObrasOpen]     = useState(false)
  const pathname = usePathname()

  // Auto-expandir acordeones
  useEffect(() => {
    if (pathname.startsWith('/dashboard/herramientas')) setToolsOpen(true)
    if (pathname.startsWith('/dashboard/obras'))        setObrasOpen(true)
  }, [pathname])

  const w = collapsed ? 48 : 220

  const linkBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: collapsed ? '10px 0' : '9px 16px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    textDecoration: 'none',
    transition: 'background 0.15s, color 0.15s, border-color 0.15s, text-shadow 0.15s',
    whiteSpace: 'nowrap', borderLeft: '2px solid transparent',
    fontSize: 12, fontFamily: '"DM Mono", "Roboto Mono", ui-monospace, monospace',
    letterSpacing: 0.4, fontWeight: 400,
  }

  const isToolsActive = pathname.startsWith('/dashboard/herramientas')
  const isObrasActive = pathname.startsWith('/dashboard/obras')

  return (
    <div style={{
      width: w, minHeight: '100vh', background: '#111',
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.18s', overflow: 'hidden',
      flexShrink: 0, borderRight: '1px solid #1e1e1e',
    }}>

      {/* Logo */}
      <div style={{
        padding: collapsed ? '16px 0' : '16px', borderBottom: '1px solid #1e1e1e',
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start', gap: 10,
      }}>
        <div style={{ width: 28, height: 28, background: '#F5C300', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#111', fontFamily: 'monospace', letterSpacing: -0.5 }}>SV</span>
        </div>
        {!collapsed && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#e0e0e0', letterSpacing: 1.5, fontFamily: 'monospace' }}>SIG VIAL</div>
            <div style={{ fontSize: 9, color: '#444', letterSpacing: 1, fontFamily: 'monospace', marginTop: 1 }}>CHACO · ADMIN</div>
          </div>
        )}
      </div>

      {/* Sección nav */}
      {!collapsed && (
        <div style={{ padding: '14px 16px 4px', fontSize: 9, color: '#333', letterSpacing: 1.5, fontFamily: 'monospace', textTransform: 'uppercase' }}>
          Navegación
        </div>
      )}

      <nav style={{ flex: 1, padding: '4px 0' }}>
        {NAV_ITEMS.map(item => {
          const isActive  = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          const isHovered = hoveredHref === item.href && !isActive
          return (
            <Link
              key={item.href} href={item.href}
              onMouseEnter={() => setHoveredHref(item.href)}
              onMouseLeave={() => setHoveredHref(null)}
              style={{
                ...linkBase,
                color: isActive ? '#F5C300' : isHovered ? '#bbb' : '#555',
                borderLeftColor: isActive ? '#F5C300' : isHovered ? '#3a3a3a' : 'transparent',
                background: isActive ? 'rgba(245,195,0,0.06)' : isHovered ? 'rgba(255,255,255,0.025)' : 'transparent',
                textShadow: isHovered ? '0 0 10px rgba(255,255,255,0.18)' : 'none',
              }}
            >
              <span style={{ flexShrink: 0, opacity: isActive ? 1 : isHovered ? 0.9 : 0.6, color: isActive ? '#F5C300' : 'currentColor', transition: 'opacity 0.15s' }}>
                {item.icon}
              </span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}

        {/* Separador */}
        <div style={{ margin: '8px 16px', borderTop: '1px solid #1e1e1e' }} />

        {/* ── Herramientas — acordeón ── */}
        <button
          onClick={() => setToolsOpen(v => !v)}
          onMouseEnter={() => setHoveredHref('herramientas')}
          onMouseLeave={() => setHoveredHref(null)}
          style={{
            ...linkBase,
            width: '100%', border: 'none', cursor: 'pointer',
            color: isToolsActive ? '#F5C300' : hoveredHref === 'herramientas' ? '#bbb' : '#555',
            borderLeftColor: isToolsActive ? '#F5C300' : hoveredHref === 'herramientas' ? '#3a3a3a' : 'transparent',
            background: isToolsActive ? 'rgba(245,195,0,0.06)' : hoveredHref === 'herramientas' ? 'rgba(255,255,255,0.025)' : 'transparent',
            textShadow: hoveredHref === 'herramientas' && !isToolsActive ? '0 0 10px rgba(255,255,255,0.18)' : 'none',
          } as React.CSSProperties}
        >
          <span style={{ flexShrink: 0, opacity: isToolsActive || hoveredHref === 'herramientas' ? 0.9 : 0.6, color: isToolsActive ? '#F5C300' : 'currentColor' }}>
            {ICONS.herramientas}
          </span>
          {!collapsed && (
            <>
              <span>Herramientas</span>
              <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.5, transition: 'transform 0.15s', display: 'inline-block', transform: toolsOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
            </>
          )}
        </button>

        {/* Sub-ítems de herramientas */}
        {toolsOpen && !collapsed && (
          <div style={{ borderLeft: '1px solid #1e1e1e', marginLeft: 24, marginTop: 2, marginBottom: 2 }}>
            {TOOL_ITEMS.map(tool => {
              const isActive  = pathname.startsWith('/dashboard/herramientas')
              const isHovered = hoveredHref === tool.id
              return (
                <Link
                  key={tool.id} href={tool.href}
                  onMouseEnter={() => setHoveredHref(tool.id)}
                  onMouseLeave={() => setHoveredHref(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 12px', textDecoration: 'none',
                    fontSize: 11, fontFamily: '"DM Mono", ui-monospace, monospace',
                    letterSpacing: 0.3, whiteSpace: 'nowrap',
                    color: isActive ? '#F5C300' : isHovered ? '#bbb' : '#555',
                    background: isHovered ? 'rgba(255,255,255,0.025)' : 'transparent',
                    transition: 'color 0.15s, background 0.15s',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{tool.icon}</span>
                  <span>{tool.label}</span>
                </Link>
              )
            })}
          </div>
        )}

        {/* ── Obras — acordeón ── */}
        <button
          onClick={() => setObrasOpen(v => !v)}
          onMouseEnter={() => setHoveredHref('obras')}
          onMouseLeave={() => setHoveredHref(null)}
          style={{
            ...linkBase,
            width: '100%', border: 'none', cursor: 'pointer',
            color: isObrasActive ? '#F5C300' : hoveredHref === 'obras' ? '#bbb' : '#555',
            borderLeftColor: isObrasActive ? '#F5C300' : hoveredHref === 'obras' ? '#3a3a3a' : 'transparent',
            background: isObrasActive ? 'rgba(245,195,0,0.06)' : hoveredHref === 'obras' ? 'rgba(255,255,255,0.025)' : 'transparent',
            textShadow: hoveredHref === 'obras' && !isObrasActive ? '0 0 10px rgba(255,255,255,0.18)' : 'none',
          } as React.CSSProperties}
        >
          <span style={{ flexShrink: 0, opacity: isObrasActive || hoveredHref === 'obras' ? 0.9 : 0.6, color: isObrasActive ? '#F5C300' : 'currentColor' }}>
            {ICONS.obras}
          </span>
          {!collapsed && (
            <>
              <span>Obras</span>
              <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.5, transition: 'transform 0.15s', display: 'inline-block', transform: obrasOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
            </>
          )}
        </button>

        {/* Sub-ítems de obras */}
        {obrasOpen && !collapsed && (
          <div style={{ borderLeft: '1px solid #1e1e1e', marginLeft: 24, marginTop: 2, marginBottom: 2 }}>
            {OBRA_ITEMS.map(item => {
              const isActive  = pathname.startsWith(item.href)
              const isHovered = hoveredHref === item.id
              return (
                <Link
                  key={item.id} href={item.href}
                  onMouseEnter={() => setHoveredHref(item.id)}
                  onMouseLeave={() => setHoveredHref(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 12px', textDecoration: 'none',
                    fontSize: 11, fontFamily: '"DM Mono", ui-monospace, monospace',
                    letterSpacing: 0.3, whiteSpace: 'nowrap',
                    color: isActive ? '#F5C300' : isHovered ? '#bbb' : '#555',
                    background: isHovered ? 'rgba(255,255,255,0.025)' : 'transparent',
                    transition: 'color 0.15s, background 0.15s',
                  }}
                >
                  <span style={{ fontSize: 14, fontFamily: 'monospace' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* Collapse toggle */}
      <div style={{ borderTop: '1px solid #1e1e1e', padding: '8px' }}>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{ width: '100%', background: 'transparent', border: '1px solid #1e1e1e', color: '#333', cursor: 'pointer', padding: '7px', fontSize: 10, fontFamily: 'monospace', letterSpacing: 1, transition: 'border-color 0.15s, color 0.15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#333'; (e.currentTarget as HTMLButtonElement).style.color = '#666' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e1e1e'; (e.currentTarget as HTMLButtonElement).style.color = '#333' }}
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>
    </div>
  )
}
