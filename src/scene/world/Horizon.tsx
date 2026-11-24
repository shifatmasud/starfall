import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { atmosphere, journey, sampleAtmosphere } from '../atmosphere/atmosphereState'
import { mulberry32 } from './shared'

/**
 * The far world — the story's horizon: two snow-capped mountain ranges ringing the valley, a few
 * red balloons drifting in the morning sun, and distant bird silhouettes crossing the sky.
 *
 * All of it lives 300–900 m out and reads through the same exponential aerial perspective as the
 * valley, so it never looks like a decal: the ranges melt into the haze, the balloons are only a
 * few warm pixels, and the birds are a slow dark punctuation that keeps the sky alive.
 *
 * Mountains are built once as two ring meshes (vertex-coloured: rock, scree, snow). Balloons and
 * birds are merged into one geometry each and animated entirely in the vertex shader, so the whole
 * horizon costs six draw calls and no per-frame CPU work.
 */

/* ------------------------------------------------------------------ mountains */

const mountainVertex = /* glsl */ `
varying vec3 vWorld;
varying vec3 vColor;
varying vec3 vNormal;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vColor = color;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const mountainFragment = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uHaze;
uniform vec3 uSunColor;
uniform vec3 uSkyTint;
uniform float uFog;
varying vec3 vWorld;
varying vec3 vColor;
varying vec3 vNormal;
layout(location = 0) out vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  float ndl = dot(n, normalize(uSun));
  float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
  float sky = 0.5 + 0.5 * clamp(n.y, 0.0, 1.0);
  vec3 col = vColor * (uSkyTint * (0.32 + 0.40 * sky) + uSunColor * wrap * 0.85);
  // the ranges catch a rim of sun on the side the morning comes from
  col += vColor * uSunColor * pow(max(ndl, 0.0), 2.5) * 0.16;
  float dist = length(vWorld - cameraPosition);
  float fog = 1.0 - exp(-dist * 0.0034 * uFog);
  col = mix(col, uHaze, clamp(fog, 0.0, 0.9));
  fragColor = vec4(col, 1.0);
}
`

type RangeSpec = { radius: number; base: number; peak: number; seed: number; snow: number; tint: number }

function buildRange({ radius, base, peak, seed, snow, tint }: RangeSpec): THREE.BufferGeometry {
  const rnd = mulberry32(seed)
  const segments = 150
  const ridges = 4
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  // a ridge line from summed sines + noise, wrapped so the ring closes
  const ridgeAt = (k: number) => {
    const u = k / segments
    const a = u * Math.PI * 2
    const n =
      0.52 +
      0.26 * Math.sin(a * 2.0 + seed) +
      0.17 * Math.sin(a * 5.0 + seed * 1.7) +
      0.1 * Math.sin(a * 9.0 + seed * 2.3) +
      0.05 * Math.sin(a * 17.0 + seed * 0.7)
    return peak * (0.46 + 0.66 * n) * (0.94 + 0.12 * rnd())
  }

  const rock = new THREE.Color(tint === 0 ? '#4e5a6c' : '#5f6875').convertLinearToSRGB()
  const rockDeep = new THREE.Color('#3d4450').convertLinearToSRGB()
  const snowCol = new THREE.Color('#f4f7f8').convertLinearToSRGB()

  for (let k = 0; k <= segments; k++) {
    const a = (k / segments) * Math.PI * 2
    const h = ridgeAt(k % segments)
    const x = Math.cos(a) * radius
    const z = Math.sin(a) * radius
    for (let r = 0; r < ridges; r++) {
      const t = r / (ridges - 1)
      const y = base + (h - base) * Math.pow(t, 1.5)
      const inset = 1 - t * 0.16
      positions.push(x * inset + (rnd() - 0.5) * 6, y, z * inset + (rnd() - 0.5) * 6)
      const snowLine = 0.40 + (0.5 - Math.abs(Math.sin(a * 2.0 + seed))) * 0.22 - snow * 0.12
      const isSnow = t > snowLine
      const c = isSnow
        ? snowCol.clone().multiplyScalar(0.82 + 0.18 * (t - snowLine) * 2.4)
        : rockDeep.clone().lerp(rock, t * 0.9)
      // a softer, bluer base so the range sits in the air
      if (t < 0.3) c.lerp(new THREE.Color('#8fa2b4'), 0.35 - t)
      colors.push(c.r, c.g, c.b)
    }
  }
  for (let k = 0; k < segments; k++) {
    for (let r = 0; r < ridges - 1; r++) {
      const a = k * ridges + r
      const b = (k + 1) * ridges + r
      indices.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function Mountains() {
  const ranges = useMemo(
    () => [
      buildRange({ radius: 1150, base: -50, peak: 190, seed: 4.2, snow: 1, tint: 0 }),
      buildRange({ radius: 720, base: -35, peak: 120, seed: 11.7, snow: 0.85, tint: 1 }),
    ],
    [],
  )
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: mountainVertex,
        fragmentShader: mountainFragment,
        uniforms: {
          uSun: { value: new THREE.Vector3(0.3, 0.5, -0.8) },
          uHaze: { value: new THREE.Color() },
          uSunColor: { value: new THREE.Color() },
          uSkyTint: { value: new THREE.Color() },
          uFog: { value: 1 },
        },
        vertexColors: true,
        side: THREE.DoubleSide,
      }),
    [],
  )
  useFrame(() => {
    sampleAtmosphere(journey.u)
    material.uniforms.uSun.value.copy(atmosphere.sunDir)
    material.uniforms.uHaze.value.copy(atmosphere.haze)
    material.uniforms.uSunColor.value.copy(atmosphere.sun)
    material.uniforms.uSkyTint.value.copy(atmosphere.mid)
    material.uniforms.uFog.value = atmosphere.fog
  })
  return (
    <group name="horizon-ranges">
      {ranges.map((geo, i) => (
        <mesh key={i} geometry={geo} material={material} frustumCulled={false} renderOrder={-30} />
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------- balloons */

function buildBalloons(): THREE.BufferGeometry {
  const rnd = mulberry32(0x9a31)
  const parts: THREE.BufferGeometry[] = []
  const spots: Array<[number, number, number, number]> = [
    [-210, 88, -330, 7.5],
    [-120, 108, -420, 6.2],
    [180, 96, -380, 6.8],
    [280, 120, -300, 5.6],
    [-320, 74, -250, 5.0],
    [60, 132, -460, 4.6],
  ]
  for (const [x, y, z, s] of spots) {
    const envelope = new THREE.SphereGeometry(s, 18, 14)
    envelope.scale(1, 1.18, 1)
    envelope.translate(x, y, z)
    parts.push(envelope)
    const basket = new THREE.BoxGeometry(s * 0.32, s * 0.3, s * 0.3)
    basket.translate(x, y - s * 1.35, z)
    parts.push(basket)
    rnd()
  }
  // merge by hand: eight balloons is small enough that one attribute copy is cheaper than a dep
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  let offset = 0
  for (const part of parts) {
    const pos = part.getAttribute('position')
    const idx = part.getIndex()
    const isBasket = (part as THREE.BufferGeometry).type === 'BoxGeometry'
    const c = isBasket ? new THREE.Color('#4a3a2a') : new THREE.Color('#b83a2c')
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
      colors.push(c.r, c.g, c.b)
    }
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices.push(offset + idx.getX(i))
    } else {
      for (let i = 0; i < pos.count; i += 3) indices.push(offset + i, offset + i + 1, offset + i + 2)
    }
    offset += pos.count
    part.dispose()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/* ---------------------------------------------------------------------- birds */

function buildBirds(): { geometry: THREE.BufferGeometry; data: Float32Array } {
  const rnd = mulberry32(0x51c3)
  const positions: number[] = []
  const data: number[] = []
  const indices: number[] = []
  const birds = 14
  for (let i = 0; i < birds; i++) {
    const cx = (rnd() - 0.5) * 260
    const cy = 46 + rnd() * 46
    const cz = -180 - rnd() * 220
    const size = 1.1 + rnd() * 1.4
    const phase = rnd() * 6.28
    const speed = 0.5 + rnd() * 0.7
    const offset = positions.length / 3
    // a shallow V: body centre, two wing tips
    positions.push(cx, cy, cz, cx - size, cy + size * 0.34, cz, cx + size, cy + size * 0.34, cz)
    indices.push(offset, offset + 1, offset + 2)
    data.push(cx, cy, cz, phase, speed, size)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  return { geometry: geo, data: new Float32Array(data) }
}

const birdVertex = /* glsl */ `
attribute vec4 aBird;   // xyz centre, w phase
attribute vec2 aFlap;   // speed, size
uniform float uTime;
varying float vFade;
void main() {
  vec3 p = position;
  vec3 c = aBird.xyz;
  float ph = aBird.w;
  // the flock drifts across the sky, and each bird beats its wings
  c.x += sin(uTime * 0.03 + ph) * 34.0 + uTime * aFlap.x * 1.6;
  c.z += cos(uTime * 0.021 + ph * 1.3) * 14.0;
  c.y += sin(uTime * 0.12 + ph * 2.0) * 1.8;
  float wing = sin(uTime * 5.0 * aFlap.x + ph * 3.0) * 0.35 + 0.65;
  vec3 local = p - vec3(aBird.x, aBird.y, aBird.z);
  local.y = local.y * wing;
  local.xz *= 1.0;
  vec3 world = c + local;
  vec4 view = viewMatrix * vec4(world, 1.0);
  vFade = smoothstep(400.0, 120.0, -view.z);
  gl_Position = projectionMatrix * view;
}
`

const birdFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uAmount;
varying float vFade;
layout(location = 0) out vec4 fragColor;
void main() {
  if (uAmount < 0.02) discard;
  fragColor = vec4(uColor, 0.55 * uAmount * vFade);
}
`

function Birds() {
  const { geometry, data } = useMemo(() => buildBirds(), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: birdVertex,
        fragmentShader: birdFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#2b3138') }, uAmount: { value: 1 } },
      }),
    [],
  )
  const mapped = useMemo(() => {
    const g = geometry
    const centre = new Float32Array((data.length / 6) * 4)
    const flap = new Float32Array((data.length / 6) * 2)
    for (let i = 0; i < data.length / 6; i++) {
      centre[i * 4] = data[i * 6]
      centre[i * 4 + 1] = data[i * 6 + 1]
      centre[i * 4 + 2] = data[i * 6 + 2]
      centre[i * 4 + 3] = data[i * 6 + 3]
      flap[i * 2] = data[i * 6 + 4]
      flap[i * 2 + 1] = data[i * 6 + 5]
    }
    // every one of the three vertices of a bird carries the bird's own centre + flap
    const perVertexCentre = new Float32Array(centre.length * 3)
    const perVertexFlap = new Float32Array(flap.length * 3)
    for (let i = 0; i < centre.length / 4; i++) {
      for (let v = 0; v < 3; v++) {
        const t = (i * 3 + v) * 4
        perVertexCentre[t] = centre[i * 4]
        perVertexCentre[t + 1] = centre[i * 4 + 1]
        perVertexCentre[t + 2] = centre[i * 4 + 2]
        perVertexCentre[t + 3] = centre[i * 4 + 3]
        const f = (i * 3 + v) * 2
        perVertexFlap[f] = flap[i * 2]
        perVertexFlap[f + 1] = flap[i * 2 + 1]
      }
    }
    g.setAttribute('aBird', new THREE.BufferAttribute(perVertexCentre, 4))
    g.setAttribute('aFlap', new THREE.BufferAttribute(perVertexFlap, 2))
    return g
  }, [geometry, data])
  useFrame(() => {
    sampleAtmosphere(journey.u)
    material.uniforms.uTime.value = journey.time
    material.uniforms.uAmount.value = Math.min(1, Math.max(0, 1 - atmosphere.window * 1.4)) * (1 - Math.max(0, atmosphere.stars - 0.4))
  })
  return <mesh geometry={mapped} material={material} frustumCulled={false} renderOrder={-25} />
}

/* ---------------------------------------------------------------- balloons mesh */

const balloonVertex = /* glsl */ `
varying vec3 vWorld;
varying vec3 vColor;
varying vec3 vNormal;
uniform float uTime;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.02 + p.z * 0.01) * 6.0;
  p.y += sin(uTime * 0.06 + p.x * 0.01) * 1.6;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vColor = color;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const balloonFragment = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uHaze;
uniform vec3 uSunColor;
uniform float uFog;
varying vec3 vWorld;
varying vec3 vColor;
varying vec3 vNormal;
layout(location = 0) out vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  float ndl = max(dot(n, normalize(uSun)), 0.0);
  vec3 col = vColor * (0.42 + 0.72 * ndl);
  col += uSunColor * pow(ndl, 8.0) * 0.35;
  float dist = length(vWorld - cameraPosition);
  col = mix(col, uHaze, clamp(1.0 - exp(-dist * 0.0042 * uFog), 0.0, 0.9));
  fragColor = vec4(col, 1.0);
}
`

function Balloons() {
  const geometry = useMemo(() => buildBalloons(), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: balloonVertex,
        fragmentShader: balloonFragment,
        uniforms: {
          uSun: { value: new THREE.Vector3(0.3, 0.5, -0.8) },
          uHaze: { value: new THREE.Color() },
          uSunColor: { value: new THREE.Color() },
          uFog: { value: 1 },
          uTime: { value: 0 },
        },
        vertexColors: true,
      }),
    [],
  )
  useFrame(() => {
    sampleAtmosphere(journey.u)
    material.uniforms.uSun.value.copy(atmosphere.sunDir)
    material.uniforms.uHaze.value.copy(atmosphere.haze)
    material.uniforms.uSunColor.value.copy(atmosphere.sun)
    material.uniforms.uFog.value = atmosphere.fog
    material.uniforms.uTime.value = journey.time
  })
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-28} />
}

export function Horizon() {
  const scene = useThree((state) => state.scene)
  useEffect(() => {
    scene.userData.hasHorizon = true
  }, [scene])
  return (
    <group name="the-far-world">
      <Mountains />
      <Balloons />
      <Birds />
    </group>
  )
}
