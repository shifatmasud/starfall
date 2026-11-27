import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyPainterlySurface } from '../scan/Fit'
import { sampleDemWorld } from '../dem'

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

function fbm(x: number, y: number, octaves = 4): number {
  let v = 0
  let amp = 0.5
  let freq = 1
  for (let i = 0; i < octaves; i++) {
    v += amp * vnoise(x * freq, y * freq)
    freq *= 2.04
    amp *= 0.5
  }
  return v
}

export function lakeShoreZ(x: number): number {
  const sweep = -6.2 - x * 0.42
  const cove = Math.sin(x * 0.22 + 0.6) * 1.45 + Math.cos(x * 0.48 - 0.4) * 0.65
  const leftHeadland = Math.exp(-Math.pow((x + 7.5) / 2.8, 2)) * 3.8
  const rightPeninsula = Math.exp(-Math.pow((x - 10.5) / 4.6, 2)) * 5.2
  return sweep + cove + leftHeadland + rightPeninsula
}

export function lakeHeight(x: number, z: number): number {
  const shoreZ = lakeShoreZ(x)
  const distFromShore = z - shoreZ

  const hummock = (fbm(x * 0.36 + 2.4, z * 0.36 - 1.7, 4) - 0.46) * 0.25
  const microTuft = (fbm(x * 2.4 - 0.8, z * 2.4 + 1.4, 3) - 0.5) * 0.042

  if (distFromShore >= 0) {
    const slope = Math.pow(distFromShore, 1.12) * 0.135
    const leftLift =
      THREE.MathUtils.smoothstep(-x, -2.0, 9.0) * 0.38 * THREE.MathUtils.smoothstep(distFromShore, 0.2, 5.5)
    const shoreFeather = THREE.MathUtils.smoothstep(distFromShore, 0.0, 1.4)
    // the meadow's real relief (Lake Louise valley, AWS Terrain Tiles, smoothed): the turf rolls the
    // way the valley does instead of sitting on a procedural hummock
    const real = (sampleDemWorld('meadow', x, z, 88, [-1.7, 4.2]) - 0.5) * 0.62 *
      THREE.MathUtils.smoothstep(distFromShore, 1.2, 9.0)
    // never below the waterline: the meadow rolls, the lake keeps its bank
    return Math.max(0.045, 0.02 + slope + leftLift + (hummock + microTuft + real) * shoreFeather)
  }

  const lakeDist = -distFromShore
  const farShoreZ = -44.0 + Math.sin(x * 0.09) * 3.5 + Math.cos(x * 0.19) * 1.8
  const farRiseDist = farShoreZ - z

  if (farRiseDist > -4.0) {
    const t = THREE.MathUtils.smoothstep(farRiseDist, -4.0, 8.0)
    const farSlope = Math.max(0, farRiseDist) * 0.22 + (fbm(x * 0.12, z * 0.12, 3) - 0.4) * 0.65
    return THREE.MathUtils.lerp(-1.95, 0.05 + farSlope, t)
  }

  const shelf = 1 - Math.exp(-lakeDist * 0.78)
  return 0.02 - shelf * 1.97 + hummock * 0.04 * (1 - shelf)
}

export type PineShadowCaster = {
  x: number
  z: number
  radius: number
  height: number
}

/** 5-blade foreground turf tuft (30 tris/tuft) with warm golden-chartreuse sunlit tips */
function buildForegroundTurfGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = []
  const count = 5
  const cRoot = new THREE.Color('#5a7830')
  const cMid = new THREE.Color('#a2c25a')
  const cTip = new THREE.Color('#eaefa6')
  const tmp = new THREE.Color()

  for (let b = 0; b < count; b++) {
    const az = (b / count) * Math.PI * 2 + b * 0.78
    const h = 0.10 + (b % 3) * 0.018
    const lean = 0.055 + (b % 3) * 0.026
    const wBase = 0.0085
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
      const w = wBase * (1 - t * 0.94)
      const bend = Math.pow(t, 1.6) * lean
      const cx = dx * bend
      const cy = h * t * (1 - 0.14 * t)
      const cz = dz * bend

      positions.push(cx - px * w, cy, cz - pz * w, cx + px * w, cy, cz + pz * w)
      normals.push(dx * 0.28, 0.92, dz * 0.28, dx * 0.28, 0.92, dz * 0.28)

      tmp
        .copy(cRoot)
        .lerp(cMid, THREE.MathUtils.smoothstep(t, 0.0, 0.45))
        .lerp(cTip, THREE.MathUtils.smoothstep(t, 0.38, 1.0))
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

/** Warm golden-yellow wildflower bloom nested in meadow drifts */
function buildButtercupGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const cStem = new THREE.Color('#749444')
  const cBloom = new THREE.Color('#f7d864')
  const cBloomTip = new THREE.Color('#fff4ae')

  const stem = new THREE.CylinderGeometry(0.002, 0.003, 0.11, 4)
  stem.translate(0, 0.055, 0)
  const sPos = stem.attributes.position as THREE.BufferAttribute
  const sCols = new Float32Array(sPos.count * 3)
  for (let i = 0; i < sPos.count; i++) {
    sCols[i * 3] = cStem.r
    sCols[i * 3 + 1] = cStem.g
    sCols[i * 3 + 2] = cStem.b
  }
  stem.setAttribute('color', new THREE.BufferAttribute(sCols, 3))
  parts.push(stem)

  const cup = new THREE.SphereGeometry(0.015, 7, 5)
  cup.scale(1.1, 0.5, 1.1)
  cup.translate(0, 0.112, 0)
  const cPos = cup.attributes.position as THREE.BufferAttribute
  const cCols = new Float32Array(cPos.count * 3)
  for (let i = 0; i < cPos.count; i++) {
    const top = THREE.MathUtils.smoothstep(cPos.getY(i), 0.105, 0.12)
    const col = cBloom.clone().lerp(cBloomTip, top)
    cCols[i * 3] = col.r
    cCols[i * 3 + 1] = col.g
    cCols[i * 3 + 2] = col.b
  }
  cup.setAttribute('color', new THREE.BufferAttribute(cCols, 3))
  parts.push(cup)

  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return merged
}

export function LakeGround({
  casters = [],
  sunDir = [0.48, 0.56, -0.67],
}: {
  casters?: PineShadowCaster[]
  sunDir?: [number, number, number]
}) {
  const turfRef = useRef<THREE.InstancedMesh>(null)
  const flowerRef = useRef<THREE.InstancedMesh>(null)

  const { geo, mat, turfGeo, turfMat, turfInstances, flowerGeo, flowerMat, flowerInstances } = useMemo(() => {
    // 110x126 grid (~27.7k tris) — keeps total scene well below 250k tris on SwiftShader
    const segX = 96
    const segZ = 110
    const g = new THREE.PlaneGeometry(76, 74, segX, segZ)
    g.rotateX(-Math.PI / 2)
    g.translate(0, 0, -32)

    const pos = g.attributes.position as THREE.BufferAttribute
    const count = pos.count
    const colors = new Float32Array(count * 3)

    const sun = new THREE.Vector3(...sunDir).normalize()
    const sx = -sun.x / Math.max(sun.y, 0.3)
    const sz = -sun.z / Math.max(sun.y, 0.3)

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i)
      const rawZ = pos.getZ(i)
      const u = THREE.MathUtils.clamp((5 - rawZ) / 74, 0, 1)
      const warpedZ = 4.5 - Math.pow(u, 1.55) * 66.0
      const y = lakeHeight(x, warpedZ)
      pos.setXYZ(i, x, y, warpedZ)
    }
    pos.needsUpdate = true
    g.computeVertexNormals()

    const norm = g.attributes.normal as THREE.BufferAttribute
    // Wide painterly contrast: warm yellow-green sunlit patches (#acc65c) vs deep olive shade (#344a24)
    const cMeadowSun = new THREE.Color('#93b24e')
    const cMeadowWarm = new THREE.Color('#b6cc70')
    const cMeadowOlive = new THREE.Color('#4c6a2c')
    const cMeadowDeep = new THREE.Color('#3f5a28')
    const cWetShore = new THREE.Color('#243236')
    const cPebbleShore = new THREE.Color('#b6bcb2')
    const cLakeBed = new THREE.Color('#081424')
    const cFarBank = new THREE.Color('#4a6a58')
    const cShadowTint = new THREE.Color('#34444a')
    const tmp = new THREE.Color()

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const nx = norm.getX(i)
      const ny = norm.getY(i)
      const nz = norm.getZ(i)

      const ndotl = nx * sun.x + ny * sun.y + nz * sun.z
      const sunFace = THREE.MathUtils.smoothstep(ndotl, -0.05, 0.78)
      const patch = fbm(x * 0.36 - 1.3, z * 0.36 + 2.9, 4)
      const deepPocket = fbm(x * 1.25 + 4.1, z * 1.25 - 2.3, 3)

      if (z < -34) {
        const above = THREE.MathUtils.smoothstep(y, -0.12, 0.35)
        tmp.copy(cLakeBed).lerp(cFarBank, above)
      } else if (y < 0.02) {
        const depthT = THREE.MathUtils.smoothstep(y, -0.32, 0.02)
        tmp.copy(cLakeBed).lerp(cWetShore, depthT)
      } else {
        tmp.copy(cMeadowOlive).lerp(cMeadowSun, sunFace)
        tmp.lerp(cMeadowWarm, THREE.MathUtils.smoothstep(patch, 0.42, 0.82) * 0.72)
        tmp.lerp(cMeadowDeep, THREE.MathUtils.smoothstep(deepPocket, 0.48, 0.85) * 0.68)

        // Bright pebbly strip right above the wet shoreline (y = 0.035..0.105) matching ref4_shore
        const pebbleBand =
          THREE.MathUtils.smoothstep(y, 0.03, 0.058) * (1 - THREE.MathUtils.smoothstep(y, 0.07, 0.12))
        tmp.lerp(cPebbleShore, pebbleBand * 0.68)

        const wet = 1 - THREE.MathUtils.smoothstep(y, 0.02, 0.055)
        tmp.lerp(cWetShore, wet * 0.86)
      }

      if (y > 0.01 && z > -35) {
        let shadow = 0
        for (let c = 0; c < casters.length; c++) {
          const sc = casters[c]
          const dBase = Math.hypot((x - sc.x) / (sc.radius * 0.85), (z - sc.z) / (sc.radius * 0.85))
          const sBase = (1 - THREE.MathUtils.smoothstep(dBase, 0.15, 1.15)) * 0.68

          const px = sc.x + sx * sc.height * 0.52
          const pz = sc.z + sz * sc.height * 0.52
          const dCanopy = Math.hypot((x - px) / (sc.radius * 1.5), (z - pz) / (sc.radius * 1.5))
          const sCanopy = (1 - THREE.MathUtils.smoothstep(dCanopy, 0.15, 1.45)) * 0.48

          shadow = Math.max(shadow, sBase, sCanopy)
        }
        tmp.lerp(cShadowTint, THREE.MathUtils.clamp(shadow, 0, 0.68))
        // terrain proximity: the turf darkens at the trunk's foot, so the tree is planted, not pasted
        let occl = 0
        for (let c = 0; c < casters.length; c++) {
          const sc = casters[c]
          const dFoot = Math.hypot((x - sc.x) / (sc.radius * 0.5), (z - sc.z) / (sc.radius * 0.5))
          occl = Math.max(occl, Math.pow(1 - THREE.MathUtils.smoothstep(dFoot, 0.0, 1.0), 1.7))
        }
        tmp.multiplyScalar(1 - occl * 0.35)
      }

      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }

    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0,
    })

    applyPainterlySurface(m, {
      soft: 0.85,
      brush: 0.7,
      rimColor: '#fff4c8',
      shadowTint: '#364b42',
      sunDir,
    })

    const prevCompile = m.onBeforeCompile
    m.onBeforeCompile = (shader, renderer) => {
      prevCompile(shader, renderer)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vPaintWorldPos.y > 0.025) {
          float camD = length(vPaintWorldPos - cameraPosition);
          float detailFade = 1.0 - smoothstep(2.0, 22.0, camD);
          vec2 p = vPaintWorldPos.xz;
          float clump = sin(p.x * 10.5 + sin(p.y * 7.2) * 1.9);
          float blades1 = sin(p.x * 38.0 + p.y * 22.0);
          float blades2 = cos(p.y * 44.0 - p.x * 29.0);
          float mottle = (clump * 0.38 + blades1 * 0.34 + blades2 * 0.28) * 0.34 * detailFade;
          diffuseColor.rgb *= 1.0 + mottle;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.54, 0.70, 0.50), smoothstep(0.02, 0.20, -mottle));
        }`,
      )
    }
    m.customProgramCacheKey = () => 'lake-ground-painterly-v5'

    // 680 foreground turf tufts (~20.4k tris) — budget-safe coverage to bottom of frame
    const tGeo = buildForegroundTurfGeometry()
    const tMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.76,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    applyPainterlySurface(tMat, {
      soft: 0.85,
      rimColor: '#fff5c4',
      shadowTint: '#344e2e',
      sunDir,
    })

    const tList: { x: number; y: number; z: number; sx: number; sy: number; yaw: number; color: THREE.Color }[] = []
    const tCount = 680
    for (let i = 0; i < tCount; i++) {
      const u = Math.pow(hash2(i * 1.41, 6.13), 1.15)
      const z = -0.26 - u * 1.45
      const spreadX = 0.85 + Math.max(0, -z) * 0.92
      const x = (hash2(i * 2.71, 3.19) * 2 - 1) * spreadX
      const y = lakeHeight(x, z)
      const t = hash2(i * 5.23, 8.41)
      const col = new THREE.Color('#7ca044').lerp(new THREE.Color('#d6e47e'), t)
      const nearScale = 0.65 + 0.45 * THREE.MathUtils.smoothstep(-z, 0.26, 1.1)
      const s = (0.78 + 0.52 * hash2(i * 3.17, 9.07)) * nearScale
      tList.push({
        x,
        y: y - 0.01,
        z,
        sx: s * (1.0 + 0.45 * hash2(i, 4.1)),
        sy: s * (0.85 + 0.35 * t),
        yaw: hash2(i * 4.91, 2.37) * Math.PI * 2,
        color: col,
      })
    }

    // 320 warm yellow wildflower clusters nested in meadow drifts
    const fGeo = buildButtercupGeometry()
    const fMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0,
    })
    applyPainterlySurface(fMat, {
      soft: 0.65,
      rimColor: '#fff9d6',
      shadowTint: '#8a8c58',
      sunDir,
    })

    const fList: { x: number; y: number; z: number; scale: number; yaw: number }[] = []
    let k = 0
    while (fList.length < 320 && k < 3200) {
      k++
      const u = Math.pow(hash2(k * 1.83, 3.41), 1.2)
      const z = -0.85 - u * 6.4
      const spreadX = 1.2 + Math.max(0, -z) * 0.85
      const x = (hash2(k * 2.97, 7.13) * 2 - 1) * spreadX
      if (z < lakeShoreZ(x) + 0.4) continue
      const drift = Math.sin(x * 1.25 - z * 0.9) * 0.5 + 0.5
      if (hash2(k * 6.41, 1.79) > 0.22 + drift * 0.72) continue
      fList.push({
        x,
        y: lakeHeight(x, z) - 0.006,
        z,
        scale: 0.72 + hash2(k * 4.19, 8.53) * 0.55,
        yaw: hash2(k * 3.53, 5.29) * Math.PI * 2,
      })
    }

    return {
      geo: g,
      mat: m,
      turfGeo: tGeo,
      turfMat: tMat,
      turfInstances: tList,
      flowerGeo: fGeo,
      flowerMat: fMat,
      flowerInstances: fList,
    }
  }, [casters, sunDir])

  useLayoutEffect(() => {
    const tm = turfRef.current
    if (tm) {
      const dummy = new THREE.Object3D()
      turfInstances.forEach((item, idx) => {
        dummy.position.set(item.x, item.y, item.z)
        dummy.rotation.set(0, item.yaw, 0)
        dummy.scale.set(item.sx, item.sy, item.sx)
        dummy.updateMatrix()
        tm.setMatrixAt(idx, dummy.matrix)
        tm.setColorAt(idx, item.color)
      })
      tm.instanceMatrix.needsUpdate = true
      if (tm.instanceColor) tm.instanceColor.needsUpdate = true
    }

    const fm = flowerRef.current
    if (fm) {
      const dummy = new THREE.Object3D()
      flowerInstances.forEach((item, idx) => {
        dummy.position.set(item.x, item.y, item.z)
        dummy.rotation.set(0.14, item.yaw, 0)
        dummy.scale.setScalar(item.scale)
        dummy.updateMatrix()
        fm.setMatrixAt(idx, dummy.matrix)
      })
      fm.instanceMatrix.needsUpdate = true
    }
  }, [turfInstances, flowerInstances])

  return (
    <group>
      <mesh geometry={geo} material={mat} />
      <instancedMesh ref={turfRef} args={[turfGeo, turfMat, turfInstances.length]} />
      <instancedMesh ref={flowerRef} args={[flowerGeo, flowerMat, flowerInstances.length]} />
    </group>
  )
}
