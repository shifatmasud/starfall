import * as THREE from 'three'
import type { GrassInstance } from './models/GrassMedium02'

/** Deterministic hash noise so every render scatters the same field. */
export const hash = (x: number, y: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return h - Math.floor(h)
}
export function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
export const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export type ScatterOpts = {
  count: number
  /** z range (negative is away from camera) */
  z: [number, number]
  /** half-width of the field at depth z */
  halfW: (z: number) => number
  /** 0..1 density multiplier at (x, z); 1 where grass may grow, 0 where it may not */
  mask?: (x: number, z: number) => number
  /** base scale of a tuft, and its random spread */
  scale: [number, number]
  /** share of the small tuft (0) vs the large one (1) */
  smallShare?: number
  y?: number
  seed?: number
  /** tint ramp: shade, mid, light */
  tints?: [THREE.Color, THREE.Color, THREE.Color]
}

/** Clumped drifts (not an even lawn) of scanned tufts, as instance records for GrassMedium02Field. */
export function scatterTufts(o: ScatterOpts): GrassInstance[] {
  const out: GrassInstance[] = []
  const [deep, mid, light] = o.tints ?? [new THREE.Color(0.72, 0.85, 0.6), new THREE.Color(1.0, 1.12, 0.8), new THREE.Color(1.3, 1.22, 0.95)]
  const seed = o.seed ?? 0
  let i = 0
  while (out.length < o.count && i < o.count * 25) {
    i++
    const k = i + seed * 1000
    const z = o.z[0] - (o.z[0] - o.z[1]) * hash(k * 1.37, 7.1)
    const x = (hash(k * 2.11, 3.3) * 2 - 1) * o.halfW(z)
    const clump = sstep(0.22, 0.55, vnoise(x * 2.4 + 3.1 + seed, z * 2.4 - 1.7) * 0.7 + vnoise(x * 7.0, z * 7.0) * 0.3)
    const keep = clump * (o.mask ? o.mask(x, z) : 1)
    if (hash(k * 5.3, 1.9) > keep) continue
    const tuft = hash(k * 9.7, 4.4) < (o.smallShare ?? 0.55) ? 0 : 1
    const scale = o.scale[0] + o.scale[1] * hash(k * 3.9, 8.8)
    const t = hash(k * 6.1, 2.2)
    out.push({ x, y: o.y ?? -0.005, z, scale, yaw: hash(k * 4.7, 6.6) * Math.PI * 2, tuft, tint: deep.clone().lerp(mid, sstep(0, 0.6, t)).lerp(light, sstep(0.55, 1, t)) })
  }
  return out
}
