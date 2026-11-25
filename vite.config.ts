import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The scanned rock models travel as base64 (`*.glb.b64`) and are written out as `.glb` here, at
 * config load, so `vite` and `vite build` both serve them from `/models/`.
 *
 * Why: the only route that can write to this repository from where the scene is built is a
 * text-only contents API — a binary pushed through it arrives corrupt. Keeping the bytes base64
 * means the art travels intact and the build produces the real files. Delete the `.b64` copies and
 * commit the `.glb`s directly the day a binary path is available.
 */
/** Decode every `*.b64` under public/ into the file it stands for (textures, stills, models). */
function decodeAssets(dir = fileURLToPath(new URL('./public/', import.meta.url))): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}${entry.name}`
    if (entry.isDirectory()) {
      decodeAssets(`${path}/`)
      continue
    }
    if (!entry.name.endsWith('.b64')) continue
    const bytes = Buffer.from(readFileSync(path, 'utf8').replace(/\s+/g, ''), 'base64')
    writeFileSync(path.slice(0, -4), bytes)
  }
}

decodeAssets()

function decodeModels(): void {
  const dir = fileURLToPath(new URL('./public/models/', import.meta.url))
  for (const name of ['moon_rock_01', 'moon_rock_03', 'moon_rock_05']) {
    const source = `${dir}${name}.glb.b64`
    if (!existsSync(source)) continue
    const bytes = Buffer.from(readFileSync(source, 'utf8').replace(/\s+/g, ''), 'base64')
    writeFileSync(`${dir}${name}.glb`, bytes)
  }
}

decodeModels()

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
