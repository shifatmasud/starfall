import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * The fallen star: one luminous golden core, no shell, no rings.
 *
 * It is a light source with structure, not a lit ball — a white-hot centre that rolls off through
 * amber into a warm orange limb, with slow granulation drifting through the body the way a small
 * sun's surface moves. The core is written above display white (HDR), which is what the selective
 * bloom in `PostFX` picks up: the halo belongs to the light, not to a painted dome around it.
 *
 * GLSL ES 3.00 (`THREE.GLSL3`) — WebGL2 only, see `src/gl/webgl2.ts`.
 */

export type OrbNumberRef = { readonly current: number }
export type OrbPointer = { readonly x: number; readonly y: number }
export type OrbPointerRef = { readonly current: OrbPointer | null }

type GoldenStarProps = {
  /** Scroll progress 0..1, read once per frame. */
  progressRef: OrbNumberRef
  /** Pointer in -1..1 screen units (null when untouched). */
  pointerRef: OrbPointerRef
}

const STAR_RADIUS = 0.62
const MAX_DELTA = 1 / 20

const vertexShader = /* glsl */ `
out vec3 vNormalView;
out vec3 vLocalPos;
out vec3 vViewDir;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vNormalView = normalize(normalMatrix * normal);
  vLocalPos = normalize(position);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`

const fragmentShader = /* glsl */ `
in vec3 vNormalView;
in vec3 vLocalPos;
in vec3 vViewDir;

uniform float uTime;
uniform float uProgress;
uniform vec2 uPointer;
uniform vec3 uLimb;
uniform vec3 uBody;
uniform vec3 uCore;
uniform vec3 uHot;

layout(location = 0) out vec4 fragColor;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

void main() {
  vec3 N = normalize(vNormalView);
  vec3 V = normalize(vViewDir);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float limb = 1.0 - ndv;

  // 1 — the body: white-hot centre, golden mid, deep amber arm of the limb
  vec3 color = mix(uLimb, uBody, smoothstep(0.02, 0.62, ndv));
  color = mix(color, uCore, smoothstep(0.45, 1.0, ndv));
  color = mix(color, uHot, pow(ndv, 5.0) * 0.85);

  // 2 — granulation: two octaves of slow convection, no surface pattern, no edges
  vec3 flow = vLocalPos * 4.4 + vec3(0.0, -uTime * 0.05, uTime * 0.036);
  float g1 = valueNoise(flow);
  float g2 = valueNoise(flow * 2.7 + 9.1);
  float granule = 0.62 * g1 + 0.38 * g2;
  color *= 0.86 + 0.30 * granule;
  color += uCore * pow(ndv, 2.0) * (0.12 + 0.28 * granule);

  // 3 — a soft key from the upper left keeps the sphere reading as a form
  float key = 0.5 + 0.5 * dot(vLocalPos, normalize(vec3(-0.5, 0.66, 0.56)));
  color *= 0.94 + 0.12 * key;

  // 4 — the limb glows warmer and a touch brighter than the body (thin, hot edge — not a ring)
  color += uLimb * pow(limb, 2.4) * 0.55;
  color += uCore * pow(limb, 9.0) * 0.9;

  // 5 — breath, and a little more presence as the fall deepens
  float breath = 1.0 + 0.025 * sin(uTime * 0.6);
  color *= breath * (0.97 + 0.06 * uProgress);

  // 6 — HDR: the centre sits above display white so the selective bloom catches only this
  float hdr = mix(1.35, 2.7, pow(ndv, 1.6));
  fragColor = vec4(color * hdr, 1.0);
}
`

export function GoldenStar({ progressRef, pointerRef }: GoldenStarProps) {
  const timeRef = useRef(0)
  const pointer = useMemo(() => new THREE.Vector2(0, 0), [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uProgress: { value: 0 },
          uPointer: { value: pointer },
          uLimb: { value: new THREE.Color('#ff8a1e') },
          uBody: { value: new THREE.Color('#ffb441') },
          uCore: { value: new THREE.Color('#ffe6a4') },
          uHot: { value: new THREE.Color('#fff6dd') },
        },
        transparent: false,
        depthWrite: true,
        depthTest: true,
        side: THREE.FrontSide,
        toneMapped: false,
      }),
    [pointer],
  )

  useEffect(() => () => material.dispose(), [material])

  useFrame((_, delta) => {
    timeRef.current += Math.min(delta, MAX_DELTA)
    const uniforms = material.uniforms
    uniforms.uTime.value = timeRef.current
    uniforms.uProgress.value = THREE.MathUtils.clamp(progressRef.current, 0, 1)

    const p = pointerRef.current
    pointer.set(p ? p.x : 0, p ? p.y : 0)
  })

  return (
    <mesh frustumCulled={false} material={material} renderOrder={0}>
      <sphereGeometry args={[STAR_RADIUS, 72, 48]} />
    </mesh>
  )
}
