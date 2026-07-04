'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '🗺' },
  { href: '/dashboard/relevamientos', label: 'Relevamientos', icon: '📋' },
  { href: '/dashboard/tecnicos', label: 'Usuarios', icon: '👤' },
  { href: '/dashboard/consorcios', label: 'Consorcios', icon: '🏘' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  const width = collapsed ? 64 : 240

  return (
    <div style={{
      width,
      minHeight: '100vh',
      background: '#2C2C2C',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.2s',
      overflow: 'hidden',
      flexShrink: 0,
      borderRight: '1px solid #3C3C3C',
    }}>
      {/* Logo */}
      <div style={{ padding: collapsed ? '20px 12px' : '20px 16px', borderBottom: '1px solid #3C3C3C' }}>
        {collapsed ? (
          <div style={{ background: '#F5C300', color: '#1A1A1A', fontWeight: 800, fontSize: 12, padding: '4px 6px', borderRadius: 6, textAlign: 'center', letterSpacing: 1 }}>
            SV
          </div>
        ) : (
          <div style={{ background: '#F5C300', color: '#1A1A1A', fontWeight: 800, fontSize: 16, padding: '6px 12px', borderRadius: 8, textAlign: 'center', letterSpacing: 2 }}>
            SIG / VIAL
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 0' }}>
        {NAV_ITEMS.map(item => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: collapsed ? '12px 20px' : '12px 20px',
                color: isActive ? '#F5C300' : '#9E9E9E',
                textDecoration: 'none',
                fontWeight: isActive ? 600 : 400,
                borderLeft: isActive ? '3px solid #F5C300' : '3px solid transparent',
                background: isActive ? 'rgba(245,195,0,0.08)' : 'transparent',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {!collapsed && <span style={{ fontSize: 14 }}>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div style={{ padding: '12px', borderTop: '1px solid #3C3C3C' }}>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            width: '100%',
            background: '#3C3C3C',
            border: 'none',
            borderRadius: 8,
            color: '#9E9E9E',
            cursor: 'pointer',
            padding: '8px',
            fontSize: 16,
          }}
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>
    </div>
  )
}
