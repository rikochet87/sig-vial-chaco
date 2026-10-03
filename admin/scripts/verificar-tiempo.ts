/**
 * Verifica la lectura del tiempo y de las alertas del SMN (lib/tiempo.ts).
 *
 * No sale a la red. Los avisos son XML armados con la forma de los reales, en
 * las dos variantes que publica el SMN el mismo día: los de alerta, con el
 * espacio de nombres por defecto y entidades numéricas para los acentos, y los
 * avisos a muy corto plazo, con prefijo `cap:` y el nivel en el título.
 *
 *   npx tsx scripts/verificar-tiempo.ts
 */
import { SEDES_CONSORCIOS } from '../src/data/sedesConsorcios'
import { CONTORNO_CHACO } from '../src/data/contornoChaco'
import {
  agruparAlertas, alcanceEnChaco, cieloDe, diasDe, nivelDe, ordenarAlertas, parsearCap, resumenProvincia, rumbo, vigente,
  type DiaTiempo, type TiempoConsorcio,
} from '../src/lib/tiempo'

let fallos = 0
const fmt = (v: unknown) => (typeof v === 'number' ? String(v) : JSON.stringify(v))
function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(64)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}

// Un cuadrado alrededor de Resistencia (-27,45 / -58,99) y otro en Mendoza
const sobreResistencia = '-27.2,-59.3 -27.2,-58.7 -27.7,-58.7 -27.7,-59.3 -27.2,-59.3'
const enMendoza = '-32.5,-69 -32.5,-68.5 -33,-68.5 -33,-69 -32.5,-69'

const alerta = (poligono: string, extra = '') => `<?xml version="1.0"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>urn:oid:2.49.0.1.32.0.2026.10.02.20.48.15.1</identifier>
<sender>smn@smn.gob.ar</sender><sent>2026-10-02T20:48:15-03:00</sent><status>Actual</status><msgType>Alert</msgType>
<info><language>es-AR</language><category>Met</category><event>Tormentas</event><urgency>Future</urgency>
<severity>Severe</severity><certainty>Likely</certainty><onset>2026-10-03T15:00:00-03:00</onset>
<expires>2026-10-03T20:59:59-03:00</expires><headline>Tormentas</headline>
<description>El &#xE1;rea ser&#xE1; afectada por tormentas fuertes</description><instruction>Evit&#xE1; salir.</instruction>
<web>https://www.smn.gob.ar/alertas</web><area><areaDesc></areaDesc><polygon>${poligono}</polygon></area>${extra}</info></alert>`

const corto = `<?xml version = "1.0" encoding = "UTF-8"?>
<cap:alert xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2"><cap:identifier>urn:oid:2.49.0.1.32.0.2026.10.03.01.53.00</cap:identifier>
<cap:sent>2026-10-03T01:53:00-03:00</cap:sent><cap:msgType>Alert</cap:msgType><cap:info><cap:category>Met</cap:category>
<cap:event>TORMENTAS FUERTES</cap:event><cap:urgency>Immediate</cap:urgency><cap:severity>Severe</cap:severity>
<cap:expires>2026-10-03T03:53:00-03:00</cap:expires>
<cap:headline>AVISO ROJO POR TORMENTAS FUERTES CON RAFAGAS</cap:headline><cap:description>TORMENTAS FUERTES</cap:description>
<cap:area><cap:areaDesc>CHACO: SAN FERNANDO - PRIMERO DE MAYO.</cap:areaDesc></cap:area></cap:info></cap:alert>`

console.log('\nLectura de los avisos CAP')
const a = parsearCap(alerta(sobreResistencia))!
ok('el evento', a.evento, 'Tormentas')
ok('los acentos en entidades numéricas se reponen', a.descripcion, 'El área será afectada por tormentas fuertes')
ok('el polígono se lee en [lat, lng]', a.poligonos[0][0][0] === -27.2 && a.poligonos[0][0][1] === -59.3)
ok('severidad Severe sin color en el título → naranja', a.nivel, 'naranja')
ok('inicio y fin', a.inicio === '2026-10-03T15:00:00-03:00' && a.fin === '2026-10-03T20:59:59-03:00')
const b = parsearCap(corto)!
ok('el aviso con prefijo cap: también se lee', b.evento, 'TORMENTAS FUERTES')
ok('el color del título manda sobre la severidad', b.nivel, 'rojo')
ok('sin onset, el inicio queda vacío', b.inicio, null)
ok('una cancelación no es una alerta', parsearCap(alerta(sobreResistencia).replace('<msgType>Alert', '<msgType>Cancel')), null)
ok('un aviso que no es meteorológico se ignora', parsearCap(alerta(sobreResistencia).replace('<category>Met', '<category>Geo')), null)
ok('nivelDe: AMARILLA en el título', nivelDe('ALERTA AMARILLA POR VIENTO', 'Severe'), 'amarillo')
ok('nivelDe: Extreme → rojo', nivelDe('Tormentas', 'Extreme'), 'rojo')
ok('nivelDe: Moderate → amarillo', nivelDe('Viento', 'Moderate'), 'amarillo')

console.log('\nQué toca el Chaco')
const enR = alcanceEnChaco(a, SEDES_CONSORCIOS, CONTORNO_CHACO)
ok('un aviso sobre Resistencia toca el Chaco', enR !== null)
ok('y cubre alguna sede de consorcio', (enR?.consorcios.length ?? 0) > 0)
ok('cada consorcio cubierto tiene su sede adentro del cuadrado', (enR?.consorcios ?? []).every(n => {
  const s = SEDES_CONSORCIOS.find(x => x.numero === n)!
  return s.lat < -27.2 && s.lat > -27.7 && s.lng > -59.3 && s.lng < -58.7
}))
ok('un aviso en Mendoza no toca el Chaco', alcanceEnChaco(parsearCap(alerta(enMendoza))!, SEDES_CONSORCIOS, CONTORNO_CHACO), null)
const sinPoligono = alcanceEnChaco(b, SEDES_CONSORCIOS, CONTORNO_CHACO)
ok('sin polígono, la descripción que nombra al Chaco alcanza', sinPoligono !== null && sinPoligono.consorcios.length === 0)
// Un polígono chico adentro de la provincia, lejos de toda sede
const chico = '-25.40,-61.55 -25.40,-61.50 -25.45,-61.50 -25.45,-61.55 -25.40,-61.55'
const enMonte = alcanceEnChaco(parsearCap(alerta(chico))!, SEDES_CONSORCIOS, CONTORNO_CHACO)
ok('un aviso chico entre sedes también toca la provincia', enMonte !== null && enMonte.consorcios.length === 0)

console.log('\nVigencia y orden')
ok('vigente antes de vencer', vigente(a, Date.parse('2026-10-03T18:00:00-03:00')))
ok('vencida después', vigente(a, Date.parse('2026-10-03T21:00:00-03:00')), false)
ok('la que todavía no empezó cuenta: avisa lo que viene', vigente(a, Date.parse('2026-10-02T21:00:00-03:00')))
ok('las rojas primero', ordenarAlertas([{ ...enR!, nivel: 'amarillo' }, { ...enR!, nivel: 'rojo', id: 'r' }])[0].id, 'r')

console.log('\nCielo, viento y el día')
ok('0 es despejado', cieloDe(0).cielo, 'despejado')
ok('95 es tormenta', cieloDe(95).cielo, 'tormenta')
ok('96 dice granizo', cieloDe(96).texto, 'Tormenta con granizo')
ok('un código desconocido no rompe', cieloDe(42).texto, '—')
ok('sin código no rompe', cieloDe(null).texto, '—')
ok('rumbo 0 es N', rumbo(0), 'N')
ok('rumbo 225 es SO', rumbo(225), 'SO')
ok('rumbo 350 es N', rumbo(350), 'N')
ok('rumbo -45 es NO', rumbo(-45), 'NO')
const dias = diasDe({
  time: ['2026-10-03'], weather_code: [61], temperature_2m_max: [30], temperature_2m_min: [null],
  precipitation_sum: [12.5], precipitation_probability_max: [80], wind_speed_10m_max: [20],
  wind_gusts_10m_max: [45], wind_direction_10m_dominant: [90],
})
ok('un dato faltante queda null, no cero', dias[0].tMin, null)
ok('la lluvia se lee', dias[0].lluvia, 12.5)

console.log('\nLa semana en la provincia')
const dia = (lluvia: number, codigo: number, tMin = 15, tMax = 30) =>
  ({ fecha: '2026-10-03', codigo, tMin, tMax, lluvia, probLluvia: 50, viento: 10, rafagas: 30, dirViento: 0 })
const cc = (n: number, d: DiaTiempo): TiempoConsorcio => ({ numero: n, nombre: '', zona: 'ZI', lat: 0, lng: 0, dias: [d] })
const r = resumenProvincia([cc(1, dia(0, 1, 12, 28)), cc(2, dia(0.5, 3)), cc(3, dia(20, 95, 18, 33))])[0]
ok('mínima de la provincia: la menor', r.tMin, 12)
ok('máxima de la provincia: la mayor', r.tMax, 33)
ok('0,5 mm no es un día de lluvia: lluvia en 1 de 3', r.conLluvia, 1)
ok('con tormenta en un tercio de la provincia, el día dice tormenta', cieloDe(r.codigo).cielo, 'tormenta')
const r2 = resumenProvincia([cc(1, dia(0, 1)), cc(2, dia(0, 1)), cc(3, dia(0, 1)), cc(4, dia(5, 95))])[0]
ok('con tormenta en uno de cuatro, manda el cielo más común', r2.codigo, 1)
ok('sin consorcios no hay resumen', resumenProvincia([]).length, 0)
{
  const conProb = (n: number, p: number | null) => cc(n, { ...dia(0, 1), probLluvia: p })
  const r3 = resumenProvincia([conProb(1, 20), conProb(2, 80), conProb(3, null)])[0]
  ok('la probabilidad mayor entre los consorcios', r3.probMax, 80)
  ok('el promedio no cuenta el que no informa', r3.probMedia, 50)
}

console.log('\nAgrupar')
{
  const base = enR!
  const g = agruparAlertas([
    { ...base, id: '1', evento: 'Tormentas', nivel: 'amarillo', inicio: '2026-10-03T09:00:00-03:00', fin: '2026-10-03T14:59:59-03:00', consorcios: [1, 2] },
    { ...base, id: '2', evento: 'Tormentas', nivel: 'amarillo', inicio: '2026-10-03T21:00:00-03:00', fin: '2026-10-04T02:59:59-03:00', consorcios: [2, 3] },
    { ...base, id: '3', evento: 'TORMENTAS FUERTES', nivel: 'naranja', inicio: null, fin: '2026-10-03T03:53:00-03:00', consorcios: [] },
    { ...base, id: '4', evento: 'Tormentas', nivel: 'naranja', inicio: '2026-10-03T15:00:00-03:00', fin: '2026-10-03T20:59:59-03:00', consorcios: [5] },
  ])
  ok('dos grupos: tormentas naranja y amarillo', g.length, 2)
  ok('el naranja primero', g[0].nivel, 'naranja')
  ok('el aviso corto y la alerta son el mismo fenómeno', g[0].avisos.length, 2)
  ok('el amarillo va del inicio más temprano', g[1].inicio, '2026-10-03T09:00:00-03:00')
  ok('al fin más tardío', g[1].fin, '2026-10-04T02:59:59-03:00')
  ok('con la unión de los consorcios, sin repetir', JSON.stringify(g[1].consorcios), '[1,2,3]')
}

console.log(fallos ? `\n✗ ${fallos} fallo(s).` : '\n✓ Todo bien.')
process.exit(fallos ? 1 : 0)
