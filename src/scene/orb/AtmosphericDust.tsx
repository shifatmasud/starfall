import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { OrbNumberRef, OrbPointerRef } from './GoldenStar'

/**
 * Atmospheric dust: pollen and light motes above the surface, suspended
 * marine dust and a few micro-bubbles below it. No insects, no animals —
 * every mote only drifts.
 *
 * Motion is entirely in the vertex shader from a deterministic clock (no CPU
 * work, no per-frame attribute uploads). The layer cross-fades on progress:
 * airborne motes fade out as the journey crosses the air/water seam while the
 * marine population fades in.
 */

type AtmosphericDustProps = {
  progressRef: OrbNumberRef
  pointerRef: OrbPointerRef
  tier: 'low' | 'high'
}

const MAX_DELTA = 1 / 20
/** Progress window where the journey crosses into water. */
const UNDER_START = 0.845
const UNDER_END = 0.875
/** Vertical wrap span of the dust volume, in world units. */
const SPAN_Y = 4.6
const BASE_Y = -1.7

const MOTE_VERTEX = /* glsl */ `
in vec4 aSeed;

uniform float uTime;
uniform float uUnder;
uniform float uProj;
uniform vec3 uOffset;

out vec3 vTint;
out float vAlpha;

const float SPAN_Y = ${SPAN_Y.toFixed(1)};
const float BASE_Y = ${BASE_Y.toFixed(1)};

void main() {
  float s = aSeed.w;
  float ph = s * 6.2831853;
  float t = uTime;

  vec3 p = aSeed.xyz + uOffset;

  // Above water: a slow buoyant wander, one breath every few seconds.
  vec3 air = vec3(
    sin(t * 0.19 + ph) * 0.50 + sin(t * 0.071 + ph * 2.7) * 0.28,
    t * 0.030 + sin(t * 0.11 + ph * 1.7) * 0.20,
    cos(t * 0.14 + ph * 1.3) * 0.40 + cos(t * 0.052 + ph * 3.1) * 0.18
  );
  // Below water: suspended marine dust, settling while it drifts.
  vec3 sea = vec3(
    sin(t * 0.053 + ph) * 0.22,
    -t * 0.010 + sin(t * 0.085 + ph * 1.9) * 0.09,
    cos(t * 0.041 + ph * 1.1) * 0.16
  );
  p += mix(air, sea, uUnder);

  // Wrap vertically and fade through both ends, so a mote never pops.
  float y = mod(p.y - BASE_Y, SPAN_Y);
  p.y = BASE_Y + y;
  float yn = y / SPAN_Y;
  float edge = smoothstep(0.0, 0.14, yn) * smoothstep(1.0, 0.84, yn);

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float dist = max(-mvPosition.z, 0.3);
  float size = mix(0.030, 0.020, uUnder) * (0.55 + s * 0.95);
  gl_PointSize = clamp(size * uProj / dist, 1.0, 18.0);

  float twinkle = 0.55 + 0.45 * sin(t * 0.8 + ph * 4.0);
  float nearFade = smoothstep(0.6, 2.4, dist);
  vAlpha = edge * twinkle * nearFade * mix(0.62, 0.60, uUnder) * (0.5 + 0.5 * s);
  vTint = mix(vec3(1.0, 0.86, 0.58), vec3(0.72, 0.90, 1.0), uUnder);
}
`

const BUBBLE_VERTEX = /* glsl */ `
in vec4 aSeed;

uniform float uTime;
uniform float uUnder;
uniform float uProj;
uniform vec3 uOffset;

out float vAlpha;

const float SPAN_Y = ${SPAN_Y.toFixed(1)};
const float BASE_Y = ${BASE_Y.toFixed(1)};

void main() {
  float s = aSeed.w;
  float ph = s * 6.2831853;
  float t = uTime;

  vec3 p = aSeed.xyz + uOffset;
  p.x += sin(t * (0.35 + 0.25 * s) + ph) * 0.12;
  p.z += cos(t * (0.28 + 0.22 * s) + ph * 1.7) * 0.10;
  p.y += t * (0.09 + 0.10 * s);

  float y = mod(p.y - BASE_Y, SPAN_Y);
  p.y = BASE_Y + y;
  float yn = y / SPAN_Y;
  float edge = smoothstep(0.0, 0.16, yn) * smoothstep(1.0, 0.80, yn);

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float dist = max(-mvPosition.z, 0.3);
  gl_PointSize = clamp((0.009 + 0.010 * s) * uProj / dist, 1.4, 5.0);

  vAlpha = uUnder * edge * smoothstep(0.5, 1.8, dist) * (0.38 + 0.45 * s);
}
`

const DUST_FRAGMENT = /* glsl */ `
in vec3 vTint;
in float vAlpha;

layout(location = 0) out vec4 fragColor;

void main() {
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(offset, offset);
  if (d2 > 1.0) discard;

  float alpha = pow(smoothstep(1.0, 0.0, d2), 1.4) * vAlpha;
  fragColor = vec4(vTint * alpha, alpha);
}
`

const BUBBLE_FRAGMENT = /* glsl */ `
in float vAlpha;

layout(location = 0) out vec4 fragColor;

void main() {
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float d = length(offset);
  if (d > 1.0) discard;

  // A thin bright shell with a soft interior: a micro-bubble, not a dot.
  float shell = smoothstep(0.70, 0.95, d) * (1.0 - smoothstep(0.95, 1.0, d));
  float glint = smoothstep(0.28, 0.0, length(offset - vec2(-0.28, 0.3)));
  float alpha = (shell * 0.9 + glint * 0.3) * vAlpha;
  vec3 tint = vec3(0.72, 0.9, 1.0);
  fragColor = vec4(tint * alpha, alpha);
}
`

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A camera-anchored volume of motes: x/z drift freely, y wraps. */
function createSeeds(count: number, seed: number) {
  const random = mulberry32(seed)
  const values = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    values[i * 4 + 0] = (random() - 0.5) * 11
    values[i * 4 + 1] = BASE_Y + random() * SPAN_Y
    values[i * 4 + 2] = 2.6 - random() * 7.1
    values[i * 4 + 3] = random()
  }
  return values
}

type DustLayers = {
  offset: THREE.Vector3
  shared: { uTime: { value: number }; uProj: { value: number }; uOffset: { value: THREE.Vector3 } }
  moteMaterial: THREE.ShaderMaterial
  bubbleMaterial: THREE.ShaderMaterial
  motePoints: THREE.Points
  bubblePoints: THREE.Points
  dispose: () => void
}

function createLayer(count: number, seed: number) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(createSeeds(count, seed), 4))
  return geometry
}

function createDustLayers(moteCount: number, bubbleCount: number): DustLayers {
  const offset = new THREE.Vector3()
  const shared = { uTime: { value: 0 }, uProj: { value: 1 }, uOffset: { value: offset } }

  const moteMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: MOTE_VERTEX,
    fragmentShader: DUST_FRAGMENT,
    uniforms: { ...shared, uUnder: { value: 0 } },
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const bubbleMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: BUBBLE_VERTEX,
    fragmentShader: BUBBLE_FRAGMENT,
    uniforms: { ...shared, uUnder: { value: 0 } },
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const moteGeometry = createLayer(moteCount, 0x51a7)
  const bubbleGeometry = createLayer(bubbleCount, 0x2c19)

  const motePoints = new THREE.Points(moteGeometry, moteMaterial)
  const bubblePoints = new THREE.Points(bubbleGeometry, bubbleMaterial)
  for (const points of [motePoints, bubblePoints]) {
    points.frustumCulled = false
    points.renderOrder = 3
  }

  return {
    offset,
    shared,
    moteMaterial,
    bubbleMaterial,
    motePoints,
    bubblePoints,
    dispose: () => {
      moteGeometry.dispose()
      bubbleGeometry.dispose()
      moteMaterial.dispose()
      bubbleMaterial.dispose()
    },
  }
}

export function AtmosphericDust({ progressRef, pointerRef, tier }: AtmosphericDustProps) {
  const gl = useThree((state) => state.gl)

  const motes = tier === 'low' ? 900 : 2200
  const bubbles = tier === 'low' ? 70 : 160
  const [layers, setLayers] = useState<DustLayers | null>(null)
  const time = useMemo(() => ({ value: 0 }), [])

  // Built inside the effect so a StrictMode remount (dev) gets live layers
  // instead of the ones the simulated unmount already disposed.
  useEffect(() => {
    const created = createDustLayers(motes, bubbles)
    setLayers(created)
    return () => {
      setLayers(null)
      created.dispose()
    }
  }, [motes, bubbles])

  useFrame((state, delta) => {
    if (!layers) return
    time.value += Math.min(delta, MAX_DELTA)
    const p = THREE.MathUtils.clamp(progressRef.current, 0, 1)
    const under = THREE.MathUtils.smoothstep(p, UNDER_START, UNDER_END)

    const camera = state.camera as THREE.PerspectiveCamera
    const height = gl.domElement.height
    const fov = THREE.MathUtils.degToRad(camera.fov ?? 40)

    layers.shared.uTime.value = time.value
    layers.shared.uProj.value = height / (2 * Math.tan(fov / 2))
    layers.moteMaterial.uniforms.uUnder.value = under
    layers.bubbleMaterial.uniforms.uUnder.value = under

    const pointer = pointerRef.current
    layers.offset.set(pointer ? pointer.x * 0.06 : 0, pointer ? pointer.y * 0.04 : 0, 0)
  })

  if (!layers) return null
  return (
    <>
      <primitive object={layers.motePoints} />
      <primitive object={layers.bubblePoints} />
    </>
  )
}
