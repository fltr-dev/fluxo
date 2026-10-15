// Gera os ícones raster do PWA/favicon a partir dos SVGs (rodar só quando o desenho mudar):
//   node scripts/generate-icons.mjs
// Usa o sharp, que já vem instalado junto com o Next.
import { readFile, writeFile } from "node:fs/promises"
import sharp from "sharp"

const png = async (svg, size) => sharp(await readFile(svg), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer()

await writeFile("public/icons/icon-192.png", await png("src/app/icon.svg", 192))
await writeFile("public/icons/icon-512.png", await png("src/app/icon.svg", 512))
await writeFile("public/icons/icon-maskable-512.png", await png("public/icons/maskable.svg", 512))
await writeFile("src/app/apple-icon.png", await png("public/icons/apple.svg", 180))

// favicon.ico com 16, 32 e 48 px (PNG dentro do contêiner ICO)
const sizes = [16, 32, 48]
const images = await Promise.all(sizes.map((s) => png("src/app/icon.svg", s)))
const header = Buffer.alloc(6)
header.writeUInt16LE(1, 2) // tipo: ícone
header.writeUInt16LE(sizes.length, 4)
let offset = 6 + 16 * sizes.length
const entries = images.map((img, i) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(sizes[i], 0)
  e.writeUInt8(sizes[i], 1)
  e.writeUInt16LE(1, 4) // planos
  e.writeUInt16LE(32, 6) // bits por pixel
  e.writeUInt32LE(img.length, 8)
  e.writeUInt32LE(offset, 12)
  offset += img.length
  return e
})
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...entries, ...images]))
console.log("ícones gerados")
