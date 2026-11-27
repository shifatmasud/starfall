import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyPainterlySurface } from '../scan/Fit'
import { POOL, oasisHeight, poolEdge } from './DuneField'

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return s - Math.floor(s)
}

/** Builds a lush multi-blade reed/shrub clump with upward normals and sunlit tip gradient */
function buildClumpGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = []
  const bladeCount = 7

  const cRoot = new THREE.Color('#5a6b42')
  const cMid = new THREE.Color('#889c58')
  const cTip = new THREE.Color('#c8ce7e')
  const tmp = new THREE.Color()

  for (let b = 0; b < bladeCount; b++) {
    const az = (b / bladeCount) * Math.PI * 2 + (b % 2) * 0.35
    const lean = 0.24 + (b % 3) * 0.13
    const h = 0.34 + (b % 4) * 0.07
    const wBase = 0.032

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
      const width = wBase * (1 - t * 0.92)
      const arch = Math.pow(t, 1.55) * lean
      const cx = dx * arch
      const cy = h * t * (1 - 0.18 * t)
      const cz = dz * arch

      // Slight V-fold camber across blade width for soft volume
      const camber = (1 - t) * 0.008
      positions.push(
        cx - px * width, cy, cz - pz * width,
        cx, cy + camber, cz,
        cx + px * width, cy, cz + pz * width,
      )

      // Bias normals upward so hemisphere sky light illuminates blades softly (never black)
      for (let k = 0; k < 3; k++) {
        normals.push(dx * 0.35, 0.88, dz * 0.35)
      }

      tmp.copy(cRoot).lerp(cMid, THREE.MathUtils.smoothstep(t, 0, 0.55)).lerp(cTip, THREE.MathUtils.smoothstep(t, 0.45, 1.0))
      for (let k = 0; k < 3; k++) {
        colors.push(tmp.r, tmp.g, tmp.b)
      }

      if (s < segs) {
        const row = s * 3
        const next = (s + 1) * 3
        indices.push(
          row, next, row + 1,
          row + 1, next, next + 1,
          row + 1, next + 1, row + 2,
          row + 2, next + 1, next + 2,
        )
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

export function OasisShrubs({
  count = 440,
  sunDir = [-5, 6.5, -3],
}: {
  count?: number
  sunDir?: [number, number, number]
}) {
  const ref = useRef<THREE.InstancedMesh>(null)

  const { geo, mat, transforms } = useMemo(() => {
    const g = buildClumpGeometry()
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.78,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    applyPainterlySurface(m, {
      soft: 0.95,
      rimColor: '#fff2c6',
      shadowTint: '#485c42',
      sunDir,
    })

    // Cluster reed clumps naturally along the shoreline coves and around foreground rocks
    const list: { x: number; y: number; z: number; sx: number; sy: number; yaw: number; color: THREE.Color }[] = []
    let i = 0
    while (list.length < count && i < count * 20) {
      i++
      const a = hash(i * 1.9, 4.3) * Math.PI * 2
      // Band tight around shoreline (0.94 .. 1.28)
      const band = 0.94 + 0.34 * Math.pow(hash(i * 2.7, 7.1), 1.35)
      const d = poolEdge(a) * band
      const x = POOL.x + Math.cos(a) * d
      const z = POOL.z + Math.sin(a) * d
      const y = oasisHeight(x, z)
      if (y < 0.015 || y > 0.42) continue

      // Clump grouping: denser in coves (left bank, back bank, right rock edge)
      const clumpNoise = Math.sin(a * 5.0 + 0.8) * 0.5 + 0.5
      if (hash(i * 6.3, 1.9) > 0.32 + clumpNoise * 0.65) continue

      const t = hash(i * 4.1, 8.2)
      const tint = new THREE.Color('#a4b672').lerp(new THREE.Color('#dfca86'), t)
      const s = 0.75 + 0.85 * hash(i * 3.3, 5.5)
      list.push({
        x,
        y: y - 0.02,
        z,
        sx: s * (0.9 + 0.35 * hash(i * 7.1, 2.4)),
        sy: s * (0.85 + 0.45 * t),
        yaw: hash(i * 5.7, 9.3) * Math.PI * 2,
        color: tint,
      })
    }

    return { geo: g, mat: m, transforms: list }
  }, [count, sunDir])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    transforms.forEach((item, idx) => {
      dummy.position.set(item.x, item.y, item.z)
      dummy.rotation.set(0, item.yaw, 0)
      dummy.scale.set(item.sx, item.sy, item.sx)
      dummy.updateMatrix()
      mesh.setMatrixAt(idx, dummy.matrix)
      mesh.setColorAt(idx, item.color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [transforms])

  return <instancedMesh ref={ref} args={[geo, mat, transforms.length]} />
}

/** Smooth stratified sandstone boulder (replaces dark scanned rocks) */
export function SandstoneBoulder({
  position = [0, 0, 0],
  scale = [1, 0.65, 0.9],
  yaw = 0,
  seed = 1,
  sunDir = [-5, 6.5, -3],
}: {
  position?: [number, number, number]
  scale?: [number, number, number]
  yaw?: number
  seed?: number
  sunDir?: [number, number, number]
}) {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 44, 30)
    const pos = g.attributes.position as THREE.BufferAttribute
    const cols = new Float32Array(pos.count * 3)

    const cTop = new THREE.Color('#f7d8b0')
    const cMid = new THREE.Color('#dfa978')
    const cUndercut = new THREE.Color('#8e6858')
    const tmp = new THREE.Color()

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i)
      let y = pos.getY(i)
      let z = pos.getZ(i)

      // Broad angular sandstone block facets + horizontal sedimentary bedding shelves
      const n1 = Math.sin(x * 2.3 + seed * 1.7) * Math.cos(z * 2.1 - seed) * 0.18
      const strata = Math.sin(y * 7.5 + n1 * 4.0) * 0.055
      const flatTop = y > 0.25 ? 0.25 + (y - 0.25) * 0.45 : y

      x *= 1 + n1 + strata
      z *= 1 - n1 * 0.8 + strata
      y = flatTop + n1 * 0.35

      pos.setXYZ(i, x, y, z)
    }
    pos.needsUpdate = true
    g.computeVertexNormals()

    const norm = g.attributes.normal as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const ny = norm.getY(i)
      const up = THREE.MathUtils.smoothstep(ny, -0.35, 0.75)
      const baseAO = THREE.MathUtils.smoothstep(y, -0.85, -0.15)
      tmp.copy(cUndercut).lerp(cMid, baseAO).lerp(cTop, up * 0.82)
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
      soft: 0.9,
      rimColor: '#fff0d4',
      shadowTint: '#8e6858',
      sunDir,
      brush: 0.6,
    })

    return { geo: g, mat: m }
  }, [seed, sunDir])

  return (
    <group position={position} rotation={[0, yaw, 0]} scale={scale}>
      <mesh geometry={geo} material={mat} />
    </group>
  )
}
/** smooth, high-subdivision sandstone boulder geometry: rounded block, bedding shelves, warm AO */
function buildBoulderGeo(seed: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 22, 16)
  const pos = g.attributes.position as THREE.BufferAttribute
  const cols = new Float32Array(pos.count * 3)
  const cTop = new THREE.Color('#e8c396')
  const cMid = new THREE.Color('#c8a276')
  const cUnder = new THREE.Color('#8c6a52')
  const tmp = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i)
    let y = pos.getY(i)
    let z = pos.getZ(i)
    const n = Math.sin(x * 2.1 + seed * 1.9) * Math.cos(z * 1.8 - seed) * 0.13 + Math.sin(y * 3.4 + x * 1.3) * 0.06
    const bed = Math.sin(y * 6.2 + n * 3.0) * 0.022
    x *= 1 + n + bed
    z *= 1 - n * 0.75 + bed
    y = (y > 0.15 ? 0.15 + (y - 0.15) * 0.6 : y) + n * 0.3
    pos.setXYZ(i, x, y, z)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  const nrm = g.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const up = THREE.MathUtils.smoothstep(nrm.getY(i), -0.4, 0.7)
    tmp.copy(cUnder).lerp(cMid, THREE.MathUtils.smoothstep(y, -0.7, 0.2)).lerp(cTop, up * 0.7)
    cols[i * 3] = tmp.r
    cols[i * 3 + 1] = tmp.g
    cols[i * 3 + 2] = tmp.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
  return g
}

/** soft rounded desert shrub cushion: a lobed dome, sage-olive under, sunlit gold on top */
function buildCushionGeo(seed: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 18, 12)
  const pos = g.attributes.position as THREE.BufferAttribute
  const cols = new Float32Array(pos.count * 3)
  const cUnder = new THREE.Color('#59683c')
  const cMid = new THREE.Color('#8d9c58')
  const cTop = new THREE.Color('#cfc884')
  const tmp = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const ang = Math.atan2(z, x)
    const lobes = 1 + 0.11 * Math.sin(ang * 7 + seed) + 0.07 * Math.sin(ang * 12 - seed * 2)
    const dome = Math.max(y, -0.15)
    pos.setXYZ(i, x * lobes, dome * 0.62 + 0.16, z * lobes)
    const up = THREE.MathUtils.clamp(y * 0.5 + 0.5, 0, 1)
    tmp.copy(cUnder).lerp(cMid, up * 0.8).lerp(cTop, Math.pow(up, 2.2) * 0.75)
    cols[i * 3] = tmp.r
    cols[i * 3 + 1] = tmp.g
    cols[i * 3 + 2] = tmp.b
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
  return g
}

/**
 * The dune's own dressing: a scatter of smooth sandstone boulders and rounded shrub cushions along
 * the ruin's foot, the pool's banks and the right promontory — the mass and granularity the bare
 * sand was missing, at a few hundred triangles each and no visible facet anywhere.
 */
export function OasisScatter({
  boulders = 22,
  cushions = 20,
  sunDir = [-5, 6.5, -3],
}: {
  boulders?: number
  cushions?: number
  sunDir?: [number, number, number]
}) {
  const bRef = useRef<THREE.InstancedMesh>(null)
  const cRef = useRef<THREE.InstancedMesh>(null)

  const { bGeo, cGeo, bMat, cMat, bList, cList } = useMemo(() => {
    const bMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })
    applyPainterlySurface(bMat, { soft: 0.92, rimColor: '#fff0d0', shadowTint: '#8c6a52', sunDir, brush: 0.9 })
    const cMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 })
    applyPainterlySurface(cMat, { soft: 0.95, rimColor: '#fff4c8', shadowTint: '#5a6a40', sunDir, brush: 0.9, brushScale: 6 })

    const bs: { x: number; y: number; z: number; s: number; yaw: number; sy: number; tint: THREE.Color }[] = []
    // along the ruined temple's foot and the pool's near bank
    const anchors: [number, number, number][] = [
      [-7.6, -12.2, 0.5], [-3.4, -12.6, 0.42], [-1.6, -11.4, 0.3], [1.2, -9.4, 0.36],
      [4.2, -8.2, 0.44], [5.2, -5.2, 0.32], [-2.9, -8.8, 0.28], [3.1, -11.8, 0.34],
    ]
    for (let i = 0; i < boulders; i++) {
      const a = anchors[i % anchors.length]
      const k = i >= anchors.length ? 1 : 0
      const spread = 0.9 + 0.5 * hash(i * 1.7, 2.3)
      const ang = hash(i * 2.9, 5.1) * Math.PI * 2
      const x = a[0] + (k ? Math.cos(ang) * spread : (hash(i * 3.3, 1.1) - 0.5) * 0.6)
      const z = a[2] + (k ? Math.sin(ang) * spread * 0.7 : (hash(i * 4.7, 7.7) - 0.5) * 0.6)
      const y = oasisHeight(x, z)
      if (y < 0.03) continue
      const s = a[1] * (0.55 + 0.55 * hash(i * 5.3, 3.9))
      bs.push({ x, y: y - s * 0.22, z, s, sy: 0.62 + 0.3 * hash(i * 6.1, 2.2), yaw: hash(i * 7.3, 4.4) * Math.PI * 2, tint: new THREE.Color('#e8cba4').lerp(new THREE.Color('#c8a276'), hash(i * 8.1, 1.5)) })
    }

    const cs: { x: number; y: number; z: number; s: number; yaw: number; tint: THREE.Color }[] = []
    for (let i = 0; i < cushions; i++) {
      const a = hash(i * 1.9, 3.3) * Math.PI * 2
      const band = poolEdge(a) * (1.35 + 0.9 * hash(i * 2.7, 7.1))
      const x = POOL.x + Math.cos(a) * 4.4 * band * 0.85
      const z = POOL.z + Math.sin(a) * 3.1 * band * 0.85
      const y = oasisHeight(x, z)
      if (y < 0.05) continue
      const s = 0.22 + 0.2 * hash(i * 3.7, 9.1)
      cs.push({ x, y: y - s * 0.1, z, s, yaw: hash(i * 4.9, 2.6) * Math.PI * 2, tint: new THREE.Color('#a8b46e').lerp(new THREE.Color('#d6c894'), hash(i * 5.7, 6.2)) })
    }

    console.log('scatter lists', bs.length, cs.length)
    return { bGeo: buildBoulderGeo(4), cGeo: buildCushionGeo(9), bMat, cMat, bList: bs, cList: cs }
  }, [boulders, cushions, sunDir])

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D()
    const bm = bRef.current
    if (bm) {
      bList.forEach((b, i) => {
        dummy.position.set(b.x, b.y, b.z)
        dummy.rotation.set(0, b.yaw, 0)
        dummy.scale.set(b.s, b.s * b.sy, b.s * (0.8 + 0.3 * hash(i, 1.3)))
        dummy.updateMatrix()
        bm.setMatrixAt(i, dummy.matrix)
        bm.setColorAt(i, b.tint)
      })
      bm.instanceMatrix.needsUpdate = true
      if (bm.instanceColor) bm.instanceColor.needsUpdate = true
    }
    const cm = cRef.current
    if (cm) {
      cList.forEach((c, i) => {
        dummy.position.set(c.x, c.y, c.z)
        dummy.rotation.set(0, c.yaw, 0)
        dummy.scale.setScalar(c.s)
        dummy.updateMatrix()
        cm.setMatrixAt(i, dummy.matrix)
        cm.setColorAt(i, c.tint)
      })
      cm.instanceMatrix.needsUpdate = true
      if (cm.instanceColor) cm.instanceColor.needsUpdate = true
    }
  }, [bList, cList])

  return (
    <group>
      <instancedMesh ref={bRef} args={[bGeo, bMat, bList.length]} />
      <instancedMesh ref={cRef} args={[cGeo, cMat, cList.length]} />
    </group>
  )
}
