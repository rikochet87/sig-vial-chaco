/**
 * Verifica la parte pura de las imágenes satelitales históricas.
 *
 * **No sale a la red.** Lo que puede romperse del lado de Esri —que cambie la
 * forma del config, del tilemap o de los metadatos— no lo atrapa este test ni
 * debería: un chequeo que falla por motivos ajenos al commit enseña a ignorar
 * los chequeos. Acá se afirma lo que es nuestro: qué tile se consulta, cómo se
 * leen las fechas y, sobre todo, **qué foto se muestra** cuando varias
 * versiones repiten la misma toma o cuando el mapa se mueve a un lugar con
 * otra lista.
 *
 *   npx tsx scripts/verificar-wayback.ts
 */
import {
  colapsarPorCaptura, entradaVigente, fechaSrc, parsearVersiones, tileDe, urlTiles,
  Z_CADENA, type Imagen,
} from '../src/lib/wayback'

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

// ── El config de versiones ──────────────────────────────────────────────────
titulo('Las versiones salen del config, de la más nueva a la más vieja')

const versiones = parsearVersiones({
  '10': { itemTitle: 'World Imagery (Wayback 2014-02-20)', metadataLayerUrl: 'https://m/10' },
  '64776': { itemTitle: 'World Imagery (Wayback 2026-08-27)', metadataLayerUrl: 'https://m/64776' },
  '7110': { itemTitle: 'World Imagery (Wayback 2019-06-26)', metadataLayerUrl: 'https://m/7110' },
  '999': { itemTitle: 'World Imagery sin fecha', metadataLayerUrl: 'https://m/999' },
})

ok('una versión sin fecha en el título se descarta', versiones.length, 3)
ok('la primera es la más nueva', versiones[0].n, 64776)
ok('la última es la más vieja', versiones[2].n, 10)
ok('el número de versión es número, no texto', typeof versiones[0].n, 'number')
ok('la fecha de publicación sale del título', versiones[1].publicada, '2019-06-26')
ok('y la URL de metadatos viaja con la versión', versiones[1].metaUrl, 'https://m/7110')

/*
 * El orden es por fecha y no por número a propósito: la cadena de dueños
 * avanza "a la anterior en el tiempo", y el número de versión es un id de
 * Esri que no promete ser monótono.
 */
const cruzadas = parsearVersiones({
  '500': { itemTitle: 'Wayback 2015-01-01', metadataLayerUrl: '' },
  '20': { itemTitle: 'Wayback 2020-01-01', metadataLayerUrl: '' },
})
ok('se ordena por fecha aunque el número diga otra cosa', cruzadas[0].n, 20)

ok('la URL de tiles lleva el número de versión',
  urlTiles(7110).includes('/tile/7110/{z}/{y}/{x}'))

// ── Qué tile se consulta ────────────────────────────────────────────────────
titulo('El tile que contiene el punto')

const mundo = tileDe(-27.45, -58.98, 0)
ok('z 0: el mundo es un solo tile', `${mundo.x},${mundo.y}`, '0,0')
const so = tileDe(-27.45, -58.98, 1)
ok('z 1: el Chaco cae en el cuadrante sudoeste', `${so.x},${so.y}`, '0,1')

/*
 * En vez de clavar un número de tile —que afirmaría la cuenta contra sí misma—
 * se vuelve del tile a sus bordes con la fórmula inversa y se comprueba que el
 * punto quede adentro.
 */
const bordes = (t: { z: number; x: number; y: number }) => {
  const n = 2 ** t.z
  const lat = (y: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI
  return { o: t.x / n * 360 - 180, e: (t.x + 1) / n * 360 - 180, n: lat(t.y), s: lat(t.y + 1) }
}
const LUGARES: [string, number, number][] = [
  ['Resistencia', -27.4514, -58.9867],
  ['Castelli', -25.9468, -60.6195],
  ['Sáenz Peña', -26.7852, -60.4388],
  ['Taco Pozo', -25.6167, -63.2667],
]
for (const [nombre, lat, lon] of LUGARES) {
  const b = bordes(tileDe(lat, lon, Z_CADENA))
  ok(`${nombre} cae dentro de su tile`, lon >= b.o && lon < b.e && lat <= b.n && lat > b.s)
}

const bR = bordes(tileDe(-27.4514, -58.9867, Z_CADENA))
const anchoM = (bR.e - bR.o) * 111_320 * Math.cos(27.45 * Math.PI / 180)
ok('a z 16 un tile mide unos 550 m, como dice el comentario', anchoM > 500 && anchoM < 600)
info(`${anchoM.toFixed(0)} m de ancho en Resistencia`)

// ── La fecha de captura ─────────────────────────────────────────────────────
titulo('La fecha de captura, tal como la manda el servicio')

/*
 * El servicio manda SRC_DATE como entero. La primera versión sólo aceptaba texto
 * y reventaba con el número: ninguna imagen tenía fecha de toma y, como el error
 * se atajaba más arriba, no se notaba — sólo se veía la fecha de publicación.
 */
ok('el número que manda el servicio se pasa a AAAA-MM-DD', fechaSrc(20250922), '2025-09-22')
ok('y el mismo valor como texto también', fechaSrc('20250922'), '2025-09-22')
ok('un cero no es una fecha', fechaSrc(0), null)
ok("'Null' no es una fecha", fechaSrc('Null'), null)
ok('null tampoco', fechaSrc(null), null)
ok('ni undefined', fechaSrc(undefined), null)
ok('ni una cadena vacía', fechaSrc(''), null)
ok('ni una fecha a medias', fechaSrc('202509'), null)

// ── Una entrada por toma ────────────────────────────────────────────────────
titulo('Las versiones que repiten la misma toma se colapsan')

const I = (n: number, publicada: string, captura: string | null): Imagen =>
  ({ n, publicada, captura, fuente: null, resolucionM: null })

/*
 * La forma del caso medido en Castelli: la cadena de dueños devuelve más
 * versiones que fotos, porque Esri a veces reprocesa la misma toma y el tile
 * cambia sin que haya imagen nueva.
 */
const cadena = [
  I(70, '2026-08-27', '2025-09-22'),
  I(60, '2025-11-06', '2025-09-22'), // misma toma, publicada antes
  I(50, '2024-03-07', '2023-07-14'),
  I(40, '2022-05-18', '2021-10-02'),
  I(30, '2021-12-01', '2021-10-02'), // misma toma
  I(20, '2018-01-08', null),         // la versión no informa captura
  I(10, '2014-02-20', null),         // ésta tampoco
]
const fotos = colapsarPorCaptura(cadena)

ok('siete dueños quedan en cinco fotos', fotos.length, 5)
ok('de la toma repetida queda la publicación más nueva',
  fotos.find(f => f.captura === '2025-09-22')?.n, 70)
ok('lo mismo para la otra repetida', fotos.find(f => f.captura === '2021-10-02')?.n, 40)
ok('las que no informan captura no se colapsan entre sí',
  fotos.filter(f => f.captura === null).length, 2)
ok('queda ordenado de la más vieja a la más nueva',
  fotos.map(f => f.n).join(','), '10,20,40,50,70')
ok('no modifica la lista que recibe', cadena.length, 7)
ok('una lista vacía no rompe', colapsarPorCaptura([]).length, 0)

/*
 * El orden es por captura, no por publicación: una toma vieja puede publicarse
 * después que una nueva, y el deslizador tiene que avanzar en el tiempo del
 * terreno, no en el del archivo.
 */
const cruzado = colapsarPorCaptura([
  I(1, '2020-01-01', '2019-11-30'),
  I(2, '2021-01-01', '2017-05-10'), // se publicó después, pero es anterior
])
ok('una toma vieja publicada tarde va primero', cruzado.map(f => f.n).join(','), '2,1')

// ── Al mover el mapa ────────────────────────────────────────────────────────
titulo('Qué foto corresponde cuando la versión elegida no está en la lista')

/*
 * Cada lugar tiene su propia lista. Si se estaba mirando la versión publicada
 * el 2023-01-15 y el mapa se mueve, lo que esa versión muestra en el lugar
 * nuevo es lo de su dueño: la más nueva publicada hasta esa fecha.
 */
ok('toma la más nueva publicada hasta esa fecha', entradaVigente(fotos, '2023-01-15')?.n, 40)
ok('la fecha exacta de publicación cuenta', entradaVigente(fotos, '2024-03-07')?.n, 50)
ok('un día antes todavía es la anterior', entradaVigente(fotos, '2024-03-06')?.n, 40)
ok('una versión posterior a todas da la última', entradaVigente(fotos, '2030-01-01')?.n, 70)
ok('una anterior a todas da la más vieja que haya', entradaVigente(fotos, '2010-01-01')?.n, 10)
ok('sin lista no hay entrada', entradaVigente([], '2023-01-15'), null)

/*
 * Se compara por publicación aunque la lista esté ordenada por captura: con la
 * toma vieja publicada tarde de más arriba, el dueño de una versión de 2020 es
 * la entrada 1, no la que quedó primera en la lista.
 */
ok('se decide por publicación, no por posición en la lista',
  entradaVigente(cruzado, '2020-06-01')?.n, 1)

console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
process.exit(fallos === 0 ? 0 : 1)
