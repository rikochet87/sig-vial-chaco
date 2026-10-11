/**
 * Los modelos de elevación globales de 30 m contra el suelo que midió GEDI, en
 * el recuadro del Gran Resistencia y dentro del recinto defendido.
 *
 *   node mde-contra-gedi.mjs [salida.json]
 *
 * Necesita EE_CLAVE (la clave JSON de la cuenta de servicio de Earth Engine) y
 * EE_MODULOS (una carpeta donde se hizo `npm i @google/earthengine`), como
 * `scripts/build_anegamiento.mjs`.
 *
 * GEDI es un lidar de la estación espacial: no da un modelo, da la cota del
 * suelo en disparos sueltos de 25 m. Sirve de verdad de campo. Mide sobre el
 * elipsoide y los modelos sobre el geoide: la diferencia se saca de la propia
 * GEDI, que trae la cota de TanDEM-X sobre el elipsoide en cada disparo, contra
 * GLO-30, que es TanDEM-X sobre el geoide. **Por eso el corrimiento absoluto de
 * cada modelo vale a los decímetros; la dispersión no depende de eso.**
 *
 * Resultado del 11/10/2026: ninguno alcanza. Está en
 * docs/inundaciones-gran-resistencia.md, «Cuarta pasada».
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
if (!process.env.EE_CLAVE || !process.env.EE_MODULOS) {
  console.error('faltan EE_CLAVE y EE_MODULOS')
  process.exit(1)
}
const ee = createRequire(join(process.env.EE_MODULOS, 'package.json'))('@google/earthengine')
const clave = JSON.parse(readFileSync(process.env.EE_CLAVE, 'utf8'))
const evaluar = obj => new Promise((res, rej) => obj.evaluate((v, e) => (e ? rej(new Error(e)) : res(v))))
const entrar = () => new Promise((res, rej) =>
  ee.data.authenticateViaPrivateKey(clave, () => ee.initialize(null, null, res, rej, null, clave.project_id), rej))

try {
  await entrar()
  const indice = JSON.parse(readFileSync(join(REPO, 'admin', 'public', 'geo', 'inundaciones', 'indice.json'), 'utf8'))
  const r = indice.recuadro
  const recuadro = ee.Geometry.Rectangle([r.oeste, r.sur, r.este, r.norte])
  const recinto = ee.Geometry(JSON.parse(readFileSync(join(REPO, 'docs', 'geo', 'inundaciones', 'recinto-amgr.geojson'), 'utf8')).geometry)
  const afuera = recuadro.difference(recinto, 1)

  // Los modelos, todos en altura sobre el geoide
  const glo = ee.ImageCollection('COPERNICUS/DEM/GLO30').filterBounds(recuadro).select('DEM').mosaic().rename('glo30')
  const fab = ee.ImageCollection('projects/sat-io/open-datasets/FABDEM').filterBounds(recuadro).mosaic().rename('fabdem')
  const nasa = ee.Image('NASA/NASADEM_HGT/001').select('elevation').rename('nasadem')
  const alos = ee.ImageCollection('JAXA/ALOS/AW3D30/V3_2').filterBounds(recuadro).select('DSM').mosaic().rename('alos')

  // GEDI L2A: el suelo (modo más bajo) de cada disparo bueno, sobre el elipsoide
  const gedi = ee.ImageCollection('LARSE/GEDI/GEDI02_A_002_MONTHLY').filterBounds(recuadro)
    .map(i => i.updateMask(i.select('quality_flag').eq(1)).updateMask(i.select('degrade_flag').eq(0))
      .updateMask(i.select('sensitivity').gte(0.95)))
  const meses = await evaluar(gedi.size())
  const proy = gedi.first().select('elev_lowestmode').projection()
  const escala = await evaluar(proy.nominalScale())
  const suelo = gedi.select('elev_lowestmode').median().rename('suelo')
  const tdx = gedi.select('digital_elevation_model').median().rename('tdx')
  const rh98 = gedi.select('rh98').median().rename('rh98')
  console.log('GEDI: meses con datos', meses, '· escala nativa', escala.toFixed(1), 'm')

  // Sin el agua de siempre: ahí ni GEDI ni los modelos miden terreno
  const agua = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').unmask(0).gte(30)
  const base = ee.Image.cat([suelo, tdx, rh98, glo, fab, nasa, alos]).updateMask(agua.not()).updateMask(suelo.mask())

  // La ondulación del geoide, de la propia GEDI: su TanDEM-X va sobre el elipsoide y GLO-30 es TanDEM-X sobre el geoide
  const pct = ee.Reducer.percentile([5, 16, 50, 84, 95])
  const stats = ee.Reducer.count().combine(ee.Reducer.mean(), '', true).combine(ee.Reducer.stdDev(), '', true).combine(pct, '', true)
  const N = await evaluar(base.select('tdx').subtract(base.select('glo30')).rename('n')
    .reduceRegion({ reducer: stats, geometry: recuadro, scale: escala, maxPixels: 1e9 }))
  console.log('ondulación (TDX de GEDI − GLO-30):', JSON.stringify(Object.fromEntries(Object.entries(N).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v]))))
  const n = N.n_p50
  const terreno = base.select('suelo').subtract(n).rename('terreno')

  const salida = { recuadro: r, mesesGedi: meses, escala, ondulacion: N, zonas: {} }
  const MODELOS = ['glo30', 'fabdem', 'nasadem', 'alos']
  for (const [nombre, geom] of [['recuadro', recuadro], ['recinto', recinto], ['fuera del recinto', afuera]]) {
    // El terreno mismo: cuánto relieve hay que distinguir
    const t = await evaluar(terreno.reduceRegion({ reducer: stats, geometry: geom, scale: escala, maxPixels: 1e9 }))
    const fila = { terreno: t, modelos: {} }
    console.log(`\n── ${nombre} · ${t.terreno_count} disparos · terreno GEDI: mediana ${t.terreno_p50.toFixed(2)} m, p5–p95 ${t.terreno_p5.toFixed(2)}–${t.terreno_p95.toFixed(2)}, desvío ${t.terreno_stdDev.toFixed(2)}`)
    for (const m of MODELOS) {
      const dif = base.select(m).subtract(terreno).rename('d')
      const d = await evaluar(dif.reduceRegion({ reducer: stats, geometry: geom, scale: escala, maxPixels: 1e9 }))
      const c = await evaluar(ee.Image.cat([base.select(m), terreno]).reduceRegion({ reducer: ee.Reducer.pearsonsCorrelation(), geometry: geom, scale: escala, maxPixels: 1e9 }))
      // Error absoluto, y el que queda si se le saca el corrimiento (la mediana)
      const abs = await evaluar(dif.abs().rename('a').addBands(dif.subtract(d.d_p50).abs().rename('ac'))
        .reduceRegion({ reducer: ee.Reducer.mean().combine(ee.Reducer.percentile([50, 90]), '', true), geometry: geom, scale: escala, maxPixels: 1e9 }))
      fila.modelos[m] = { ...d, r: c.correlation, ...abs }
      console.log(`  ${m.padEnd(8)} sesgo (mediana) ${d.d_p50.toFixed(2).padStart(6)} · desvío ${d.d_stdDev.toFixed(2)} · p16–p84 ${d.d_p16.toFixed(2)} a ${d.d_p84.toFixed(2)} · p5–p95 ${d.d_p5.toFixed(2)} a ${d.d_p95.toFixed(2)} · MAE ${abs.a_mean.toFixed(2)} · MAE sin corrimiento ${abs.ac_mean.toFixed(2)} (p90 ${abs.ac_p90.toFixed(2)}) · r ${c.correlation.toFixed(2)}`)
    }
    salida.zonas[nombre] = fila
  }

  // ¿Y promediando por sectores? Los mismos disparos, juntados en celdas: si el error es ruido, baja
  console.log('── por sectores, dentro del recinto (celdas con 8 disparos o más)')
  for (const lado of [250, 500, 1000]) {
    const junto = ee.Image.cat([terreno, base.select('fabdem'), base.select('glo30'), terreno.multiply(0).add(1).rename('n')])
      .setDefaultProjection(proy).reduceResolution({ reducer: ee.Reducer.mean().forEach(['terreno', 'fabdem', 'glo30']).combine(ee.Reducer.count().forEach(['n']), '', false), maxPixels: 4096 })
      .reproject({ crs: 'EPSG:32721', scale: lado })
    const ok = junto.updateMask(junto.select('n').gte(8))
    for (const m of ['fabdem', 'glo30']) {
      const d = ok.select(m).subtract(ok.select('terreno')).rename('d')
      const e = await evaluar(d.reduceRegion({ reducer: stats, geometry: recinto, scale: lado, maxPixels: 1e9 }))
      const c = await evaluar(ok.select([m, 'terreno']).reduceRegion({ reducer: ee.Reducer.pearsonsCorrelation(), geometry: recinto, scale: lado, maxPixels: 1e9 }))
      const t = await evaluar(ok.select('terreno').reduceRegion({ reducer: ee.Reducer.stdDev(), geometry: recinto, scale: lado, maxPixels: 1e9 }))
      console.log('  ' + String(lado).padStart(4) + ' m ' + m.padEnd(7) + ' celdas ' + e.d_count + ' · relieve entre celdas (desvío) ' + t.terreno.toFixed(2) + ' · sesgo ' + e.d_p50.toFixed(2) + ' · desvío del error ' + e.d_stdDev.toFixed(2) + ' · p5–p95 ' + e.d_p5.toFixed(2) + ' a ' + e.d_p95.toFixed(2) + ' · r ' + c.correlation.toFixed(2))
      salida['sectores_' + lado + '_' + m] = { ...e, r: c.correlation, relieve: t.terreno }
    }
  }
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(salida, null, 1))
  process.exit(0)
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}
