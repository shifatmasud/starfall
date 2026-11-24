import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { atmosphere, journey, sampleAtmosphere } from '../atmosphere/atmosphereState'
import type { Lake } from './LakeWater'

/**
 * Water FX — the small physics that sells the contact: impact spray, droplets, micro-bubbles.
 *
 * One CPU-emitted pool keeps the whole layer deterministic and cheap (a few hundred points, one
 * draw call). Emission is driven by what the star is doing, not by a timer:
 *  · entering the water digs a crown of droplets and a puff of mist, thrown outward and up;
 *  · floating, it sheds a few drops per second from its waterline;
 *  · a pointer stroke on the lake flicks a small spray where it lands;
 *  · underwater, a separate bubble field rises from the seabed all the way up.
 *
 * Gravity, drag and buoyancy are real numbers (9.81 m/s², a quadratic-ish drag, bubbles rising at
 * ~0.25 m/s), so the arcs read as water rather than confetti.
 */

const POOL = 320

type Kind = 0 | 1 | 2 // 0 droplet, 1 mist, 2 bubble

type Particle = {
  origin: THREE.Vector3
  velocity: THREE.Vector3
  born: number
  life: number
  kind: Kind
  size: number
  active: boolean
}

const vertexShader = /* glsl */ `
attribute vec3 aOrigin;
attribute vec3 aVelocity;
attribute vec3 aData;   // born, life, kind
attribute float aSize;
uniform float uTime;
uniform float uProj;
uniform float uLevel;
uniform float uBuoyancy;
out float vAlpha;
out float vKind;
out float vLife;

void main() {
  float age = max(0.0, uTime - aData.x);
  float life = aData.y;
  float k = age / max(life, 0.001);
  if (k > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; return; }
  vKind = aData.z;

  // drag: the horizontal arc shortens as the drop slows
  float travel = (1.0 - exp(-age * 2.2)) / 2.2;
  vec3 p = aOrigin + vec3(aVelocity.x * travel, aVelocity.y * age, aVelocity.z * travel);
  // gravity for drops and mist, buoyancy for bubbles
  float g = vKind < 1.5 ? -4.9 : 0.0;
  p.y += g * age * age;
  p.y += uBuoyancy * age * (vKind > 1.5 ? 1.0 : 0.0);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(-mv.z, 0.4);
  float size = aSize * (vKind > 1.5 ? 1.0 : 0.7 + age * 1.6);
  gl_PointSize = clamp(size * uProj / dist, 1.0, 26.0);
  gl_Position = projectionMatrix * mv;

  float lifeFade = smoothstep(1.0, 0.55, k) * smoothstep(0.0, 0.06, k);
  vAlpha = lifeFade;
  vLife = k;
}
`

const fragmentShader = /* glsl */ `
in float vAlpha;
in float vKind;
in float vLife;
uniform vec3 uDropColor;
uniform vec3 uMistColor;
uniform vec3 uBubbleColor;
layout(location = 0) out vec4 fragColor;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = length(uv);
  if (d > 1.0) discard;
  if (vKind > 1.5) {
    // bubble: a thin shell with one highlight
    float shell = smoothstep(0.62, 0.95, d) * (1.0 - smoothstep(0.95, 1.0, d));
    float glint = smoothstep(0.3, 0.0, length(uv - vec2(-0.3, 0.32)));
    float a = (shell * 0.85 + glint * 0.4) * vAlpha;
    fragColor = vec4(uBubbleColor, a);
  } else if (vKind > 0.5) {
    // mist: a soft puff, brightest at its centre
    float a = pow(1.0 - d, 2.0) * vAlpha * 0.22;
    fragColor = vec4(uMistColor, a);
  } else {
    // droplet: a bright bead with a lit crown
    float a = pow(1.0 - d, 1.4) * vAlpha;
    vec3 c = mix(uDropColor, vec3(1.0), smoothstep(0.55, 0.0, length(uv - vec2(-0.25, 0.3))) * 0.6);
    fragColor = vec4(c, a);
  }
}
`

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function WaterFX({ lake, orbRef }: { lake: Lake; orbRef?: RefObject<THREE.Object3D | null> }) {
  const rand = useMemo(() => mulberry(0x51ab), [])
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: POOL }, () => ({
        origin: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        born: -10,
        life: 1,
        kind: 0 as Kind,
        size: 1,
        active: false,
      })),
    [],
  )
  const cursor = useRef(0)
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POOL * 3), 3))
    geo.setAttribute('aOrigin', new THREE.BufferAttribute(new Float32Array(POOL * 3), 3))
    geo.setAttribute('aVelocity', new THREE.BufferAttribute(new Float32Array(POOL * 3), 3))
    geo.setAttribute('aData', new THREE.BufferAttribute(new Float32Array(POOL * 3), 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(POOL), 1))
    geo.setDrawRange(0, POOL)
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -10), 80)
    return geo
  }, [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uProj: { value: 900 },
          uLevel: { value: lake.config.level },
          uBuoyancy: { value: 0.22 },
          uDropColor: { value: new THREE.Color('#e8f3f6') },
          uMistColor: { value: new THREE.Color('#dfeef2') },
          uBubbleColor: { value: new THREE.Color('#cfeef2') },
        },
      }),
    [lake],
  )

  const emit = (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    kind: Kind,
    size: number,
    life: number,
    now: number,
  ) => {
    const p = particles[cursor.current]
    cursor.current = (cursor.current + 1) % POOL
    p.origin.set(x, y, z)
    p.velocity.set(vx, vy, vz)
    p.born = now
    p.life = life
    p.kind = kind
    p.size = size
    p.active = true
  }

  const wasAbove = useRef(true)
  const lastY = useRef(0)
  const emission = useRef(0)

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    material.uniforms.uTime.value = t
    const camera = state.camera as THREE.PerspectiveCamera
    const height = state.gl.domElement.height
    material.uniforms.uProj.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
    sampleAtmosphere(journey.u)

    const orb = orbRef?.current
    if (orb) {
      const p = orb.getWorldPosition(new THREE.Vector3())
      const surface = lake.surfaceAt(p.x, p.z, t)
      const above = p.y > surface + 0.35
      if (wasAbove.current && !above && Math.abs(p.x) < 40) {
        // the impact: a crown of drops, a breath of mist, a fistful of bubbles
        const splash = Math.min(1, Math.abs(p.y - surface) * 2 + 0.5)
        for (let i = 0; i < 54; i++) {
          const a = rand() * Math.PI * 2
          const r = 0.6 + rand() * 2.4
          const up = 1.6 + rand() * 3.6 * splash
          emit(
            p.x + Math.cos(a) * 0.35,
            surface,
            p.z + Math.sin(a) * 0.35,
            Math.cos(a) * r,
            up,
            Math.sin(a) * r,
            rand() < 0.22 ? 1 : 0,
            rand() < 0.22 ? 0.9 + rand() * 1.4 : 0.06 + rand() * 0.07,
            0.8 + rand() * 0.8,
            t,
          )
        }
        for (let i = 0; i < 12; i++) {
          const a = rand() * Math.PI * 2
          emit(p.x, surface - 0.1, p.z, Math.cos(a) * 0.25, 0.3 + rand() * 0.4, Math.sin(a) * 0.25, 2, 0.1 + rand() * 0.1, 2.4 + rand() * 1.6, t)
        }
        emission.current = t
      }
      wasAbove.current = p.y > surface + 0.2
      lastY.current = p.y

      // floating: a slow leak of drops from the waterline
      if (!above && Math.abs(p.y - surface) < 0.7 && t - emission.current > 0.7 && journey.u > 5.6 && journey.u < 6.9) {
        emission.current = t
        for (let i = 0; i < 2; i++) {
          const a = rand() * Math.PI * 2
          emit(p.x + Math.cos(a) * 0.5, surface + 0.05, p.z + Math.sin(a) * 0.5, Math.cos(a) * 0.3, 0.9 + rand() * 0.8, Math.sin(a) * 0.3, 0, 0.05, 0.7, t)
        }
      }
    }

    // write the pool
    const o = geometry.getAttribute('aOrigin') as THREE.BufferAttribute
    const v = geometry.getAttribute('aVelocity') as THREE.BufferAttribute
    const d = geometry.getAttribute('aData') as THREE.BufferAttribute
    const s = geometry.getAttribute('aSize') as THREE.BufferAttribute
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < POOL; i++) {
      const p = particles[i]
      if (!p.active || t - p.born > p.life) {
        o.setXYZ(i, 0, -1000, 0)
        v.setXYZ(i, 0, 0, 0)
        d.setXYZ(i, -100, 0.001, 0)
        s.setX(i, 0)
        pos.setXYZ(i, 0, -1000, 0)
        continue
      }
      o.setXYZ(i, p.origin.x, p.origin.y, p.origin.z)
      v.setXYZ(i, p.velocity.x, p.velocity.y, p.velocity.z)
      d.setXYZ(i, p.born, p.life, p.kind)
      s.setX(i, p.size)
      pos.setXYZ(i, p.origin.x, p.origin.y, p.origin.z)
    }
    for (const attr of [o, v, d, s, pos]) attr.needsUpdate = true
    void delta
    void atmosphere
  })

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={6} />
}

/** Deep bubbles: a looping column of rising micro-bubbles around the resting star. */
export function DeepBubbles({ center }: { center: [number, number, number] }) {
  const count = 220
  const geometry = useMemo(() => {
    const rand = mulberry(0x71f2)
    const seeds = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = (rand() - 0.5) * 26
      seeds[i * 4 + 1] = center[1] - 1.5 + rand() * 9
      seeds[i * 4 + 2] = center[2] + (rand() - 0.5) * 26
      seeds[i * 4 + 3] = rand()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    return geo
  }, [center])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: /* glsl */ `
          in vec4 aSeed;
          uniform float uTime;
          uniform float uProj;
          out float vA;
          void main() {
            vec3 p = aSeed.xyz;
            p.y = mod(p.y + uTime * (0.22 + 0.3 * aSeed.w) - ${(center[1] - 1.5).toFixed(2)}, 11.0) + ${(center[1] - 1.5).toFixed(2)};
            p.x += sin(uTime * 0.6 + aSeed.w * 20.0) * 0.16;
            p.z += cos(uTime * 0.5 + aSeed.w * 14.0) * 0.16;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float dist = max(-mv.z, 0.5);
            gl_PointSize = clamp((0.035 + 0.05 * aSeed.w) * uProj / dist, 1.0, 9.0);
            vA = smoothstep(40.0, 4.0, dist) * (0.35 + 0.5 * aSeed.w);
          }
        `,
        fragmentShader: /* glsl */ `
          in float vA;
          layout(location = 0) out vec4 fragColor;
          void main() {
            vec2 uv = gl_PointCoord * 2.0 - 1.0;
            float d = length(uv);
            if (d > 1.0) discard;
            float shell = smoothstep(0.60, 0.94, d) * (1.0 - smoothstep(0.94, 1.0, d));
            float glint = smoothstep(0.28, 0.0, length(uv - vec2(-0.3, 0.32)));
            fragColor = vec4(vec3(0.80, 0.94, 0.96), (shell * 0.8 + glint * 0.35) * vA);
          }
        `,
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uProj: { value: 900 } },
      }),
    [center],
  )

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    const camera = state.camera as THREE.PerspectiveCamera
    material.uniforms.uProj.value = state.gl.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
  })

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />
}
