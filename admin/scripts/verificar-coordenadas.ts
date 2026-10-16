/**
 * Verifica la lectura de coordenadas tipeadas de la carga de gabinete: que el
 * formato se reconozca solo, que las tres formas de escribir el mismo punto
 * den el mismo número, y que lo imposible se rechace con un motivo.
 *
 *   npx tsx scripts/verificar-coordenadas.ts
 */
import { leerCoordenada, aGms, enChaco, type Eje } from '../src/lib/coordenadas'

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

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien.')
process.exit(fallos ? 1 : 0)
