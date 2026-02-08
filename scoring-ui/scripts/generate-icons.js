import sharp from 'sharp'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(__dirname, '..', 'public')
const svgBuffer = readFileSync(resolve(publicDir, 'icon.svg'))

// Maskable icons need extra padding (safe zone is inner 80%)
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
  <rect width="640" height="640" fill="#1d4ed8"/>
  <g transform="translate(64,64)">
    ${svgBuffer.toString().replace(/<\?xml[^?]*\?>/, '').replace(/<svg[^>]*>/, '').replace('</svg>', '')}
  </g>
</svg>`

async function generate() {
  // Regular icons
  await sharp(svgBuffer).resize(192, 192).png().toFile(resolve(publicDir, 'icon-192.png'))
  await sharp(svgBuffer).resize(512, 512).png().toFile(resolve(publicDir, 'icon-512.png'))

  // Maskable icons (with padding for safe zone)
  await sharp(Buffer.from(maskableSvg)).resize(192, 192).png().toFile(resolve(publicDir, 'icon-maskable-192.png'))
  await sharp(Buffer.from(maskableSvg)).resize(512, 512).png().toFile(resolve(publicDir, 'icon-maskable-512.png'))

  // Apple touch icon
  await sharp(svgBuffer).resize(180, 180).png().toFile(resolve(publicDir, 'apple-touch-icon.png'))

  console.log('Icons generated successfully')
}

generate().catch(console.error)
