/**
 * Verifica el bloque «Aguas arriba» del panel del río: la lista de escalas y
 * el cálculo de la tendencia.
 *
 * No sale a la red. Que el INA cambie un umbral o deje de publicar una escala
 * lo releva `scripts/relevar-ina.ts`, a mano; acá se afirma lo que este sistema
 * declara por su cuenta:
 *
 * - que la lista no se contradice con las otras dos que nombran las mismas
 *   escalas (`ESTACIONES` y `ESTACIONES_PARAGUAY`);
 * - que la tendencia se mide contra el día exacto, con casos donde la respuesta
 *   se sabe sin calcular.
 *
 *   npx tsx scripts/verificar-rio-arriba.ts
 */
import { ESTACIONES, ESTACIONES_ARRIBA, ESTACIONES_PARAGUAY, estadoDe } from '../src/lib/ina'
import { tendenciaDe, sentidoDe, QUIETO_M } from '../src/lib/rioArriba'

let fallos = 0
const fmt = (v: unknown) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : JSON.stringify(v)

function ok(que: string, valor: unknown, esperado?: unknown) {
  const bien = esperado === undefined ? valor === true : valor === esperado
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(62)} ${fmt(valor)}`
    + (bien ? '' : `   (esperaba ${fmt(esperado)})`))
}
const titulo = (s: string) => console.log(`\n— ${s} —`)

// ── La lista ────────────────────────────────────────────────────────────────
titulo('Las escalas')

const ids = ESTACIONES_ARRIBA.map(e => e.id)
ok('ocho escalas', ESTACIONES_ARRIBA.length, 8)
ok('sin ids repetidos', new Set(ids).size, ids.length)
ok('cinco del Paraná', ESTACIONES_ARRIBA.filter(e => e.rio === 'Paraná').length, 5)
ok('tres del Paraguay', ESTACIONES_ARRIBA.filter(e => e.rio === 'Paraguay').length, 3)
ok('en todas, la evacuación está sobre el alerta',
  ESTACIONES_ARRIBA.every(e => e.evacuacion > e.alerta))

// Ninguna es de aguas abajo: Corrientes, Barranqueras y las que siguen no van acá
const abajo = [19, 20, 21, 22, 23]
ok('ninguna de Corrientes hacia abajo', ESTACIONES_ARRIBA.some(e => abajo.includes(e.id)), false)

// La misma escala en dos listas tiene que decir lo mismo: si no, el panel
// mostraría dos umbrales para Itá Ibaté según qué bloque se mire.
for (const otra of [...ESTACIONES, ...ESTACIONES_PARAGUAY]) {
  const e = ESTACIONES_ARRIBA.find(x => x.id === otra.id)
  if (!e) continue
  ok(`${e.nombre}: mismo alerta que en la otra lista`, e.alerta, otra.alerta)
  ok(`${e.nombre}: misma evacuación que en la otra lista`, e.evacuacion, otra.evacuacion)
}

// `estadoDe` toma los umbrales de la escala, no uno general
const posadas = ESTACIONES_ARRIBA.find(e => e.id === 14)!
const ituzaingo = ESTACIONES_ARRIBA.find(e => e.id === 15)!
ok('5 m en Posadas es normal', estadoDe(posadas, 5), 'normal')
ok('5 m en Ituzaingó es evacuación (está al pie de la represa)', estadoDe(ituzaingo, 5), 'evacuacion')

// ── La tendencia ────────────────────────────────────────────────────────────
titulo('La tendencia')

/** Una lectura por día a las 03:00 UTC, como las escalas de Prefectura */
const diaria = (desde: string, alturas: (number | null)[]) =>
  alturas.flatMap((m, i) => {
    if (m === null) return []
    const f = new Date(Date.parse(desde) + i * 86_400_000).toISOString().slice(0, 10)
    return [{ fecha: `${f}T03:00:00.000Z`, m }]
  })

// Sube 10 cm por día durante ocho días
const sube = diaria('2026-09-01', [3.0, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7])
const t1 = tendenciaDe(sube, '2026-09-08')!
ok('la última es la del 08/09', t1.ultima.fecha, '2026-09-08')
ok('la última es 3,70 m', t1.ultima.m, 3.7)
ok('subió 10 cm en un día', t1.cambio1, 0.1)
ok('subió 70 cm en siete días', t1.cambio7, 0.7)
ok('al día', t1.atraso, 0)
ok('dice que sube', sentidoDe(t1.cambio1), 'sube')

// El mismo río, mirado tres días después: atrasado
ok('tres días sin lectura es atraso 3', tendenciaDe(sube, '2026-09-11')!.atraso, 3)

// Falta el día de hace una semana: no se toma el más cercano
const hueco = diaria('2026-09-01', [3.0, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7]).filter(l => !l.fecha.startsWith('2026-09-01'))
const t2 = tendenciaDe(hueco, '2026-09-08')!
ok('sin el día de hace siete, el cambio es null', t2.cambio7, null)
ok('el de un día sigue', t2.cambio1, 0.1)

// Falta ayer
const sinAyer = sube.filter(l => !l.fecha.startsWith('2026-09-07'))
const t3 = tendenciaDe(sinAyer, '2026-09-08')!
ok('sin ayer, el cambio de un día es null', t3.cambio1, null)
ok('y eso es «sin dato», no «estable»', sentidoDe(t3.cambio1), 'sin_dato')
ok('el de siete días sigue', t3.cambio7, 0.7)

// Dos lecturas el mismo día: vale la última del día
const doble = [...sube, { fecha: '2026-09-08T15:00:00.000Z', m: 3.75 }]
const t4 = tendenciaDe(doble, '2026-09-08')!
ok('con dos lecturas el mismo día, vale la última', t4.ultima.m, 3.75)
ok('y el cambio es contra ayer', t4.cambio1, 0.15)

// Desordenadas: el resultado no depende del orden en que llegan
const t5 = tendenciaDe([...sube].reverse(), '2026-09-08')!
ok('desordenadas dan lo mismo', t5.cambio7, 0.7)

// Baja y quieto
const baja = tendenciaDe(diaria('2026-09-01', [5, 4.9, 4.8, 4.7, 4.6, 4.5, 4.4, 4.3]), '2026-09-08')!
ok('baja 10 cm', baja.cambio1, -0.1)
ok('dice que baja', sentidoDe(baja.cambio1), 'baja')
ok(`un centímetro es quieto (umbral ${QUIETO_M} m)`, sentidoDe(0.01), 'quieto')
ok('dos centímetros ya es subir', sentidoDe(0.02), 'sube')

// Sin lecturas no hay tendencia, y no es un río quieto
ok('sin lecturas, null', tendenciaDe([], '2026-09-08'), null)

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo en orden')
process.exit(fallos ? 1 : 0)
