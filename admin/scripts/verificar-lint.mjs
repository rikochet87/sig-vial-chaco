#!/usr/bin/env node
/**
 * Barrera de lint por línea de base.
 *
 * El repo arrastra 75 errores de eslint que no conviene arreglar a fuerza bruta
 * (ver CLAUDE.md: la mayoría de `set-state-in-effect` son falsos positivos en
 * SSR, y los `no-explicit-any` son deuda de tipado de Leaflet). Llevar el lint a
 * cero no es el objetivo; el objetivo es que **no siga creciendo**.
 *
 * Este script compara el conteo actual por regla contra `lint-linea-base.json`
 * y falla si alguna regla sube o aparece una nueva. Que baje no falla: cuando
 * bajás una, corré `--actualizar` y commiteá la línea de base más baja.
 *
 *   node scripts/verificar-lint.mjs              # compara
 *   node scripts/verificar-lint.mjs --actualizar # regraba la línea de base
 *
 * Es por regla y no por total a propósito: un total solo deja pasar el caso de
 * arreglar dos `prefer-const` y meter dos `any` nuevos.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const BASE = join(AQUI, 'lint-linea-base.json')
const RAIZ = join(AQUI, '..')
const actualizar = process.argv.includes('--actualizar')

function correrEslint() {
  // eslint sale con código 1 cuando hay errores: eso es lo normal acá, no un
  // fallo de ejecución. Sólo importa que haya escrito JSON válido.
  let salida = ''
  try {
    const win = process.platform === 'win32'
    salida = execFileSync(
      win ? 'npx.cmd' : 'npx',
      ['eslint', 'src', '--format', 'json'],
      // `shell` en Windows porque Node 20+ no ejecuta archivos `.cmd` sin él.
      { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: win },
    )
  } catch (e) {
    salida = e.stdout || ''
    if (!salida.trim().startsWith('[')) {
      console.error('No se pudo correr eslint:\n' + (e.stderr || e.message))
      process.exit(2)
    }
  }
  return JSON.parse(salida)
}

function contarPorRegla(informe) {
  const conteo = {}
  for (const archivo of informe) {
    for (const m of archivo.messages) {
      if (m.severity !== 2) continue // sólo errores; las advertencias no gatean
      const regla = m.ruleId || '(sin regla)'
      conteo[regla] = (conteo[regla] || 0) + 1
    }
  }
  return Object.fromEntries(Object.entries(conteo).sort((a, b) => b[1] - a[1]))
}

const actual = contarPorRegla(correrEslint())
const total = Object.values(actual).reduce((s, n) => s + n, 0)

if (actualizar || !existsSync(BASE)) {
  writeFileSync(BASE, JSON.stringify({ total, reglas: actual }, null, 2) + '\n')
  console.log(`Línea de base grabada: ${total} errores en ${Object.keys(actual).length} reglas.`)
  console.log('Revisá el diff antes de commitear.')
  process.exit(0)
}

const base = JSON.parse(readFileSync(BASE, 'utf8'))
const reglas = new Set([...Object.keys(base.reglas), ...Object.keys(actual)])
const subieron = []
const bajaron = []

for (const r of [...reglas].sort()) {
  const antes = base.reglas[r] || 0
  const ahora = actual[r] || 0
  if (ahora > antes) subieron.push({ r, antes, ahora })
  else if (ahora < antes) bajaron.push({ r, antes, ahora })
}

for (const { r, antes, ahora } of bajaron) {
  console.log(`  ✓ ${r}: ${antes} → ${ahora}`)
}

if (subieron.length === 0) {
  console.log(`Lint OK: ${total} errores, ninguna regla creció (línea de base ${base.total}).`)
  if (bajaron.length > 0) {
    console.log('Bajaron reglas: corré `node scripts/verificar-lint.mjs --actualizar` para fijar el piso más abajo.')
  }
  process.exit(0)
}

console.error(`\nLint: ${subieron.length} regla(s) crecieron respecto de la línea de base.\n`)
for (const { r, antes, ahora } of subieron) {
  console.error(`  ✗ ${r}: ${antes} → ${ahora}  (+${ahora - antes})`)
}
console.error(`\nTotal: ${base.total} → ${total}`)
console.error('\nArreglá lo nuevo. Si el aumento es deliberado y está justificado,')
console.error('corré `node scripts/verificar-lint.mjs --actualizar` y explicá por qué en el commit.')
process.exit(1)
