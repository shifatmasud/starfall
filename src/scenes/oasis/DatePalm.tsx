import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyPainterlySurface } from '../scan/Fit'

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

/** Builds a single arched pinnate palm frond with V-folded tapering leaflets */
function buildFrondGeometry(length: number, droop: number, arch: number, seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []

  // Central rachis spine (tapered 4-sided tube along curve)
  const spinePts: THREE.Vector3[] = []
  const steps = 10
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const z = t * length
    const y = Math.sin(t * Math.PI * 0.72) * arch - Math.pow(t, 2.1) * droop
    const x = Math.sin(t * 2.4 + seed) * 0.04 * length
    spinePts.push(new THREE.Vector3(x, y, z))
  }
  const curve = new THREE.CatmullRomCurve3(spinePts)
  const rachis = new THREE.TubeGeometry(curve, 10, 0.016, 5, false)
  // Color rachis warm olive-ochre
  const rPos = rachis.attributes.position
  const rCols = new Float32Array(rPos.count * 3)
  const cStem = new THREE.Color('#8e8c4e')
  for (let i = 0; i < rPos.count; i++) {
    rCols[i * 3] = cStem.r
    rCols[i * 3 + 1] = cStem.g
    rCols[i * 3 + 2] = cStem.b
  }
  rachis.setAttribute('color', new THREE.BufferAttribute(rCols, 3))
  // the leaflets carry no uv: strip the tube's so the merge can share one attribute set
  rachis.deleteAttribute('uv')
  parts.push(rachis)

  // Pinnate leaflets along both sides of the rachis (15 pairs = 30 leaflets)
  const pairs = 19
  const cBase = new THREE.Color('#33502c')
  const cMid = new THREE.Color('#4f6f3a')
  const cTip = new THREE.Color('#8a9d4e')
  const cDry = new THREE.Color('#bfa462')
  const tmp = new THREE.Color()

  for (let p = 1; p <= pairs; p++) {
    const u = p / (pairs + 1)
    const pt = curve.getPoint(u)
    const tan = curve.getTangent(u).normalize()
    // Envelope: short near petiole, longest at 45%, tapering cleanly to tip
    const env = Math.sin(Math.pow(u, 0.78) * Math.PI)
    const leafLen = length * (0.11 + 0.25 * env) * (0.9 + 0.2 * rand())
    const leafW = 0.022 + 0.014 * env

    for (const side of [-1, 1]) {
      // Each leaflet is a 2-segment bent ribbon (4 tris) so it droops naturally under gravity
      const g = new THREE.BufferGeometry()
      const splay = 0.62 + 0.28 * (1 - u) // angles forward toward frond tip
      const lift = (0.28 - 0.55 * u) + (rand() - 0.5) * 0.12
      const dir = new THREE.Vector3(
        side * Math.sin(splay),
        lift,
        Math.cos(splay) * 0.65,
      ).normalize()
      // Rotate leaflet direction slightly with spine tangent
      dir.y += tan.y * 0.45
      dir.normalize()

      const midPt = pt.clone().addScaledVector(dir, leafLen * 0.55)
      const tipPt = pt.clone().addScaledVector(dir, leafLen).add(new THREE.Vector3(0, -leafLen * 0.24, 0))
      const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(leafW)

      const v0 = pt.clone().sub(perp.clone().multiplyScalar(0.45))
      const v1 = pt.clone().add(perp.clone().multiplyScalar(0.45))
      const v2 = midPt.clone().sub(perp)
      const v3 = midPt.clone().add(perp)
      const v4 = tipPt

      const positions = new Float32Array([
        v0.x, v0.y, v0.z,
        v1.x, v1.y, v1.z,
        v2.x, v2.y, v2.z,
        v3.x, v3.y, v3.z,
        v4.x, v4.y, v4.z,
      ])
      const indices = [0, 2, 1, 1, 2, 3, 2, 4, 3]
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      g.setIndex(indices)
      g.computeVertexNormals()

      // Flip normal slightly upward so sky fill catches the top of every leaflet
      const nAttr = g.attributes.normal as THREE.BufferAttribute
      for (let k = 0; k < nAttr.count; k++) {
        nAttr.setY(k, Math.abs(nAttr.getY(k)) * 0.7 + 0.3)
      }

      // Vertex color gradient: deep sage at rachis -> sunlit olive -> warm golden tip
      const cols = new Float32Array(5 * 3)
      const c0 = tmp.copy(cBase).lerp(cMid, u * 0.5).clone()
      const c1 = tmp.copy(cMid).lerp(cTip, 0.45 + u * 0.4).clone()
      const c2 = tmp.copy(cTip).lerp(cDry, droop > 0.75 ? 0.55 : 0.18).clone()
      const vertCols = [c0, c0, c1, c1, c2]
      for (let k = 0; k < 5; k++) {
        cols[k * 3] = vertCols[k].r
        cols[k * 3 + 1] = vertCols[k].g
        cols[k * 3 + 2] = vertCols[k].b
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
      parts.push(g)
    }
  }

  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return merged
}

export function DatePalm({
  position = [0, 0, 0],
  height = 4.4,
  lean = 0.12,
  yaw = 0,
  seed = 1,
  sunDir = [-5, 6.5, -3],
}: {
  position?: [number, number, number]
  height?: number
  lean?: number
  yaw?: number
  seed?: number
  sunDir?: [number, number, number]
}) {
  const { trunkGeo, crownGeo, trunkMat, frondMat } = useMemo(() => {
    const rand = mulberry32(seed * 97 + 13)

    // 1. Curved, ringed date-palm trunk
    const radialSegs = 14
    const heightSegs = 36
    const tGeo = new THREE.CylinderGeometry(0.11, 0.23, height, radialSegs, heightSegs, false)
    tGeo.translate(0, height * 0.5, 0)

    const pos = tGeo.attributes.position as THREE.BufferAttribute
    const cols = new Float32Array(pos.count * 3)
    const cBarkDark = new THREE.Color('#5a4334')
    const cBarkMid = new THREE.Color('#8d6c52')
    const cBarkCrown = new THREE.Color('#b48d68')
    const tmp = new THREE.Color()

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const t = THREE.MathUtils.clamp(y / height, 0, 1)

      // Sawtooth leaf-scar rings along trunk + flared fibrous skirt just under crown
      const ring = Math.pow(Math.abs(Math.sin(t * height * 11.5)), 0.65) * 0.016
      const skirt = THREE.MathUtils.smoothstep(t, 0.86, 1.0) * 0.09
      const radialScale = 1 + ring + skirt

      // Natural S-curve lean
      const bendX = Math.sin(t * Math.PI * 0.85) * lean * height * 0.38
      const bendZ = Math.cos(t * Math.PI * 0.5) * lean * height * 0.12 - lean * height * 0.12

      pos.setXYZ(i, x * radialScale + bendX, y, z * radialScale + bendZ)

      // Base AO -> warm sunlit bark -> golden fibrous crown skirt
      const baseAO = THREE.MathUtils.smoothstep(t, 0.0, 0.14)
      const underCrownAO = 1 - THREE.MathUtils.smoothstep(t, 0.92, 1.0) * 0.35
      tmp.copy(cBarkDark).lerp(cBarkMid, baseAO).lerp(cBarkCrown, THREE.MathUtils.smoothstep(t, 0.78, 0.96))
      tmp.multiplyScalar(0.75 + 0.25 * underCrownAO)

      cols[i * 3] = tmp.r
      cols[i * 3 + 1] = tmp.g
      cols[i * 3 + 2] = tmp.b
    }
    pos.needsUpdate = true
    tGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    tGeo.computeVertexNormals()

    // 2. Crown of 26 pinnate fronds arranged in 3 phyllotactic tiers
    const topX = Math.sin(Math.PI * 0.85) * lean * height * 0.38
    const topY = height * 0.97
    const topZ = -lean * height * 0.12

    const frondGeos: THREE.BufferGeometry[] = []
    const tiers = [
      { count: 7, pitch: -0.62, len: height * 0.42, droop: 0.32, arch: 0.38 }, // ascending inner spears
      { count: 10, pitch: -0.14, len: height * 0.54, droop: 0.65, arch: 0.46 }, // sweeping middle plumes
      { count: 9, pitch: 0.34, len: height * 0.50, droop: 0.92, arch: 0.32 }, // lower drooping sunlit fronds
    ]

    let idx = 0
    tiers.forEach((tier, tIdx) => {
      for (let k = 0; k < tier.count; k++) {
        idx++
        const az = (k / tier.count) * Math.PI * 2 + tIdx * 0.55 + (rand() - 0.5) * 0.24
        const fLen = tier.len * (0.88 + 0.24 * rand())
        const fg = buildFrondGeometry(fLen, tier.droop, tier.arch, seed * 31 + idx)
        const m = new THREE.Matrix4()
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(tier.pitch + (rand() - 0.5) * 0.14, az, (rand() - 0.5) * 0.18, 'YXZ'),
        )
        m.compose(new THREE.Vector3(topX, topY - tIdx * 0.08, topZ), q, new THREE.Vector3(1, 1, 1))
        fg.applyMatrix4(m)
        frondGeos.push(fg)
      }
    })

    const cGeo = mergeGeometries(frondGeos, false)
    frondGeos.forEach((fg) => fg.dispose())

    const tMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
    })
    applyPainterlySurface(tMat, {
      soft: 0.85,
      rimColor: '#ffe8c2',
      shadowTint: '#5c463d',
      sunDir,
    })

    const fMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    applyPainterlySurface(fMat, {
      soft: 0.95,
      rimColor: '#fff2be',
      shadowTint: '#365446',
      sunDir,
    })

    return { trunkGeo: tGeo, crownGeo: cGeo, trunkMat: tMat, frondMat: fMat }
  }, [height, lean, seed, sunDir])

  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <mesh geometry={trunkGeo} material={trunkMat} />
      <mesh geometry={crownGeo} material={frondMat} />
    </group>
  )
}