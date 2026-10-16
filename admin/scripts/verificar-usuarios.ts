/**
 * Verifica la lista de usuarios (`lib/usuarios.ts`): tipo de acceso, filtros,
 * orden por relevamientos y el conteo por período. No sale a la red.
 *
 *   npx tsx scripts/verificar-usuarios.ts
 */
import {
  accesoDe, entraAlPanel, seccionesDe, filtrar, contarRelevamientos, normalizar, hoyArgentina,
  FILTROS_INICIALES, SIN_RELEVAMIENTOS,
  type UsuarioFila, type Filtros,
} from '../src/lib/usuarios'

let fallos = 0
const fmt = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))
function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(64)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}
const titulo = (s: string) => console.log(`\n— ${s} —`)

const U = (id: string, nombre: string, rol: UsuarioFila['rol'], zona: string | null, permisos: string[],
  total = 0, d90 = 0, d30 = 0, ultimo: string | null = null): UsuarioFila =>
  ({ id, nombre, email: `${id}@x.com`, rol, zona, permisos, relevamientos: { total, d90, d30, ultimo } })

const lista: UsuarioFila[] = [
  U('a', 'Ana Admin', 'admin', null, []),
  U('b', 'Beto Panel', 'panel', null, ['consorcios', 'lluvia']),
  U('c', 'Carla Técnica', 'tecnico', 'ZII', [], 40, 10, 2, '2026-10-10'),
  U('d', 'Diego Técnico', 'tecnico', 'ZII', ['consorcios'], 40, 12, 0, '2026-09-01'),
  U('e', 'Héctor Lopez', 'tecnico', null, [], 5, 5, 5, '2026-10-15'),
  U('f', 'Flor App', 'usuario', null, []),
  U('g', 'Gaby Panel', 'panel', null, []),
]
const F = (x: Partial<Filtros>) => ({ ...FILTROS_INICIALES, ...x })
const ids = (l: UsuarioFila[]) => l.map(u => u.id).join('')

// ── Acceso ──────────────────────────────────────────────────────────────────
titulo('Acceso (mismo criterio que el middleware)')

ok('admin: panel', accesoDe(lista[0]), 'panel')
ok('panel con secciones: panel', accesoDe(lista[1]), 'panel')
ok('panel sin secciones igual entra (lo deja el middleware)', entraAlPanel(lista[6]))
ok('técnico sin permisos: sólo app', accesoDe(lista[2]), 'app')
ok('técnico con permisos: panel y app', accesoDe(lista[3]), 'ambos')
ok('el admin tiene todas las secciones', seccionesDe(lista[0]).length, 9)
ok('una clave vieja no cuenta como sección',
  seccionesDe(U('z', 'Z', 'panel', null, ['consorcios', 'clave_vieja'])).length, 1)

// ── Filtros ─────────────────────────────────────────────────────────────────
titulo('Filtros')

ok('sin filtros, todos, por nombre', ids(filtrar(lista, FILTROS_INICIALES)), 'abcdfge')
ok('tipo técnico', ids(filtrar(lista, F({ rol: 'tecnico' }))), 'cde')
ok('zona ZII', ids(filtrar(lista, F({ zona: 'ZII' }))), 'cd')
ok('técnicos sin zona (no cuenta a los que no son técnicos)', ids(filtrar(lista, F({ zona: 'sin' }))), 'e')
ok('acceso panel incluye a los que tienen las dos', ids(filtrar(lista, F({ acceso: 'panel' }))), 'abdg')
ok('acceso app incluye a los que tienen las dos', ids(filtrar(lista, F({ acceso: 'app' }))), 'cdfe')
ok('panel y app: sólo los dos', ids(filtrar(lista, F({ acceso: 'ambos' }))), 'd')
ok('sección consorcios: el admin entra siempre', ids(filtrar(lista, F({ seccion: 'consorcios' }))), 'abd')
ok('búsqueda sin tildes: «hector» encuentra a «Héctor»', ids(filtrar(lista, F({ texto: 'hector' }))), 'e')
ok('búsqueda por correo', ids(filtrar(lista, F({ texto: 'b@x' }))), 'b')
ok('filtros combinados', ids(filtrar(lista, F({ rol: 'tecnico', zona: 'ZII', seccion: 'consorcios' }))), 'd')
ok('normalizar saca tildes y mayúsculas', normalizar('  ÑANDÚ Él '), 'nandu el')

// ── Orden ───────────────────────────────────────────────────────────────────
titulo('Orden por relevamientos')

// c y d empatan en 40: va primero el del relevamiento más reciente
ok('total: empate por el más reciente', ids(filtrar(lista, F({ orden: 'relevamientos' }))).slice(0, 3), 'cde')
ok('90 días', ids(filtrar(lista, F({ orden: 'relevamientos', periodo: 'd90' }))).slice(0, 3), 'dce')
ok('30 días', ids(filtrar(lista, F({ orden: 'relevamientos', periodo: 'd30' }))).slice(0, 3), 'ecd')
ok('los que no cargaron quedan al final, por nombre',
  ids(filtrar(lista, F({ orden: 'relevamientos' }))).slice(3), 'afgb'.split('').sort((x, y) =>
    lista.find(u => u.id === x)!.nombre.localeCompare(lista.find(u => u.id === y)!.nombre, 'es')).join(''))
ok('no modifica la lista original', ids(lista), 'abcdefg')

// ── Conteo ──────────────────────────────────────────────────────────────────
titulo('Conteo de relevamientos')

const HOY = '2026-10-16'
const c = contarRelevamientos([
  { tecnico_id: 'x', fecha: '2026-10-16T22:00:00Z' },   // hoy
  { tecnico_id: 'x', fecha: '2026-09-17T12:00:00.000Z' }, // hace 29 días: entra en 30
  { tecnico_id: 'x', fecha: '2026-09-16T12:00:00.000Z' }, // hace 30: no entra en 30, sí en 90
  { tecnico_id: 'x', fecha: '2026-07-19' },             // hace 89: entra en 90
  { tecnico_id: 'x', fecha: '2026-07-18' },             // hace 90: no
  { tecnico_id: 'x', fecha: null },                     // sin fecha: cuenta en el total
  { tecnico_id: null, fecha: '2026-10-16' },            // sin autor: no es de nadie
  { tecnico_id: 'y', fecha: '2027-01-01' },             // fecha futura: total sí, períodos no
], HOY)
const x = c.get('x') ?? SIN_RELEVAMIENTOS
ok('total', x.total, 6)
ok('últimos 30 días: hoy y los 29 anteriores', x.d30, 2)
ok('últimos 90 días', x.d90, 4)
ok('el último es el más nuevo', x.ultimo, '2026-10-16')
ok('un relevamiento sin autor no se cuenta', c.size, 2)
ok('una fecha futura no entra en los períodos', (c.get('y')?.d30 ?? -1) + (c.get('y')?.d90 ?? -1), 0)

titulo('Hoy en Argentina')
ok('22:00 del 16 en Resistencia es el 16, aunque en UTC sea el 17',
  hoyArgentina(Date.parse('2026-10-17T01:00:00Z')), '2026-10-16')
ok('a las 03:00 UTC ya es el 17 acá', hoyArgentina(Date.parse('2026-10-17T03:00:00Z')), '2026-10-17')

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien')
process.exit(fallos ? 1 : 0)
