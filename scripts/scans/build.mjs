// Build the compressed scan models listed in scripts/scans/manifest.json.
//
// For each entry: download the Poly Haven photogrammetry glTF (the API's file list), keep the one
// mesh named (the smallest variant/LOD), simplify it, drop the normal and ARM maps, store the
// diffuse as WebP at `tex` px, quantize, and write it meshopt-compressed to
// public/scans/models/<out>.glb. The gltfjsx component for each lives in src/scans/models and is
// committed with the manifest entry; scenes import the component, never the raw file.
//
// Run:  npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4
// @gltf-transform/functions@4 meshoptimizer sharp && node scripts/scans/build.mjs
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import * as F from '@gltf-transform/functions'
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'

const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'))
const force = process.argv.includes('--force')
await MeshoptEncoder.ready

async function fetchTo(url, path) {
  if (existsSync(path)) return // sources are big (fir_tree_01 is ~480 MB): fetch once
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Buffer.from(await r.arrayBuffer()))
}

for (const e of manifest) {
  const out = `public/scans/models/${e.out}.glb`
  if (existsSync(out) && !force) continue
  const files = await (await fetch(`https://api.polyhaven.com/files/${e.id}`)).json()
  const g = files.gltf[e.res ?? '1k'].gltf
  const dir = `/tmp/scan-src/${e.id}`
  const main = join(dir, g.url.split('/').pop())
  await fetchTo(g.url, main)
  for (const [rel, inc] of Object.entries(g.include)) await fetchTo(inc.url, join(dir, rel))

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  const doc = await io.read(main)
  const root = doc.getRoot()
  if (e.mesh) for (const n of root.listNodes()) { const m = n.getMesh(); if (m && m.getName() !== e.mesh) n.dispose() }
  // keep only the named nodes (a few tufts out of a scanned set)
  if (e.nodes) for (const n of root.listNodes()) if (n.getMesh() && !e.nodes.includes(n.getName())) n.dispose()
  // keep only the parts made of the named materials (a tree's trunk without its million twigs)
  if (e.materials) for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    if (!e.materials.includes(p.getMaterial()?.getName())) { m.removePrimitive(p); p.dispose() }
  }
  for (const mat of root.listMaterials()) {
    mat.setNormalTexture(null)
    mat.setOcclusionTexture(null)
    mat.setMetallicRoughnessTexture(null)
    mat.setMetallicFactor(0)
    mat.setRoughnessFactor(0.85)
    if (mat.getAlphaMode() === 'BLEND') { mat.setAlphaMode('MASK'); mat.setAlphaCutoff(0.5) }
  }
  await doc.transform(
    F.prune(), F.dedup(), F.weld(),
    F.simplify({ simplifier: MeshoptSimplifier, ratio: e.ratio ?? 0.25, error: e.error ?? 0.01 }),
    F.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [e.tex ?? 256, e.tex ?? 256], quality: e.quality ?? 70 }),
    F.prune(), F.quantize(), F.reorder({ encoder: MeshoptEncoder }),
  )
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER })
  mkdirSync(dirname(out), { recursive: true })
  await io.write(out, doc)
  console.log(`${e.id} -> ${out} (${readFileSync(out).length} bytes)`)
}
