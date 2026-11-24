import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { CAUSTICS_GLSL, UW_GLSL, createCausticUniforms, createMediumUniforms, type CausticUniforms } from './caustics'
import type { Lake } from './LakeWater'

/**
 * KelpForest — Giant Kelp (*Macrocystis pyrifera*), the underwater verticals.
 *
 * `REFERENCES.md` §15 is the spec this is built against: a massive holdfast,
 * rope-like stipes ~1 cm thick to 45 m, a ladder of corrugated blades each
 * attached at a single amber pneumatocyst, and a canopy that reads as a
 * colonnade when you look *up* it. Colours are never hand-picked: the blades
 * go through the same Beer-Lambert ramp as the water (`exp(-k·d)`, red first),
 * so kelp at 6 m and the water at 6 m agree.
 *
 * House rules kept: **zero fish or animals** (the brief says so twice), two or
 * three flat value steps rather than a gradient, no ink on plants — the
 * silhouette and a rim do the edge. One merged geometry for stipes, blades and
 * holdfast (one draw) plus one for the floats (a second draw, because the
 * pneumatocyst's single specular dot is what sells kelp). Every ribbon sways
 * in the vertex shader from the same `uTime` the lake uses; nothing is
 * animated on the CPU.
 */

export type KelpOptions = {
  /** how many fronds to grow (12–18 is the reference colonnade; 24 reads as a forest) */
  count?: number
  /** centre of the bed on the world plane */
  center?: [number, number]
  /** radius of the bed */
  radius?: number
  /** tallest stipe in metres (clamped to stay under the surface) */
  height?: number
  /** deterministic seed, so QA frames are reproducible */
  seed?: number
  /** keep the plants this far below the surface */
  clearance?: number
}

const mulberry = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

type Builder = {
  pos: number[]
  nrm: number[]
  aT: number[]
  aPhase: number[]
  aSway: number[]
  aKind: number[]
  idx: number[]
}

const push = (b: Builder, p: THREE.Vector3, n: THREE.Vector3, t: number, phase: number, sway: number, kind: number) => {
  b.pos.push(p.x, p.y, p.z)
  b.nrm.push(n.x, n.y, n.z)
  b.aT.push(t)
  b.aPhase.push(phase)
  b.aSway.push(sway)
  b.aKind.push(kind)
  return b.pos.length / 3 - 1
}

/** a corrugated blade: 4 rows x 3 columns, tapered, drooping, with a crease.
 *  REFERENCES §15: real Macrocystis blades are corrugated and hang from the
 *  pneumatocyst on a short pedicel — a flat triangle reads as a sapling leaf. */
function addBlade(
  b: Builder,
  base: THREE.Vector3,
  dir: THREE.Vector3,
  length: number,
  width: number,
  t: number,
  phase: number,
  sway: number,
  rnd: () => number,
) {
  const side = new THREE.Vector3(-dir.z, 0.18 * (rnd() - 0.5), dir.x)
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0)
  side.normalize()
  const normal = new THREE.Vector3().crossVectors(dir, side).normalize()
  const droop = 0.25 + rnd() * 0.45
  const twist = (rnd() - 0.5) * 0.5
  const rows = 4
  const ring: number[] = []
  for (let r = 0; r < rows; r++) {
    const u = r / (rows - 1)
    const centre = base
      .clone()
      .addScaledVector(dir, length * u)
      .addScaledVector(normal, 0.05 * Math.sin(u * Math.PI) * length)
      .add(new THREE.Vector3(0, -droop * length * u * u, 0))
    const half = width * (0.5 - 0.42 * u * u)
    const crease = 0.03 * length * (1 - 0.6 * u)
    for (let c = -1; c <= 1; c++) {
      const lateral = side.clone().applyAxisAngle(dir, twist * u)
      const p = centre.clone().addScaledVector(lateral, half * c)
      if (c === 0) p.addScaledVector(normal, crease)
      const n = normal.clone().addScaledVector(lateral, c * 0.45).normalize()
      ring.push(push(b, p, n, t, phase, sway * (0.5 + 0.5 * u), 1))
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    const o = ring[r * 3]
    // left quad + right quad of this band
    b.idx.push(o, o + 1, o + 4, o, o + 4, o + 3)
    b.idx.push(o + 1, o + 2, o + 5, o + 1, o + 5, o + 4)
  }
}

/** a tapered tube segment used for the holdfast's root fingers */
function addRoot(b: Builder, base: THREE.Vector3, dir: THREE.Vector3, length: number, phase: number) {
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize()
  const ring: number[] = []
  for (let s = 0; s < 3; s++) {
    const t = s / 2
    const centre = base.clone().addScaledVector(dir, length * t)
    const r = 0.045 * (1 - 0.75 * t)
    for (const c of [-1, 1]) {
      const p = centre.clone().addScaledVector(side, r * c)
      const n = side.clone().multiplyScalar(c)
      ring.push(push(b, p, n, 0, phase, 0, 2))
    }
  }
  for (let s = 0; s < 2; s++) {
    const o = ring[s * 2] - 2
    b.idx.push(o, o + 1, o + 3, o, o + 3, o + 2)
  }
}

function addFloat(b: Builder, at: THREE.Vector3, size: number, t: number, phase: number, sway: number) {
  // 6 x 4 ellipsoid — enough for a lit dot at arm's length
  const seg = 6
  const rows = 4
  const first = b.pos.length / 3
  for (let r = 0; r <= rows; r++) {
    const phi = (r / rows) * Math.PI
    for (let s = 0; s < seg; s++) {
      const th = (s / seg) * Math.PI * 2
      const n = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th))
      const p = new THREE.Vector3(at.x + n.x * size * 1.25, at.y + n.y * size, at.z + n.z * size * 1.25)
      push(b, p, n, t, phase, sway, 3)
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < seg; s++) {
      const a = first + r * seg + s
      const bb = first + r * seg + ((s + 1) % seg)
      const c = first + (r + 1) * seg + ((s + 1) % seg)
      const d = first + (r + 1) * seg + s
      b.idx.push(a, bb, c, a, c, d)
    }
  }
}

export function buildKelpGeometry(lake: Lake, options: KelpOptions = {}) {
  const count = options.count ?? 28
  const center = options.center ?? lake.config.center
  const radius = options.radius ?? Math.min(26, lake.config.basinRadius * 0.55)
  const tallest = options.height ?? 9
  const clearance = options.clearance ?? 0.06
  const rnd = mulberry(options.seed ?? 20261124)

  const body: Builder = { pos: [], nrm: [], aT: [], aPhase: [], aSway: [], aKind: [], idx: [] }

  let placed = 0
  let guard = 0
  while (placed < count && guard++ < count * 24) {
    const angle = rnd() * Math.PI * 2
    const r = Math.sqrt(rnd()) * radius
    const x = center[0] + Math.cos(angle) * r
    const z = center[1] + Math.sin(angle) * r
    const depth = lake.bedDepth(x, z)
    if (depth < 1.6) continue // kelp needs a bed it can stand on
    const base = new THREE.Vector3(x, lake.config.bedAt(x, z) + 0.04, z)
    const H = Math.min(tallest * (0.62 + 0.38 * rnd()), depth - clearance)
    if (H < 2) continue
    const phase = rnd() * Math.PI * 2
    const leanDir = rnd() * Math.PI * 2
    const lean = 0.16 + rnd() * 0.22
    const sway = 0.35 + H * 0.075
    const seg = 13
    const S = new THREE.Vector3(Math.cos(leanDir), 0, Math.sin(leanDir))
    const P = new THREE.Vector3(-S.z, 0, S.x)

    // ---- stipe: a rope with a slow S-curve, 13 rings
    const rings: THREE.Vector3[] = []
    const ringT: number[] = []
    for (let s = 0; s <= seg; s++) {
      const t = s / seg
      const p = base
        .clone()
        .add(new THREE.Vector3(0, H * t, 0))
        .addScaledVector(S, lean * H * Math.pow(t, 1.5))
        .addScaledVector(P, Math.sin(t * 3.9 + phase) * 0.055 * H * Math.pow(t, 1.6))
      rings.push(p)
      ringT.push(t)
    }
    for (let s = 0; s <= seg; s++) {
      const t = ringT[s]
      const p = rings[s]
      const tangent = (s === seg ? rings[s].clone().sub(rings[s - 1]) : rings[s + 1].clone().sub(rings[s])).normalize()
      const side = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 0, 1))
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0)
      side.normalize()
      const w = 0.065 * (1 - 0.5 * t)
      for (const c of [-1, 1]) {
        const vert = p.clone().addScaledVector(side, w * c)
        push(body, vert, side.clone().multiplyScalar(c), t, phase, sway, 0)
      }
    }
    for (let s = 0; s < seg; s++) {
      const o = body.pos.length / 3 - (seg + 1) * 2 + s * 2
      body.idx.push(o, o + 1, o + 3, o, o + 3, o + 2)
    }

    // ---- holdfast: root fingers gripping the bed
    const fingers = 6 + Math.floor(rnd() * 3)
    for (let f = 0; f < fingers; f++) {
      const a = (f / fingers) * Math.PI * 2 + rnd() * 0.6
      const dir = new THREE.Vector3(Math.cos(a), -0.55 - rnd() * 0.25, Math.sin(a)).normalize()
      addRoot(body, base.clone().add(new THREE.Vector3(0, 0.12, 0)), dir, 0.28 + rnd() * 0.3, phase)
    }

    // ---- blades: one per pneumatocyst, alternating sides, bigger mid-frond
    const blades = 16
    for (let i2 = 0; i2 < blades; i2++) {
      const t = 0.13 + (i2 / blades) * 0.83
      const s = Math.min(seg, Math.round(t * seg))
      const at = rings[s].clone()
      const canopy = t > 0.9
      const outward = S.clone().multiplyScalar(Math.cos(i2 * 2.1 + phase) * 0.9)
        .addScaledVector(P, Math.sin(i2 * 2.1 + phase) * 0.9)
        .add(new THREE.Vector3(0, canopy ? 0.06 + rnd() * 0.1 : 0.55 + rnd() * 0.35, 0))
        .normalize()
      const taper = 1 - Math.pow(Math.abs(t - 0.55) * 1.35, 2)
      const length = (0.7 + rnd() * 0.5) * (0.55 + 0.75 * Math.max(0.15, taper)) * (H / 8 + 0.5) * (canopy ? 1.5 : 1)
      const width = length * (0.5 + rnd() * 0.16)
      addBlade(body, at.clone().addScaledVector(outward, 0.03), outward, length, width, t, phase, sway, rnd)
      addFloat(body, at.clone().addScaledVector(outward, 0.055), 0.05 + rnd() * 0.025, t, phase, sway * 0.8)
    }

    placed++
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(body.pos, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(body.nrm, 3))
  geometry.setAttribute('aT', new THREE.Float32BufferAttribute(body.aT, 1))
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(body.aPhase, 1))
  geometry.setAttribute('aSway', new THREE.Float32BufferAttribute(body.aSway, 1))
  geometry.setAttribute('aKind', new THREE.Float32BufferAttribute(body.aKind, 1))
  geometry.setIndex(body.idx)
  geometry.computeBoundingSphere()
  return geometry
}

/* ------------------------------------------------------------------------ *
 * Shaders
 * ------------------------------------------------------------------------ */

const KELP_VERT = /* glsl */ `
uniform float uTime;
uniform vec2 uCurrent;

attribute float aT;
attribute float aPhase;
attribute float aSway;
attribute float aKind;

out vec3 vWorld;
out vec3 vNormal;
out float vT;
out float vKind;

void main() {
  vec3 p = position;
  /* sway: one slow breath along the frond, phase-shifted per plant, growing
     with height^1.4 — a kelp stipe pivots at the holdfast, it does not flap */
  float bend = pow(clamp(aT, 0.0, 1.0), 1.4);
  float s1 = sin(uTime * 0.55 + aPhase + aT * 2.2) * 0.62;
  float s2 = sin(uTime * 0.33 + aPhase * 1.7 + aT * 3.6) * 0.38;
  vec2 dir = vec2(cos(aPhase * 1.3 + aT * 0.8), sin(aPhase * 1.3 + aT * 0.8));
  p.xz += dir * (s1 + s2) * aSway * bend;
  p.xz += uCurrent * bend * bend * 0.55;
  p.y += sin(uTime * 0.7 + aPhase * 2.0 + aT * 4.0) * 0.014 * aT;

  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vT = aT;
  vKind = aKind;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const KELP_FRAG = /* glsl */ `
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in float vT;
in float vKind;

uniform vec3 uCamPos;
uniform float uTime;
uniform vec3 uKelpDeep;
uniform vec3 uKelpLit;
uniform vec3 uKelpFloat;
uniform vec3 uKelpHold;

layout(location = 0) out vec4 fragColor;

${CAUSTICS_GLSL}
${UW_GLSL}

void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(uCamPos - vWorld);
  if (dot(n, view) < 0.0) n = -n;            // blades are one-sided cards
  vec3 sun = normalize(uSunDir);

  // cylindrical shading, quantised to three values (house style: no gradients)
  float lam = 0.5 + 0.5 * dot(n, sun);
  float step3 = smoothstep(0.40, 0.46, lam) * 0.55 + smoothstep(0.66, 0.72, lam) * 0.45;
  float rim = pow(1.0 - max(dot(n, view), 0.0), 3.0);

  vec3 alb = uKelpDeep;
  if (vKind > 2.5) alb = uKelpFloat;
  else if (vKind > 1.5) alb = uKelpHold;
  else if (vKind > 0.5) alb = mix(uKelpDeep, uKelpLit, 0.35 + 0.4 * vT);

  vec3 col = mix(alb * 0.55, alb, step3);
  col += uKelpLit * rim * 0.35;
  // the float's single specular dot: the sparkle that sells kelp
  if (vKind > 2.5) {
    float spec = pow(max(dot(reflect(-view, n), sun), 0.0), 64.0);
    col += vec3(1.0, 0.94, 0.76) * spec * 1.6;
  }

  // caustic dapple, projected on the frond from the moving surface
  float dapple = causticDapple(vWorld.xz + vec2(0.0, vWorld.y * 0.22));
  col *= 1.0 + (dapple - 0.35) * 0.55;

  float depth = max(uLevel - vWorld.y, 0.0);
  float dist = length(uCamPos - vWorld);
  fragColor = vec4(uwSrgb(uwTint(col, depth, dist)), 1.0);
}
`

/* ------------------------------------------------------------------------ *
 * Core + component
 * ------------------------------------------------------------------------ */

export type KelpForestHandles = {
  group: THREE.Group
  material: THREE.ShaderMaterial
  uniforms: Record<string, THREE.IUniform>
  update: (time: number, camera: THREE.Camera) => void
  dispose: () => void
}

export function createKelpForest(
  lake: Lake,
  options: KelpOptions & { caustics?: CausticUniforms; sunDir?: THREE.Vector3 } = {},
): KelpForestHandles {
  const caustics = options.caustics ?? createCausticUniforms()
  const geometry = buildKelpGeometry(lake, options)
  const medium = createMediumUniforms(lake.config.level)

  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uCurrent: { value: new THREE.Vector2(0.06, 0.03) },
    uKelpDeep: { value: new THREE.Color('#2b3416') },
    uKelpLit: { value: new THREE.Color('#6f7a33') },
    uKelpFloat: { value: new THREE.Color('#9c6f22') },
    uKelpHold: { value: new THREE.Color('#2f261b') },
    uLevel: medium.uLevel,
    uUwAbs: medium.uUwAbs,
    uUwScatter: medium.uUwScatter,
    uSunDir: medium.uSunDir,
    uUwBeam: medium.uUwBeam,
    uCaus: caustics.uCaus,
    uCausTint: caustics.uCausTint,
    uCausTex: caustics.uCausTex,
  }

  if (options.sunDir) (uniforms.uSunDir.value as THREE.Vector3).copy(options.sunDir).normalize()

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: KELP_VERT,
    fragmentShader: KELP_FRAG,
    uniforms,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'KelpForest'
  mesh.frustumCulled = false
  mesh.renderOrder = 5

  const group = new THREE.Group()
  group.name = 'KelpForestGroup'
  group.add(mesh)

  const update = (time: number, camera: THREE.Camera) => {
    uniforms.uTime.value = time
    uniforms.uCamPos.value.copy(camera.position)
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  return { group, material, uniforms, update, dispose }
}

export type KelpForestProps = {
  lake: Lake
  options?: KelpOptions
  caustics?: CausticUniforms
  sunDir?: THREE.Vector3
}

export function KelpForest({ lake, options, caustics, sunDir }: KelpForestProps) {
  const handles = useMemo(
    () => createKelpForest(lake, { ...options, caustics, sunDir }),
    [lake, options, caustics, sunDir],
  )
  useFrame((state) => handles.update(state.clock.elapsedTime, state.camera))
  return <primitive object={handles.group} />
}
