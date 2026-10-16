/**
 * Verifica la lectura de coordenadas tipeadas de la carga de gabinete: que el
 * formato se reconozca solo, que las tres formas de escribir el mismo punto
 * den el mismo número, y que lo imposible se rechace con un motivo.
 *
 *   npx tsx scripts/verificar-coordenadas.ts
 */
import { leerCoordenada, aGms, enChaco, coordenadaDeEnlace, esEnlaceCorto, type Eje } from '../src/lib/coordenadas'

let fallos = 0
function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(60)} ${JSON.stringify(valor)}`
    + (bien ? '' : `   (esperaba ${JSON.stringify(esperado)})`))
}
const titulo = (s: string) => console.log(`\n— ${s} —`)
const valor = (t: string, e: Eje) => { const l = leerCoordenada(t, e); return l.ok ? l.valor : NaN }
const cerca = (a: number, b: number) => Math.abs(a - b) < 1e-9

titulo('El formato se reconoce por la cantidad de números')
const formato = (t: string) => { const l = leerCoordenada(t, 'lat'); return l.ok ? l.formato : l.error }
ok('-27.4512', formato('-27.4512'), 'decimal')
ok('27,4512 S (coma decimal)', formato('27,4512 S'), 'decimal')
ok('27 27.07 S', formato('27 27.07 S'), 'gm')
ok(`27°27'04,4" S`, formato(`27°27'04,4" S`), 'gms')
ok('27 27 4.4 S', formato('27 27 4.4 S'), 'gms')

titulo('El mismo punto escrito de tres formas da lo mismo')
const dec = -(27 + 27 / 60 + 4.4 / 3600)
ok('decimal', cerca(valor(String(dec), 'lat'), dec))
ok('grados, minutos y segundos', cerca(valor(`27°27'04.4" S`, 'lat'), dec))
ok('grados y minutos decimales', cerca(valor(`27°27.07333333333' S`, 'lat'), dec))
ok('ida y vuelta por aGms', aGms(valor(`27°27'04,4" S`, 'lat'), 'lat'), `27°27'04,4" S`)
ok('aGms lleva 59,999" al minuto siguiente', aGms(-(27 + 59.999 / 3600), 'lat'), `27°01'00,0" S`)

titulo('Hemisferio')
ok('S da negativo', valor('27 S', 'lat'), -27)
ok('N da positivo', valor('27 N', 'lat'), 27)
ok('W y O dan negativo', valor('58 W', 'lng') === -58 && valor('58 O', 'lng') === -58)
ok('E da positivo', valor('58 E', 'lng'), 58)
ok('el signo menos vale sin letra', valor('-27.5', 'lat'), -27.5)
const sinNada = leerCoordenada('27 27 04', 'lat')
ok('sin signo ni letra se toma S…', sinNada.ok && sinNada.valor < 0)
ok('…y se avisa', sinNada.ok && sinNada.hemisferioSupuesto)
ok('con letra no se avisa', (l => l.ok && !l.hemisferioSupuesto)(leerCoordenada('27 S', 'lat')))

titulo('Lo imposible se rechaza')
const rechaza = (t: string, e: Eje = 'lat') => !leerCoordenada(t, e).ok
ok('vacío', rechaza(''))
ok('minutos 60', rechaza('27 60 0'))
ok('segundos 60', rechaza('27 10 60'))
ok('grados con decimales y minutos', rechaza('27.5 10'))
ok('cuatro números', rechaza('27 27 4 1'))
ok('latitud de 91°', rechaza('91'))
ok('longitud de 181°', rechaza('181', 'lng'))
ok('E en una latitud', rechaza('27 E'))
ok('dos letras', rechaza('27 S N'))
ok('longitud de 120° sí vale', !rechaza('120', 'lng'))

titulo('Recuadro del Chaco')
ok('Resistencia adentro', enChaco(-27.451, -58.987))
ok('Castelli adentro', enChaco(-25.946, -60.619))
ok('latitud y longitud cruzadas, afuera', enChaco(-58.987, -27.451), false)
ok('Buenos Aires, afuera', enChaco(-34.6, -58.4), false)

titulo('Enlaces de Google Maps')
const enl = (u: string) => { const c = coordenadaDeEnlace(u); return c ? `${c.lat},${c.lng} ${c.origen}` : null }
ok('lugar: manda el marcador (!3d!4d), no el centro (@)',
  enl('https://www.google.com/maps/place/Puente/@-27.4400,-58.9700,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-27.4512!4d-58.9867!16s'),
  '-27.4512,-58.9867 marcador')
ok('?q=lat,lng', enl('https://maps.google.com/?q=-27.4512,-58.9867'), '-27.4512,-58.9867 busqueda')
ok('?q= con espacio y +', enl('https://www.google.com/maps?q=-27.4512,+-58.9867&z=17'), '-27.4512,-58.9867 busqueda')
ok('?query= (API de enlaces)', enl('https://www.google.com/maps/search/?api=1&query=-27.4512%2C-58.9867'), '-27.4512,-58.9867 busqueda')
ok('/search/lat,+lng', enl('https://www.google.com/maps/search/-27.4512,+-58.9867?entry=tts'), '-27.4512,-58.9867 busqueda')
ok('/place/lat,lng/@…', enl('https://www.google.com/maps/place/-27.4512,-58.9867/@-27.4512,-58.9867,17z'), '-27.4512,-58.9867 busqueda')
ok('sólo @: centro de la vista', enl('https://www.google.com/maps/@-27.4512,-58.9867,15z'), '-27.4512,-58.9867 vista')
ok('google.com.ar también', enl('https://www.google.com.ar/maps/@-27.4512,-58.9867,15z'), '-27.4512,-58.9867 vista')
ok('pantalla de consentimiento', enl('https://consent.google.com/m?continue=' + encodeURIComponent('https://www.google.com/maps?q=-27.4512,-58.9867')), '-27.4512,-58.9867 busqueda')
ok('lugar por nombre, sin números: null', enl('https://www.google.com/maps/place/Resistencia,+Chaco'), null)
ok('un nombre con «11, 5» no es coordenada', enl('https://www.google.com/maps/search/Ruta+11,+5'), null)
ok('otro sitio: null', enl('https://example.com/maps/@-27.4512,-58.9867,15z'), null)
ok('google.com.evil.com: null', enl('https://www.google.com.evil.io/maps/@-27.4512,-58.9867,15z'), null)
ok('maps.app.goo.gl es corto', esEnlaceCorto('https://maps.app.goo.gl/AbCd123'))
ok('goo.gl/maps es corto', esEnlaceCorto('https://goo.gl/maps/AbCd123'))
ok('goo.gl a secas no', esEnlaceCorto('https://goo.gl/AbCd123'), false)

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien.')
process.exit(fallos ? 1 : 0)
