/**
 * Verifica los límites administrativos que se dibujan sobre el mapa de lluvia.
 *
 * Lo que se puede afirmar con datos que ya están en el sistema: que hay cinco
 * zonas y 25 departamentos, que cada sede de consorcio cae en una zona y un
 * departamento, y que **la zona en la que cae es la que la ficha del consorcio
 * dice que tiene** — dos fuentes independientes que tienen que coincidir.
 *
 *   npx tsx scripts/verificar-limites.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsearLimites, recintoEn } from '../src/lib/limites'
import { dentroDe } from '../src/lib/cuencas'

let fallos = 0
const fmt = (v: unknown) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : JSON.stringify(v)

function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(60)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}
const info = (s: string) => console.log(`       ${s}`)
const titulo = (s: string) => console.log(`\n— ${s} —`)

const bundle = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'geo', 'geo_bundle.json'), 'utf8'))
const lim = parsearLimites(bundle)
const sedes = bundle.sedes as { numero: number; zona: string; lat: number; lng: number }[]

titulo('Los tres juegos de límites')

ok('la provincia tiene al menos una parte', lim.provincia.partes.length >= 1)
ok('son cinco zonas', lim.zonas.length, 5)
ok('en orden, de la I a la V', lim.zonas.map(z => z.clave).join(','), 'ZI,ZII,ZIII,ZIV,ZV')
ok('son 25 departamentos', lim.departamentos.length, 25)
ok('todos con nombre', lim.departamentos.every(d => d.nombre.length > 0))
ok('sin nombres repetidos', new Set(lim.departamentos.map(d => d.nombre)).size, 25)
info(lim.departamentos.map(d => d.nombre).slice(0, 6).join(' · ') + ' …')

titulo('El rótulo de cada recinto cae adentro de su recinto')

ok('las cinco zonas', lim.zonas.every(z => recintoEn(lim.zonas, z.rotulo[0], z.rotulo[1])?.clave === z.clave))
ok('los 25 departamentos',
  lim.departamentos.every(d => d.partes.some(p => dentroDe(p, d.rotulo[0], d.rotulo[1]))))

titulo('Las sedes de los consorcios, contra los límites')

let sinZona = 0, sinDepto = 0, enDosZonas = 0, enDosDeptos = 0, zonaDistinta = 0
const distintas: string[] = []
for (const s of sedes) {
  const zonas = lim.zonas.filter(z => z.partes.some(p => dentroDe(p, s.lat, s.lng)))
  const deptos = lim.departamentos.filter(d => d.partes.some(p => dentroDe(p, s.lat, s.lng)))
  if (zonas.length === 0) sinZona++
  if (zonas.length > 1) enDosZonas++
  if (deptos.length === 0) sinDepto++
  if (deptos.length > 1) enDosDeptos++
  if (zonas.length === 1 && zonas[0].clave !== s.zona) {
    zonaDistinta++
    distintas.push(`CC ${s.numero}: ficha ${s.zona}, cae en ${zonas[0].clave}`)
  }
}
ok('hay 103 sedes para probar', sedes.length, 103)
ok('ninguna cae fuera de todas las zonas', sinZona, 0)
ok('ninguna cae en dos zonas', enDosZonas, 0)
ok('ninguna cae fuera de todos los departamentos', sinDepto, 0)
ok('ninguna cae en dos departamentos', enDosDeptos, 0)

/*
 * La comprobación fuerte: la ficha de cada consorcio dice a qué zona pertenece,
 * y el polígono de zona en el que cae su sede tiene que ser ése. Son dos datos
 * cargados por separado, y coinciden en las 103.
 */
ok('la zona del polígono es la de la ficha en las 103', zonaDistinta, 0)
info(`${zonaDistinta} de ${sedes.length} no coinciden${distintas.length ? ': ' + distintas.join(' · ') : ''}`)

titulo('La consulta por punto')

ok('Resistencia está en San Fernando', recintoEn(lim.departamentos, -27.4514, -58.9867)?.nombre, 'SAN FERNANDO')
ok('y en la provincia', recintoEn([lim.provincia], -27.4514, -58.9867)?.clave, 'CHACO')
ok('Buenos Aires no está en ningún departamento', recintoEn(lim.departamentos, -34.6, -58.4), null)
ok('una lista vacía no rompe', recintoEn([], -27, -60), null)

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
