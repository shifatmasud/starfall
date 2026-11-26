// Build the forest floor's moss carpet for scene 3 from a real scanned material: ambientCG Moss002
// (CC0, photoscanned), its own Displacement map for the relief and its Color map for the surface.
//
// The patch is a grid displaced by the scan's height data (no invented shape), the colour as one
// small tiling WebP. Vertex alpha fades the carpet out at its edges, in drifts, and along the dirt path
// that runs from the foreground back past the orb, so the photographed floor shows through as in panel 3.
// Written meshopt-compressed to public/scans/models/moss_carpet.glb; the gltfjsx component is
// src/scans/models/MossCarpet.tsx.
//
// Run:  npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4
// @gltf-transform/functions@4 meshoptimizer sharp && node scripts/scans/build-moss-carpet.mjs
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import * as F from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'

const ID = 'Moss002'
const DIR = `/tmp/acg/${ID}`
if (!existsSync(`${DIR}/${ID}_1K-JPG_Color.jpg`)) {
  mkdirSync(DIR, { recursive: true })
  execSync(`curl -sL -o ${DIR}.zip "https://ambientcg.com/get?file=${ID}_1K-JPG.zip" && unzip -oq ${DIR}.zip -d ${DIR}`)
}
await MeshoptEncoder.ready

// the patch, in metres: x across, z from just in front of the camera back past the orb
const X0 = -3.2, X1 = 3.2, Z0 = 0.1, Z1 = -6.3
const N = 28 // grid cells per side
const TILE = 6 // texture repeats across the patch (about a metre per repeat)
const RELIEF = 0.035 // metres of relief at full displacement
const TEX = 192 // one repeat of the scan; the sampler tiles it

// the scan's displacement, sampled per vertex (tiled like the colour)
const disp = await sharp(`${DIR}/${ID}_1K-JPG_Displacement.jpg`).greyscale().resize(256, 256).raw().toBuffer()
const height = (u, v) => {
  const x = Math.floor(((u * TILE) % 1) * 255)
  const y = Math.floor(((v * TILE) % 1) * 255)
  return disp[y * 256 + x] / 255
}

// smooth value noise for the moss's bare patches (a mask only: the surface itself is the scan)
const hash = (x, y) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h) }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const fbm = (x, y) => vnoise(x, y) * 0.6 + vnoise(x * 2.3 + 5.2, y * 2.3 + 1.7) * 0.28 + vnoise(x * 5.1, y * 5.1) * 0.12

// where the carpet holds (1) and where the photographed floor shows through (0)
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
function mask(u, v) {
  const x = X0 + (X1 - X0) * u
  const z = Z0 + (Z1 - Z0) * v
  const edge = smooth(0, 0.12, u) * smooth(0, 0.12, 1 - u) * smooth(0, 0.04, v) * smooth(0, 0.22, 1 - v)
  // the dirt path: from the foreground centre, bending left behind the orb, as in panel 3
  const pathX = 0.05 - 0.18 * (-z) + 0.02 * Math.sin(-z * 2.1)
  const pathW = 0.10 + 0.05 * (-z)
  const path = 1 - 0.75 * (1 - smooth(pathW * 0.4, pathW, Math.abs(x - pathX))) * smooth(-0.3, -0.9, z)
  // bare patches: the photographed leaf litter breaks through the moss in drifts, as on panel 3's floor
  const patches = smooth(0.22, 0.42, fbm(x * 1.7 + 11.3, z * 1.7 - 4.1))
  return edge * path * (0.4 + 0.6 * patches)
}

// geometry: a displaced grid; the mask rides as vertex alpha (COLOR_0), so the texture can tile small
const pos = [], uv = [], col = [], idx = []
for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
  const u = i / N, v = j / N, m = mask(u, v)
  pos.push(X0 + (X1 - X0) * u, height(u, v) * RELIEF * m, Z0 + (Z1 - Z0) * v)
  uv.push(u, v) // 0..1; the texture's own transform tiles it TILE times
  col.push(1, 1, 1, m)
}
// smooth normals from the grid's own heights (central differences)
const nrm = []
const at = (i, j) => pos[(Math.min(N, Math.max(0, j)) * (N + 1) + Math.min(N, Math.max(0, i))) * 3 + 1]
const dx = (X1 - X0) / N, dz = (Z0 - Z1) / N
for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
  const nx = -(at(i + 1, j) - at(i - 1, j)) / (2 * dx), nz = (at(i, j + 1) - at(i, j - 1)) / (2 * dz)
  const l = Math.hypot(nx, 1, nz)
  nrm.push(nx / l, 1 / l, nz / l)
}
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1
  idx.push(a, b, c, b, d, c) // counter-clockwise seen from above: the face looks up
}

// texture: one repeat of the scan's colour, graded toward panel 3's olive, sun-warmed moss
const webp = await sharp(`${DIR}/${ID}_1K-JPG_Color.jpg`)
  .modulate({ brightness: 0.62, saturation: 0.72, hue: -10 })
  .resize(TEX, TEX)
  .webp({ quality: 58 })
  .toBuffer()

const doc = new Document()
const buf = doc.createBuffer()
const prim = doc.createPrimitive()
  .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
  .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buf))
  .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nrm)).setBuffer(buf))
  .setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(new Float32Array(col)).setBuffer(buf))
  .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(idx)).setBuffer(buf))
const tex = doc.createTexture('moss002_color').setImage(webp).setMimeType('image/webp')
const mat = doc.createMaterial('moss_carpet').setBaseColorTexture(tex).setAlphaMode('BLEND').setMetallicFactor(0).setRoughnessFactor(0.95)
mat.getBaseColorTextureInfo().setExtension('KHR_texture_transform', doc.createExtension(ALL_EXTENSIONS.find((e) => e.EXTENSION_NAME === 'KHR_texture_transform')).setRequired(true).createTransform().setScale([TILE, TILE]))
prim.setMaterial(mat)
doc.createScene().addChild(doc.createNode('moss_carpet').setMesh(doc.createMesh('moss_carpet').addPrimitive(prim)))
await doc.transform(F.quantize(), F.reorder({ encoder: MeshoptEncoder }))
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER })
doc.createExtension(ALL_EXTENSIONS.find((e) => e.EXTENSION_NAME === 'EXT_texture_webp')).setRequired(true)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
const out = 'public/scans/models/moss_carpet.glb'
await io.write(out, doc)
// the repo takes text only: the bytes travel as base64 and vite.config.ts writes the .glb back out
writeFileSync(`${out}.b64`, readFileSync(out).toString('base64'))
console.log(`${ID} -> ${out} (${readFileSync(out).length} bytes) + .b64`)
