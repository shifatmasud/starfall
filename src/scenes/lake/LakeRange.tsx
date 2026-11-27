import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Terrain } from '../scan/Terrain'
import { applyPainterlySurface } from '../scan/Fit'

const SUN4: [number, number, number] = [0.64, 0.52, -0.56]

// 1. Far receding horizon peaks (left & center): pale blue silhouettes with trace snow only at the very top
const FAR_HORIZON_PEAKS = {
  lit: '#b6cce8',
  shade: '#88a2cc',
  snowLit: '#f4f9ff',
  snowShade: '#cdddf4',
  snowLine: 0.88,
  air: '#dceafa',
}

// 2. Far-left receding valley hills (no snow)
const LEFT_VALLEY_RIDGE = {
  lit: '#a8c0e2',
  shade: '#7c96c0',
  air: '#dceafa',
}

// 3. Lower sunny pasture & forested mountainside shelf sweeping down to the right lake shore
const RIGHT_PASTURE_SLOPE = {
  lit: '#92ac6c',
  shade: '#5c786e',
  snowLit: '#eef5ff',
  snowShade: '#b4cae4',
  snowLine: 0.94,
  air: '#c6dcf4',
}

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return s - Math.floor(s)
}

/**
 * Procedural ridged alpine hero mountain (right of center, matching ref4_range):
 * Sharp pointed summit, radiating dark ridge spurs, eroded gullies, lower green pasture shelf,
 * and trace snow in high couloirs — pure high-subdivision geometry + vertex shading (~12k tris).
 */
function HeroAlpinePeak({ sunDir = SUN4 }: { sunDir?: [number, number, number] }) {
  const { geo, mat } = useMemo(() => {
    const segX = 96
    const segZ = 64
    const g = new THREE.PlaneGeometry(118, 56, segX, segZ)
    g.rotateX(-Math.PI / 2)
    g.translate(22, -0.8, -82)

    const pos = g.attributes.position as THREE.BufferAttribute
    const count = pos.count
    const colors = new Float32Array(count * 3)
    const sun = new THREE.Vector3(...sunDir).normalize()

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)

      // Main summit centered around x = 26, z = -84, plus secondary western shoulder at x = 4, z = -88
      const dx1 = (x - 26) / 34
      const dz1 = (z + 84) / 22
      const r1 = Math.hypot(dx1, dz1)
      const mainCone = Math.max(0, 1 - Math.pow(r1, 0.88)) * 24.5

      const dx2 = (x - 2) / 28
      const dz2 = (z + 88) / 20
      const r2 = Math.hypot(dx2, dz2)
      const westShoulder = Math.max(0, 1 - Math.pow(r2, 0.92)) * 13.5

      const baseMass = Math.max(mainCone, westShoulder)

      // Sharp radiating ridge spurs and eroded couloir gullies
      const ang = Math.atan2(z + 84, x - 26)
      const spur1 = Math.abs(Math.sin(ang * 5.0 + x * 0.08)) * 0.34
      const spur2 = Math.abs(Math.cos(ang * 9.0 - z * 0.11)) * 0.18
      const ridgeFactor = 1.0 - (spur1 + spur2) * THREE.MathUtils.smoothstep(baseMass, 2.0, 18.0)

      // Soften front/back skirt so it blends smoothly into the lake shore & pasture shelf
      const zSkirt = THREE.MathUtils.smoothstep(z, -54, -66) * (1 - THREE.MathUtils.smoothstep(z, -102, -110))
      const y = -0.8 + baseMass * ridgeFactor * zSkirt
      pos.setY(i, y)
    }
    pos.needsUpdate = true
    g.computeVertexNormals()

    const norm = g.attributes.normal as THREE.BufferAttribute
    const cPastureLit = new THREE.Color('#86a266')
    const cPastureShade = new THREE.Color('#4f6c64')
    const cRockLit = new THREE.Color('#8fa2be')
    const cRockShade = new THREE.Color('#526888')
    const cSnowTrace = new THREE.Color('#eef4fc')
    const cAir = new THREE.Color('#cce0f6')
    const tmp = new THREE.Color()

    for (let i = 0; i < count; i++) {
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const nx = norm.getX(i)
      const ny = norm.getY(i)
      const nz = norm.getZ(i)

      const ndotl = nx * sun.x + ny * sun.y + nz * sun.z
      const sunFace = THREE.MathUtils.smoothstep(ndotl, -0.15, 0.72)

      // Lower slopes are alpine pasture/forest; upper steep ribs are grey-blue alpine rock
      const rockMix = THREE.MathUtils.smoothstep(y, 5.5, 11.5)
      const pastureCol = cPastureShade.clone().lerp(cPastureLit, sunFace)
      const rockCol = cRockShade.clone().lerp(cRockLit, sunFace)
      tmp.copy(pastureCol).lerp(rockCol, rockMix)

      // Trace snow only in high sheltered gullies (ny > 0.78 and y > 15.5)
      const snowMask = THREE.MathUtils.smoothstep(y, 15.5, 20.5) * THREE.MathUtils.smoothstep(ny, 0.74, 0.9) * 0.55
      tmp.lerp(cSnowTrace, snowMask)

      // forest speckle on the pasture belt, rock ribs higher up: painted texture, not a flat gradient
      {
        const x = pos.getX(i)
        const n1 = Math.sin(x * 1.1 + z * 0.45 + Math.sin(z * 0.6) * 2.0) * 0.5 + 0.5
        const n2 = Math.sin(x * 2.6 - z * 1.3 + Math.sin(x * 0.9)) * 0.5 + 0.5
        const forest = (1 - rockMix) * (n1 * 0.6 + n2 * 0.4)
        tmp.lerp(tmp.clone().multiplyScalar(0.58 + 0.22 * n2), forest * 0.9)
        tmp.multiplyScalar(0.94 + 0.12 * n2)
      }

      // Distance aerial perspective
      const airMix = THREE.MathUtils.smoothstep(-z, 62.0, 108.0) * 0.42
      tmp.lerp(cAir, airMix)

      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    // baked like the rest of the range: the vertex colours already carry the sun, so no live
    // lambert pass can turn the mountain into a dark navy cut-out
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })

    return { geo: g, mat: m }
  }, [sunDir])

  return <mesh geometry={geo} material={mat} />
}

/**
 * Soft layered conifer spire (~230 tris): one smooth lathe with gentle whorl swells and a noise
 * warp, so the silhouette feathers rather than breaking into stacked cones.
 */
function buildSlopeConiferPrototype(): THREE.BufferGeometry {
  const rings = 14
  const radial = 9
  const profile: THREE.Vector2[] = []
  for (let r = 0; r <= rings; r++) {
    const t = r / rings
    // tier swells: the bough layers read as soft skirts, not steps
    const swell = 1 + 0.16 * Math.sin(t * Math.PI * 3.2 + 0.4)
    const rad = (0.34 * Math.pow(1 - t, 0.95) + 0.02) * swell
    profile.push(new THREE.Vector2(rad, 0.04 + t * 0.94))
  }
  const g = new THREE.LatheGeometry(profile, radial)
  const pos = g.attributes.position as THREE.BufferAttribute
  const cols = new Float32Array(pos.count * 3)
  const cShadow = new THREE.Color('#35523f')
  const cMid = new THREE.Color('#4e7052')
  const cSun = new THREE.Color('#7f9c62')
  const tmp = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i)
    const vy = pos.getY(i)
    const vz = pos.getZ(i)
    const ang = Math.atan2(vz, vx)
    const t = THREE.MathUtils.clamp((vy - 0.04) / 0.94, 0, 1)
    const ragged = 1 + 0.10 * Math.sin(ang * 5 + vy * 16) + 0.06 * Math.cos(ang * 8 - vy * 22)
    pos.setXYZ(i, vx * ragged, vy, vz * ragged)
    tmp.copy(cShadow).lerp(cMid, t * 0.7)
    tmp.lerp(cSun, THREE.MathUtils.smoothstep(t, 0.45, 1.0) * 0.55)
    cols[i * 3] = tmp.r
    cols[i * 3 + 1] = tmp.g
    cols[i * 3 + 2] = tmp.b
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
  return g.toNonIndexed()
}

/** 280 fine conifer spires forming the dark-green forest belt along the right mountain base */
function DistantTreelineBand({ sunDir = SUN4 }: { sunDir?: [number, number, number] }) {
  const ref = useRef<THREE.InstancedMesh>(null)

  const { geo, mat, instances } = useMemo(() => {
    const g = buildSlopeConiferPrototype()
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0,
    })
    applyPainterlySurface(m, {
      soft: 0.85,
      rimColor: '#e4f0ff',
      shadowTint: '#3e5c70',
      sunDir,
    })

    const list: { x: number; y: number; z: number; sx: number; sy: number; yaw: number; tint: THREE.Color }[] = []
    const count = 100
    const cNearTint = new THREE.Color('#c8dcc8')
    const cFarTint = new THREE.Color('#84a8d2')

    for (let i = 0; i < count; i++) {
      const u = hash(i * 1.37, 4.19)
      const v = hash(i * 2.71, 7.83)
      const x = 3.5 + v * 40.0 + (u - 0.5) * 7.0
      const z = -15.0 - v * 58.0 - u * 7.0
      const baseY = Math.max(0.04, (x - 8.5) * 0.14 + (-z - 15.0) * 0.075 + u * 2.6 - 0.6)
      const h = (1.15 + hash(i * 5.13, 2.91) * 0.95) * (1 - v * 0.2)
      const hazeT = THREE.MathUtils.smoothstep(-z, 16.0, 66.0)

      list.push({
        x,
        y: baseY,
        z,
        sx: h * (0.64 + hash(i, 3.1) * 0.2),
        sy: h,
        yaw: hash(i * 3.91, 6.47) * Math.PI * 2,
        tint: cNearTint.clone().lerp(cFarTint, hazeT * 0.82),
      })
    }

    return { geo: g, mat: m, instances: list }
  }, [sunDir])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    instances.forEach((item, idx) => {
      dummy.position.set(item.x, item.y, item.z)
      dummy.rotation.set(0, item.yaw, 0)
      dummy.scale.set(item.sx, item.sy, item.sx)
      dummy.updateMatrix()
      mesh.setMatrixAt(idx, dummy.matrix)
      mesh.setColorAt(idx, item.tint)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [instances])

  return <instancedMesh ref={ref} args={[geo, mat, instances.length]} />
}

export function LakeRange() {
  return (
    <group>
      {/* Far receding pale-blue horizon ridges to the left with only trace snow */}
      <Terrain
        dem="/tex/dem/alps-h.webp"
        size={[280, 64]}
        segments={[96, 32]}
        relief={22}
        floor={0.08}
        position={[-34, -0.9, -132]}
        yaw={Math.PI}
        sun={SUN4}
        haze={0.35}
        palette={FAR_HORIZON_PEAKS}
      />

      {/* Dominant ridged alpine peak right of center (ref4_range hero summit) */}
      <HeroAlpinePeak sunDir={SUN4} />

      {/* Far-left receding blue-haze valley hills (no snow) */}
      <Terrain
        dem="/tex/dem/ridge-h.webp"
        size={[80, 44]}
        segments={[72, 28]}
        relief={12.0}
        floor={0.04}
        position={[-42, -0.7, -80]}
        yaw={0.35}
        sun={SUN4}
        haze={0.35}
        palette={LEFT_VALLEY_RIDGE}
      />

      {/* Right sunny pasture & forested mountainside sweeping down to the shore */}
      <Terrain
        dem="/tex/dem/ridge-h.webp"
        size={[68, 48]}
        segments={[72, 30]}
        relief={13.0}
        floor={0.03}
        position={[30, -0.8, -46]}
        yaw={0.78}
        sun={SUN4}
        haze={0.22}
        palette={RIGHT_PASTURE_SLOPE}
      />

      {/* 280 fine conifer spires forming the dark-green forest belt along the mountain base */}
      <DistantTreelineBand sunDir={SUN4} />
    </group>
  )
}
