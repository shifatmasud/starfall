import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * A real conifer, built the way one grows.
 *
 * Nine (or six, far away) tiers of drooping boughs spiral up a tapered stem: each bough is a
 * flattened, tapered, slightly curved needle mass with its own ragged tip, its length, droop and
 * azimuth jittered per bough, and each tier's radius falls off with height. The boughs of one tier
 * overlap their neighbours and the tiers overlap each other, so the crown is a dense, layered,
 * asymmetric mass — visible horizontal skirt lines, sky showing between the outer tips, a dark
 * interior — rather than a lathed cone.
 *
 * Vertex colours carry the needle paint: a hash mottle of light and dark needle clusters, deep
 * green in the interior and under each bough, warm sunlit olive on the top of every bough, pale gold
 * at the tips, and a vertical AO across the whole crown. All shading is smooth (normals recomputed),
 * no facet anywhere.
 */

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return s - Math.floor(s)
}

export type ConiferOptions = {
  seed?: number
  /** bough rings up the crown */
  tiers?: number
  /** boughs per ring */
  perTier?: number
  /** sphere segments for one bough (widthSegments, heightSegments) */
  seg?: [number, number]
  /** where the crown begins, as a fraction of its height */
  lift?: number
  /** crown radius as a fraction of height */
  width?: number
}

export function buildSoftConifer({
  seed = 3,
  tiers = 9,
  perTier = 5,
  seg = [8, 5],
  lift = 0.1,
  width = 0.42,
}: ConiferOptions = {}): THREE.BufferGeometry {
  const phase = hash2(seed, 1.7) * 6.2831853
  const top = 0.98
  const parts: THREE.BufferGeometry[] = []

  const cUnder = new THREE.Color('#1d2e1b')
  const cBase = new THREE.Color('#2f4728')
  const cMid = new THREE.Color('#4d6a38')
  const cLit = new THREE.Color('#87a355')
  const cTip = new THREE.Color('#c3d089')
  const tmp = new THREE.Color()

  const paint = (g: THREE.BufferGeometry, yRef: number, reach: number) => {
    const pos = g.attributes.position as THREE.BufferAttribute
    const nrm = g.attributes.normal as THREE.BufferAttribute
    const cols = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const up = THREE.MathUtils.clamp(nrm.getY(i) * 0.5 + 0.5, 0, 1)
      const height = THREE.MathUtils.clamp((y - lift) / (top - lift), 0, 1)
      const outward = THREE.MathUtils.clamp(Math.hypot(x, z) / Math.max(reach, 1e-3), 0, 1)
      // needle clusters: a value mottle in local space, so a bough is never one flat colour
      const mottle = hash2(Math.floor(x * 26 + seed * 5), Math.floor(z * 26 + y * 34 + yRef * 7))
      tmp.copy(cUnder).lerp(cBase, up * 0.9 + mottle * 0.25)
      tmp.lerp(cMid, up * 0.8 * (0.7 + 0.45 * mottle))
      tmp.lerp(cLit, Math.pow(up, 1.5) * (0.25 + 0.4 * height) * (0.6 + 0.7 * mottle))
      tmp.lerp(cTip, Math.pow(outward, 2.4) * Math.pow(up, 1.1) * 0.65 * (0.5 + mottle))
      tmp.multiplyScalar(0.78 + 0.22 * THREE.MathUtils.smoothstep(height, 0.0, 0.5))
      cols[i * 3] = tmp.r
      cols[i * 3 + 1] = tmp.g
      cols[i * 3 + 2] = tmp.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
  }

  // the stem: a tapered trunk the crown is built around (its lower half stays visible)
  const trunk = new THREE.CylinderGeometry(width * 0.05, width * 0.11, top, 7, 3, true)
  trunk.translate(0, top * 0.5, 0)
  trunk.computeVertexNormals()
  {
    const pos = trunk.attributes.position as THREE.BufferAttribute
    const cols = new Float32Array(pos.count * 3)
    const bark = new THREE.Color('#4a3a2c')
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / top
      cols[i * 3] = bark.r * (0.8 + 0.4 * t)
      cols[i * 3 + 1] = bark.g * (0.8 + 0.4 * t)
      cols[i * 3 + 2] = bark.b * (0.8 + 0.4 * t)
    }
    trunk.setAttribute('color', new THREE.BufferAttribute(cols, 3))
  }
  parts.push(trunk)

  // a narrow inner mass, so looking up through the boughs shows shadowed foliage, not sky
  const core = new THREE.SphereGeometry(1, seg[0], seg[1])
  core.scale(width * 0.3, (top - lift) * 0.5, width * 0.3)
  core.translate(0, lift + (top - lift) * 0.44, 0)
  core.computeVertexNormals()
  paint(core, lift, width * 0.4)
  parts.push(core)

  for (let t = 0; t < tiers; t++) {
    const tt = t / Math.max(1, tiers - 1)
    const y = lift + tt * (top - lift) * 0.9
    const ring = width * Math.pow(1 - tt, 0.82) + 0.03
    const count = perTier + (tt < 0.55 ? 1 : 0)
    for (let k = 0; k < count; k++) {
      const ang = (k / count) * Math.PI * 2 + t * 0.92 + phase
      const len = ring * (0.9 + 0.42 * hash2(seed + t * 4.3, k * 6.1)) * (0.85 + 0.3 * hash2(seed + 2.1, t))
      const thick = len * (0.3 + 0.12 * hash2(seed + 5.7, k + t))
      // the bough: a flattened ellipsoid reaching out and drooping, then a small ragged tip
      const g = new THREE.SphereGeometry(1, seg[0], seg[1])
      g.scale(len, thick * 0.62, thick)
      g.translate(len * 0.62, 0, 0)
      g.rotateZ(-(0.3 + 0.16 * hash2(seed + 9.1, t * 2.7 + k)))
      g.rotateY(ang + (hash2(seed + k, t) - 0.5) * 0.35)
      g.translate(0, y - tt * 0.02, 0)
      g.computeVertexNormals()
      paint(g, y, len * 1.5)
      parts.push(g)

      const tipLen = len * (0.5 + 0.2 * hash2(seed + 3.3, t + k * 2.2))
      const tipG = new THREE.SphereGeometry(1, Math.max(5, seg[0] - 3), Math.max(3, seg[1] - 1))
      tipG.scale(tipLen * 0.5, thick * 0.34, thick * 0.55)
      tipG.translate(len * 1.12, -thick * 0.55, 0)
      tipG.rotateY(ang + (hash2(seed + k, t) - 0.5) * 0.35)
      tipG.translate(0, y - tt * 0.02 - len * 0.1, 0)
      tipG.computeVertexNormals()
      paint(tipG, y, len * 1.6)
      parts.push(tipG)
    }
  }

  // the leader: a soft spire just past the last tier
  const leadH = (top - lift) * 0.2
  const leader = new THREE.ConeGeometry(width * 0.1, leadH, 7, 2, true)
  leader.translate(0, top - leadH * 0.3, 0)
  leader.computeVertexNormals()
  paint(leader, top, width * 0.3)
  parts.push(leader)

  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return merged
}
