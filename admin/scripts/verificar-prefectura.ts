/**
 * Verifica la lectura de las alturas de Prefectura —el JSON, la tabla y el
 * histórico por puerto— y cómo se unen con la serie del INA (`lib/prefectura.ts`).
 *
 * No sale a la red: que Prefectura cambie la forma de su página no es algo que
 * deba romper un commit. Las filas de abajo son **las que la página publicó el
 * 10/10/2026**, copiadas tal cual —con sus tabulaciones y sus celdas «S/E»—, y
 * la serie del INA es la de Barranqueras de esa semana.
 *
 *   npx tsx scripts/verificar-prefectura.ts
 */
import { ESTACIONES, ESTACIONES_ARRIBA, ESTACION_BERMEJO, SALTO_MAX_M } from '../src/lib/ina'
import {
  ESCALAS_SOLO_PREFECTURA, PUERTOS_PREFECTURA, fechaPrefectura, fechaHoraLocal, filaDe,
  leerHistorico, leerJson, leerTabla, lecturasDePrefectura, unirSeries,
} from '../src/lib/prefectura'
import { tendenciaDe, tendenciaEnHoras } from '../src/lib/rioArriba'

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

const fila = (puerto: string, rio: string, ult: string, fecha: string, ant: string, fAnt: string,
  alerta: string, evac: string) => `
                                                        <tr class="" >
                                <th data-label="Puerto:">${puerto}</th>
                                <td data-label="Río:">${rio}</td>
                                \t\t\t\t\t\t\t\t\t<td data-label="Ultimo Registro:" class="warning">${ult}</td>
\t\t\t\t\t\t\t\t\t\t\t\t\t<td data-label="Variacion">0.09</td>
\t\t\t\t\t\t\t\t                                <td data-label="Periodo">12</td>
                                <td data-label="Fecha Hora:"><b>${fecha}</b></td>
                                <td data-label="Estado:">CRECE</td>
                                <td><img src="img/arriba.svg" width="40" /></td>
\t\t\t\t\t\t\t\t\t<td data-label="Registro Anterior:">${ant}</td>
\t\t\t\t\t\t\t\t                                <td data-label="Fecha Anterior:">${fAnt}</td>
                                <td data-label="Alerta:">${alerta}</td>
                                <td data-label="Evacuación:">${evac}</td>
                                <td><a href="/alturas/?page=historico&tiempo=7&id=140" target="_blank"></a></td>
                            </tr>`

const PAGINA = `<table class="table table-hover fpTable"><thead><tr><th>Puerto</th><th>Río</th></tr></thead><tbody>`
  + fila('CAXIA (BRASIL)', 'IGUAZU', '33.36', '09/OCT/26 - 0900', '54.17', '08/OCT/26 - 0900', '-', '-')
  + fila('BARRANQUERAS', 'PARANA', '4.88', '10/OCT/26 - 0000', '4.79', '09/OCT/26 - 1200', '6.00', '6.50')
  + fila('BOUVIER', 'PARAGUAY', 'S/E', '10/OCT/26 - 0000', 'S/E', '09/OCT/26 - 1200', '6.00', '6.40')
  + fila('BERMEJO', 'PARAGUAY', '3.15', '10/OCT/26 - 0000', '3.02', '09/OCT/26 - 1200', '6.50', '7.00')
  + `</tbody></table>`

/** Lo que el INA tenía de Barranqueras el 10/10/2026 a las 12:00: hasta el 09/10 */
const INA = [
  { fecha: '2026-10-02T03:00:00.000Z', m: 4.07 },
  { fecha: '2026-10-05T03:00:00.000Z', m: 4.16 },
  { fecha: '2026-10-06T03:00:00.000Z', m: 4.27 },
  { fecha: '2026-10-07T03:00:00.000Z', m: 4.36 },
  { fecha: '2026-10-08T03:00:00.000Z', m: 4.5 },
  { fecha: '2026-10-09T03:00:00.000Z', m: 4.7 },
]
const AHORA = Date.parse('2026-10-10T15:00:00.000Z')

// ── Las fechas ──────────────────────────────────────────────────────────────
titulo('Las fechas')

ok('las 00:00 locales son las 03:00 UTC, como las marca el INA',
  fechaPrefectura('10/OCT/26 - 0000'), '2026-10-10T03:00:00.000Z')
ok('las 12:00 locales, las 15:00 UTC del mismo día',
  fechaPrefectura('09/OCT/26 - 1200'), '2026-10-09T15:00:00.000Z')
ok('las 22:00 locales caen en el día siguiente en UTC',
  fechaPrefectura('31/DIC/26 - 2200'), '2027-01-01T01:00:00.000Z')
ok('septiembre viene como SEP o como SET',
  fechaPrefectura('01/SET/26 - 0000'), fechaPrefectura('01/SEP/26 - 0000'))
ok('un mes que no existe no se adivina', fechaPrefectura('10/OCX/26 - 0000'), null)
ok('una hora imposible tampoco', fechaPrefectura('10/OCT/26 - 2500'), null)
ok('ni un texto cualquiera', fechaPrefectura('S/E'), null)
ok('ida y vuelta a hora local', fechaHoraLocal('2026-10-10T03:00:00.000Z'), '10/10 00:00')

// ── La tabla ────────────────────────────────────────────────────────────────
titulo('La tabla')

const filas = leerTabla(PAGINA)
ok('cuatro filas: el encabezado no cuenta', filas.length, 4)

const b = filaDe(filas, 20)
ok('Barranqueras está', b !== null)
ok('su última lectura', b?.ultimo?.m, 4.88)
ok('  de las 00:00 del 10/10', b?.ultimo?.fecha, '2026-10-10T03:00:00.000Z')
ok('su lectura anterior', b?.anterior?.m, 4.79)
ok('  de las 12:00 del 09/10', b?.anterior?.fecha, '2026-10-09T15:00:00.000Z')
ok('alerta', b?.alerta, 6)
ok('evacuación', b?.evacuacion, 6.5)

const bouvier = filas.find(f => f.puerto === 'BOUVIER')
ok('«S/E» no es una lectura: queda sin dato, no en cero', bouvier?.ultimo ?? null, null)
ok('un guión en el alerta es sin umbral', filas[0].alerta, null)

ok('«BERMEJO» es Puerto Bermejo, sobre el Paraguay', filaDe(filas, 58)?.ultimo?.m, 3.15)
ok('El Colorado no está en Prefectura', filaDe(filas, ESTACION_BERMEJO.id), null)
ok('una escala que la página no trae da null', filaDe(filas, 19), null)
ok('una página sin tabla da lista vacía', leerTabla('<html><body>Mantenimiento</body></html>').length, 0)

{
  const usadas = [...ESTACIONES, ...ESTACIONES_ARRIBA].map(e => e.id)
  const sin = [...new Set(usadas)].filter(id => !PUERTOS_PREFECTURA[id])
  ok('todas las escalas del panel tienen puerto, salvo El Colorado', sin.join(), String(ESTACION_BERMEJO.id))
}


// ── El JSON ─────────────────────────────────────────────────────────────────
titulo('alturas.json')

/** Tres filas de `alturas.json` del 10/10/2026, tal cual */
const JSON_PNA = '{"Reportes": {"@xmlns:ent": "http://schemas.datacontract.org/2004/07/Entidades", "ReporteUltimoClass": ['
  + '{"Alerta":"6.00","Evacuacion":"6.50","FechaHora":"10/OCT/26 - 0000","FechaAnterior":"09/OCT/26 - 1200","Puerto":"BARRANQUERAS","RegistroAnterior":"4.79","Rio":"PARANA","Estado":"CRECE","latitud":"-27.48747","longitud":"-58.92317","Periodo":"12","Variacion":"0.09","UltimoRegistro":"4.88"},'
  + '{"Alerta":"6.50","Evacuacion":"7.00","FechaHora":"10/OCT/26 - 0000","FechaAnterior":"09/OCT/26 - 1200","Puerto":"LAS PALMAS","RegistroAnterior":"4.45","Rio":"PARAGUAY","Estado":"CRECE","latitud":"-27.118028","longitud":"-58.642278","Periodo":"12","Variacion":"0.10","UltimoRegistro":"4.55"},'
  + '{"Alerta":"6.00","Evacuacion":"6.40","FechaHora":"10/OCT/26 - 0000","FechaAnterior":"09/OCT/26 - 1200","Puerto":"BOUVIER","RegistroAnterior":"S/E","Rio":"PARAGUAY","Estado":"S/E.","latitud":"-25.465","longitud":"-57.574444","Periodo":"12","Variacion":"-","UltimoRegistro":"S/E"}'
  + ']}}'

const delJson = leerJson(JSON_PNA)
ok('tres filas', delJson.length, 3)
ok('Barranqueras dice lo mismo que en la tabla',
  JSON.stringify(filaDe(delJson, 20)), JSON.stringify(b))
ok('Las Palmas está, con su id propio', filaDe(delJson, -525)?.ultimo?.m, 4.55)
ok('  y sus niveles', `${filaDe(delJson, -525)?.alerta}/${filaDe(delJson, -525)?.evacuacion}`, '6.5/7')
ok('«S/E» tampoco es una lectura acá', delJson[2].ultimo, null)
ok('un texto que no es JSON da lista vacía', leerJson('<html>502</html>').length, 0)
ok('un JSON de otra forma, también', leerJson('{"Reportes":{}}').length, 0)
ok('las dos escalas de sólo Prefectura tienen puerto',
  ESCALAS_SOLO_PREFECTURA.every(e => e.id < 0 && !!PUERTOS_PREFECTURA[e.id]))
ok('ningún id de Prefectura repetido',
  new Set(Object.values(PUERTOS_PREFECTURA).map(p => p.idPna)).size, Object.keys(PUERTOS_PREFECTURA).length)

// ── El histórico de un puerto ───────────────────────────────────────────────
titulo('El histórico de un puerto')

const renglon = (n: number, fecha: string, hora: string, valor: string) => `
                                                    <tr>
                                <th scope="row">${n}</th>
                                <td><i class="fa fa-calendar"></i> ${fecha} <i class="fa fa-clock-o"></i> ${hora}</td>
                                                                    <td>${valor}</td>
                                                            </tr>`

/** Las primeras filas del histórico de Barranqueras del 10/10/2026: le falta la del 08/10 a las 12:00 */
const HISTORICO = `<b>Puerto: </b>BARRANQUERAS en río PARANA<br><tbody>`
  + renglon(1, '2026-10-09', '00:00', '4.7 Mts')
  + renglon(2, '2026-10-08', '00:00', '4.5 Mts')
  + renglon(3, '2026-10-07', '12:00', '4.42 Mts')
  + renglon(4, '2026-10-07', '00:00', '4.36 Mts')
  + renglon(5, '2026-10-06', '12:00', 'S/E')
  + renglon(6, '2026-10-06', '00:00', '4.27 Mts')
  + renglon(7, '2026-10-03', '00:00', '3.99 Mts')
  + renglon(8, '2026-10-02', '00:00', '4.07 Mts')
  + `</tbody><script>title: { text: 'Registros del puerto BARRANQUERAS' }</script>`

const hist = leerHistorico(HISTORICO)
ok('dice de qué puerto es', hist.puerto, 'BARRANQUERAS')
ok('siete lecturas: la fila «S/E» se saltea', hist.lecturas.length, 7)
ok('de la más vieja a la más nueva', hist.lecturas[0].fecha, '2026-10-02T03:00:00.000Z')
ok('la de las 12:00 va a las 15:00 UTC',
  hist.lecturas.some(l => l.fecha === '2026-10-07T15:00:00.000Z' && l.m === 4.42))
ok('una página que no es un histórico no da puerto', leerHistorico('<html></html>').puerto, null)

const dePna = lecturasDePrefectura(hist.lecturas, b)
ok('el histórico y, encima, las dos de alturas.json', dePna.length, 9)
ok('la última es la de hoy a las 00:00', dePna[dePna.length - 1].m, 4.88)
ok('sin histórico quedan las dos últimas', lecturasDePrefectura(null, b).length, 2)
ok('sin nada, nada', lecturasDePrefectura(null, null).length, 0)

// ── Unir con el INA ─────────────────────────────────────────────────────────
titulo('Unir con el INA')

const DESDE = '2026-09-25'
const u = unirSeries(dePna, INA, DESDE, AHORA)
ok('manda Prefectura: nueve lecturas suyas', u.fuentes.prefectura, 9)
ok('del INA entra sólo el 05/10, que a Prefectura le falta', u.fuentes.ina, 1)
ok('  y es esa', u.observado.find(l => l.fecha.startsWith('2026-10-05'))?.m, 4.16)
ok('la última es de Prefectura', u.lectura?.m, 4.88)
ok('  con su variación', u.lectura?.variacion?.m, 0.09)
ok('  en doce horas', u.lectura?.variacion?.horas, 12)
ok('en orden y sin instantes repetidos',
  u.observado.every((l, i, a) => i === 0 || a[i - 1].fecha < l.fecha))

{
  // El caso medido: el INA, cargado un día tarde, da otra cosa. 16/11/2025.
  const pna = [
    { fecha: '2025-11-15T03:00:00.000Z', m: 3.31 }, { fecha: '2025-11-15T15:00:00.000Z', m: 3.24 },
    { fecha: '2025-11-16T03:00:00.000Z', m: 3.20 }, { fecha: '2025-11-16T15:00:00.000Z', m: 3.15 },
    { fecha: '2025-11-17T03:00:00.000Z', m: 3.08 },
  ]
  const ina = [
    { fecha: '2025-11-15T03:00:00.000Z', m: 3.31 }, { fecha: '2025-11-16T03:00:00.000Z', m: 3.53 },
    { fecha: '2025-11-17T03:00:00.000Z', m: 3.08 },
  ]
  const c = unirSeries(pna, ina, '2025-11-01', Date.parse('2025-11-17T15:00:00Z'))
  ok('donde difieren vale Prefectura: 3,20 y no 3,53',
    c.observado.find(l => l.fecha === '2025-11-16T03:00:00.000Z')?.m, 3.2)
  ok('  y del INA no entra ninguna', c.fuentes.ina, 0)
}

{
  // Prefectura tiene alguna lectura a la 01:00; la del INA de las 00:00 es la misma
  const c = unirSeries([{ fecha: '2026-10-01T04:00:00.000Z', m: 4.18 }],
    [{ fecha: '2026-10-01T03:00:00.000Z', m: 4.17 }], DESDE, AHORA)
  ok('una del INA a una hora de la de Prefectura no se suma', c.observado.length, 1)
}

{
  const c = unirSeries(dePna, INA, '2026-10-07', AHORA)
  ok('`desde` recorta el año de Prefectura',
    c.observado.filter(l => l.fecha.slice(0, 10) < '2026-10-07').every(l => INA.includes(l)))
}

{
  const c = unirSeries([], INA, DESDE, AHORA)
  ok('sin Prefectura queda la serie del INA', c.observado.length, INA.length)
  ok('  y la última no es de Prefectura', c.lectura, null)
}
{
  const c = unirSeries(dePna, [], DESDE, AHORA)
  ok('sin el INA quedan las de Prefectura', c.observado.length, 9)
}

// ── La tendencia, con dos lecturas por día ──────────────────────────────────
titulo('La tendencia, con dos lecturas por día')

{
  const t = tendenciaEnHoras(u.observado, '2026-10-10')
  ok('la última con su hora', t?.ultima.fecha, '2026-10-10T03:00:00.000Z')
  ok('24 h: de 00:00 a 00:00, 4,88 − 4,70', t?.cambio1, 0.18)
  ok('7 días: contra el 03/10 a las 00:00, 4,88 − 3,99', t?.cambio7, 0.89)
  ok('sin atraso', t?.atraso, 0)
  ok('la de una por fecha habría medido doce horas', tendenciaDe(u.observado, '2026-10-10')?.cambio1, 0.09)
}
{
  // A la tarde la última es la de las 12:00
  const tarde = [...u.observado, { fecha: '2026-10-10T15:00:00.000Z', m: 4.95 }]
  ok('contra las 12:00 de ayer: 4,95 − 4,79', tendenciaEnHoras(tarde, '2026-10-10')?.cambio1, 0.16)
  const sinAyer = tarde.filter(l => l.fecha !== '2026-10-09T15:00:00.000Z')
  const t = tendenciaEnHoras(sinAyer, '2026-10-10')
  ok('si falta la de las 12:00 de ayer, se mide de 00:00 a 00:00', t?.cambio1, 0.18)
  ok('  no contra la del otro turno, que daría 4,95 − 4,70', t?.cambio1 !== 0.25)
  ok('  y la última sigue siendo la de las 12:00', t?.ultima.m, 4.95)
  ok('  los 7 días, desde la misma lectura: 4,88 − 3,99', t?.cambio7, 0.89)
  // Ni la de las 12:00 ni la de las 00:00 tienen pareja: sin dato, no cero
  const sinNada = sinAyer.filter(l => l.fecha !== '2026-10-09T03:00:00.000Z')
  ok('sin ninguna pareja en el último día, el cambio es null',
    tendenciaEnHoras(sinNada, '2026-10-10')?.cambio1, null)
}
ok('sin lecturas no hay tendencia', tendenciaEnHoras([], '2026-10-10'), null)
ok('dos días sin lectura es atraso 2', tendenciaEnHoras(u.observado, '2026-10-12')?.atraso, 2)

// ── Lo que no se usa ────────────────────────────────────────────────────────
titulo('Lo que no se usa')

{
  // El caso de Empedrado, por la otra puerta: 12,33 m con el río en 4,79
  const mala = [...dePna.slice(0, -1), { fecha: '2026-10-10T03:00:00.000Z', m: 12.33 }]
  const c = unirSeries(mala, INA, DESDE, AHORA)
  ok(`un salto de más de ${SALTO_MAX_M} m no entra`, c.observado[c.observado.length - 1].m, 4.79)
  ok('  y queda dicho, como de Prefectura', c.descartadasPrefectura.length, 1)
  ok('  no como del INA', c.descartadasIna.length, 0)
}
{
  const futura = [...dePna, { fecha: '2026-10-12T03:00:00.000Z', m: 4.9 }]
  const c = unirSeries(futura, INA, DESDE, AHORA)
  ok('una fecha futura no entra', c.observado[c.observado.length - 1].fecha, '2026-10-10T03:00:00.000Z')
  ok('  y queda dicha', c.descartadasPrefectura.length, 1)
}
{
  const c = unirSeries(dePna, [...INA, { fecha: '2026-10-04T03:00:00.000Z', m: 0 }], DESDE, AHORA)
  ok('una del INA imposible queda dicha como del INA', c.descartadasIna.length, 1)
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo en orden')
process.exit(fallos ? 1 : 0)
