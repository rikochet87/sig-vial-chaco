/**
 * Verifica el motor de lluvia: la clasificación con valores de borde, la
 * escala de radios, la detección de episodios y la agregación por consorcio.
 *
 * No sale a la red: `consultarLluvia` se prueba aparte, contra el servicio real,
 * porque depende de que Open-Meteo esté arriba y eso no es una verificación del
 * código.
 *
 *   npx tsx scripts/verificar-lluvia.ts
 */

import {
  clasificar, radioLluvia, resumirPorConsorcio, detectarEpisodios,
  diasEntre, UMBRALES, type RegistroLluvia,
} from '../src/lib/lluvia'
import { SEDES_CONSORCIOS } from '../src/data/sedesConsorcios'
import { PUNTOS_LLUVIA } from '../src/data/puntosLluvia'

let fallos = 0
const ok = (etiqueta: string, real: unknown, esperado: unknown) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado)
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : ' FALLA'} ${etiqueta.padEnd(52)} ${JSON.stringify(real)}`
    + (bien ? '' : `  esperado ${JSON.stringify(esperado)}`))
}

console.log('— Sedes —')
ok('cantidad de consorcios', SEDES_CONSORCIOS.length, 103)
ok('todos con número entero', SEDES_CONSORCIOS.every(s => Number.isInteger(s.numero)), true)
ok('todos dentro de Chaco (lat)', SEDES_CONSORCIOS.every(s => s.lat < -24 && s.lat > -28.5), true)
ok('todos dentro de Chaco (lng)', SEDES_CONSORCIOS.every(s => s.lng < -58 && s.lng > -63.5), true)
ok('sin números repetidos', new Set(SEDES_CONSORCIOS.map(s => s.numero)).size, 103)

console.log('\n— Puntos de muestreo sobre la red —')
{
  const porCC = new Map<number, typeof PUNTOS_LLUVIA>()
  for (const p of PUNTOS_LLUVIA) {
    const a = porCC.get(p.cc) ?? []
    a.push(p); porCC.set(p.cc, a)
  }
  const pesosMal = [...porCC.entries()]
    .filter(([, ps]) => Math.abs(ps.reduce((s, p) => s + p.peso, 0) - 1) > 1e-3)
    .map(([cc]) => cc)

  ok('hay puntos cargados', PUNTOS_LLUVIA.length > 500, true)
  ok('cubre los 103 consorcios', porCC.size, 103)
  ok('los pesos de cada consorcio suman 1', pesosMal, [])
  ok('ningun peso negativo o cero', PUNTOS_LLUVIA.every(p => p.peso > 0), true)
  ok('todos dentro de Chaco',
    PUNTOS_LLUVIA.every(p => p.lat < -24 && p.lat > -28.5 && p.lng < -58 && p.lng > -63.5), true)
  // El CC 96 no tiene traza en el bundle: va con un solo punto, su centroide
  ok('sólo el CC 96 queda con un punto único',
    [...porCC.entries()].filter(([, ps]) => ps.length === 1).map(([cc]) => cc), [96])
  ok('el resto tiene varios puntos',
    [...porCC.values()].filter(ps => ps.length > 1).length, 102)
  // La sede no puede ser el punto de muestreo: ese era justamente el problema
  const coincideConSede = SEDES_CONSORCIOS.filter(s =>
    (porCC.get(s.numero) ?? []).some(p => Math.abs(p.lat - s.lat) < 1e-4 && Math.abs(p.lng - s.lng) < 1e-4))
  ok('ningun punto es exactamente la sede', coincideConSede.length, 0)
}

console.log('\n— Clasificación (valores de borde) —')
ok('0 mm → sin',            clasificar(0).nivel,     'sin')
ok('0,9 mm → sin',          clasificar(0.9).nivel,   'sin')
ok('1 mm → leve',           clasificar(1).nivel,     'leve')
ok('14,9 mm → leve',        clasificar(14.9).nivel,  'leve')
ok('15 mm → moderada',      clasificar(15).nivel,    'moderada')
ok('39,9 mm → moderada',    clasificar(39.9).nivel,  'moderada')
ok('40 mm → fuerte',        clasificar(40).nivel,    'fuerte')
ok('80 mm → muy fuerte',    clasificar(80).nivel,    'muy_fuerte')
ok('150 mm → extrema',      clasificar(150).nivel,   'extrema')
ok('500 mm → extrema',      clasificar(500).nivel,   'extrema')
ok('umbrales en orden',
  UMBRALES.every((u, i) => i === 0 || u.desde > UMBRALES[i - 1].desde), true)

console.log('\n— Radio —')
ok('0 mm → mínimo', radioLluvia(0), 4)
ok('crece con los mm', radioLluvia(100) > radioLluvia(25), true)
ok('no es lineal: x4 mm no da x4 radio',
  Math.abs((radioLluvia(100) - 4) / (radioLluvia(25) - 4) - 2) < 0.01, true)
ok('tiene tope', radioLluvia(9999), 30)

console.log('\n— Fechas —')
ok('mismo día = 1', diasEntre('2026-09-18', '2026-09-18'), 1)
ok('18 al 19 = 2',  diasEntre('2026-09-18', '2026-09-19'), 2)
ok('al revés = 0 o menos', diasEntre('2026-09-19', '2026-09-18') <= 0, true)

// ── Datos de la tormenta real del 18 y 19 de septiembre de 2026 ─────────────
// Los milímetros salen de una consulta a Open-Meteo para esas sedes y coinciden
// con lo que reportó la prensa provincial esos días.
const registros: RegistroLluvia[] = [
  // CC 1 — dos días seguidos, acumula 27,9 → moderada
  { consorcio_numero: 1, fecha: '2026-09-17', mm: 0 },
  { consorcio_numero: 1, fecha: '2026-09-18', mm: 12.1 },
  { consorcio_numero: 1, fecha: '2026-09-19', mm: 15.8 },
  { consorcio_numero: 1, fecha: '2026-09-20', mm: 0 },
  // CC 2 — el más golpeado, 45,1 → fuerte
  { consorcio_numero: 2, fecha: '2026-09-17', mm: 0 },
  { consorcio_numero: 2, fecha: '2026-09-18', mm: 9.4 },
  { consorcio_numero: 2, fecha: '2026-09-19', mm: 35.7 },
  { consorcio_numero: 2, fecha: '2026-09-20', mm: 0 },
  // CC 3 — apenas mojó
  { consorcio_numero: 3, fecha: '2026-09-18', mm: 0.5 },
  { consorcio_numero: 3, fecha: '2026-09-19', mm: 0.2 },
]

console.log('\n— Agregación por consorcio —')
const resumen = resumirPorConsorcio(registros)
const cc = (n: number) => resumen.find(r => r.numero === n)!

ok('devuelve los 103 aunque falten datos', resumen.length, 103)
ok('CC 1 acumulado',        cc(1).mm, 27.9)
ok('CC 1 día pico',         cc(1).mmMaxDia, 15.8)
ok('CC 1 fecha del pico',   cc(1).fechaMaxDia, '2026-09-19')
ok('CC 1 días con agua',    cc(1).dias, 2)
ok('CC 2 acumulado',        cc(2).mm, 45.1)
ok('CC 2 clasifica fuerte', clasificar(cc(2).mm).nivel, 'fuerte')
ok('CC 1 clasifica moderada', clasificar(cc(1).mm).nivel, 'moderada')
ok('CC sin datos queda en 0', cc(50).mm, 0)
ok('CC sin datos no inventa fecha', cc(50).fechaMaxDia, null)
// El círculo va donde se midió, NO en la sede: dibujarlo en el pueblo
// contradice el dato, que es el promedio sobre la red vial.
{
  const sede1 = SEDES_CONSORCIOS.find(s => s.numero === 1)!
  const lejos = resumen.filter(r => {
    const s = SEDES_CONSORCIOS.find(x => x.numero === r.numero)!
    return Math.abs(r.lat - s.lat) > 1e-5 || Math.abs(r.lng - s.lng) > 1e-5
  })
  ok('el centro no es la sede (CC 1)',
    Math.abs(cc(1).lat - sede1.lat) > 1e-5 || Math.abs(cc(1).lng - sede1.lng) > 1e-5, true)
  ok('casi ningún consorcio queda centrado en su sede', lejos.length >= 100, true)
  ok('todos los centros dentro de Chaco',
    resumen.every(r => r.lat < -24 && r.lat > -28.5 && r.lng < -58 && r.lng > -63.5), true)
  // El centro tiene que caer dentro de la nube de puntos del consorcio
  const fuera = resumen.filter(r => {
    const ps = PUNTOS_LLUVIA.filter(p => p.cc === r.numero)
    if (!ps.length) return false
    return r.lat > Math.max(...ps.map(p => p.lat)) + 1e-6
        || r.lat < Math.min(...ps.map(p => p.lat)) - 1e-6
        || r.lng > Math.max(...ps.map(p => p.lng)) + 1e-6
        || r.lng < Math.min(...ps.map(p => p.lng)) - 1e-6
  })
  ok('el centro cae dentro de sus puntos de muestreo', fuera.map(r => r.numero), [])
}

console.log('\n— Detección de episodios —')
const eps = detectarEpisodios(registros)
ok('detecta un solo episodio', eps.length, 1)
ok('arranca el 18',  eps[0]?.desde, '2026-09-18')
ok('termina el 19',  eps[0]?.hasta, '2026-09-19')
ok('pico del episodio', eps[0]?.mmPico, 45.1)
ok('un consorcio sobre 40', eps[0]?.consorciosFuertes, 1)

// Dos tormentas separadas por días secos tienen que dar dos episodios
const dos: RegistroLluvia[] = [
  { consorcio_numero: 1, fecha: '2026-09-01', mm: 20 },
  { consorcio_numero: 1, fecha: '2026-09-02', mm: 0 },
  { consorcio_numero: 1, fecha: '2026-09-03', mm: 0 },
  { consorcio_numero: 1, fecha: '2026-09-10', mm: 30 },
  { consorcio_numero: 1, fecha: '2026-09-11', mm: 10 },
]
const eps2 = detectarEpisodios(dos)
ok('separa dos tormentas', eps2.length, 2)
ok('el más reciente va primero', eps2[0]?.desde, '2026-09-10')
ok('la segunda abarca dos días', [eps2[0]?.desde, eps2[0]?.hasta], ['2026-09-10', '2026-09-11'])
ok('llovizna bajo el umbral no abre episodio',
  detectarEpisodios([{ consorcio_numero: 1, fecha: '2026-09-01', mm: 2 }]).length, 0)

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} falla(s).`)
process.exit(fallos === 0 ? 0 : 1)
