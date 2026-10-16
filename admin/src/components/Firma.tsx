/**
 * La firma del autor al pie del panel y del enlace público de Hidrología.
 * Mismo nombre que la licencia del repo (CC BY-NC-ND 4.0).
 *
 * Va afuera de `#panel-contenido`, como el encabezado: así el zoom de
 * accesibilidad no la agranda y queda siempre a la vista, sin depender de
 * que la página llegue al fondo.
 */
export const AUTOR = 'Matias Rosello'
export const CORREO = 'rosellomatias87@gmail.com'

export default function Firma() {
  return (
    <footer style={{
      flexShrink: 0, minHeight: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      flexWrap: 'wrap', gap: '0 10px', padding: '3px 16px', borderTop: '1px solid #222', background: '#141414',
      fontFamily: 'monospace', fontSize: 11, color: '#8f8f8f', letterSpacing: 0.4,
    }}>
      <span>Desarrollado por <span style={{ color: '#c4c4c4' }}>{AUTOR}</span></span>
      <a href={`mailto:${CORREO}`} style={{ color: '#a0a0a0', textDecoration: 'none' }}>{CORREO}</a>
    </footer>
  )
}
