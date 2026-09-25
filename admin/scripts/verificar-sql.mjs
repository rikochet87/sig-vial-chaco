#!/usr/bin/env node
/**
 * Chequea la sintaxis de los .sql de `docs/sql/` contra el parser real de
 * Postgres (libpg_query, vía el paquete `pglast` de Python).
 *
 * Existe porque en este repo el SQL **se aplica a mano en el editor de
 * Supabase**: no hay migraciones ni nada que lo corra antes. Un paréntesis de
 * más se descubre recién pegándolo en producción.
 *
 * Sólo valida que **parsee**. No dice nada de si las tablas existen, si la
 * política tiene sentido o si el script es reejecutable — eso sigue siendo
 * lectura humana.
 *
 * Si `pglast` no está instalado, avisa y sale en verde: es un chequeo extra, no
 * una dependencia del proyecto.
 *
 *   pip install pglast
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const DIR_SQL = join(AQUI, '..', '..', 'docs', 'sql')

const PY = `
import sys, json
try:
    import pglast
except ImportError:
    print(json.dumps({"falta": True})); sys.exit(0)
out = {}
for f in sys.argv[1:]:
    try:
        out[f] = {"ok": True, "n": len(pglast.parse_sql(open(f, encoding="utf-8").read()))}
    except Exception as e:
        out[f] = {"ok": False, "error": str(e)}
print(json.dumps({"archivos": out}))
`

const archivos = readdirSync(DIR_SQL).filter(f => f.endsWith('.sql')).sort()
if (archivos.length === 0) {
  console.log('No hay .sql en docs/sql/.')
  process.exit(0)
}

let r = null
for (const python of ['python3', 'python', 'py']) {
  // Sin `shell`: el código de Python va como argumento y trae comillas y saltos
  // de línea, y las rutas pueden tener espacios. cmd.exe lo destrozaría.
  // Python es un .exe, así que no necesita shell en ninguna plataforma.
  r = spawnSync(python, ['-c', PY, ...archivos.map(f => join(DIR_SQL, f))], {
    encoding: 'utf8',
  })
  if (r.status === 0 && (r.stdout || '').trim().startsWith('{')) break
  r = null
}

if (!r) {
  console.log('No se encontró Python: se omite el chequeo de sintaxis SQL.')
  process.exit(0)
}

const datos = JSON.parse(r.stdout)
if (datos.falta) {
  console.log('`pglast` no está instalado: se omite el chequeo de sintaxis SQL.')
  console.log('Para habilitarlo: pip install pglast')
  process.exit(0)
}

let fallaron = 0
for (const [ruta, res] of Object.entries(datos.archivos)) {
  const nombre = ruta.split(/[\\/]/).pop()
  if (res.ok) {
    console.log(`  ok  ${nombre.padEnd(32)} ${res.n} sentencias`)
  } else {
    fallaron++
    console.error(`  ✗   ${nombre.padEnd(32)} ${res.error}`)
  }
}

if (fallaron > 0) {
  console.error(`\n${fallaron} archivo(s) no parsean.`)
  process.exit(1)
}
console.log(`\nSQL OK: ${archivos.length} archivos parsean.`)
