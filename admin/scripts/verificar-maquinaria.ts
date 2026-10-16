/**
 * Verifica el catálogo y las reglas de la maquinaria vial (`lib/maquinaria.ts`).
 *
 * No sale a la red ni toca la base. Afirma que el catálogo es el de la app
 * «Equipos Viales» —mismos id, mismos nombres, mismas categorías—, que la
 * validación es una lista blanca, y el conteo de pólizas y condiciones.
 *
 *   npx tsx scripts/verificar-maquinaria.ts
 */
import {
  CATEGORIAS, TIPOS, CONDICIONES, OPERATIVAS, COLOR_CONDICION,
  tipoPorId, validarMaquina, estadoPoliza, resumir, numeroDe, hoyLocal,
  type Condicion,
} from '../src/lib/maquinaria'

let fallos = 0
const fmt = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(64)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}
const titulo = (s: string) => console.log(`\n— ${s} —`)

// ── Catálogo ────────────────────────────────────────────────────────────────
titulo('Catálogo')

ok('cuatro categorías', CATEGORIAS.length, 4)
ok('31 tipos', TIPOS.length, 31)
ok('los id son 1..31, en orden y sin huecos', TIPOS.every((x, i) => x.id === i + 1))
ok('nombres únicos', new Set(TIPOS.map(x => x.nombre)).size, TIPOS.length)
ok('cada tipo cae en una categoría que existe',
  TIPOS.every(x => CATEGORIAS.some(c => c.id === x.categoria)))
ok('ninguna categoría queda vacía',
  CATEGORIAS.every(c => TIPOS.some(x => x.categoria === c.id)))
// Los que la app vieja marcaba con chasis y motor: los 12 automotores y dos de logística
ok('14 tipos llevan chasis y motor', TIPOS.filter(x => x.chasisMotor).length, 14)
ok('la motoniveladora lleva chasis y motor', tipoPorId(2)?.chasisMotor, true)
ok('la niveladora de arrastre no', tipoPorId(13)?.chasisMotor, false)
ok('el tipo 14 es el perfilador (Ravasto)', tipoPorId(14)?.nombre, 'Perfilador Múltiple (Ravasto)')
ok('un id que no existe no devuelve tipo', tipoPorId(99) === undefined)

// ── Condiciones ─────────────────────────────────────────────────────────────
titulo('Condiciones')

ok('seis condiciones', CONDICIONES.length, 6)
ok('tres operativas: Bueno, Regular, Malo', OPERATIVAS.join(','), 'Bueno,Regular,Malo')
ok('cada condición tiene color', CONDICIONES.every(c => /^#[0-9a-f]{6}$/i.test(COLOR_CONDICION[c])))

// ── Validación ──────────────────────────────────────────────────────────────
titulo('Validación')

const ANIO = 2026
const base = { tipo_id: 2, condicion: 'Bueno' }

const v1 = validarMaquina({ ...base, marca: '  John Deere ', anio: '2020', dominio: 'ab 123 cd' }, ANIO)
ok('una carga válida pasa', v1.ok)
if (v1.ok) {
  ok('recorta los espacios de la marca', v1.datos.marca, 'John Deere')
  ok('el año queda como número', v1.datos.anio, 2020)
  ok('el dominio va en mayúsculas y sin espacios', v1.datos.dominio, 'AB123CD')
  ok('un campo vacío queda en null, no en ""', v1.datos.modelo, null)
}

const v2 = validarMaquina({ ...base, consorcio_numero: 999, creado_por: 'x', id: 'y' }, ANIO)
ok('lista blanca: no deja pasar consorcio, autor ni id',
  v2.ok && !('consorcio_numero' in v2.datos) && !('creado_por' in v2.datos) && !('id' in v2.datos))

const v3 = validarMaquina({ tipo_id: 13, condicion: 'Bueno', n_chasis: 'ABC', n_motor: 'XYZ' }, ANIO)
ok('un implemento descarta chasis y motor aunque lleguen',
  v3.ok && v3.datos.n_chasis === null && v3.datos.n_motor === null)

const v4 = validarMaquina({ tipo_id: 2, condicion: 'Bueno', n_chasis: 'ABC' }, ANIO)
ok('un automotor los conserva', v4.ok && v4.datos.n_chasis === 'ABC')

ok('rechaza un tipo que no existe', validarMaquina({ ...base, tipo_id: 99 }, ANIO).ok, false)
ok('rechaza un tipo que no es número', validarMaquina({ ...base, tipo_id: 'Tractor' }, ANIO).ok, false)
ok('rechaza una condición fuera de la lista', validarMaquina({ ...base, condicion: 'Operativo' }, ANIO).ok, false)
ok('rechaza un año del futuro lejano', validarMaquina({ ...base, anio: 2030 }, ANIO).ok, false)
ok('acepta el año que viene (modelo 2027)', validarMaquina({ ...base, anio: 2027 }, ANIO).ok, true)
ok('rechaza un año con decimales', validarMaquina({ ...base, anio: 2020.5 }, ANIO).ok, false)
ok('rechaza una fecha de póliza mal escrita', validarMaquina({ ...base, poliza_vencimiento: '31/12/2026' }, ANIO).ok, false)
ok('acepta una fecha de póliza ISO', validarMaquina({ ...base, poliza_vencimiento: '2026-12-31' }, ANIO).ok, true)
ok('rechaza un cuerpo vacío', validarMaquina(null, ANIO).ok, false)

const largo = validarMaquina({ ...base, observaciones: 'x'.repeat(5000) }, ANIO)
ok('corta las observaciones a mil caracteres', largo.ok && largo.datos.observaciones?.length === 1000)

// ── Póliza ──────────────────────────────────────────────────────────────────
titulo('Póliza')

const HOY = '2026-10-16'
ok('sin fecha es «sin póliza»', estadoPoliza(null, HOY).estado, 'sin_poliza')
ok('ayer: vencida', estadoPoliza('2026-10-15', HOY).estado, 'vencida')
ok('hoy: por vencer, no vencida', estadoPoliza('2026-10-16', HOY).estado, 'por_vencer')
ok('a 30 días: por vencer', estadoPoliza('2026-11-15', HOY).estado, 'por_vencer')
ok('a 31 días: vigente', estadoPoliza('2026-11-16', HOY).estado, 'vigente')
const vencida = estadoPoliza('2026-10-06', HOY)
ok('cuenta los días de vencida', vencida.estado === 'vencida' ? vencida.dias : null, -10)
// El cambio de horario no existe en Argentina, pero el cálculo no debe depender de eso
const anio = estadoPoliza('2027-10-16', HOY)
ok('un año son 365 días', anio.estado === 'vigente' ? anio.dias : null, 365)

// ── Resumen ─────────────────────────────────────────────────────────────────
titulo('Resumen')

const M = (condicion: Condicion, poliza_vencimiento: string | null = null) => ({ condicion, poliza_vencimiento })
const r = resumir([
  M('Bueno', '2027-01-01'),
  M('Bueno', '2026-10-01'),     // vencida
  M('Regular', '2026-10-20'),   // por vencer
  M('En reparación'),
  M('Baja', '2020-01-01'),      // vencida, pero dada de baja: no se avisa
], HOY)
ok('total', r.total, 5)
ok('operativas', r.operativas, 3)
ok('no operativas: la baja cuenta', r.noOperativas, 2)
ok('operativas + no operativas = total', r.operativas + r.noOperativas, r.total)
ok('por condición: dos «Bueno»', r.porCondicion['Bueno'], 2)
ok('las de cero también están', r.porCondicion['Desuso'], 0)
ok('una póliza vencida (la de la baja no cuenta)', r.polizasVencidas, 1)
ok('una por vencer', r.polizasPorVencer, 1)
ok('lista vacía: todo en cero', resumir([], HOY).total, 0)

// ── Varios ──────────────────────────────────────────────────────────────────
titulo('Número de consorcio y fecha')

ok('«7» es 7', numeroDe('7'), 7)
ok('«07» no se acepta', numeroDe('07'), null)
ok('«0» no se acepta', numeroDe('0'), null)
ok('«7abc» no se acepta', numeroDe('7abc'), null)
ok('hoyLocal arma YYYY-MM-DD con ceros', hoyLocal(new Date(2026, 0, 5)), '2026-01-05')

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien')
process.exit(fallos ? 1 : 0)
