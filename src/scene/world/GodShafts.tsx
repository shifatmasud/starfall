import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { atmosphere, journey, sampleAtmosphere } from '../atmosphere/atmosphereState'
import { mulberry32 } from './shared'

/**
 * Canopy god rays — the columns of light that make the forest chapter read as a photograph.
 *
 * Eight broad, soft shafts leaning with the sun through the clearing, drawn as additive billboards
 * with a vertical falloff and a slow drift of dust in the beam. They are brightest exactly where
 * the sun is behind the trees (the phase term), and they fade out entirely once the lens leaves
 * the canopy, so the sky chapters never carry a stray quad.
 */

const vertex = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
varying vec2 vUv;
varying vec3 vWorld;
varying float vFade;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec3 toCam = normalize(cameraPosition - world.xyz);
  // the beam is brighter when we look along it toward the sun
  vFade = pow(max(dot(-toCam, normalize(uSunDir)), 0.0), 2.0) * 0.7 + 0.3;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const fragment = /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
in float vFade;
uniform vec3 uColor;
uniform float uAmount;
uniform float uTime;
layout(location = 0) out vec4 fragColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  if (uAmount < 0.01) discard;
  // across the beam: a soft bell, never a hard edge
  float across = smoothstep(0.0, 0.32, vUv.x) * smoothstep(1.0, 0.68, vUv.x);
  // down the beam: bright at the top, dissolving into the mist at the floor
  float down = smoothstep(0.0, 0.28, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  // dust drifting through the shaft
  float dust = 0.7 + 0.3 * noise(vec2(vUv.x * 9.0 + vUv.y * 2.0 + uTime * 0.05, vUv.y * 6.0 - uTime * 0.03));
  float a = across * down * dust * uAmount * vFade * 0.32;
  if (a < 0.002) discard;
  fragColor = vec4(uColor * a * 1.6, a);
}
`

export function GodShafts() {
  const shafts = useMemo(() => {
    const rnd = mulberry32(0x9f3a)
    const list: Array<{ pos: [number, number, number]; w: number; h: number; rot: number }> = []
    for (let i = 0; i < 9; i++) {
      const x = (rnd() - 0.5) * 26
      const z = -34 + rnd() * 34
      list.push({ pos: [x, 9 + rnd() * 3, z], w: 3.5 + rnd() * 5.5, h: 20 + rnd() * 10, rot: (rnd() - 0.5) * 0.22 })
    }
    return list
  }, [])

  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uColor: { value: new THREE.Color('#ffe6b8') },
          uAmount: { value: 0 },
          uTime: { value: 0 },
          uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.7) },
        },
      }),
    [],
  )

  useFrame(() => {
    sampleAtmosphere(journey.u)
    const u = material.uniforms
    u.uTime.value = journey.time
    u.uSunDir.value.copy(atmosphere.sunDir)
    u.uColor.value.copy(atmosphere.sun)
    // present through the forest chapter and the lake with a canopy behind it, gone by the sea
    const amount = THREE.MathUtils.smoothstep(journey.u, 1.7, 2.3) * (1 - THREE.MathUtils.smoothstep(journey.u, 3.4, 4.0))
    u.uAmount.value = amount * (0.5 + 0.7 * atmosphere.shaft)
  })

  return (
    <group name="canopy-shafts">
      {shafts.map((s, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={material}
          position={s.pos}
          scale={[s.w, s.h, 1]}
          rotation={[0.16, s.rot, 0.14]}
          frustumCulled={false}
          renderOrder={20}
        />
      ))}
    </group>
  )
}
