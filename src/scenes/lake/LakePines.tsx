import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyPainterlySurface } from '../scan/Fit'
import { lakeHeight } from './LakeGround'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Builds an airy, feathered alpine pine prototype (~3,600 tris):
 * - Slender sinuous bark trunk visible between open branch tiers
 * - 14 irregular whorls of splayed, drooping needle sprays (never solid cone blobs)
 * - Lit olive-green outer needles (#6f8f4c) over blue-green shaded interior (#3d5b52)
 */
function buildLayeredPinePrototype(seed: number): {
  trunkGeo: THREE.BufferGeometry
  foliageGeo: THREE.BufferGeometry
} {
  const rand = mulberry32(seed)

  // 1. Slender tapered trunk
  const trunkGeo = new THREE.CylinderGeometry(0.016, 0.075, 1.0, 9, 14)
  trunkGeo.translate(0, 0.5, 0)
  const tPos = trunkGeo.attributes.position as THREE.BufferAttribute
  const tCols = new Float32Array(tPos.count * 3)
  const cBarkBase = new THREE.Color('#4a433e')
  const cBarkMid = new THREE.Color('#746254')
  const tmp = new THREE.Color()

  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i)
    const y = tPos.getY(i)
    const z = tPos.getZ(i)
    const swayX = Math.sin(y * Math.PI * 1.15 + seed) * 0.015
    const swayZ = Math.cos(y * Math.PI * 0.95 + seed) * 0.012
    tPos.setXYZ(i, x + swayX, y, z + swayZ)

    tmp.copy(cBarkBase).lerp(cBarkMid, THREE.MathUtils.smoothstep(y, 0.0, 0.45))
    tCols[i * 3] = tmp.r
    tCols[i * 3 + 1] = tmp.g
    tCols[i * 3 + 2] = tmp.b
  }
  tPos.needsUpdate = true
  trunkGeo.setAttribute('color', new THREE.BufferAttribute(tCols, 3))
  trunkGeo.computeVertexNormals()

  // 2. A full, soft canopy: one noise-displaced inner volume that fills the cone, wrapped in
  //    overlapping needle pads so the silhouette feathers out instead of breaking into tiers.
  const boughParts: THREE.BufferGeometry[] = []
  const cDeep = new THREE.Color('#26403a')
  const cInterior = new THREE.Color('#47664f')
  const cMid = new THREE.Color('#6b8d55')
  const cLit = new THREE.Color('#8fa95e')
  const cTip = new THREE.Color('#b7c479')

  // inner canopy mass: a lathe cone warped by noise, dark shaded-green, fills every gap
  const profile: THREE.Vector2[] = []
  const rings = 16
  for (let r = 0; r <= rings; r++) {
    const t = r / rings
    const rad = Math.pow(1 - t, 0.74) * 0.36 + 0.010
    profile.push(new THREE.Vector2(rad, 0.12 + t * 0.86))
  }
  const core = new THREE.LatheGeometry(profile, 22)
  {
    const cp = core.attributes.position as THREE.BufferAttribute
    const cc = new Float32Array(cp.count * 3)
    for (let k = 0; k < cp.count; k++) {
      const x = cp.getX(k), y = cp.getY(k), z = cp.getZ(k)
      const ang = Math.atan2(z, x)
      const t = THREE.MathUtils.clamp((y - 0.12) / 0.86, 0, 1)
      const wob = 1 + 0.16 * Math.sin(ang * 5 + y * 9 + seed) + 0.09 * Math.cos(ang * 9 - y * 15 + seed * 2)
      cp.setXYZ(k, x * wob, y, z * wob)
      tmp.copy(cDeep).lerp(cInterior, THREE.MathUtils.smoothstep(t, 0.0, 0.6))
      cc[k * 3] = tmp.r
      cc[k * 3 + 1] = tmp.g
      cc[k * 3 + 2] = tmp.b
    }
    cp.needsUpdate = true
    core.computeVertexNormals()
    core.setAttribute('color', new THREE.BufferAttribute(cc, 3))
    const coreFlat = core.toNonIndexed()
    core.dispose?.()
    boughParts.push(coreFlat)
  }

  // needle pads: small smooth icospheres, squashed and noisy, layered over the core volume
  const padCount = 96
  const padIco = new THREE.IcosahedronGeometry(1, 1)
  for (let i = 0; i < padCount; i++) {
    const u = rand()
    const hf = 0.08 + Math.pow(u, 0.88) * 0.92 // biased low: the canopy is widest at the base
    const env = Math.pow(1 - hf, 0.72) * 0.36 + 0.016
    const az = rand() * Math.PI * 2
    const rad = env * (0.55 + 0.5 * Math.sqrt(rand()))
    const y = 0.13 + hf * 0.85 - (1 - hf) * 0.035
    const padR = (0.048 + env * 0.34) * (0.62 + 0.5 * rand())
    const pad = padIco.clone()
    const pp = pad.attributes.position as THREE.BufferAttribute
    const pc = new Float32Array(pp.count * 3)
    const phase = rand() * 6.28
    for (let k = 0; k < pp.count; k++) {
      let vx = pp.getX(k), vy = pp.getY(k), vz = pp.getZ(k)
      const ang = Math.atan2(vz, vx)
      const spike = 1 + 0.22 * Math.sin(ang * 6 + phase) + 0.12 * Math.cos(ang * 11 - phase)
      vx *= spike * padR
      vz *= spike * padR
      vy = vy * padR * 0.70
      pp.setXYZ(k, vx, vy, vz)
      // lit on top and toward the sun side, deep blue-green underneath
      const up = THREE.MathUtils.clamp(vy / Math.max(padR, 1e-4) + 0.55, 0, 1)
      const sunSide = THREE.MathUtils.clamp(vx / Math.max(padR, 1e-4) * 0.5 + 0.5, 0, 1)
      tmp.copy(cInterior).lerp(cMid, up * 0.7)
      tmp.lerp(cLit, up * sunSide * 0.8)
      tmp.lerp(cTip, up * up * 0.55)
      pc[k * 3] = tmp.r
      pc[k * 3 + 1] = tmp.g
      pc[k * 3 + 2] = tmp.b
    }
    pp.needsUpdate = true
    pad.setAttribute('color', new THREE.BufferAttribute(pc, 3))
    pad.computeVertexNormals()
    pad.translate(Math.cos(az) * rad, y, Math.sin(az) * rad)
    boughParts.push(pad)
  }
  padIco.dispose()

  // soft leader spire at the apex
  const apex = new THREE.IcosahedronGeometry(0.05, 2)
  apex.scale(0.55, 2.3, 0.55)
  apex.translate(0, 0.99, 0)
  const aPos = apex.attributes.position as THREE.BufferAttribute
  const aCols = new Float32Array(aPos.count * 3)
  for (let k = 0; k < aPos.count; k++) {
    tmp.copy(cMid).lerp(cTip, THREE.MathUtils.smoothstep(aPos.getY(k), 0.95, 1.11))
    aCols[k * 3] = tmp.r
    aCols[k * 3 + 1] = tmp.g
    aCols[k * 3 + 2] = tmp.b
  }
  apex.setAttribute('color', new THREE.BufferAttribute(aCols, 3))
  apex.computeVertexNormals()
  boughParts.push(apex)

  const foliageGeo = mergeGeometries(boughParts, false)
  boughParts.forEach((p) => p.dispose())

  return { trunkGeo, foliageGeo }
}

export type PinePlacement = {
  x: number
  z: number
  height: number
  yaw: number
  lean: number
  tint: string
}

export const LAKE_PINES: PinePlacement[] = [
  // Left rocky headland cluster (smaller 1.65 - 2.55 m trees matching ref left point)
  { x: -8.6, z: -8.8, height: 2.2, yaw: 0.4, lean: 0.03, tint: '#cfe0c6' },
  { x: -7.5, z: -8.1, height: 2.55, yaw: 1.8, lean: -0.02, tint: '#d6e6cc' },
  { x: -6.4, z: -9.4, height: 1.85, yaw: 2.7, lean: 0.04, tint: '#c9dcc6' },
  { x: -9.8, z: -10.2, height: 2.35, yaw: 1.1, lean: -0.03, tint: '#c6d8cd' },
  { x: -5.2, z: -10.6, height: 1.65, yaw: 0.9, lean: 0.02, tint: '#cfe2c9' },

  // Right shoreline stand pulled back to x >= 9.5, z <= -12.8 (2.85 - 5.5 m, fading blue with distance)
  { x: 9.5, z: -12.8, height: 2.95, yaw: 0.6, lean: -0.02, tint: '#d8e8ce' },
  { x: 10.9, z: -14.2, height: 3.55, yaw: 2.1, lean: 0.02, tint: '#d0e2c8' },
  { x: 12.2, z: -15.8, height: 4.1, yaw: 1.4, lean: -0.02, tint: '#c8dcc6' },
  { x: 9.9, z: -16.4, height: 3.15, yaw: 2.9, lean: 0.03, tint: '#c4d8c8' },
  { x: 13.8, z: -18.2, height: 4.55, yaw: 0.3, lean: 0.02, tint: '#c8dce6' },
  { x: 11.6, z: -19.6, height: 3.85, yaw: 1.9, lean: -0.03, tint: '#c2d8e8' },
  { x: 15.6, z: -21.5, height: 4.95, yaw: 2.4, lean: 0.01, tint: '#bcd4ea' },
  { x: 13.4, z: -23.4, height: 4.4, yaw: 0.8, lean: -0.02, tint: '#b6d0ec' },
  { x: 17.5, z: -25.8, height: 5.5, yaw: 1.5, lean: 0.02, tint: '#b0ccee' },
]

export function LakePines({
  trees = LAKE_PINES,
  sunDir = [0.48, 0.56, -0.67],
}: {
  trees?: PinePlacement[]
  sunDir?: [number, number, number]
}) {
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const foliageRef = useRef<THREE.InstancedMesh>(null)

  const { trunkGeo, foliageGeo, trunkMat, foliageMat } = useMemo(() => {
    const proto = buildLayeredPinePrototype(42)

    const tMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
    })
    applyPainterlySurface(tMat, {
      soft: 0.8,
      rimColor: '#fff0cc',
      shadowTint: '#485862',
      sunDir,
      brush: 0.7,
    })

    const fMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.84,
      metalness: 0,
    })
    applyPainterlySurface(fMat, {
      soft: 0.98,
      rimColor: '#fff8dc',
      shadowTint: '#4a6a58',
      sunDir,
    })

    return {
      trunkGeo: proto.trunkGeo,
      foliageGeo: proto.foliageGeo,
      trunkMat: tMat,
      foliageMat: fMat,
    }
  }, [sunDir])

  useLayoutEffect(() => {
    const tm = trunkRef.current
    const fm = foliageRef.current
    if (!tm || !fm) return

    const dummy = new THREE.Object3D()
    const col = new THREE.Color()

    trees.forEach((tree, i) => {
      const y = lakeHeight(tree.x, tree.z) - 0.05
      const widthScale = tree.height * (0.76 + (i % 3) * 0.07)
      dummy.position.set(tree.x, y, tree.z)
      dummy.rotation.set(tree.lean, tree.yaw, -tree.lean * 0.7)
      dummy.scale.set(widthScale, tree.height, widthScale)
      dummy.updateMatrix()

      tm.setMatrixAt(i, dummy.matrix)
      fm.setMatrixAt(i, dummy.matrix)

      col.set(tree.tint)
      fm.setColorAt(i, col)
    })

    tm.instanceMatrix.needsUpdate = true
    fm.instanceMatrix.needsUpdate = true
    if (fm.instanceColor) fm.instanceColor.needsUpdate = true
  }, [trees])

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[trunkGeo, trunkMat, trees.length]} />
      <instancedMesh ref={foliageRef} args={[foliageGeo, foliageMat, trees.length]} />
    </group>
  )
}
