import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The two flora textures are committed as base64 (`*.png.b64`) and written out
 * as PNGs here, at config load, so `vite` and `vite build` both find them in
 * `public/textures/flora/`.
 *
 * Why: the only route that can write to this repository from where the scene is
 * built is a text-only contents API — a binary pushed through it arrives
 * corrupt. Keeping the bytes base64 (half a megabyte of text, once) means the
 * art travels intact and the build produces the real files. Delete the `.b64`
 * pair and commit the PNGs directly the day a binary path is available.
 */
function decodeTextures(): void {
  const dir = fileURLToPath(new URL('./public/textures/flora/', import.meta.url))
  for (const name of ['foliage-atlas.png', 'grass-tuft.png']) {
    const source = `${dir}${name}.b64`
    if (!existsSync(source)) continue
    const png = Buffer.from(readFileSync(source, 'utf8').replace(/\s+/g, ''), 'base64')
    writeFileSync(`${dir}${name}`, png)
  }
}

decodeTextures()

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
})
