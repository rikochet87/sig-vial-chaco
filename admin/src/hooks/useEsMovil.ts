/**
 * ¿La pantalla es angosta, de celular?
 *
 * Casi todo el acomodo para celular está en `globals.css` («Hidrología en
 * pantallas angostas»), con clases que pisan los estilos en línea. Esto es
 * para lo que el CSS no puede decidir: qué arranca plegado y qué se dibuja de
 * otra forma. El corte es el mismo que el de la hoja de estilos.
 */
import { useSyncExternalStore } from 'react'

const CONSULTA = '(max-width: 760px)'

/** Para un estado inicial, en componentes que sólo se montan en el navegador */
export const esMovilAhora = () =>
  typeof window !== 'undefined' && window.matchMedia(CONSULTA).matches

function suscribir(avisar: () => void) {
  const mq = window.matchMedia(CONSULTA)
  mq.addEventListener('change', avisar)
  return () => mq.removeEventListener('change', avisar)
}

/** En el servidor contesta que no: la primera pintura es la de escritorio */
export function useEsMovil(): boolean {
  return useSyncExternalStore(suscribir, esMovilAhora, () => false)
}
