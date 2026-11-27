import { useMemo } from 'react'
import * as THREE from 'three'
import { applyPainterlySurface } from '../scan/Fit'

export const POOL = { x: -0.35, z: -6.1, rx: 4.5, rz: 3.1 }

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
    freq *= 2.03
    amp *= 0.5
  }
  return v
}

/** Sharp-crested wind dune ridge function: 1 - |sin| shaped by domain warp */
function duneRidge(x: number, z: number): number {
  const warp = (fbm(x * 0.08 + 3.1, z * 0.08 - 1.7, 3) - 0.5) * 3.4
  const phase = x * 0.19 + z * 0.28 + warp
  const r = 1 - Math.abs(Math.sin(phase))
  return Math.pow(r, 1.65)
}

export function poolEdge(angle: number): number {
  const n1 = Math.sin(angle * 2.0 + 0.5) * 0.14
  const n2 = Math.cos(angle * 3.0 - 0.8) * 0.09
  const n3 = Math.sin(angle * 5.0 + 1.4) * 0.04
  return 1 + n1 + n2 + n3
}

/** Deterministic ground height used by DuneField and every prop placement */
export function oasisHeight(x: number, z: number): number {
  const dx = (x - POOL.x) / POOL.rx
  const dz = (z - POOL.z) / POOL.rz
  const angle = Math.atan2(dz, dx)
  const radial = Math.hypot(dx, dz) / poolEdge(angle)

  // Pool basin: -0.68m deep in center, rising smoothly across shoreline (radial = 1.0 -> y = 0.02)
  const basin = THREE.MathUtils.smoothstep(radial, 0.25, 1.18)
  let h = THREE.MathUtils.lerp(-0.68, 0.26, basin)

  // Shore bank swell outside the water edge
  const bankMask = THREE.MathUtils.smoothstep(radial, 0.96, 1.55)

  // Background wind-sculpted dunes rising behind the oasis (z < -10)
  const backDist = Math.max(0, -z - 9.5)
  const ridge1 = duneRidge(x * 0.85, z * 0.95) * (0.45 + backDist * 0.16)
  const ridge2 = duneRidge(x * 1.4 - 4.0, z * 1.2 + 2.0) * (0.25 + backDist * 0.08)
  h += bankMask * (ridge1 + ridge2)

  // Gentle foreground sand undulation
  h += (fbm(x * 0.22 + 5.2, z * 0.22 - 3.4, 3) - 0.45) * 0.34 * bankMask

  // Right-foreground stepped sandstone/dune promontory (matches ref bottom-right framing)
  const promDist = Math.hypot((x - 3.3) / 2.6, (z + 2.1) / 1.9)
  const prom = 1 - THREE.MathUtils.smoothstep(promDist, 0.35, 1.25)
  const stepTerrace = Math.floor(prom * 3.2) * 0.12 + prom * 0.48
  h += stepTerrace

  // Left-foreground gentle dune rise
  const leftRise = 1 - THREE.MathUtils.smoothstep(Math.hypot((x + 4.4) / 3.2, (z + 1.6) / 2.4), 0.3, 1.3)
  h += leftRise * 0.32

  return h
}

export type ShadowCaster = {
  x: number
  z: number
  rx: number
  rz: number
  strength: number
}

export function DuneField({
  casters = [],
  sunDir = [-5, 6.5, -3],
}: {
  casters?: ShadowCaster[]
  sunDir?: [number, number, number]
}) {
  const { geo, mat } = useMemo(() => {
    const width = 96
    const depth = 96
    const segs = 180
    const g = new THREE.PlaneGeometry(width, depth, segs, segs)
    g.rotateX(-Math.PI / 2)
    g.translate(0, 0, -28)

    const pos = g.attributes.position as THREE.BufferAttribute
    const count = pos.count
    const colors = new Float32Array(count * 3)

    const sun = new THREE.Vector3(...sunDir).normalize()
    // Ground projection offset for elevated canopies/lintels (sun comes from -X, +Y, -Z -> shadow falls +X, +Z)
    const sx = -sun.x / Math.max(sun.y, 0.25)
    const sz = -sun.z / Math.max(sun.y, 0.25)

    // 1. Displace vertices using oasisHeight
    for (let i = 0; i < count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      pos.setY(i, oasisHeight(x, z))
    }
    pos.needsUpdate = true
    g.computeVertexNormals()

    const norm = g.attributes.normal as THREE.BufferAttribute
    const colSandLit = new THREE.Color('#f4d0a2')
    const colSandCrest = new THREE.Color('#ffedcb')
    const colSandSlope = new THREE.Color('#c08f68')
    const colWetSand = new THREE.Color('#6d5546')
    const colShadowTint = new THREE.Color('#79626a')
    const tmp = new THREE.Color()

    // 2. Bake slope shading, wet shoreline capillary band, wind-ripple tone, and cast shadows
    for (let i = 0; i < count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const nx = norm.getX(i)
      const ny = norm.getY(i)
      const nz = norm.getZ(i)

      // Sun-facing slope vs slip-face leeward slope
      const ndotl = nx * sun.x + ny * sun.y + nz * sun.z
      const sunFace = THREE.MathUtils.smoothstep(ndotl, -0.15, 0.78)
      const crest = THREE.MathUtils.smoothstep(1 - ny, 0.04, 0.26)

      tmp.copy(colSandSlope).lerp(colSandLit, sunFace)
      tmp.lerp(colSandCrest, crest * sunFace * 0.55)

      // Subtle warm/cool mineral variation across the dunes
      const patch = fbm(x * 0.16 - 2.1, z * 0.16 + 4.3, 3)
      tmp.offsetHSL((patch - 0.5) * 0.025, (patch - 0.5) * 0.08, (patch - 0.5) * 0.06)

      // Wet shoreline band just above water level (y = 0.02 .. 0.16)
      const wet = 1 - THREE.MathUtils.smoothstep(y, 0.01, 0.17)
      tmp.lerp(colWetSand, wet * 0.62)

      // Analytical soft cast shadows from palm crowns, ruins, and rocks
      let shadow = 0
      for (let c = 0; c < casters.length; c++) {
        const sc = casters[c]
        // Sample both base contact shadow and sun-projected canopy/column shadow
        const dBase = Math.hypot((x - sc.x) / (sc.rx * 0.85), (z - sc.z) / (sc.rz * 0.85))
        const sBase = (1 - THREE.MathUtils.smoothstep(dBase, 0.2, 1.15)) * sc.strength * 0.65

        const projX = sc.x + sx * 1.9
        const projZ = sc.z + sz * 1.9
        const dProj = Math.hypot((x - projX) / (sc.rx * 1.6), (z - projZ) / (sc.rz * 1.6))
        const sProj = (1 - THREE.MathUtils.smoothstep(dProj, 0.2, 1.4)) * sc.strength * 0.46

        shadow = Math.max(shadow, sBase, sProj)
      }
      tmp.lerp(colShadowTint, THREE.MathUtils.clamp(shadow, 0, 0.72))

      // terrain proximity: the ground darkens where the mass actually meets it (no light, no shadow
      // map — just occlusion), so nothing reads as standing on a painted circle
      let occl = 0
      for (let c = 0; c < casters.length; c++) {
        const sc = casters[c]
        const dFoot = Math.hypot((x - sc.x) / (sc.rx * 0.5), (z - sc.z) / (sc.rz * 0.5))
        occl = Math.max(occl, Math.pow(1 - THREE.MathUtils.smoothstep(dFoot, 0.0, 1.0), 1.7))
      }
      tmp.multiplyScalar(1 - occl * 0.38)

      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }

    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.0,
    })

    // Inject procedural wind-ripple micro-relief in fragment shader so sand has tactile grain
    applyPainterlySurface(m, {
      soft: 0.85,
      brush: 0.75,
      rimColor: '#fff0d6',
      shadowTint: '#9c7864',
      sunDir,
      ripple: 1,
    })

    const prevCompile = m.onBeforeCompile
    m.onBeforeCompile = (shader, renderer) => {
      prevCompile(shader, renderer)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Fine wind-blown sand ripples modulated by slope and camera distance
        float camDist = length(vPaintWorldPos - cameraPosition);
        float rippleFade = 1.0 - smoothstep(4.0, 26.0, camDist);
        float warp = sin(vPaintWorldPos.x * 0.9 + vPaintWorldPos.z * 0.6) * 0.8;
        float ripple = sin((vPaintWorldPos.x * 5.2 + vPaintWorldPos.z * 7.8) + warp);
        float ripple2 = sin((vPaintWorldPos.x * 11.0 - vPaintWorldPos.z * 3.5) - warp * 0.5);
        float grain = (ripple * 0.65 + ripple2 * 0.35) * 0.032 * rippleFade;
        diffuseColor.rgb *= (1.0 + grain);`,
      )
    }
    m.customProgramCacheKey = () => 'oasis-dune-field-v1'

    return { geo: g, mat: m }
  }, [casters, sunDir])

  return <mesh geometry={geo} material={mat} receiveShadow />
}