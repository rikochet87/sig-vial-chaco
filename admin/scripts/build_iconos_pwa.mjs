#!/usr/bin/env node
/**
 * Genera los íconos del panel instalado en `public/iconos/`.
 *
 *   node scripts/build_iconos_pwa.mjs
 *
 * El origen es el ícono de la app móvil (`assets/icon_sig_vial.png`, 1024 px),
 * así el panel instalado y la app de campo se reconocen como lo mismo.
 *
 * - `icono-192.png` y `icono-512.png`: los dos tamaños que Chrome pide para
 *   ofrecer la instalación.
 * - `icono-maskable-512.png`: el mismo dibujo achicado al 76 % sobre el fondo
 *   del ícono. Android recorta los íconos «maskable» en círculo o en gota, y
 *   sólo garantiza el 80 % del centro; con el original el borde amarillo se
 *   cortaría.
 * - `apple-180.png`: el de iOS. Va sin transparencia, porque iOS pinta de negro
 *   lo transparente y le pone sus propias esquinas.
 *
 * Usa `sharp`, que llega instalado como dependencia de Next y no está en
 * `package.json`: es un script que se corre una vez y los PNG van al repo.
 */
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const ORIGEN = join(aqui, '..', '..', 'assets', 'icon_sig_vial.png')
const DESTINO = join(aqui, '..', 'public', 'iconos')
const FONDO = '#0d0d0d'

mkdirSync(DESTINO, { recursive: true })

for (const lado of [192, 512]) {
  await sharp(ORIGEN).resize(lado, lado).png().toFile(join(DESTINO, `icono-${lado}.png`))
}

const adentro = Math.round(512 * 0.76)
const dibujo = await sharp(ORIGEN).resize(adentro, adentro).png().toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 4, background: FONDO } })
  .composite([{ input: dibujo, gravity: 'center' }])
  .png()
  .toFile(join(DESTINO, 'icono-maskable-512.png'))

await sharp(ORIGEN).resize(180, 180).flatten({ background: FONDO }).png()
  .toFile(join(DESTINO, 'apple-180.png'))

console.log('Íconos en', DESTINO)
