/**
 * De dónde viene un relevamiento: del campo, con la app, o de gabinete, cargado
 * desde el panel sin ir al lugar.
 *
 * Va en `datos_especificos.origen` y no en una columna —ver
 * `api/relevamientos/route.ts`—. Los de la app no traen la clave: ausente es
 * campo.
 */
export const esGabinete = (r: { datos_especificos?: unknown } | null | undefined): boolean =>
  (r?.datos_especificos as { origen?: string } | null | undefined)?.origen === 'gabinete'
