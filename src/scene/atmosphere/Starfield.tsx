import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { atmosphere, journey, sampleAtmosphere } from './atmosphereState'

/**
 * The stars — a real field of them, not a texture.
 *
 * A few thousand points on a shell far beyond the mountains, distributed evenly over the sphere
 * (so nothing bunches at the poles), each with its own magnitude, temperature and twinkle phase.
 * The field fades in for the chapter above the weather and is gone by the time the star reaches the
 * clouds; it is drawn after the sky dome and before everything else, and never moves with the
 * camera's translation (only its rotation), so it reads as "infinitely far away".
 */

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

const vertexShader = /* glsl */ `
in vec3 aStar;    // xyz direction * radius
in vec4 aData;    // magnitude, temperature, phase, size
uniform float uTime;
uniform float uAmount;
out float vAlpha;
out vec3 vTint;
void main() {
  vec4 mv = modelViewMatrix * vec4(aStar, 1.0);
  gl_Position = projectionMatrix * mv;
  float twinkle = 0.78 + 0.22 * sin(uTime * (1.1 + aData.y) + aData.z * 6.2831);
  vAlpha = uAmount * (0.35 + 0.65 * aData.x) * twinkle;
  vTint = mix(vec3(1.0, 0.86, 0.68), vec3(0.76, 0.86, 1.0), aData.y);
  gl_PointSize = clamp((0.6 + aData.w * 2.6) * aData.x * 9.0, 0.8, 6.5);
}
`

const fragmentShader = /* glsl */ `
in float vAlpha;
in vec3 vTint;
layout(location = 0) out vec4 fragColor;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = dot(uv, uv);
  if (d > 1.0) discard;
  float core = pow(smoothstep(1.0, 0.0, d), 1.6);
  fragColor = vec4(vTint, core * vAlpha);
}
`

export function Starfield() {
  const camera = useThree((state) => state.camera)
  const count = 2600
  const groupRef = useMemo(() => ({ current: null as THREE.Group | null }), [])

  const geometry = useMemo(() => {
    const rand = mulberry(0x51a7c3)
    const positions = new Float32Array(count * 3)
    const data = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      // an even distribution on the sphere (cosine of the polar angle, not the angle itself)
      const u = rand() * 2 - 1
      const phi = rand() * Math.PI * 2
      const r = Math.sqrt(Math.max(0, 1 - u * u))
      const R = 820
      positions[i * 3] = Math.cos(phi) * r * R
      positions[i * 3 + 1] = u * R
      positions[i * 3 + 2] = Math.sin(phi) * r * R
      const magnitude = Math.pow(rand(), 2.4)
      data[i * 4] = magnitude
      data[i * 4 + 1] = rand()
      data[i * 4 + 2] = rand()
      data[i * 4 + 3] = rand()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aStar', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aData', new THREE.BufferAttribute(data, 4))
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
        depthTest: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uAmount: { value: 0 } },
      }),
    [],
  )

  useFrame(() => {
    sampleAtmosphere(journey.u)
    material.uniforms.uTime.value = journey.time
    material.uniforms.uAmount.value = Math.min(1, atmosphere.stars * 1.2)
    // the shell travels with the lens: stars have no parallax
    const g = groupRef.current
    if (g) {
      g.position.copy(camera.position)
      g.visible = atmosphere.stars > 0.01
    }
  })

  return (
    <group ref={(node) => { if (node) groupRef.current = node }}>
      <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-95} />
    </group>
  )
}
