import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { atmosphere, journey, sampleAtmosphere } from '../atmosphere/atmosphereState'
import { mulberry32 } from '../world/shared'

/**
 * The ocean floor — chapter eight, where the fallen star comes to rest.
 *
 * Nothing here is a prop dropped on a plane: every element is placed on the pool's real bed (the
 * same basin the water and the terrain agree on), shaded by the same underwater medium, and lit by
 * the star itself — a warm gold pool of light that falls off through the silt.
 *
 *  · the bed's ripples and silt belong to the terrain shader; this file adds what sits on it
 *  · boulders with a mossy crown and a silted base
 *  · sea fans and seagrass tufts, swaying in the slow current
 *  · a broken ship's hull, its mast leaning out of the silt, its timbers dark and barnacled
 *  · a weathered skeleton at rest near the wreck (tasteful: a silhouette in the haze, no gore)
 *  · distant fish, only ever silhouettes, drifting in the blue
 */

const BED = -12.6

/* ------------------------------------------------------------------ material */

const GLSL_UW = /* glsl */ `
uniform vec3 uHaze;
uniform vec3 uSunColor;
uniform vec3 uOrb;
uniform vec3 uGold;
uniform float uFog;
uniform float uTime;

vec3 medium(vec3 col, vec3 world) {
  float dist = length(world - cameraPosition);
  float fog = 1.0 - exp(-dist * 0.030 * uFog);
  col = mix(col, uHaze, clamp(fog * 0.92, 0.0, 0.9));
  // the star's own light: warm, soft, and gone within a few metres
  float d2 = dot(world.xz - uOrb.xz, world.xz - uOrb.xz);
  float dy = world.y - uOrb.y;
  float glow = exp(-(d2 + dy * dy) * 0.055);
  col += uGold * glow * 0.55;
  return col;
}
`

const rockVertex = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vSilt;

void main() {
  vec3 p = position;
  // a boulder, not a ball: three octaves of displacement, sealed at the base
  float n = sin(p.x * 3.1 + aSeed.x) * cos(p.y * 2.7 + aSeed.y) * sin(p.z * 3.4 + aSeed.z);
  p += normal * n * 0.18 * (0.5 + 0.5 * p.y);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vSilt = smoothstep(0.45, -0.1, p.y);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const propFragment = /* glsl */ `
${GLSL_UW}
uniform vec3 uSunDir;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vSilt;
layout(location = 0) out vec4 fragColor;

void main() {
  vec3 n = normalize(vNormal);
  float ndl = max(dot(n, normalize(uSunDir)), 0.0);
  float up = 0.5 + 0.5 * n.y;
  vec3 col = vColor * (0.30 + 0.55 * up + 0.35 * ndl);
  // silt settles on everything lying still
  col = mix(col, vec3(0.40, 0.40, 0.33), vSilt * 0.55);
  col = medium(col, vWorld);
  fragColor = vec4(col, 1.0);
}
`

/* ------------------------------------------------------------------- boulders */

function buildBoulders(): { geometry: THREE.BufferGeometry; seeds: Float32Array } {
  const rnd = mulberry32(0x77b2)
  const parts: THREE.BufferGeometry[] = []
  const seeds: number[] = []
  const spots: Array<[number, number, number, number]> = [
    [-15.5, -426.5, 2.4, 1.0],
    [-9.2, -430.5, 1.6, 0.8],
    [11.8, -428.5, 2.8, 0.9],
    [16.4, -433.5, 2.0, 1.1],
    [-19.5, -437.5, 2.2, 1.2],
    [19.0, -440.0, 2.6, 1.0],
    [4.8, -435.8, 1.4, 0.7],
    [-5.4, -444.5, 3.4, 1.3],
    [9.0, -446.0, 2.1, 0.9],
    [-12.0, -449.5, 2.4, 1.0],
    [23.0, -431.0, 1.8, 0.9],
    [-25.0, -433.5, 2.0, 1.0],
  ]
  for (const [x, z, s, h] of spots) {
    const geo = new THREE.IcosahedronGeometry(s, 1)
    geo.scale(1.25, 0.72 * h, 1.05)
    geo.translate(x, BED + s * 0.34 * h, z)
    const angles = geo.getAttribute('position').count
    for (let i = 0; i < angles; i++) seeds.push(rnd() * 6.28)
    const colors = new Float32Array(angles * 3)
    const base = new THREE.Color('#5c6155').convertLinearToSRGB()
    const moss = new THREE.Color('#54663f').convertLinearToSRGB()
    for (let i = 0; i < angles; i++) {
      const c = base.clone().lerp(moss, rnd() * 0.6)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    parts.push(geo)
  }
  return { geometry: mergeGeometries(parts), seeds: new Float32Array(seeds) }
}

/* --------------------------------------------------------------- sea fans */

function buildFans(): THREE.BufferGeometry {
  const rnd = mulberry32(0x2e19)
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const spots: Array<[number, number, number]> = [
    [-11.8, -429.6, 1.6],
    [8.6, -432.4, 1.8],
    [-16.4, -438.2, 1.4],
    [13.8, -440.0, 1.7],
    [4.4, -447.6, 1.5],
    [-7.6, -442.0, 1.3],
  ]
  for (const [x, z, s] of spots) {
    const arms = 16
    for (let a = 0; a < arms; a++) {
      const ang = (a / arms) * Math.PI - Math.PI * 0.5 + (rnd() - 0.5) * 0.16
      const len = s * (1.5 + rnd() * 0.9)
      const bend = (rnd() - 0.5) * 0.7
      const base = positions.length / 3
      const col = new THREE.Color().setHSL(0.36 + rnd() * 0.06, 0.28, 0.30 + rnd() * 0.08).convertLinearToSRGB()
      const tip = new THREE.Color().setHSL(0.34, 0.32, 0.44).convertLinearToSRGB()
      for (let k = 0; k <= 4; k++) {
        const t = k / 4
        const r = len * t
        const px = x + Math.sin(ang) * r * (1.0 - 0.15 * t) + bend * t * t
        const pz = z + Math.cos(ang) * r * (1.0 - 0.15 * t)
        const py = BED + 0.15 + len * (0.55 * t - 0.18 * t * t)
        const w = 0.06 * (1 - t * 0.8) + 0.012
        positions.push(px - w, py, pz, px + w, py, pz)
        const c = col.clone().lerp(tip, t)
        colors.push(c.r, c.g, c.b, c.r, c.g, c.b)
        if (k < 4) {
          const i0 = base + k * 2
          indices.push(i0, i0 + 1, i0 + 3, i0, i0 + 3, i0 + 2)
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

const fanVertex = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vSilt;
void main() {
  vec3 p = position;
  float sway = sin(uTime * 0.55 + p.x * 0.6 + p.z * 0.4) * 0.16 * clamp((p.y - ${BED.toFixed(2)}) * 0.5, 0.0, 1.0);
  p.x += sway;
  p.z += sway * 0.6;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vSilt = 0.0;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

/* ---------------------------------------------------------------- the wreck */

function buildWreck(): THREE.BufferGeometry {
  const rnd = mulberry32(0x3c4d)
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const addPlank = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    width: number,
    thick: number,
    col: THREE.Color,
  ) => {
    const dir = new THREE.Vector3().subVectors(b, a)
    const len = dir.length()
    const geo = new THREE.BoxGeometry(width, thick, len)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize())
    const m = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1))
    geo.applyMatrix4(m)
    const pos = geo.getAttribute('position')
    const base = positions.length / 3
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
      colors.push(col.r, col.g, col.b)
    }
    const idx = geo.getIndex()
    if (idx) for (let i = 0; i < idx.count; i++) indices.push(base + idx.getX(i))
    geo.dispose()
  }

  const hull = new THREE.Color('#3b3126').convertLinearToSRGB()
  const hullLit = new THREE.Color('#5a4a35').convertLinearToSRGB()

  // a broken hull: ribs rising out of the silt, planks along them
  const cx = -7.4
  const cz = -438.5
  const ribs = 9
  for (let r = 0; r < ribs; r++) {
    const t = r / (ribs - 1)
    const z = cz - 3.4 + t * 9.0
    const lean = Math.sin(t * 2.4) * 0.5
    const height = 1.7 * (1 - Math.abs(t - 0.4) * 0.9)
    for (let s = -1; s <= 1; s++) {
      const a = new THREE.Vector3(cx + s * 2.1 + lean, BED - 0.1, z)
      const b = new THREE.Vector3(cx + s * 1.2 + lean, BED + height, z)
      if (rnd() < 0.12) continue
      addPlank(a, b, 0.14, 0.22, hull.clone().lerp(hullLit, rnd() * 0.5))
    }
  }
  // planks along the hull, some missing
  for (let s = -1; s <= 1; s += 2) {
    for (let p = 0; p < 4; p++) {
      if (rnd() < 0.25) continue
      const a = new THREE.Vector3(cx + s * 1.7, BED + 0.5 + p * 0.34, cz - 3.2)
      const b = new THREE.Vector3(cx + s * 1.5, BED + 0.5 + p * 0.34, cz + 3.4)
      addPlank(a, b, 0.10, 0.14, hull.clone().multiplyScalar(0.9 + rnd() * 0.25))
    }
  }
  // the mast, snapped, leaning out of the wreck
  addPlank(new THREE.Vector3(cx + 0.4, BED, cz + 0.6), new THREE.Vector3(cx + 2.6, BED + 7.2, cz - 2.0), 0.26, 0.26, hullLit)
  addPlank(new THREE.Vector3(cx + 1.6, BED + 4.4, cz - 0.8), new THREE.Vector3(cx + 4.6, BED + 4.8, cz - 0.9), 0.12, 0.12, hull)
  // a fallen spar
  addPlank(new THREE.Vector3(cx - 1.6, BED + 0.1, cz + 2.2), new THREE.Vector3(cx + 1.4, BED + 0.25, cz + 5.4), 0.2, 0.2, hull)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/* --------------------------------------------------------------- the skeleton */

function buildSkeleton(): THREE.BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const bone = new THREE.Color('#c9bfa4').convertLinearToSRGB()
  const push = (geo: THREE.BufferGeometry, pos: THREE.Vector3, rot?: THREE.Euler, scale = 1) => {
    if (rot) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot))
    geo.scale(scale, scale, scale)
    geo.translate(pos.x, pos.y, pos.z)
    const p = geo.getAttribute('position')
    const base = positions.length / 3
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i))
      colors.push(bone.r, bone.g, bone.b)
    }
    const idx = geo.getIndex()
    if (idx) for (let i = 0; i < idx.count; i++) indices.push(base + idx.getX(i))
    geo.dispose()
  }
  const x = -2.2
  const z = -432.5
  const y = BED + 0.22
  // skull, jaw, spine, ribcage, one arm reaching out, legs
  push(new THREE.SphereGeometry(0.28, 12, 10), new THREE.Vector3(x, y + 0.24, z - 1.5), new THREE.Euler(0.2, 0.3, 0.1))
  push(new THREE.BoxGeometry(0.34, 0.10, 0.26), new THREE.Vector3(x, y + 0.06, z - 1.24), new THREE.Euler(0.25, 0, 0))
  for (let i = 0; i < 7; i++) {
    push(new THREE.CylinderGeometry(0.055, 0.06, 0.24, 6), new THREE.Vector3(x + 0.02 * i, y + 0.1 + i * 0.015, z - 1.1 + i * 0.26), new THREE.Euler(Math.PI / 2, 0, 0))
    if (i < 6) {
      push(new THREE.TorusGeometry(0.30 - i * 0.018, 0.022, 5, 14, Math.PI * 1.15), new THREE.Vector3(x, y + 0.16, z - 0.95 + i * 0.24), new THREE.Euler(0, Math.PI / 2, 0.25))
    }
  }
  push(new THREE.CylinderGeometry(0.045, 0.05, 0.62, 6), new THREE.Vector3(x + 0.38, y + 0.05, z - 0.72), new THREE.Euler(0.2, 0, 1.15))
  push(new THREE.CylinderGeometry(0.035, 0.04, 0.52, 6), new THREE.Vector3(x + 1.02, y + 0.02, z - 0.55), new THREE.Euler(0.2, 0, 1.35))
  push(new THREE.CylinderGeometry(0.05, 0.055, 0.7, 6), new THREE.Vector3(x - 0.02, y + 0.04, z + 0.9), new THREE.Euler(1.5, 0, 0.05))
  push(new THREE.CylinderGeometry(0.04, 0.045, 0.6, 6), new THREE.Vector3(x - 0.28, y + 0.03, z + 1.6), new THREE.Euler(1.6, 0.3, 0.3))

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/* -------------------------------------------------------------------- fish */

function buildFish(): THREE.BufferGeometry {
  const rnd = mulberry32(0x6b21)
  const positions: number[] = []
  const indices: number[] = []
  const centres: number[] = []
  const count = 46
  for (let i = 0; i < count; i++) {
    const cx = (rnd() - 0.5) * 40
    const cy = BED + 1.2 + rnd() * 6.5
    const cz = -392 - rnd() * 30
    const s = 0.16 + rnd() * 0.22
    const base = positions.length / 3
    // a slender silhouette: nose, tail, two fins
    positions.push(cx, cy, cz, cx - s * 2.2, cy + s * 0.5, cz, cx - s * 2.2, cy - s * 0.5, cz)
    positions.push(cx - s * 2.2, cy + s * 0.5, cz, cx - s * 3.4, cy + s * 1.1, cz, cx - s * 2.2, cy, cz)
    positions.push(cx - s * 2.2, cy - s * 0.5, cz, cx - s * 3.4, cy - s * 1.1, cz, cx - s * 2.2, cy, cz)
    for (let k = 0; k < 9; k += 3) indices.push(base + k, base + k + 1, base + k + 2)
    centres.push(cx, cy, cz, rnd(), rnd())
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  return geo
}

const fishVertex = /* glsl */ `
uniform float uTime;
attribute vec3 aCentre;
attribute vec2 aSeed;
varying vec3 vWorld;
varying float vAlpha;
void main() {
  vec3 p = position;
  vec3 c = aCentre;
  // a slow school drift, each fish a little out of phase
  float ph = aSeed.x * 6.28;
  c.x += sin(uTime * 0.07 + ph) * 9.0 + uTime * 0.22 * (0.6 + aSeed.y);
  c.y += sin(uTime * 0.11 + ph * 1.7) * 0.5;
  c.z += cos(uTime * 0.05 + ph * 1.3) * 2.4;
  p += c;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vAlpha = smoothstep(46.0, 12.0, -view.z);
  gl_Position = projectionMatrix * view;
}
`

const fishFragment = /* glsl */ `
${GLSL_UW}
uniform float uAmount;
varying vec3 vWorld;
varying float vAlpha;
layout(location = 0) out vec4 fragColor;
void main() {
  if (uAmount < 0.02) discard;
  vec3 col = vec3(0.10, 0.16, 0.19);
  float dist = length(vWorld - cameraPosition);
  col = mix(col, uHaze, clamp(1.0 - exp(-dist * 0.05), 0.0, 0.85));
  fragColor = vec4(col, 0.42 * uAmount * vAlpha);
}
`

/* ------------------------------------------------------------- geometry merge */

function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  let offset = 0
  for (const part of parts) {
    const pos = part.getAttribute('position')
    const nrm = part.getAttribute('normal')
    const col = part.getAttribute('color')
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
      normals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i))
      colors.push(col ? col.getX(i) : 1, col ? col.getY(i) : 1, col ? col.getZ(i) : 1)
    }
    const idx = part.getIndex()
    if (idx) for (let i = 0; i < idx.count; i++) indices.push(offset + idx.getX(i))
    else for (let i = 0; i < pos.count; i++) indices.push(offset + i)
    offset += pos.count
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeBoundingSphere()
  return geo
}

/* --------------------------------------------------------------- component */

function useUnderwater(object: THREE.Object3D | null, active: boolean) {
  if (object) object.visible = active
}

export function Seabed() {
  const scene = useThree((state) => state.scene)
  const boulders = useMemo(() => {
    const built = buildBoulders()
    built.geometry.setAttribute('aSeed', new THREE.BufferAttribute(built.seeds, 1))
    return built
  }, [])
  const fans = useMemo(() => buildFans(), [])
  const wreck = useMemo(() => buildWreck(), [])
  const skeleton = useMemo(() => buildSkeleton(), [])
  const fish = useMemo(() => buildFish(), [])
  const group = useRef<THREE.Group>(null)
  const orbPos = useRef(new THREE.Vector3())
  const shared = useMemo(
    () => ({
      uHaze: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() },
      uOrb: { value: new THREE.Vector3() },
      uGold: { value: new THREE.Color('#ffb347') },
      uFog: { value: 1 },
      uTime: { value: 0 },
      uAmount: { value: 1 },
    }),
    [],
  )

  const rockMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: rockVertex,
        fragmentShader: propFragment,
        uniforms: { ...shared, uOrb: { value: orbPos.current } },
        vertexColors: true,
      }),
    [shared],
  )
  const propMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: /* glsl */ `
          ${GLSL_UW}
          varying vec3 vWorld;
          varying vec3 vNormal;
          varying vec3 vColor;
          varying float vSilt;
          void main() {
            vec3 p = position;
            p.x += sin(uTime * 0.4 + p.z * 0.7) * 0.05 * clamp((p.y + 7.0) * 0.5, 0.0, 1.0);
            vec4 world = modelMatrix * vec4(p, 1.0);
            vWorld = world.xyz;
            vNormal = normalize(mat3(modelMatrix) * normal);
            vColor = color;
            vSilt = smoothstep(-7.9, -8.3, p.y);
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: propFragment,
        uniforms: { ...shared, uOrb: { value: orbPos.current } },
        vertexColors: true,
      }),
    [shared],
  )
  const fanMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: fanVertex,
        fragmentShader: propFragment,
        uniforms: { ...shared, uOrb: { value: orbPos.current } },
        vertexColors: true,
        side: THREE.DoubleSide,
      }),
    [shared],
  )
  const fishMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: fishVertex,
        fragmentShader: fishFragment,
        uniforms: { ...shared, uOrb: { value: orbPos.current } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [shared],
  )

  // per-fish centre/seed attributes
  const fishGeo = useMemo(() => {
    const geo = fish
    const count = geo.getAttribute('position').count / 9
    const centre = new Float32Array(count * 9 * 3)
    const seed = new Float32Array(count * 9 * 2)
    const rnd = mulberry32(0x1234)
    for (let i = 0; i < count; i++) {
      // the centre has to ride along with each of the nine vertices of the fish
      const cx = geo.getAttribute('position').getX(i * 9)
      const cy = geo.getAttribute('position').getY(i * 9)
      const cz = geo.getAttribute('position').getZ(i * 9)
      const s0 = rnd()
      const s1 = rnd()
      for (let v = 0; v < 9; v++) {
        centre[(i * 9 + v) * 3] = cx
        centre[(i * 9 + v) * 3 + 1] = cy
        centre[(i * 9 + v) * 3 + 2] = cz
        seed[(i * 9 + v) * 2] = s0
        seed[(i * 9 + v) * 2 + 1] = s1
      }
    }
    geo.setAttribute('aCentre', new THREE.BufferAttribute(centre, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2))
    return geo
  }, [fish])

  useEffect(
    () => () => {
      boulders.geometry.dispose()
      fans.dispose()
      wreck.dispose()
      skeleton.dispose()
      fishGeo.dispose()
      rockMaterial.dispose()
      propMaterial.dispose()
      fanMaterial.dispose()
      fishMat.dispose()
    },
    [boulders, fans, wreck, skeleton, fishGeo, rockMaterial, propMaterial, fanMaterial, fishMat],
  )

  useFrame(() => {
    sampleAtmosphere(journey.u)
    const active = journey.u > 6.2
    useUnderwater(group.current, active)
    if (!active) return
    const orb = scene.getObjectByName('orb-stage')
    if (orb) {
      orb.getWorldPosition(orbPos.current)
      shared.uOrb.value.copy(orbPos.current)
    }
    shared.uHaze.value.copy(atmosphere.haze)
    shared.uSunColor.value.copy(atmosphere.sun)
    shared.uSunDir.value.copy(atmosphere.sunDir)
    shared.uFog.value = atmosphere.fog
    shared.uTime.value = journey.time
    shared.uAmount.value = THREE.MathUtils.smoothstep(journey.u, 6.2, 6.7)
    rockMaterial.uniforms.uTime = shared.uTime
    rockMaterial.uniforms.uFog = shared.uFog
    rockMaterial.uniforms.uHaze = shared.uHaze
    rockMaterial.uniforms.uSunDir = shared.uSunDir
    rockMaterial.uniforms.uGold = shared.uGold
  })

  return (
    <group ref={group} name="seabed" visible={false}>
      <mesh geometry={boulders.geometry} material={rockMaterial} frustumCulled={false} />
      <mesh geometry={fans} material={fanMaterial} frustumCulled={false} />
      <mesh geometry={wreck} material={propMaterial} frustumCulled={false} />
      <mesh geometry={skeleton} material={propMaterial} frustumCulled={false} />
      <mesh geometry={fishGeo} material={fishMat} frustumCulled={false} renderOrder={4} />
    </group>
  )
}
