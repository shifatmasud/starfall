import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * A ruined classical colonnade in sandstone, built as geometry: the reference's desert temple is a row
 * of fluted columns on a stepped plinth carrying a broken architrave, with fallen drums in the sand.
 *
 * Each column is a real order: a two-step plinth and a torus base, a fluted shaft with a slight entasis
 * (widest a third of the way up, then tapering), and an echinus + abacus capital. Flutes are cut into
 * the surface as concave grooves (20 of them, the Doric count), so the sun rakes across them. Broken
 * columns end in a jagged, sun-bleached fracture instead of a capital.
 *
 * Colour is baked per vertex: the sandstone's warm body, a bleached top where the sun has stood on it
 * for centuries, a darker damp band at the foot, and per-vertex noise so no two blocks match — the
 * value separation the reference relies on to read stone rather than plastic.
 */

type Vec3 = [number, number, number]

const SAND = new THREE.Color('#cda97c')
const SAND_LIT = new THREE.Color('#dcc099')
const SAND_SHADE = new THREE.Color('#b08a63')

function hash(n: number) {
  const s = Math.sin(n * 78.233) * 43758.5453
  return s - Math.floor(s)
}

class Builder {
  pos: number[] = []
  col: number[] = []
  idx: number[] = []
  seed = 1

  colorAt(y: number, top: number, tint = 0) {
    const c = SAND.clone().lerp(SAND_LIT, THREE.MathUtils.clamp(y / Math.max(top, 1e-3), 0, 1) * 0.55)
    c.lerp(SAND_SHADE, Math.max(0, 1 - y / 0.6) * 0.35 + tint)
    c.multiplyScalar(0.94 + 0.12 * hash(this.seed++))
    return c
  }

  tri(a: Vec3, b: Vec3, c: Vec3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color) {
    const base = this.pos.length / 3
    this.pos.push(...a, ...b, ...c)
    this.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b)
    this.idx.push(base, base + 1, base + 2)
  }

  /** a fluted cone section between y0 and y1, radius r0 → r1, centre (cx, cz) */
  shaft(cx: number, cz: number, y0: number, y1: number, r0: number, r1: number, sides = 40, flutes = 20, groove = 0.055, topJag = 0) {
    const rings = 5
    const ringPts: Vec3[][] = []
    const ringY: number[] = []
    for (let i = 0; i <= rings; i++) {
      const t = i / rings
      const y = y0 + (y1 - y0) * t
      const slump = 1 + 0.06 * Math.sin(t * Math.PI) // entasis
      const r = (r0 + (r1 - r0) * t) * slump
      const pts: Vec3[] = []
      for (let j = 0; j < sides; j++) {
        const a = (j / sides) * Math.PI * 2
        // the concave flute: a cosine groove between the arrises
        const fl = 1 - groove * (0.5 + 0.5 * Math.cos(a * flutes))
        const jag = i === rings ? topJag * (0.6 + 0.4 * Math.sin(a * 3 + cx)) : 0
        pts.push([cx + Math.cos(a) * r * fl, y + jag, cz + Math.sin(a) * r * fl])
      }
      ringPts.push(pts)
      ringY.push(y)
    }
    for (let i = 0; i < rings; i++) {
      const ca = this.colorAt(ringY[i]!, y1 - y0)
      const cb = this.colorAt(ringY[i + 1]!, y1 - y0)
      for (let j = 0; j < sides; j++) {
        const k = (j + 1) % sides
        this.tri(ringPts[i]![j]!, ringPts[i]![k]!, ringPts[i + 1]![j]!, ca, ca, cb)
        this.tri(ringPts[i]![k]!, ringPts[i + 1]![k]!, ringPts[i + 1]![j]!, ca, cb, cb)
      }
    }
  }

  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, tint = 0) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h
    const c0 = this.colorAt(y0, y1, tint)
    const c1 = this.colorAt(y1, y1, tint)
    const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, ca: THREE.Color, cb: THREE.Color) => {
      this.tri(a, b, c, ca, ca, cb)
      this.tri(a, c, d, ca, cb, cb)
    }
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], c0, c1)
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], c0, c1)
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], c0, c1)
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], c0, c1)
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], c1, c1)
  }

  /** a fluted column: plinth, torus base, tapered shaft, echinus + abacus (or a jagged break) */
  column(cx: number, cz: number, height: number, r: number, broken = false, seed = 1) {
    this.seed = seed * 977
    const brokenTop = broken ? height * (0.55 + 0.2 * hash(seed)) : height
    this.box(cx, 0, cz, r * 3.0, r * 0.32, r * 3.0, 0.05)
    this.box(cx, r * 0.32, cz, r * 2.6, r * 0.22, r * 2.6, 0.02)
    this.shaft(cx, cz, r * 0.54, brokenTop, r * 1.15, r * 0.94, 40, 20, 0.05, broken ? r * 0.55 : 0)
    if (!broken) {
      this.shaft(cx, cz, brokenTop, brokenTop + r * 0.42, r * 0.94, r * 1.35, 40, 20, 0.015)
      this.box(cx, brokenTop + r * 0.42, cz, r * 2.9, r * 0.3, r * 2.9, 0.0)
    }
  }

  /** a drum lying in the sand: a short cylinder on its side */
  drum(cx: number, cz: number, r: number, len: number, yaw: number) {
    const sides = 20
    const cy = r * 0.85
    const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw))
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    for (let j = 0; j < sides; j++) {
      const a0 = (j / sides) * Math.PI * 2, a1 = ((j + 1) / sides) * Math.PI * 2
      const p = (a: number, t: number): Vec3 => {
        const base = new THREE.Vector3(side.x * Math.cos(a) * r, Math.sin(a) * r + cy * 0.2, side.z * Math.cos(a) * r)
        return [cx + base.x + dir.x * t, base.y + r * 0.24, cz + base.z + dir.z * t]
      }
      const c0 = this.colorAt(cy * 0.5, r)
      const c1 = this.colorAt(cy * 1.4, r)
      this.tri(p(a0, -len / 2), p(a1, -len / 2), p(a1, len / 2), c0, c0, c1)
      this.tri(p(a0, -len / 2), p(a1, len / 2), p(a0, len / 2), c0, c1, c1)
      const cEnd = this.colorAt(cy, r)
      this.tri([cx + dir.x * len / 2, cy * 0.2, cz + dir.z * len / 2], p(a0, len / 2), p(a1, len / 2), cEnd, cEnd, cEnd)
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setIndex(this.idx)
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }
}

export function buildTemple(seed = 1) {
  const b = new Builder()
  // stepped platform
  b.box(0, 0, 0, 5.0, 0.2, 2.2, 0.08)
  b.box(0, 0.2, 0, 4.6, 0.16, 1.95, 0.04)
  const top = 0.4
  const r = 0.29
  // a row of five: three standing, two broken, the architrave resting on the standing three
  const xs = [-1.7, -0.85, 0.0, 0.85, 1.7]
  const hs = [2.15, 2.25, 2.1, 0, 1.15]
  xs.forEach((x, i) => {
    const h = hs[i]!
    if (h > 0) b.column(x, 0, top + h, r, i === 4, seed + i * 13)
    else b.column(x, 0, top + 1.7, r, true, seed + i * 13)
  })
  // the architrave: a dressed beam over the standing three, snapped at the fourth
  b.box(0.1, top + 2.25 + 0.04, 0, 3.4, 0.2, 0.42, 0.0)
  // a low, broken course of wall behind the columns
  b.box(-1.35, top, 0.95, 2.6, 0.85, 0.26, 0.12)
  b.box(-1.9, top + 0.85, 0.95, 1.4, 0.3, 0.28, 0.02)
  // fallen drums in front of the platform
  b.drum(-2.1, 1.25, r * 1.05, 0.75, 0.4)
  b.drum(2.35, 1.05, r * 1.0, 0.62, 2.3)
  b.drum(0.6, 1.6, r * 0.9, 0.5, 1.1)
  return b.geometry()
}

export function RuinTemple({
  position = [0, 0, 0],
  yaw = 0,
  scale = 1,
  seed = 1,
}: {
  position?: [number, number, number]
  yaw?: number
  scale?: number
  seed?: number
}) {
  const geo = useMemo(() => buildTemple(seed), [seed])
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, color: '#ffffff', roughness: 0.95, metalness: 0, emissive: new THREE.Color('#8a6540'), emissiveIntensity: 0.32 }),
    [],
  )
  return <mesh geometry={geo} material={mat} position={position} rotation={[0, yaw, 0]} scale={scale} />
}
