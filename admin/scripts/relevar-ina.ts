/**
 * Releva el Alerta Hidrológico del INA y verifica que `lib/ina.ts` siga en pie.
 *
 * **No es un test de lógica, es un test de contrato con un tercero.** Lo que
 * puede romperse acá no es nuestro código sino la API del INA: que cambie la
 * forma de una respuesta, que una estación deje de ser pública, que muevan un
 * umbral. Nada de eso lo atrapa `tsc`.
 *
 * Por eso **no entra en `npm run verificar`**: sale a la red, depende de que un
 * organismo esté en línea y que haya conexión. Un chequeo que falla por motivos
 * ajenos al commit enseña a ignorar los chequeos. Se corre a mano:
 *
 *   npx tsx scripts/relevar-ina.ts
 *
 * Tampoco corre desde el sandbox de Claude: la red de ahí está limitada a
 * dominios permitidos y el del INA no está. Va desde PowerShell o desde Vercel.
 */
import {
  ESTACIONES, REFERENCIA, alturasObservadas, pronosticoDe, estadoDe, ETIQUETA_ESTADO,
} from '../src/lib/ina'

const BASE = 'https://alerta.ina.gob.ar/a5'
let fallos = 0

const ok = (que: string, bien: boolean, detalle = '') => {
  if (!bien) fallos++
  console.log(`${bien ? '  ok  ' : '  ✗   '} ${que.padEnd(52)} ${detalle}`)
}
const info = (s: string) => console.log(`       ${s}`)
const titulo = (s: string) => console.log(`\n— ${s} —`)

const hace = (d: number) => {
  const f = new Date()
  f.setDate(f.getDate() - d)
  return f.toISOString().slice(0, 10)
}
const hoy = new Date().toISOString().slice(0, 10)

async function main() {
  // ── 1 · El catálogo sigue teniendo nuestras estaciones ────────────────────
  titulo('El catálogo del INA')

  const est = await fetch(`${BASE}/obs/puntual/estaciones?format=json`, {
    headers: { accept: 'application/json' },
  }).then(r => r.json()) as {
    id: number; nombre: string; provincia: string | null; rio: string | null
    has_obs: boolean; public: boolean
    nivel_alerta: number | null; nivel_evacuacion: number | null; cero_ign: number | null
  }[]

  info(`${est.length.toLocaleString('es-AR')} estaciones en el catálogo`)
  ok('el catálogo responde y trae estaciones', est.length > 1000)

  for (const nuestra of ESTACIONES) {
    const enApi = est.find(e => e.id === nuestra.id)
    if (!enApi) { ok(`${nuestra.nombre} sigue existiendo`, false, 'no está en el catálogo'); continue }

    ok(`${nuestra.nombre} es pública y tiene observaciones`, enApi.public && enApi.has_obs)

    // Los umbrales son lo que el sistema va a citar: si el INA los mueve,
    // nuestra copia miente y hay que enterarse acá, no en una emergencia.
    const mismoAlerta = enApi.nivel_alerta === nuestra.alerta
    const mismaEvac = enApi.nivel_evacuacion === nuestra.evacuacion
    ok(`${nuestra.nombre}: umbrales sin cambios`, mismoAlerta && mismaEvac,
      mismoAlerta && mismaEvac
        ? `alerta ${nuestra.alerta} · evac ${nuestra.evacuacion}`
        : `¡CAMBIARON! API dice alerta ${enApi.nivel_alerta} · evac ${enApi.nivel_evacuacion}`)

    // Barranqueras no tiene cero_ign y eso está asumido. Si algún día aparece,
    // es una buena noticia que también hay que ver.
    if (nuestra.ceroIgn === null && enApi.cero_ign !== null) {
      info(`¡${nuestra.nombre} ahora SÍ tiene cero_ign: ${enApi.cero_ign}! Actualizar lib/ina.ts.`)
    }
  }

  // ── 2 · Observaciones ─────────────────────────────────────────────────────
  titulo('Alturas observadas, últimos 15 días')

  for (const e of ESTACIONES) {
    const obs = await alturasObservadas(e.id, hace(15), hoy)
    if (obs.length === 0) { ok(`${e.nombre}: hay observaciones`, false, 'ninguna'); continue }

    const ultima = obs[obs.length - 1]
    const estado = estadoDe(e, ultima.m)
    const aAlerta = (e.alerta - ultima.m).toFixed(2)
    ok(`${e.nombre}: hay observaciones`, true,
      `${obs.length} lecturas · última ${ultima.m} m (${ultima.fecha.slice(0, 10)}) `
      + `· ${ETIQUETA_ESTADO[estado]} · faltan ${aAlerta} m para alerta`)

    // Una altura hidrométrica fuera de este rango es un error de lectura, no
    // una crecida histórica: en el Paraná medio la escala no llega a 20 m.
    const raro = obs.filter(o => o.m < -2 || o.m > 20)
    ok(`${e.nombre}: valores en rango plausible`, raro.length === 0,
      raro.length ? `${raro.length} fuera de rango` : '')
  }

  // ── 3 · Pronóstico ────────────────────────────────────────────────────────
  titulo('Pronóstico vigente')

  for (const e of ESTACIONES) {
    const p = await pronosticoDe(e.id)
    if (!p) { info(`${e.nombre}: sin corrida publicada`); continue }

    const bandas = new Set(p.puntos.map(q => q.banda))
    const fin = p.puntos[p.puntos.length - 1]
    const dias = Math.round(
      (new Date(fin.fecha).getTime() - new Date(p.emitido).getTime()) / 86_400_000)

    ok(`${e.nombre}: pronóstico con banda`, bandas.size > 1,
      `emitido ${p.emitido.slice(0, 10)} · ${dias} días · ${p.puntos.length} puntos `
      + `· bandas: ${[...bandas].join(', ')}`)

    // Un pronóstico emitido hace mucho es un pronóstico viejo, y mostrarlo como
    // vigente sería peor que no mostrarlo.
    const antiguedad = Math.round(
      (Date.now() - new Date(p.emitido).getTime()) / 86_400_000)
    ok(`${e.nombre}: la corrida es reciente`, antiguedad <= 7, `${antiguedad} días de emitida`)

    const maximo = Math.max(...p.puntos.map(q => q.m))
    if (maximo >= e.alerta) {
      info(`⚠ ${e.nombre}: el pronóstico llega a ${maximo} m, sobre el alerta de ${e.alerta} m`)
    }
  }

  // ── 4 · La estación de referencia ─────────────────────────────────────────
  titulo('Referencia para el área metropolitana')
  const ref = ESTACIONES.find(e => e.id === REFERENCIA)
  ok('la referencia está en la lista', !!ref, ref?.nombre ?? '')
  if (ref && ref.ceroIgn === null) {
    info('Barranqueras sigue sin cero_ign: no se puede ligar la escala al datum')
    info('del IGN. Hace falta pedirlo al INA o a Prefectura antes de cualquier')
    info('simulación que compare altura de río contra cotas del terreno.')
  }

  console.log(fallos === 0 ? '\n✓ Todo bien.' : `\n✗ ${fallos} fallo(s).`)
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('\n✗ No se pudo completar el relevamiento:', e instanceof Error ? e.message : e)
  console.error('  Si es un problema de red o el INA está caído, no es un fallo del repo.')
  process.exit(1)
})
