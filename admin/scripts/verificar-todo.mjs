#!/usr/bin/env node
/**
 * Corre toda la verificación del panel en un comando: `npm run verificar`.
 *
 *   1. tsc --noEmit
 *   2. la barrera de lint por línea de base
 *   3. la sintaxis de los docs/sql/*.sql
 *   4. cada scripts/verificar-*.ts
 *
 * Va en Node y no en un `for` de shell a propósito: los scripts de npm corren
 * bajo cmd.exe en Windows, que es de donde se verifica este repo, y ahí la
 * sintaxis de bash no existe.
 *
 * **`shell` se decide por paso, no global.** Con `shell: true` en Windows el
 * comando se pasa a cmd.exe sin comillas, así que `process.execPath` —que es
 * `C:\Program Files\nodejs\node.exe`— se parte en el espacio y cmd contesta
 * *"C:\Program no se reconoce como un comando"*. Los pasos que llaman a Node
 * directamente van sin shell; los que llaman a `npx.cmd` lo necesitan, porque
 * Node 20+ no ejecuta archivos `.cmd` sin él.
 *
 * `next build` queda afuera: tarda varios minutos y usa el binario nativo de
 * SWC, así que sólo corre en la máquina donde se instalaron los paquetes.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..')
const WIN = process.platform === 'win32'
const NPX = WIN ? 'npx.cmd' : 'npx'

/** Un paso de Node: el ejecutable no lleva shell (puede tener espacios). */
const nodo = (nombre, script) => ({ nombre, cmd: process.execPath, args: [join(AQUI, script)], shell: false })
/**
 * Un paso de npx: en Windows es un .cmd y necesita shell. Como con shell los
 * argumentos los vuelve a partir cmd.exe, los que tengan espacios van entre
 * comillas — hoy ninguno tiene, pero basta con mover el repo a una carpeta con
 * espacio para que deje de andar sin decir por qué.
 */
const citar = a => (WIN && /\s/.test(a) ? `"${a}"` : a)
const npx = (nombre, args) => ({ nombre, cmd: NPX, args: args.map(citar), shell: WIN })

const pasos = [
  npx('Tipos (tsc --noEmit)', ['tsc', '--noEmit']),
  nodo('Barrera de lint', 'verificar-lint.mjs'),
  nodo('Sintaxis SQL', 'verificar-sql.mjs'),
  ...readdirSync(AQUI)
    .filter(f => f.startsWith('verificar-') && f.endsWith('.ts'))
    .sort()
    .map(f => npx(f.replace(/^verificar-|\.ts$/g, ''), ['tsx', join(AQUI, f)])),
]

const fallaron = []
for (const { nombre, cmd, args, shell } of pasos) {
  console.log(`\n\u001b[1m── ${nombre}\u001b[0m`)
  const r = spawnSync(cmd, args, { cwd: RAIZ, stdio: 'inherit', shell })
  if (r.error) {
    console.error(`No se pudo ejecutar: ${r.error.message}`)
    fallaron.push(nombre)
  } else if (r.status !== 0) {
    fallaron.push(nombre)
  }
}

console.log('\n' + '─'.repeat(50))
if (fallaron.length === 0) {
  console.log(`\u001b[32mTodo en verde: ${pasos.length} pasos.\u001b[0m`)
  process.exit(0)
}
console.error(`\u001b[31mFallaron ${fallaron.length} de ${pasos.length}:\u001b[0m`)
for (const f of fallaron) console.error(`  ✗ ${f}`)
process.exit(1)
