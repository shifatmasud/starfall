import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { atmosphere, journey, sampleAtmosphere } from './atmosphereState'
import { rainCount, snowCount } from './quality'

/**
 * Weather: the mist sheets, the rain of the overcast beat, and the marine snow of the dive.
 *
 * Everything is one draw call per layer and animated entirely in the vertex shader from a single
 * `uTime` — no per-frame instance matrix writes, so a 1 GB-RAM phone keeps the same frame cost.
 * Nothing here is an animal or an insect (hard constraint): water, light and air only.
 */

const GLSL_HEAD = /* glsl */ `
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
`

/* ---------------------------------------------------------------- mist */

const mistVertex = /* glsl */ `
out vec2 vUv;
out vec3 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const mistFragment = /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
uniform vec3 uColor;
uniform vec3 uHaze;
uniform float uMist;
uniform float uTime;
layout(location = 0) out vec4 fragColor;
${GLSL_HEAD}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash11(dot(i, vec2(1.0, 57.0)));
  float b = hash11(dot(i + vec2(1.0, 0.0), vec2(1.0, 57.0)));
  float c = hash11(dot(i + vec2(0.0, 1.0), vec2(1.0, 57.0)));
  float d = hash11(dot(i + vec2(1.0, 1.0), vec2(1.0, 57.0)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
void main() {
  if (uMist < 0.02) discard;
  vec2 uv = vUv;
  float edge = smoothstep(0.0, 0.42, uv.x) * (1.0 - smoothstep(0.58, 1.0, uv.x))
             * smoothstep(0.0, 0.45, uv.y) * (1.0 - smoothstep(0.6, 1.0, uv.y));
  float n = vnoise(uv * vec2(5.0, 2.4) + vec2(uTime * 0.012, uTime * 0.006) + vWorld.xz * 0.01);
  n = 0.55 + 0.45 * n;
  float alpha = edge * n * uMist * 0.30;
  if (alpha < 0.004) discard;
  vec3 col = mix(uColor, uHaze, 0.35);
  fragColor = vec4(col, alpha);
}
`

function Mist() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: mistVertex,
        fragmentShader: mistFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uColor: { value: new THREE.Color() },
          uHaze: { value: new THREE.Color() },
          uMist: { value: 0.5 },
          uTime: { value: 0 },
        },
      }),
    [],
  )
  const sheets = useMemo(
    () => [
      { r: 62, a: -0.35, y: 3.2, w: 150, h: 30, tilt: 0 },
      { r: 96, a: 0.55, y: 5.4, w: 190, h: 40, tilt: 0 },
      { r: 78, a: 2.5, y: 2.4, w: 160, h: 26, tilt: 0 },
      { r: 120, a: 3.6, y: 7.5, w: 210, h: 46, tilt: 0 },
      { r: 70, a: 4.2, y: 22, w: 170, h: 54, tilt: 0 },
      { r: 105, a: 1.6, y: 30, w: 210, h: 62, tilt: 0 },
      { r: 88, a: 5.3, y: 26, w: 180, h: 58, tilt: 0 },
    ],
    [],
  )

  useFrame(() => {
    sampleAtmosphere(journey.u)
    const u = material.uniforms
    u.uColor.value.copy(atmosphere.cloudLit)
    u.uHaze.value.copy(atmosphere.haze)
    u.uMist.value = atmosphere.mist
    u.uTime.value = journey.time
  })

  return (
    <group>
      {sheets.map((sheet, index) => (
        <mesh
          key={index}
          material={material}
          position={[Math.cos(sheet.a) * sheet.r, sheet.y, Math.sin(sheet.a) * sheet.r - 20]}
          rotation={[0, -sheet.a + Math.PI / 2, 0]}
          frustumCulled={false}
          renderOrder={-20}
        >
          <planeGeometry args={[sheet.w, sheet.h]} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------------------------------------------------------- rain */

const rainVertex = /* glsl */ `
in vec3 aPos;
in float aSeed;
uniform float uTime;
uniform vec3 uCenter;
uniform float uSpanY;
out float vDist;
void main() {
  vec3 p = aPos;
  float speed = 16.0 + aSeed * 14.0;
  p.y = mod(aPos.y - uTime * speed, uSpanY);
  p += uCenter;
  vec4 view = viewMatrix * vec4(p, 1.0);
  view.xy += position.xy;
  vDist = -view.z;
  gl_Position = projectionMatrix * view;
}
`

const rainFragment = /* glsl */ `
in float vDist;
uniform vec3 uColor;
uniform float uAmount;
uniform float uTime;
layout(location = 0) out vec4 fragColor;
void main() {
  if (uAmount < 0.02) discard;
  float near = smoothstep(1.5, 5.0, vDist);
  float far = 1.0 - smoothstep(45.0, 95.0, vDist);
  float alpha = uAmount * near * far * 0.45;
  if (alpha < 0.003) discard;
  fragColor = vec4(uColor, alpha);
}
`

function Rain() {
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(0.028, 1.5)
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = plane.index
    geo.setAttribute('position', plane.attributes.position)
    geo.setAttribute('uv', plane.attributes.uv)
    const positions = new Float32Array(rainCount * 3)
    const seeds = new Float32Array(rainCount)
    const rand = (() => {
      let a = 987654321
      return () => {
        a = (a * 1664525 + 1013904223) >>> 0
        return a / 4294967296
      }
    })()
    for (let i = 0; i < rainCount; i++) {
      positions[i * 3] = (rand() * 2 - 1) * 90
      positions[i * 3 + 1] = rand() * 70
      positions[i * 3 + 2] = (rand() * 2 - 1) * 90 - 10
      seeds[i] = rand()
    }
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(positions, 3))
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
    geo.instanceCount = rainCount
    return geo
  }, [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: rainVertex,
        fragmentShader: rainFragment,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: new THREE.Color('#dfe9ea') },
          uAmount: { value: 0 },
          uTime: { value: 0 },
          uCenter: { value: new THREE.Vector3(0, 0, -10) },
          uSpanY: { value: 70 },
        },
      }),
    [],
  )

  useFrame(() => {
    sampleAtmosphere(journey.u)
    material.uniforms.uAmount.value = atmosphere.rain
    material.uniforms.uTime.value = journey.time
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-10} />
}

/* --------------------------------------------------------- marine snow */

const snowVertex = /* glsl */ `
in float aSeed;
uniform float uTime;
uniform float uSize;
out float vFade;
void main() {
  vec3 p = position;
  p.y = mod(position.y + uTime * (0.35 + aSeed * 0.55) + 30.0, 60.0) - 30.0;
  p.x += sin(uTime * 0.35 + aSeed * 23.0) * 1.4;
  p.z += cos(uTime * 0.28 + aSeed * 17.0) * 1.4;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = max(0.6, -mv.z);
  gl_PointSize = clamp(uSize * (0.4 + aSeed) * 26.0 / d, 1.0, 6.0);
  vFade = smoothstep(70.0, 10.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`

const snowFragment = /* glsl */ `
in float vFade;
uniform vec3 uColor;
uniform float uAmount;
layout(location = 0) out vec4 fragColor;
void main() {
  if (uAmount < 0.02) discard;
  float d = length(gl_PointCoord - 0.5);
  float alpha = smoothstep(0.5, 0.1, d) * uAmount * vFade * 0.55;
  if (alpha < 0.004) discard;
  fragColor = vec4(uColor, alpha);
}
`

function MarineSnow() {
  const geometry = useMemo(() => {
    const positions = new Float32Array(snowCount * 3)
    const seeds = new Float32Array(snowCount)
    const rand = (() => {
      let a = 24681357
      return () => {
        a = (a * 1664525 + 1013904223) >>> 0
        return a / 4294967296
      }
    })()
    for (let i = 0; i < snowCount; i++) {
      positions[i * 3] = (rand() * 2 - 1) * 40
      positions[i * 3 + 1] = rand() * 60 - 30
      positions[i * 3 + 2] = (rand() * 2 - 1) * 40 - 8
      seeds[i] = rand()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    return geo
  }, [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: snowVertex,
        fragmentShader: snowFragment,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: new THREE.Color('#dff6f2') },
          uAmount: { value: 0 },
          uTime: { value: 0 },
          uSize: { value: 1 },
        },
      }),
    [],
  )

  useFrame(() => {
    sampleAtmosphere(journey.u)
    material.uniforms.uAmount.value = Math.max(atmosphere.snow, atmosphere.window * 0.4)
    material.uniforms.uTime.value = journey.time
  })

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={10} />
}

export function WeatherSystem() {
  return (
    <>
      <Mist />
      <Rain />
      <MarineSnow />
    </>
  )
}
