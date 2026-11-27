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
    })

    return { geo: g, mat: m }
  }, [seed, sunDir])

  return (
    <group position={position} rotation={[0, yaw, 0]} scale={scale}>
      <mesh geometry={geo} material={mat} />
    </group>
  )
}