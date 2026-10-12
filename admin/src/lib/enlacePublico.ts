/**
 * Enlaces públicos de Hidrología: quien tiene el enlace ve la sección sin
 * cuenta, sólo lectura y sin la pestaña Precisión.
 *
 * El enlace es `/p/<clave>`. Al abrirlo se guarda la clave en una cookie y se
 * pasa a `/publico/hidrologia`; desde ahí la cookie es lo que autoriza la
 * página, los archivos de `public/` que la pantalla baja y las rutas de
 * lectura (`requireLecturaHidrologia()` en `apiAuth.ts`).
 *
 * Lo usan el middleware, la ruta del enlace y las APIs, y por el middleware
 * **no importa nada de Node**: consulta la tabla con `fetch` contra la API REST
 * de Supabase, no con el cliente.
 *
 * La tabla es `enlaces_publicos` (`docs/sql/14-enlaces-publicos.sql`).
 */

export const COOKIE_ENLACE = 'sv_enlace'
export const RUTA_PUBLICA = '/publico/hidrologia'
export const RUTA_SIN_ACCESO = '/publico/sin-acceso'

/** Lo que dura la cookie: seis meses. Revocar el enlace la deja sin efecto antes */
export const COOKIE_DIAS = 180

/** Carpetas de `public/` que la pantalla de Hidrología baja por su cuenta */
const DATOS_PUBLICOS = ['/geo/', '/rio/', '/lluvia/']

export const esDatoDeHidrologia = (pathname: string) =>
  DATOS_PUBLICOS.some(p => pathname.startsWith(p))

/** 24 bytes al azar en base64 para URL: 32 caracteres */
const FORMA = /^[A-Za-z0-9_-]{32}$/

export function nuevoToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Una página son la ruta, media docena de archivos y otras tantas APIs, cada
 * una preguntando lo mismo. La respuesta se recuerda un minuto por proceso:
 * es también lo que puede tardar en cortarse un enlace recién revocado.
 */
const RECORDAR_MS = 60_000
const vistos = new Map<string, { vigente: boolean; hasta: number }>()

/** ¿Existe el enlace y no está revocado? Si la base no contesta, no. */
export async function enlaceVigente(token: string | null | undefined): Promise<boolean> {
  if (!token || !FORMA.test(token)) return false

  const visto = vistos.get(token)
  if (visto && visto.hasta > Date.now()) return visto.vigente

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !clave) return false

  try {
    const r = await fetch(
      `${base}/rest/v1/enlaces_publicos?select=id&token=eq.${token}&revocado_en=is.null&limit=1`,
      { headers: { apikey: clave, authorization: `Bearer ${clave}` }, cache: 'no-store' },
    )
    // Un fallo no se recuerda: el próximo pedido vuelve a preguntar
    if (!r.ok) return false
    const filas: unknown = await r.json()
    const vigente = Array.isArray(filas) && filas.length > 0
    vistos.set(token, { vigente, hasta: Date.now() + RECORDAR_MS })
    return vigente
  } catch {
    return false
  }
}
