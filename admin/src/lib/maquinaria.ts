/**
 * La maquinaria vial de cada consorcio: el catálogo, las condiciones y las
 * reglas de carga. Puro, sin React ni Supabase: lo usan la pantalla, la ruta y
 * `scripts/verificar-maquinaria.ts`.
 *
 * **La organización y los nombres vienen de la app «Equipos Viales»**, que se
 * armó aparte con su propia base: cuatro categorías, los tipos de cada una,
 * qué tipos llevan chasis y motor, y las seis condiciones en dos grupos. Lo que
 * no se trajo, a propósito:
 *
 * - **El propietario.** Allá un equipo era de la repartición o de un consorcio;
 *   acá la sección vive dentro del consorcio y todo lo que lista es suyo.
 * - **El legajo**, que era el número interno de la repartición.
 * - **`en_servicio`**, que repetía lo que ya dice la condición y el formulario
 *   viejo ni mostraba.
 *
 * **El catálogo va en el código y no en una tabla.** Allá eran dos tablas
 * (`categorias_equipo`, `tipos_equipo`) que nadie editaba desde la pantalla.
 * Acá la base guarda el `tipo_id` y la ruta rechaza uno que no esté en
 * `TIPOS`. **Los id no se reusan**: si un tipo deja de usarse, se marca
 * `activo: false` — las máquinas viejas lo siguen mostrando y no se lo ofrece
 * para cargar.
 */

export interface CategoriaMaquinaria {
  id: number
  nombre: string
}

export interface TipoMaquinaria {
  id: number
  nombre: string
  categoria: number
  /** Los autopropulsados tienen chasis y motor con número; un implemento no */
  chasisMotor: boolean
  activo: boolean
}

export const CATEGORIAS: readonly CategoriaMaquinaria[] = [
  { id: 1, nombre: 'Tractores y Automotores' },
  { id: 2, nombre: 'Nivelación y Perfilado' },
  { id: 3, nombre: 'Implementos de Labranza' },
  { id: 4, nombre: 'Logística y Apoyo' },
]

const t = (id: number, nombre: string, categoria: number, chasisMotor: boolean): TipoMaquinaria =>
  ({ id, nombre, categoria, chasisMotor, activo: true })

/** Mismos id y en el mismo orden que `tipos_equipo` de la app vieja */
export const TIPOS: readonly TipoMaquinaria[] = [
  t(1, 'Tractor Agrícola', 1, true),
  t(2, 'Motoniveladora', 1, true),
  t(3, 'Retroexcavadora Autopropulsada', 1, true),
  t(4, 'Retropala Autopropulsada', 1, true),
  t(5, 'Cargador Frontal Autopropulsado', 1, true),
  t(6, 'Topadora / Bulldozer', 1, true),
  t(7, 'Minicargadora', 1, true),
  t(8, 'Camioneta Pick-Up', 1, true),
  t(9, 'Camión Volcador', 1, true),
  t(10, 'Camión Cisterna / Tanque', 1, true),
  t(11, 'Camión Chasis', 1, true),
  t(12, 'Camión Batea', 1, true),

  t(13, 'Niveladora de Arrastre', 2, false),
  t(14, 'Perfilador Múltiple (Ravasto)', 2, false),
  t(15, 'Pala Hidráulica de Arrastre', 2, false),
  t(16, 'Hoja Topante', 2, false),
  t(17, 'Retroexcavadora de Acople (p/tractor)', 2, false),
  t(18, 'Cargador Frontal de Acople (p/tractor)', 2, false),

  t(19, 'Rastra de Discos Excéntrica', 3, false),
  t(20, 'Desmalezadora', 3, false),
  t(21, 'Rolo Triturador', 3, false),
  t(22, 'Rolo Liso / Compactador', 3, false),
  t(23, 'Fumigadora / Pulverizadora', 3, false),

  t(24, 'Tanque / Batán Combustible', 4, false),
  t(25, 'Tanque / Batán Agua', 4, false),
  t(26, 'Casilla Rodante', 4, false),
  t(27, 'Taller Rodante', 4, false),
  t(28, 'Acoplado Rural / Volcador', 4, false),
  t(29, 'Semirremolque / Carretón', 4, false),
  t(30, 'Motocicleta', 4, true),
  t(31, 'Semirremolque', 4, true),
]

export function tipoPorId(id: number): TipoMaquinaria | undefined {
  return TIPOS.find(x => x.id === id)
}

// ── Condición ─────────────────────────────────────────────────────────────

export const CONDICIONES = ['Bueno', 'Regular', 'Malo', 'En reparación', 'Desuso', 'Baja'] as const
export type Condicion = typeof CONDICIONES[number]

/** Las tres primeras andan; las otras tres no. Es el agrupamiento de la app vieja */
export const OPERATIVAS: readonly Condicion[] = ['Bueno', 'Regular', 'Malo']

export function esOperativa(c: Condicion): boolean {
  return OPERATIVAS.includes(c)
}

/**
 * Colores de cada condición. Van como filo y texto, no como fondo lleno: es la
 * convención del panel. El verde y el rojo de «Bueno» y «Malo» no se repiten
 * en lo no operativo, que va en grises y en el naranja de los avisos.
 */
export const COLOR_CONDICION: Record<Condicion, string> = {
  'Bueno': '#4caf50',
  'Regular': '#F5C300',
  'Malo': '#e53935',
  'En reparación': '#ff9800',
  'Desuso': '#a0a0a0',
  'Baja': '#8f8f8f',
}

// ── La máquina ────────────────────────────────────────────────────────────

/** Lo que se carga en el formulario y valida la ruta */
export interface DatosMaquina {
  tipo_id: number
  marca: string | null
  modelo: string | null
  anio: number | null
  dominio: string | null
  n_chasis: string | null
  n_motor: string | null
  condicion: Condicion
  poliza_numero: string | null
  /** YYYY-MM-DD */
  poliza_vencimiento: string | null
  observaciones: string | null
}

/** Una fila de `maquinaria` */
export interface Maquina extends DatosMaquina {
  id: string
  consorcio_numero: number
  creado_por: string | null
  /** El nombre de quien la cargó, tal como era ese día: sobrevive al borrado del usuario */
  creado_por_nombre: string | null
  created_at: string
  actualizado_por: string | null
  actualizado_por_nombre: string | null
  updated_at: string
}

// ── Quién puede cargar ────────────────────────────────────────────────────

export interface PerfilMaquinaria {
  rol: string | null | undefined
  zona: string | null | undefined
}

/**
 * Cargar y editar: **el administrador en cualquier consorcio, y un técnico sólo
 * en los de su zona.** Puede haber varios técnicos en la misma zona. Un técnico
 * sin zona asignada no carga en ninguno. Los usuarios de oficina con el permiso
 * `consorcios` ven la lista pero no la tocan.
 *
 * `zonaConsorcio` sale de la tabla `consorcios` y la del técnico de su perfil,
 * las dos del lado del servidor: `ZI` a `ZV` en las dos.
 */
export function puedeCargar(perfil: PerfilMaquinaria, zonaConsorcio: string | null | undefined): boolean {
  if (perfil.rol === 'admin') return true
  if (perfil.rol !== 'tecnico') return false
  const z = perfil.zona?.trim()
  return !!z && !!zonaConsorcio && z === zonaConsorcio.trim()
}

/** Borrar es sólo del administrador: lo que cargó un técnico no lo borra otro */
export function puedeBorrar(perfil: PerfilMaquinaria): boolean {
  return perfil.rol === 'admin'
}

export const ANIO_MIN = 1950

const LARGO: Record<string, number> = {
  marca: 60, modelo: 60, dominio: 12, n_chasis: 40, n_motor: 40, poliza_numero: 40,
  observaciones: 1000,
}

function texto(v: unknown, max: number): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

/**
 * Valida lo que llega del navegador y arma la fila. **Lista blanca**: sólo
 * estos campos, nunca `{ ...body }` (ver «Autorización en las APIs» en
 * CLAUDE.md).
 *
 * - Un tipo sin chasis y motor —un implemento— guarda esos dos en null aunque
 *   lleguen: el formulario no los muestra, y un número que quedó de cuando se
 *   eligió otro tipo no es un dato.
 * - El dominio va en mayúsculas y sin espacios, que es como se escribe una
 *   patente y como se la busca.
 * - Un tipo que dejó de usarse se acepta en una máquina que ya lo tenía
 *   (`tipoAnterior`), no en una nueva.
 */
export function validarMaquina(
  body: unknown,
  anioActual: number,
  tipoAnterior?: number,
): { ok: true; datos: DatosMaquina } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Cuerpo inválido' }
  const b = body as Record<string, unknown>

  const tipoId = Number(b.tipo_id)
  const tipo = Number.isInteger(tipoId) ? tipoPorId(tipoId) : undefined
  if (!tipo) return { ok: false, error: 'Tipo de equipo inválido' }
  if (!tipo.activo && tipo.id !== tipoAnterior) {
    return { ok: false, error: `«${tipo.nombre}» ya no se usa para cargar equipos` }
  }

  const condicion = b.condicion as Condicion
  if (!CONDICIONES.includes(condicion)) return { ok: false, error: 'Condición inválida' }

  let anio: number | null = null
  if (b.anio != null && String(b.anio).trim() !== '') {
    anio = Number(b.anio)
    if (!Number.isInteger(anio) || anio < ANIO_MIN || anio > anioActual + 1) {
      return { ok: false, error: `El año tiene que estar entre ${ANIO_MIN} y ${anioActual + 1}` }
    }
  }

  let vto: string | null = null
  if (b.poliza_vencimiento != null && String(b.poliza_vencimiento).trim() !== '') {
    vto = String(b.poliza_vencimiento).trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vto) || Number.isNaN(Date.parse(vto + 'T00:00:00Z'))) {
      return { ok: false, error: 'Fecha de vencimiento de la póliza inválida' }
    }
  }

  const dominio = texto(b.dominio, LARGO.dominio)

  return {
    ok: true,
    datos: {
      tipo_id: tipo.id,
      marca: texto(b.marca, LARGO.marca),
      modelo: texto(b.modelo, LARGO.modelo),
      anio,
      dominio: dominio ? dominio.toUpperCase().replace(/\s+/g, '') : null,
      n_chasis: tipo.chasisMotor ? texto(b.n_chasis, LARGO.n_chasis) : null,
      n_motor: tipo.chasisMotor ? texto(b.n_motor, LARGO.n_motor) : null,
      condicion,
      poliza_numero: texto(b.poliza_numero, LARGO.poliza_numero),
      poliza_vencimiento: vto,
      observaciones: texto(b.observaciones, LARGO.observaciones),
    },
  }
}

// ── Póliza ────────────────────────────────────────────────────────────────

/** Desde cuántos días antes del vencimiento se avisa. El de la app vieja */
export const AVISO_POLIZA_DIAS = 30

export type EstadoPoliza =
  | { estado: 'sin_poliza' }
  | { estado: 'vencida' | 'por_vencer' | 'vigente'; dias: number }

/**
 * `hoy` en YYYY-MM-DD, la fecha local de quien mira. Se cuenta en días de
 * calendario: vence hoy es 0 días y todavía no está vencida.
 */
export function estadoPoliza(vencimiento: string | null, hoy: string): EstadoPoliza {
  if (!vencimiento) return { estado: 'sin_poliza' }
  const dias = Math.round(
    (Date.parse(vencimiento + 'T00:00:00Z') - Date.parse(hoy + 'T00:00:00Z')) / 86_400_000,
  )
  if (dias < 0) return { estado: 'vencida', dias }
  if (dias <= AVISO_POLIZA_DIAS) return { estado: 'por_vencer', dias }
  return { estado: 'vigente', dias }
}

// ── Resumen ───────────────────────────────────────────────────────────────

export interface ResumenMaquinaria {
  total: number
  operativas: number
  noOperativas: number
  porCondicion: Record<Condicion, number>
  polizasVencidas: number
  polizasPorVencer: number
}

/**
 * Lo que va arriba de la lista. **La baja cuenta como no operativa pero cuenta**:
 * una máquina dada de baja sigue en el inventario hasta que alguien la borra,
 * y esconderla del total haría que el número no coincida con la lista.
 */
export function resumir(lista: readonly Pick<Maquina, 'condicion' | 'poliza_vencimiento'>[], hoy: string): ResumenMaquinaria {
  const porCondicion = Object.fromEntries(CONDICIONES.map(c => [c, 0])) as Record<Condicion, number>
  let polizasVencidas = 0
  let polizasPorVencer = 0
  for (const m of lista) {
    porCondicion[m.condicion]++
    // Una máquina dada de baja no necesita seguro: su póliza no se avisa
    if (m.condicion === 'Baja') continue
    const p = estadoPoliza(m.poliza_vencimiento, hoy)
    if (p.estado === 'vencida') polizasVencidas++
    else if (p.estado === 'por_vencer') polizasPorVencer++
  }
  const operativas = OPERATIVAS.reduce((s, c) => s + porCondicion[c], 0)
  return {
    total: lista.length,
    operativas,
    noOperativas: lista.length - operativas,
    porCondicion,
    polizasVencidas,
    polizasPorVencer,
  }
}

/** El número de consorcio de la ruta: entero positivo y escrito tal cual («07» no) */
export function numeroDe(s: string): number | null {
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) && n > 0 && String(n) === s ? n : null
}

/** Fecha local de hoy en YYYY-MM-DD, para `estadoPoliza` y `resumir` */
export function hoyLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
