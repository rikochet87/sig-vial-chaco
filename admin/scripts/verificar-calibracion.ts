/**
 * Verifica el lector del parte de la APA y las métricas de calibración.
 *
 * El caso de prueba es el parte real del 18/09/2026 publicado por Diario Norte,
 * con los 48 valores que informó la APA. Si el lector deja de reconocer alguno,
 * esto lo marca.
 *
 *   npx tsx scripts/verificar-calibracion.ts
 */

import {
  leerParteApa, metricas, ajustarFactor, aplicarFactor, evaluarCorreccion,
  type Par,
} from '../src/lib/calibracion'
import { ESTACIONES_APA, buscarEstacion } from '../src/data/estacionesApa'

let fallos = 0
const ok = (etiqueta: string, real: unknown, esperado: unknown) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado)
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : ' FALLA'} ${etiqueta.padEnd(50)} ${JSON.stringify(real)}`
    + (bien ? '' : `  esperado ${JSON.stringify(esperado)}`))
}

// ── Texto real del parte del 18/09/2026 ──────────────────────────────────────
const PARTE = `
De acuerdo con la planilla oficial, Pampa Almirón encabezó los registros de la
jornada con 46 milímetros, seguida por Las Palmas, con 39; La Eduvigis y General
San Martín, con 37 milímetros.
En la zona del Bermejo se contabilizaron 23 milímetros en El Espinillo, 22 en
Presidencia Roca y 7 en Nueva Pompeya y Villa Río Bermejito.
En la cuenca del Oro, además de los 46 milímetros de Pampa Almirón y los 37 de
General San Martín, se registraron 19 milímetros en Selvas del Río de Oro, 11 en
Puerto Bermejo y 9 en General Vedia. En tanto, Pampa del Indio recibió 11
milímetros, Laguna Limpia 10 y Ciervo Petiso 12.
En el área de Tragadero, los registros fueron más moderados: 12 milímetros en
Colonia Elisa y Colonia Benítez, 11 en Margarita Belén y 2 en Capitán Solari.
La estación de Resistencia marcó 4 milímetros durante el viernes 18, mientras
que Barranqueras acumuló 6 y Puerto Tirol 8.
En otros puntos se contabilizaron 16 milímetros en Villa Rural El Palmar, 11 en
Miraflores, 10 en Las Garcitas y Makallé, 6 en Juan José Castelli, 5 en La Verde
y apenas 1 milímetro en Presidencia de la Plaza y La Escondida.
Hacia el centro provincial, Tres Isletas recibió 9 milímetros, mientras que en
la cuenca Tapenagá se informaron 7 milímetros en Machagai, 5 en Napenay, 4 en
Avia Terai y 2 en Presidencia Roque Sáenz Peña.
Villa Berthet fue uno de los puntos destacados con 10 milímetros, seguida por La
Clotilde con 7, Corzuela y Enrique Urien con 5, San Bernardo con 4, Charata con
3, Coronel Du Graty con 2 y Las Breñas, Villa Ángela y General Pinedo con un
milímetro.
Por otra parte, Isla del Cerrito registró 18 milímetros y Puerto Vilelas 4.
`

console.log('— Estaciones —')
ok('hay estaciones cargadas', ESTACIONES_APA.length >= 55, true)
ok('sin nombres repetidos', new Set(ESTACIONES_APA.map(e => e.nombre)).size, ESTACIONES_APA.length)
ok('todas dentro de Chaco',
  ESTACIONES_APA.every(e => e.lat < -24 && e.lat > -28.6 && e.lng < -58 && e.lng > -63.6), true)
ok('alias: "Sáenz Peña"', buscarEstacion('Sáenz Peña')?.nombre, 'Presidencia Roque Sáenz Peña')
ok('alias: "Castelli"',   buscarEstacion('Castelli')?.nombre,   'Juan José Castelli')
ok('sin tildes también',  buscarEstacion('MAKALLE')?.nombre,    'Makallé')
ok('nombre inexistente',  buscarEstacion('Rosario'),            null)

console.log('\n— Lectura del parte real del 18/09/2026 —')
const r = leerParteApa(PARTE)
const mm = Object.fromEntries(r.lecturas.map(l => [l.estacion, l.mm]))

ok('reconoce al menos 30 estaciones', r.lecturas.length >= 30, true)
ok('Pampa Almirón',                 mm['Pampa Almirón'], 46)
ok('La Eduvigis',                   mm['La Eduvigis'], 37)
ok('General José de San Martín',    mm['General José de San Martín'], 37)
ok('El Espinillo',                  mm['El Espinillo'], 23)
ok('Presidencia Roca',              mm['Presidencia Roca'], 22)
ok('Selvas del Río de Oro',         mm['Selvas del Río de Oro'], 19)
ok('Isla del Cerrito',              mm['Isla del Cerrito'], 18)
ok('Ciervo Petiso',                 mm['Ciervo Petiso'], 12)
ok('Margarita Belén',               mm['Margarita Belén'], 11)
ok('Resistencia',                   mm['Resistencia'], 4)
ok('Capitán Solari',                mm['Capitán Solari'], 2)
ok('Sáenz Peña por alias',          mm['Presidencia Roque Sáenz Peña'], 2)
ok('Castelli por alias',            mm['Juan José Castelli'], 6)
ok('Villa Berthet ("con 10")',      mm['Villa Berthet'], 10)
ok('La Clotilde ("con 7")',         mm['La Clotilde'], 7)
ok('San Bernardo ("con 4")',        mm['San Bernardo'], 4)
// Las tres que el geocodificador no resolvía ahora vienen de la propia APA.
// "Villa Rural El Palmar" es como la nombra el parte; la APA la llama
// "Villa El Palmar", y el alias las une.
ok('Las Palmas, que antes se perdía',   mm['Las Palmas'], 39)
ok('Miraflores, que antes se perdía',   mm['Miraflores'], 11)
ok('Villa El Palmar, por alias',        mm['Villa El Palmar'], 16)
ok('ningún valor absurdo', r.lecturas.every(l => l.mm >= 0 && l.mm <= 600), true)

ok('Barranqueras no se come el "viernes 18"', mm['Barranqueras'], 6)
ok('Puerto Tirol',                  mm['Puerto Tirol'], 8)
ok('Las Breñas (enumeración con eñe)', mm['Las Breñas'], 1)
ok('Villa Angela (misma enumeración)',  mm['Villa Angela'], 1)
ok('General Pinedo (misma enumeración)', mm['General Pinedo'], 1)
ok('Nueva Pompeya (dos comparten 7)',  mm['Nueva Pompeya'], 7)
ok('Villa Río Bermejito (idem)',       mm['Villa Río Bermejito'], 7)
ok('Colonia Elisa y Benítez comparten 12',
  [mm['Colonia Elisa'], mm['Colonia Benítez']], [12, 12])
ok('ya no queda ninguna localidad sin ubicar',
  r.desconocidos.map(d => d.nombre), [])
ok('no reporta recortes como estación nueva',
  r.desconocidos.some(d => d.nombre.trim() === 'Presidencia'), false)

console.log('\n— Fechas, que no son lluvia —')
ok('"viernes 18"',        leerParteApa('marcó 4 milímetros durante el viernes 18, y Makallé 9').lecturas.find(l=>l.estacion==='Makallé')?.mm, 9)
ok('"18 de septiembre"',  leerParteApa('hasta el 18 de septiembre en Resistencia').lecturas.length, 0)
ok('"sábado 19"',         leerParteApa('el sábado 19 en Charata').lecturas.length, 0)

console.log('\n— Casos que no debe tragarse —')
ok('un año no es lluvia', leerParteApa('en 2026 en Resistencia').lecturas.length, 0)
ok('texto vacío',         leerParteApa('').lecturas.length, 0)
ok('sin números',         leerParteApa('Llovió mucho en Resistencia').lecturas.length, 0)
ok('valor imposible',     leerParteApa('900 milímetros en Resistencia').lecturas.length, 0)

console.log('\n— Métricas —')
{
  // Perfecto: modelo = medición
  const perfecto: Par[] = [10, 20, 30, 40].map(v => ({ medido: v, modelo: v }))
  const mp = metricas(perfecto)
  ok('sin error → sesgo 0',       mp.sesgo, 0)
  ok('sin error → correlación 1', mp.pearson, 1)
  ok('sin error → error medio 0', mp.errorAbsMedio, 0)

  // Sobrestima uniforme del 50 %
  const alto: Par[] = [10, 20, 30, 40].map(v => ({ medido: v, modelo: v * 1.5 }))
  const ma = metricas(alto)
  ok('sobrestima → sesgo positivo',  ma.sesgo > 0, true)
  ok('sobrestima → relativo 0,5',    ma.sesgoRelativo, 0.5)
  ok('sobrestima → correlación sigue 1', ma.pearson, 1)

  // Orden invertido
  const inv: Par[] = [{medido:10,modelo:40},{medido:20,modelo:30},{medido:30,modelo:20},{medido:40,modelo:10}]
  ok('orden invertido → spearman -1', metricas(inv).spearman, -1)
}

console.log('\n— Corrección —')
{
  const pares: Par[] = Array.from({ length: 30 }, (_, i) => {
    const medido = (i % 10) * 5
    return { medido, modelo: medido * 1.4 }
  })
  ok('con pocos pares no ajusta', ajustarFactor(pares.slice(0, 5)), null)
  const f = ajustarFactor(pares)
  ok('recupera el factor (1/1,4)', f !== null && Math.abs(f - 1 / 1.4) < 0.02, true)
  ok('aplicar corrige', Math.abs(aplicarFactor(14, f) - 10) < 0.3, true)
  ok('factor null no toca el valor', aplicarFactor(14, null), 14)

  // Un factor absurdo se rechaza en vez de aplicarse
  ok('rechaza factor disparatado',
    ajustarFactor(Array.from({length:20},(_,i)=>({ medido:(i+1)*10, modelo:(i+1)*0.1 }))), null)

  // Fuera de muestra: se parte por evento, no por par
  const porEvento = new Map<string, Par[]>()
  for (let d = 1; d <= 6; d++) {
    porEvento.set(`2026-0${d}-01`, Array.from({length:12},(_,i)=>({ medido:i*3, modelo:i*3*1.4 })))
  }
  const ev = evaluarCorreccion(porEvento)
  ok('evalúa fuera de muestra', ev !== null, true)
  ok('separa ajuste y prueba', ev && ev.eventosAjuste + ev.eventosPrueba === 6, true)
  ok('mejora el error', ev?.mejora, true)
  ok('con pocos eventos no evalúa', evaluarCorreccion(new Map([['a', []]])), null)
}

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} falla(s).`)
process.exit(fallos === 0 ? 0 : 1)
