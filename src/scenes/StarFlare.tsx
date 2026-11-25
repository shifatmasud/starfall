import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Layout } from './layout'

/**
 * The bright star in the upper-right sky, and the soft halo behind the orb.
 *
 * Camera-facing quads that draw light rather than a picture: a white core, a wide cyan glow, the
 * four-point diffraction cross the plate has, and a warm bloom off the ball's sunward side. Written
 * above display white so only the bright pass spreads them.
 */

const VERT = /* glsl */ `
uniform float uSize;
out vec2 vUv;
void main() {
  vec3 centre = modelViewMatrix[3].xyz;
  vec3 pos = centre + vec3(position.xy * uSize, 0.0);
  vUv = position.xy;
  gl_Position = projectionMatrix * vec4(pos, 1.0);
}
`

const FLARE_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform float uTime;
layout(location = 0) out vec4 fragColor;
void main() {
  vec2 p = vUv;
  float r = length(p);
  if (r > 1.0) discard;
  float breathe = 0.95 + 0.05 * sin(uTime * 1.7);

  vec3 col = vec3(1.0, 0.99, 0.97) * exp(-r * 34.0) * 7.0;
  col += vec3(0.72, 0.86, 1.0) * exp(-r * 9.0) * 1.05;
  col += vec3(0.36, 0.58, 1.0) * exp(-r * 3.6) * 0.30;

  float sx = exp(-abs(p.y) * 260.0) * exp(-abs(p.x) * 7.0) * 1.5;
  float sy = exp(-abs(p.x) * 260.0) * exp(-abs(p.y) * 8.0) * 1.2;
  float dx = exp(-abs(p.x - p.y) * 190.0) * exp(-length(p) * 11.0) * 0.35;
  float dy = exp(-abs(p.x + p.y) * 190.0) * exp(-length(p) * 11.0) * 0.35;
  col += vec3(0.86, 0.93, 1.0) * (sx + sy + dx + dy);

  col *= 1.0 - smoothstep(0.45, 1.0, r);
  fragColor = vec4(col * breathe, 1.0);
}
`

const HALO_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform float uTime;
uniform vec3 uTint;
uniform float uGain;
layout(location = 0) out vec4 fragColor;
void main() {
  vec2 p = vUv;
  float r = length(p);
  if (r > 1.0) discard;
  float breathe = 0.90 + 0.10 * sin(uTime * 0.9);
  float off = length(p - vec2(0.24, 0.12));
  float soft = 1.0 - smoothstep(0.25, 1.0, r);
  vec3 col = uTint * (exp(-off * 5.0) * 0.85 + exp(-r * 2.6) * 0.12) * soft;
  fragColor = vec4(col * uGain * breathe, 1.0);
}
`

function Quad({
  position,
  size,
  fragment,
  uniforms,
}: {
  position: [number, number, number]
  size: number
  fragment: string
  uniforms: Record<string, THREE.IUniform>
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERT,
        fragmentShader: fragment,
        uniforms: { uSize: { value: size }, ...uniforms },
        transparent: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    [fragment, size, uniforms],
  )

  return (
    <mesh position={position} frustumCulled={false} renderOrder={40} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}

export function StarFlare({ layout }: { layout: Layout }) {
  const time = useRef(0)
  const star = useMemo(() => ({ uTime: { value: 0 } }), [])
  const halo = useMemo(
    () => ({
      uTime: { value: 0 },
      uTint: { value: new THREE.Color('#fff0d0') },
      uGain: { value: 0.40 },
    }),
    [],
  )

  useFrame((_, delta) => {
    time.current += Math.min(delta, 1 / 20)
    star.uTime.value = time.current
    halo.uTime.value = time.current
  })

  return (
    <>
      <Quad position={[layout.star.x, layout.star.y, 0.4]} size={0.34} fragment={FLARE_FRAG} uniforms={star} />
      <Quad
        position={[layout.orb.x + layout.orb.r * 0.18, layout.orb.y + layout.orb.r * 0.1, -0.02]}
        size={layout.orb.r * 2.2}
        fragment={HALO_FRAG}
        uniforms={halo}
      />
    </>
  )
}
