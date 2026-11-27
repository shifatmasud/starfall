import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyPainterlySurface } from '../scan/Fit'

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return s - Math.floor(s)
}

function vnoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

/** ridged fbm: sharp crests, the way a glacier breaks */
function ridge(x: number, y: number, oct = 4): number {
  let v = 0
  let amp = 0.55
  let f = 1
  for (let i = 0; i < oct; i++) {
    v += amp * (1 - Math.abs(vnoise(x * f, y * f) * 2 - 1))
    f *= 2.07
    amp *= 0.52
  }
  return v
}

/**
 * One sculpted berg: a high-subdivision ellipsoid carved by ridged noise into a glacial mass with a
 * sharp crest, fluted sides and a thin shelf at the waterline. Vertex colours carry the whole read:
 * snow-lit crown, pale blue flanks, and a turquoise translucent skirt under the waterline.
 */
function buildBerg(seed: number, variant: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 64, 40)
  const pos = g.attributes.position as THREE.BufferAttribute
  const col = new Float32Array(pos.count * 3)

  const cSnow = new THREE.Color('#fbfdff')
  const cLit = new THREE.Color('#eef6ff')
  const cFlank = new THREE.Color('#cfe2f6')
  const cShade = new THREE.Color('#8fb4dc')
  const cSkirt = new THREE.Color('#4fb6d4')
  const cDeep = new THREE.Color('#1f7fa6')
  const tmp = new THREE.Color()

  const stretch = 1.0 + 0.35 * hash2(seed, 3.1)
  for (let i = 0; i < pos.count; i++) {
    const x0 = pos.getX(i)
    const y0 = pos.getY(i)
    const z0 = pos.getZ(i)
    const ang = Math.atan2(z0, x0)

    // ridge crest running along x, plus fluted buttresses down the flanks
    const crest = Math.pow(ridge(x0 * 2.1 + seed, z0 * 1.5, 5), 1.25)
    const flutes = 1 + 0.06 * Math.sin(ang * (7 + variant * 2) + seed)
    let x = x0 * (0.92 + 0.5 * (crest - 0.5)) * stretch * flutes
    let z = z0 * (0.86 + 0.45 * (crest - 0.5)) * flutes
    let y = y0
    if (y > 0) {
      // the top is cut into a ridge with a notch: higher near the crest line, lower at the ends
      const notch = 1 - 0.45 * Math.pow(Math.abs(x0) * 0.9, 2)
      y = y * (0.30 + 1.35 * crest) * Math.max(0.3, notch)
    } else {
      // below the waterline the mass spreads into a shelf and sinks fast
      y *= 0.55
      x *= 1.06
      z *= 1.06
    }
    // a flat shelf just above the water, so the berg sits in the sea rather than floating
    if (y > -0.04 && y < 0.10) y = 0.02 + (y + 0.04) * 0.35
    pos.setXYZ(i, x, y, z)

    const up = THREE.MathUtils.clamp(y0 * 0.5 + 0.5, 0, 1)
    const crestLit = THREE.MathUtils.clamp(crest * 1.15 - 0.2, 0, 1)
    if (y < 0) {
      const d = THREE.MathUtils.smoothstep(y, -0.75, 0.0)
      tmp.copy(cDeep).lerp(cSkirt, d * 0.85)
    } else {
      tmp.copy(cShade).lerp(cFlank, THREE.MathUtils.smoothstep(y, 0.0, 0.35))
      tmp.lerp(cLit, THREE.MathUtils.smoothstep(y, 0.25, 0.72))
      tmp.lerp(cSnow, THREE.MathUtils.smoothstep(y, 0.6, 1.0) * (0.55 + 0.45 * crestLit))
      tmp.lerp(cSnow, THREE.MathUtils.smoothstep(up, 0.45, 0.95) * 0.35)
    }
    col[i * 3] = tmp.r
    col[i * 3 + 1] = tmp.g
    col[i * 3 + 2] = tmp.b
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

export type BergSpec = {
  x: number
  z: number
  scale: [number, number, number]
  yaw: number
  seed: number
  variant: number
}

/** sculpted bergs: near-field giants, mid distance, and the brash of small floes to the horizon */
export const ICE_BERGS: BergSpec[] = [
  { x: -3.6, z: -11.0, scale: [1.6, 0.75, 1.25], yaw: 0.4, seed: 1, variant: 0 },
  { x: 2.3, z: -9.4, scale: [1.0, 0.5, 0.85], yaw: 2.1, seed: 2, variant: 1 },
  { x: 6.2, z: -14.0, scale: [1.8, 0.85, 1.4], yaw: 1.2, seed: 3, variant: 2 },
  { x: -8.2, z: -17.5, scale: [2.1, 1.0, 1.6], yaw: 2.8, seed: 4, variant: 0 },
  { x: 0.2, z: -6.2, scale: [0.5, 0.28, 0.42], yaw: 0.9, seed: 5, variant: 1 },
  { x: 9.6, z: -21.0, scale: [2.4, 1.15, 1.9], yaw: 0.2, seed: 6, variant: 2 },
  { x: -4.6, z: -25.0, scale: [3.0, 1.35, 2.2], yaw: 1.7, seed: 7, variant: 0 },
  { x: 4.4, z: -29.0, scale: [3.4, 1.5, 2.5], yaw: 2.4, seed: 8, variant: 1 },
  { x: -13.0, z: -32.0, scale: [4.0, 1.7, 2.8], yaw: 0.6, seed: 9, variant: 2 },
  { x: 13.0, z: -36.0, scale: [4.6, 1.9, 3.3], yaw: 1.1, seed: 10, variant: 0 },
]

export function IceBergs({
  bergs = ICE_BERGS,
  sunDir = [0.45, 0.36, -0.82],
}: {
  bergs?: BergSpec[]
  sunDir?: [number, number, number]
}) {
  const { geo, mat } = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (const b of bergs) {
      const g = buildBerg(b.seed, b.variant)
      g.scale(b.scale[0], b.scale[1], b.scale[2])
      g.rotateY(b.yaw)
      g.translate(b.x, -0.12 * b.scale[1], b.z)
      parts.push(g)
    }
    const merged = mergeGeometries(parts, false)
    parts.forEach((p) => p.dispose())

    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.42,
      metalness: 0,
      emissive: new THREE.Color('#123a52'),
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.98,
    })
    applyPainterlySurface(m, { soft: 0.9, rimColor: '#ffffff', shadowTint: '#7aa2cc', sunDir })
    return { geo: merged, mat: m }
  }, [bergs, sunDir])

  return <mesh geometry={geo} material={mat} />
}
