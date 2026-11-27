import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyPainterlySurface } from '../scan/Fit'
import { SoftShadow } from '../scan/SoftShadow'

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

/** sea floor: a gently rippled sand sheet with painterly granule mottle and a warm pool of light */
export function ReefFloor({ radius = 26, y = 0 }: { radius?: number; y?: number }) {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.PlaneGeometry(radius * 2, radius * 2, 110, 110)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position as THREE.BufferAttribute
    const col = new Float32Array(pos.count * 3)
    const cLit = new THREE.Color('#7aa2a6')
    const cMid = new THREE.Color('#457685')
    const cDeep = new THREE.Color('#153e54')
    const cPool = new THREE.Color('#cfc6a6')
    const tmp = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const r = Math.hypot(x, z)
      const ripple = Math.sin(x * 1.15 + z * 0.35) * 0.5 + Math.sin(z * 1.9 - x * 0.4) * 0.35
      const yy = y + ripple * 0.045 + Math.sin(x * 3.3) * Math.cos(z * 2.7) * 0.012
      pos.setY(i, yy)
      const pool = 1 - THREE.MathUtils.smoothstep(r, 0.4, 4.2)
      const far = THREE.MathUtils.smoothstep(r, 6, 24)
      tmp.copy(cMid).lerp(cLit, 0.25 + 0.35 * ripple)
      // a pale sand shelf under the orb — the warm pool itself is the point light, not a paint
      tmp.lerp(cPool, pool * 0.22)
      tmp.lerp(cDeep, far * 0.9)
      col[i * 3] = tmp.r
      col[i * 3 + 1] = tmp.g
      col[i * 3 + 2] = tmp.b
    }
    pos.needsUpdate = true
    g.computeVertexNormals()
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
    applyPainterlySurface(m, { soft: 0.95, rimColor: '#cfeeff', shadowTint: '#1c4258', sunDir: [-0.1, 1, -0.2], brush: 0.95, caustics: 0.26, causticScale: 5.2 })
    return { geo: g, mat: m }
  }, [radius, y])
  return <mesh geometry={geo} material={mat} position={[0, 0, 0]} />
}

/** one branching staghorn coral: recursive tapered curved tubes, smooth and high-detail */
function buildBranchCoral(seed: number, hue: string): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  const cBase = new THREE.Color(hue)
  const cTip = cBase.clone().lerp(new THREE.Color('#ffe6c8'), 0.55)
  const tmp = new THREE.Color()

  const grow = (start: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const end = start.clone().addScaledVector(dir, len)
    // curved branch: two segments with a bend, so the tube is organic rather than a straight stick
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3((rand() - 0.5) * len * 0.25, len * 0.1, (rand() - 0.5) * len * 0.25))
    const curve = new THREE.CatmullRomCurve3([start, mid, end])
    const tube = new THREE.TubeGeometry(curve, 6, rad, 6, false)
    const tp = tube.attributes.position as THREE.BufferAttribute
    const tc = new Float32Array(tp.count * 3)
    for (let i = 0; i < tp.count; i++) {
      const t = THREE.MathUtils.clamp((tp.getY(i) - start.y) / Math.max(len, 1e-3), 0, 1)
      tmp.copy(cBase).lerp(cTip, Math.pow(t, 1.4))
      tc[i * 3] = tmp.r
      tc[i * 3 + 1] = tmp.g
      tc[i * 3 + 2] = tmp.b
    }
    tube.setAttribute('color', new THREE.BufferAttribute(tc, 3))
    parts.push(tube)
    if (depth <= 0) return
    const kids = 2 + (rand() > 0.55 ? 1 : 0)
    for (let k = 0; k < kids; k++) {
      const nd = dir
        .clone()
        .add(new THREE.Vector3((rand() - 0.5) * 1.1, 0.25 + rand() * 0.4, (rand() - 0.5) * 1.1))
        .normalize()
      grow(end, nd, len * (0.62 + rand() * 0.16), rad * 0.66, depth - 1)
    }
  }

  const trunks = 3
  for (let i = 0; i < trunks; i++) {
    const a = (i / trunks) * Math.PI * 2 + rand()
    grow(
      new THREE.Vector3(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05),
      new THREE.Vector3(Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45).normalize(),
      0.34 + rand() * 0.12,
      0.035,
      3,
    )
  }
  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return merged
}

/** a sea fan: a fine double-sided web of ribbons radiating from a stalk */
function buildSeaFan(seed: number, hue: string): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  const ribs = 18
  const cBase = new THREE.Color(hue)
  const cTip = cBase.clone().lerp(new THREE.Color('#f2e2ea'), 0.5)
  const tmp = new THREE.Color()
  for (let i = 0; i < ribs; i++) {
    const t = i / (ribs - 1)
    const ang = (t - 0.5) * Math.PI * 0.95
    const len = 0.55 + 0.4 * Math.sin(t * Math.PI)
    const pts: THREE.Vector3[] = []
    for (let s = 0; s <= 4; s++) {
      const k = s / 4
      pts.push(new THREE.Vector3(Math.sin(ang) * len * k, k * len * 0.85, Math.cos(ang) * 0.06 * (1 - k)))
    }
    const curve = new THREE.CatmullRomCurve3(pts)
    const tube = new THREE.TubeGeometry(curve, 4, 0.012 + 0.006 * rand(), 4, false)
    const tp = tube.attributes.position as THREE.BufferAttribute
    const tc = new Float32Array(tp.count * 3)
    for (let v = 0; v < tp.count; v++) {
      const d = tp.getY(v) / len
      tmp.copy(cBase).lerp(cTip, THREE.MathUtils.clamp(d, 0, 1))
      tc[v * 3] = tmp.r
      tc[v * 3 + 1] = tmp.g
      tc[v * 3 + 2] = tmp.b
    }
    tube.setAttribute('color', new THREE.BufferAttribute(tc, 3))
    parts.push(tube)
  }
  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return merged
}

/** kelp: long tapered wavy ribbons */
function buildKelp(seed: number, hue: string): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  const cBase = new THREE.Color(hue)
  const cTip = cBase.clone().lerp(new THREE.Color('#8fbf94'), 0.5)
  const tmp = new THREE.Color()
  const strands = 5
  for (let s = 0; s < strands; s++) {
    const a = (s / strands) * Math.PI * 2 + rand()
    const h = 2.2 + rand() * 1.6
    const segs = 14
    const pos: number[] = []
    const idx: number[] = []
    const cols: number[] = []
    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      const w = 0.075 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t * 0.15) + 0.008
      const sway = Math.sin(t * 3.1 + s) * 0.22 * t
      const cx = Math.cos(a) * 0.12 + Math.sin(t * 2.2 + s) * 0.12
      const cz = Math.sin(a) * 0.12 + Math.cos(t * 1.7 + s) * 0.12
      const y = h * t
      pos.push(cx - w, y, cz, cx + w, y, cz)
      tmp.copy(cBase).lerp(cTip, Math.pow(t, 1.6))
      cols.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b)
      if (i < segs) {
        const r0 = i * 2
        idx.push(r0, r0 + 2, r0 + 1, r0 + 1, r0 + 2, r0 + 3)
      }
      void sway
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    parts.push(g)
  }
  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return merged
}

/** sculpted reef rock: a smooth displaced sphere, dark against the water */
export function ReefRock({
  position = [0, 0, 0],
  scale = [1, 1, 1],
  seed = 1,
}: {
  position?: [number, number, number]
  scale?: [number, number, number]
  seed?: number
}) {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 48, 32)
    const pos = g.attributes.position as THREE.BufferAttribute
    const col = new Float32Array(pos.count * 3)
    const cDark = new THREE.Color('#0b2230')
    const cMid = new THREE.Color('#173d4e')
    const cLit = new THREE.Color('#2e5f74')
    const tmp = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const n =
        Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 - seed) * 0.16 +
        Math.sin(y * 4.3 + x * 1.7) * 0.1 +
        Math.cos(z * 5.1 + y * 2.2) * 0.06
      const wob = 1 + n
      pos.setXYZ(i, x * wob, Math.max(-0.35, y * wob * 0.9), z * wob)
      const up = THREE.MathUtils.clamp(y * 0.5 + 0.5, 0, 1)
      tmp.copy(cDark).lerp(cMid, up).lerp(cLit, Math.pow(up, 2) * 0.6)
      col[i * 3] = tmp.r
      col[i * 3 + 1] = tmp.g
      col[i * 3 + 2] = tmp.b
    }
    pos.needsUpdate = true
    g.computeVertexNormals()
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 })
    applyPainterlySurface(m, { soft: 0.92, rimColor: '#9fe0f4', shadowTint: '#103446', sunDir: [-0.15, 1, -0.25], brush: 0.75, caustics: 0.15, causticScale: 4.6 })
    return { geo: g, mat: m }
  }, [seed])
  return (
    <group>
      <mesh geometry={geo} material={mat} position={position} scale={scale} />
      <SoftShadow
        position={[position[0], position[1] + scale[1] * 0.42, position[2]]}
        radius={scale[0] * 1.05}
        stretch={[1.15, 1]}
        opacity={0.78}
        color="#123642"
      />
    </group>
  )
}

/** the reef: coral heads, fans and kelp, instanced in a few clusters around the orb */
export function ReefLife() {
  const coralGeo = useMemo(() => buildBranchCoral(7, '#d9764a'), [])
  const coralGeo2 = useMemo(() => buildBranchCoral(13, '#c98fc0'), [])
  const fanGeo = useMemo(() => buildSeaFan(3, '#c4788e'), [])
  const kelpGeo = useMemo(() => buildKelp(5, '#3d7a55'), [])
  const matRef = useRef<THREE.MeshStandardMaterial>(null)

  const placements = useMemo(
    () => ({
      coral: [
        [-1.75, 0.02, -3.4, 0.85, 0.3],
        [1.35, 0.0, -3.9, 0.9, 2.1],
        [-2.6, 0.02, -5.0, 1.1, 1.2],
        [2.45, 0.0, -5.4, 0.95, 2.8],
        [0.55, 0.02, -5.9, 0.7, 0.9],
        [-3.3, 0.05, -2.6, 0.62, 1.7],
        [3.1, 0.03, -2.9, 0.58, 0.5],
        [-4.1, 0.05, -3.6, 0.72, 2.2],
        [3.9, 0.04, -3.8, 0.66, 1.4],
        [-0.9, 0.02, -4.6, 0.5, 2.6],
        [1.0, 0.02, -6.6, 0.55, 0.2],
      ],
      fans: [
        [-1.95, 0.05, -4.2, 0.9, 0.4],
        [1.95, 0.05, -4.6, 0.85, 2.3],
        [-2.2, 0.05, -2.9, 0.65, 1.1],
        [2.3, 0.05, -3.3, 0.6, 0.8],
      ],
      kelp: [
        [-2.9, 0, -4.2, 1.0, 0],
        [2.9, 0, -4.6, 0.9, 1.2],
        [-1.2, 0, -6.4, 1.15, 2.4],
        [1.6, 0, -6.8, 1.05, 0.6],
        [-3.6, 0, -5.6, 1.25, 1.8],
        [3.4, 0, -5.9, 1.2, 2.9],
      ],
      coral2: [
        [1.35, 0.0, -3.9, 0.9, 2.1],
        [-2.6, 0.02, -5.0, 1.1, 1.2],
        [2.45, 0.0, -5.4, 0.95, 2.8],
        [3.9, 0.04, -3.8, 0.66, 1.4],
        [-4.1, 0.05, -3.6, 0.72, 2.2],
      ],
    }),
    [],
  )

  const coralRef = useRef<THREE.InstancedMesh>(null)
  const coral2Ref = useRef<THREE.InstancedMesh>(null)
  const fanRef = useRef<THREE.InstancedMesh>(null)
  const kelpRef = useRef<THREE.InstancedMesh>(null)

  const mat = useMemo(() => {
    // lit, not baked: the reef keeps its own hue under the water attenuation, but the orb's warm
    // light and the surface shafts have to reach it, or the coral reads as a flat sticker. The
    // painterly response (wrap light, coloured bounce, cyan rim) keeps it painted rather than plastic.
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 })
    applyPainterlySurface(m, { soft: 0.95, rimColor: '#a8e8ff', shadowTint: '#1b4a63', sunDir: [-0.15, 1, -0.25], brush: 0.55, caustics: 0.12, causticScale: 4.8 })
    return m
  }, [])

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D()
    const set = (mesh: THREE.InstancedMesh | null, list: number[][]) => {
      if (!mesh) return
      list.forEach(([x, y, z, s, r], i) => {
        dummy.position.set(x, y, z)
        dummy.rotation.set(0, r, 0)
        dummy.scale.setScalar(s)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
    }
    set(coralRef.current, placements.coral)
    set(coral2Ref.current, (placements as { coral2: number[][] }).coral2)
    set(fanRef.current, placements.fans)
    set(kelpRef.current, placements.kelp)
    if (matRef.current) matRef.current.needsUpdate = true
  }, [placements])

  return (
    <group>
      {placements.coral.map(([x, y, z, s], i) => (
        <SoftShadow key={`cs-${i}`} position={[x, y + 0.015, z]} radius={0.62 * s} stretch={[1.1, 0.95]} opacity={0.76} color="#123642" />
      ))}
      {placements.fans.map(([x, y, z, s], i) => (
        <SoftShadow key={`fs-${i}`} position={[x, y + 0.015, z]} radius={0.42 * s} stretch={[1.2, 0.8]} opacity={0.68} color="#123642" />
      ))}
      <instancedMesh ref={coralRef} args={[coralGeo, mat, placements.coral.length]} />
      <instancedMesh ref={coral2Ref} args={[coralGeo2, mat, 5]} />
      <instancedMesh ref={fanRef} args={[fanGeo, mat, placements.fans.length]} />
      <instancedMesh ref={kelpRef} args={[kelpGeo, mat, placements.kelp.length]} />
    </group>
  )
}
