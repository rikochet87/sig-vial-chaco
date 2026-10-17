#!/usr/bin/env node
/**
 * Genera los íconos del panel instalado en `public/iconos/` y el favicon.
 *
 *   node scripts/build_iconos_pwa.mjs
 *
 * El dibujo es el logo de la barra lateral (`Sidebar.tsx`): cuadrado amarillo
 * con «SV» en negro, monoespaciada. Es lo que el usuario reconoce como el
 * panel; el ícono de la app móvil (el mapa del Chaco) se probó primero y se
 * descartó el 17/10/2026.
 *
 * - `icono-192.png` y `icono-512.png`: los dos tamaños que Chrome pide para
 *   ofrecer la instalación.
 * - `icono-maskable-512.png`: con más aire alrededor de las letras. Android
 *   recorta los «maskable» en círculo o en gota y sólo garantiza el 80 % del
 *   centro.
 * - `apple-180.png`: el de iOS, que le pone sus propias esquinas.
 * - `src/app/favicon.ico`: el de la pestaña. Era el triángulo que trae Next.
 *   Un .ico con un PNG adentro, que todos los navegadores leen.
 *
 * **La fuente es Consolas, la que Chrome usa en Windows para `monospace`, y
 * tiene que estar instalada.** Con una lista de alternativas o con peso 800
 * (Consolas no lo tiene), el renderizador cae en una sin serifa sin avisar.
 *
 * Usa `sharp`, que llega instalado como dependencia de Next y no está en
 * `package.json`: es un script que se corre una vez y los PNG van al repo.
 */
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const DESTINO = join(aqui, '..', 'public', 'iconos')
const FAVICON = join(aqui, '..', 'src', 'app', 'favicon.ico')

/** `letra` es el alto de las letras como fracción del lado */
function svg(lado, letra) {
  const t = Math.round(lado * letra)
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}">
  <rect width="${lado}" height="${lado}" fill="#F5C300"/>
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
    font-family="Consolas" font-weight="700"
    font-size="${t}" letter-spacing="${-t * 0.04}" fill="#111">SV</text>
</svg>`)
}

const png = (lado, letra) => sharp(svg(lado, letra)).png().toBuffer()

mkdirSync(DESTINO, { recursive: true })
writeFileSync(join(DESTINO, 'icono-192.png'), await png(192, 0.46))
writeFileSync(join(DESTINO, 'icono-512.png'), await png(512, 0.46))
writeFileSync(join(DESTINO, 'icono-maskable-512.png'), await png(512, 0.36))
writeFileSync(join(DESTINO, 'apple-180.png'), await png(180, 0.46))

// ICO de una imagen: cabecera de 6 bytes, una entrada de 16 y el PNG
const p32 = await png(32, 0.5)
const ico = Buffer.alloc(22)
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4)
ico.writeUInt8(32, 6); ico.writeUInt8(32, 7)
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12)
ico.writeUInt32LE(p32.length, 14); ico.writeUInt32LE(22, 18)
writeFileSync(FAVICON, Buffer.concat([ico, p32]))

console.log('Íconos en', DESTINO, 'y', FAVICON)
