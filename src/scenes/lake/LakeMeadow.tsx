import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyPainterlySurface } from '../scan/Fit'
import { lakeHeight, lakeShoreZ } from './LakeGround'

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return s - Math.floor(s)
}

/**
 * Fine meadow grass tuft (6 slender tapering blades, 0.10-0.15 m tall, 0.0075 m base width):
 * Upward-biased normals + warm chartreuse-yellow tip gradient prevent dark edge needles.
 */
function buildGrassTuftGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = []
  const bladeCount = 6

  const cBase = new THREE.Color('#93b158')
  const cMid = new THREE.Color('#c3d97e')
  const cTip = new THREE.Color('#eef0ac')
  const tmp = new THREE.Color()

  for (let b = 0; b < bladeCount; b++) {
    const az = (b / bladeCount) * Math.PI * 2 + b * 0.52
    const h = 0.105 + (b % 4) * 0.014
    const lean = 0.045 + (b % 3) * 0.022
    const wBase = 0.0075

    const segs = 3
    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const indices: number[] = []

    const dx = Math.cos(az)
    const dz = Math.sin(az)
    const px = -dz
    const pz = dx

    for (let s = 0; s <= segs; s++) {
      const t = s / segs
      const w = wBase * (1 - t * 0.96)
      const bend = Math.pow(t, 1.7) * lean
      const cx = dx * bend
      const cy = h * t * (1 - 0.12 * t)
      const cz = dz * bend

      positions.push(cx - px * w, cy, cz - pz * w, cx + px * w, cy, cz + pz * w)
      normals.push(dx * 0.2, 0.96, dz * 0.2, dx * 0.2, 0.96, dz * 0.2)

      tmp
        .copy(cBase)
        .lerp(cMid, THREE.MathUtils.smoothstep(t, 0.0, 0.55))
        .lerp(cTip, THREE.MathUtils.smoothstep(t, 0.45, 1.0))
      colors.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b)

      if (s < segs) {
        const r0 = s * 2
        const r1 = (s + 1) * 2
        indices.push(r0, r1, r0 + 1, r0 + 1, r1, r1 + 1)
      }
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    g.setIndex(indices)
    blades.push(g)
  }

  const merged = mergeGeometries(blades, false)
  blades.forEach((b) => b.dispose())
  return merged
}

/**
 * Compact wild alpine daisy (~0.072 m head diameter, 0.105 m stem height):
 * 8 slim rounded petals (#fdfaf0 -> #ffffff) around a buttery golden disc (#f6cf6a).
 */
function buildDaisyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const headY = 0.105

  // Slender green stem
  const stem = new THREE.CylinderGeometry(0.0022, 0.0032, headY, 5)
  stem.translate(0, headY * 0.5, 0)
  const sPos = stem.attributes.position as THREE.BufferAttribute
  const sCols = new Float32Array(sPos.count * 3)
  const cStem = new THREE.Color('#88aa58')
  for (let i = 0; i < sPos.count; i++) {
    sCols[i * 3] = cStem.r
    sCols[i * 3 + 1] = cStem.g
    sCols[i * 3 + 2] = cStem.b
  }
  stem.setAttribute('color', new THREE.BufferAttribute(sCols, 3))
  parts.push(stem)

  // Buttery golden center button
  const center = new THREE.SphereGeometry(0.011, 10, 6)
  center.scale(1.0, 0.55, 1.0)
  center.translate(0, headY + 0.002, 0)
  const cPos = center.attributes.position as THREE.BufferAttribute
  const cCols = new Float32Array(cPos.count * 3)
  const cDisc = new THREE.Color('#f6cf6a')
  for (let i = 0; i < cPos.count; i++) {
    cCols[i * 3] = cDisc.r
    cCols[i * 3 + 1] = cDisc.g
    cCols[i * 3 + 2] = cDisc.b
  }
  center.setAttribute('color', new THREE.BufferAttribute(cCols, 3))
  parts.push(center)

  // 8 slim rounded warm-white petals (~0.036 m radius -> ~0.072 m across)
  const petals = 8
  const cPetalBase = new THREE.Color('#fdfaf0')
  const cPetalTip = new THREE.Color('#ffffff')
  for (let p = 0; p < petals; p++) {
    const ang = (p / petals) * Math.PI * 2
    const petal = new THREE.CircleGeometry(0.014, 8)
    petal.scale(0.46, 1.35, 1.0) // slim rounded ellipse
    petal.rotateX(-Math.PI * 0.45)
    petal.translate(0, headY + 0.001, 0.021)
    petal.rotateY(ang)

    const pPos = petal.attributes.position as THREE.BufferAttribute
    const pCols = new Float32Array(pPos.count * 3)
    const pNorm = petal.attributes.normal as THREE.BufferAttribute
    for (let k = 0; k < pPos.count; k++) {
      const r = Math.hypot(pPos.getX(k), pPos.getZ(k))
      const t = THREE.MathUtils.clamp((r - 0.008) / 0.028, 0, 1)
      const col = cPetalBase.clone().lerp(cPetalTip, t)
      pCols[k * 3] = col.r
      pCols[k * 3 + 1] = col.g
      pCols[k * 3 + 2] = col.b
      pNorm.setXYZ(k, 0, 1, 0)
    }
    petal.setAttribute('color', new THREE.BufferAttribute(pCols, 3))
    parts.push(petal)
  }

  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return merged
}

/** Painted mossy lakeside boulder for foreground shoreline & headland */
export function LakesideBoulder({
  position = [0, 0, 0],
  scale = [1, 0.65, 0.9],
  yaw = 0,
  seed = 1,
  sunDir = [0.48, 0.56, -0.67],
}: {
  position?: [number, number, number]
  scale?: [number, number, number]
  yaw?: number
  seed?: number
  sunDir?: [number, number, number]
}) {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 3)
    const pos = g.attributes.position as THREE.BufferAttribute
    const cols = new Float32Array(pos.count * 3)

    const cMossTop = new THREE.Color('#a4bc72')
    const cRockLit = new THREE.Color('#c2beb0')
    const cRockShade = new THREE.Color('#687684')
    const tmp = new THREE.Color()

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i)
      let y = pos.getY(i)
      let z = pos.getZ(i)
      const n = Math.sin(x * 2.6 + seed * 1.7) * Math.cos(z * 2.4 - seed) * 0.22
      const ridge = Math.abs(Math.sin(y * 4.5 + n * 3.0)) * 0.08
      x *= 1 + n + ridge
      z *= 1 - n * 0.8 + ridge
      y = (y > 0.2 ? 0.2 + (y - 0.2) * 0.55 : y) + n * 0.3
      pos.setXYZ(i, x, y, z)
    }
    pos.needsUpdate = true
    g.computeVertexNormals()

    const norm = g.attributes.normal as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const ny = norm.getY(i)
      const up = THREE.MathUtils.smoothstep(ny, -0.25, 0.8)
      const baseAO = THREE.MathUtils.smoothstep(y, -0.8, -0.1)
      tmp.copy(cRockShade).lerp(cRockLit, baseAO * 0.85 + up * 0.25)
      tmp.lerp(cMossTop, THREE.MathUtils.smoothstep(ny, 0.58, 0.92) * 0.65)
      cols[i * 3] = tmp.r
      cols[i * 3 + 1] = tmp.g
      cols[i * 3 + 2] = tmp.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3))

    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0,
    })
    applyPainterlySurface(m, {
      soft: 0.85,
      rimColor: '#fff6dc',
      shadowTint: '#627280',
      sunDir,
    })

    return { geo: g, mat: m }
  }, [seed, sunDir])

  return (
    <group position={position} rotation={[0, yaw, 0]} scale={scale}>
      <mesh geometry={geo} material={mat} />
    </group>
  )
}

export function LakeMeadow({
  grassCount = 7200,
  daisyCount = 620,
  sunDir = [0.48, 0.56, -0.67],
}: {
  grassCount?: number
  daisyCount?: number
  sunDir?: [number, number, number]
}) {
  const grassRef = useRef<THREE.InstancedMesh>(null)
  const daisyRef = useRef<THREE.InstancedMesh>(null)

  const { grassGeo, grassMat, grassInstances, daisyGeo, daisyMat, daisyInstances } = useMemo(() => {
    const gGeo = buildGrassTuftGeometry()
    const gMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    applyPainterlySurface(gMat, {
      soft: 0.85,
      rimColor: '#fff8d4',
      shadowTint: '#6a8a58',
      sunDir,
    })

    // Clear 1.2 m apron in front of camera (camera at z = 0.25 -> grass starts at z <= -0.95)
    const gList: { x: number; y: number; z: number; sx: number; sy: number; yaw: number; color: THREE.Color }[] = []
    let i = 0
    while (gList.length < grassCount && i < grassCount * 18) {
      i++
      const u = Math.pow(hash(i * 1.37, 5.1), 1.3)
      const z = -0.95 - u * 8.6
      const spreadX = 1.45 + Math.max(0, -z) * 0.88
      const x = (hash(i * 2.19, 3.7) * 2 - 1) * spreadX
      const shore = lakeShoreZ(x)
      if (z < shore + 0.22) continue

      const y = lakeHeight(x, z)
      const t = hash(i * 6.13, 2.41)
      // Luminous pastel yellow-green meadow tones (avoid poster saturation)
      const col = new THREE.Color('#cfdc90').lerp(new THREE.Color('#efefa8'), t)
      // Taper scale slightly right at the near apron edge so no tuft towers into lens
      const nearTaper = THREE.MathUtils.smoothstep(-z, 0.95, 1.85)
      const s = (0.62 + 0.56 * hash(i * 3.91, 8.23)) * (0.68 + 0.32 * nearTaper)

      gList.push({
        x,
        y: y - 0.008,
        z,
        sx: s * (0.9 + 0.35 * hash(i * 7.1, 1.9)),
        sy: s * (0.85 + 0.35 * t),
        yaw: hash(i * 4.73, 6.61) * Math.PI * 2,
        color: col,
      })
    }

    // Daisies: small warm-white flowers nested at 0.72-0.88 of grass canopy height, clustered in drifts
    const dGeo = buildDaisyGeometry()
    const dMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    // Keep shadowTint warm neutral so white petals never turn grey-blue
    applyPainterlySurface(dMat, {
      soft: 0.55,
      rimColor: '#fffdf4',
      shadowTint: '#b8beaa',
      sunDir,
    })

    const dList: { x: number; y: number; z: number; scale: number; yaw: number; tilt: number }[] = []
    let j = 0
    while (dList.length < daisyCount && j < daisyCount * 28) {
      j++
      const u = Math.pow(hash(j * 1.71, 2.23), 1.2)
      const z = -1.1 - u * 6.8
      const spreadX = 1.45 + Math.max(0, -z) * 0.82
      const x = (hash(j * 3.13, 5.57) * 2 - 1) * spreadX
      const shore = lakeShoreZ(x)
      if (z < shore + 0.38) continue

      // Natural meadow drift clustering
      const drift = Math.sin(x * 1.15 + z * 0.85) * 0.5 + 0.5
      if (hash(j * 8.3, 4.1) > 0.18 + drift * 0.78) continue

      const y = lakeHeight(x, z)
      // Scale 0.72..1.18 -> head diameter ~0.055..0.088 m, head height ~0.075..0.12 m (inside grass canopy)
      const sc = 0.72 + 0.46 * hash(j * 7.71, 1.31)
      dList.push({
        x,
        y: y - 0.006,
        z,
        scale: sc,
        yaw: hash(j * 2.93, 9.17) * Math.PI * 2,
        tilt: 0.15 + 0.2 * hash(j * 5.1, 3.3),
      })
    }

    return {
      grassGeo: gGeo,
      grassMat: gMat,
      grassInstances: gList,
      daisyGeo: dGeo,
      daisyMat: dMat,
      daisyInstances: dList,
    }
  }, [grassCount, daisyCount, sunDir])

  useLayoutEffect(() => {
    const gm = grassRef.current
    if (gm) {
      const dummy = new THREE.Object3D()
      grassInstances.forEach((item, idx) => {
        dummy.position.set(item.x, item.y, item.z)
        dummy.rotation.set(0, item.yaw, 0)
        dummy.scale.set(item.sx, item.sy, item.sx)
        dummy.updateMatrix()
        gm.setMatrixAt(idx, dummy.matrix)
        gm.setColorAt(idx, item.color)
      })
      gm.instanceMatrix.needsUpdate = true
      if (gm.instanceColor) gm.instanceColor.needsUpdate = true
    }

    const dm = daisyRef.current
    if (dm) {
      const dummy = new THREE.Object3D()
      daisyInstances.forEach((item, idx) => {
        dummy.position.set(item.x, item.y, item.z)
        dummy.rotation.set(item.tilt, item.yaw, (idx % 2 === 0 ? 1 : -1) * 0.08)
        dummy.scale.setScalar(item.scale)
        dummy.updateMatrix()
        dm.setMatrixAt(idx, dummy.matrix)
      })
      dm.instanceMatrix.needsUpdate = true
    }
  }, [grassInstances, daisyInstances])

  return (
    <group>
      <instancedMesh ref={grassRef} args={[grassGeo, grassMat, grassInstances.length]} />
      <instancedMesh ref={daisyRef} args={[daisyGeo, daisyMat, daisyInstances.length]} />
    </group>
  )
}
