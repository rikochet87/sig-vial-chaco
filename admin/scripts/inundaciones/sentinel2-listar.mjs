// Lista las pasadas de Sentinel-2 sobre el recuadro en uno o más rangos de fechas.
//   node sentinel2-listar.mjs 2019-01-10/2019-02-10 2023-11-01/2023-12-05
import { G, json } from './grilla.mjs'
const STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1'
for (const rango of process.argv.slice(2)) {
  const [a, b] = rango.split('/')
  const j = await json(`${STAC}/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collections: ['sentinel-2-l2a'], bbox: [G.AOI.oeste, G.AOI.sur, G.AOI.este, G.AOI.norte], datetime: `${a}T00:00:00Z/${b}T23:59:59Z`, limit: 500 }) })
  const porFecha = new Map()
  for (const f of j.features) { const d = f.properties.datetime.slice(0, 10); (porFecha.get(d) ?? porFecha.set(d, []).get(d)).push(`${f.properties['s2:mgrs_tile']}:${Math.round(f.properties['eo:cloud_cover'])}%`) }
  console.log('--', rango)
  for (const [d, v] of [...porFecha].sort()) console.log(d, v.join('  '))
}
