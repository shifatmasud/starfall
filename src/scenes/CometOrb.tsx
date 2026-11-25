import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Layout } from '../scenes/layout'
import { CrystalStarOrb } from '../components/CrystalStarOrb'

/**
 * The diving crystal star and its comet wake.
 *
 * The orb falls through the cloud sea on a diagonal, and behind it a cold luminous tail: a tapered
 * sheet of ice-blue light whose filaments stretch along the fall, laced with drifting sparkles that
 * catch the sun. Everything is additive and soft — the tail is light, not smoke, and it must never
 * draw a hard edge against the painted clouds.
 */

const TAIL_VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const TAIL_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform float uTime;
uniform float uLength;
uniform float uWidth;
layout(location = 0) out vec4 fragColor;

float h21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y * 43.23);
}

float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = p * 2.03 + vec2(3.7, 1.9);
    a *= 0.5;
  }
  return s;
}

void main() {
  // t = 0 at the orb, 1 at the far end of the wake
  float t = clamp(vUv.x, 0.0, 1.0);
  float y = (vUv.y - 0.5) * 2.0;                 // -1..1 across the tail

  // the sheet opens as it leaves the orb, and frays at its end
  float halfW = mix(0.22, 1.05, pow(t, 0.60));
  float across = abs(y) / max(halfW, 0.001);

  // filaments: stretched noise streaming back from the head
  float f1 = fbm(vec2(t * 3.0 - uTime * 0.16, y * 2.6 + 3.0));
  float f2 = fbm(vec2(t * 6.4 - uTime * 0.30, y * 5.6 + 9.0));
  float filament = smoothstep(0.26, 0.86, f1 * 0.60 + f2 * 0.40);

  float body = 1.0 - smoothstep(0.25, 1.0, across);
  float fade = exp(-t * 1.7) * (1.0 - smoothstep(0.70, 1.0, t));
  float head = exp(-t * 22.0);

  vec3 ice = vec3(0.52, 0.76, 1.0);
  vec3 white = vec3(0.95, 0.98, 1.0);
  vec3 dust = vec3(1.0, 0.88, 0.72);
  vec3 col = mix(ice, white, smoothstep(0.10, 0.80, body * (0.45 + filament * 0.85)));
  col = mix(col, dust, smoothstep(0.50, 1.0, t) * 0.35);

  float alpha = body * fade * (0.24 + 0.76 * filament) * 1.30;
  alpha = max(alpha, body * head * 0.30);

  // sparkles: hashed points drifting back along the wake, each twinkling on its own clock
  vec2 g = vec2(t * 34.0, vUv.y * 14.0);
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = h21(cell);
  vec2 off = vec2(h21(cell + 11.0), h21(cell + 23.0)) - 0.5;
  float dot0 = 1.0 - smoothstep(0.0, 0.12, length((f - off * 0.7) * vec2(1.0, 1.3)));
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.3 + h * 2.0) + h * 30.0);
  float spark = step(0.72, h) * dot0 * twinkle * (1.0 - smoothstep(0.30, 0.95, across)) * (1.0 - smoothstep(0.6, 1.0, t));
  col += white * spark * 1.3;
  alpha += spark * 0.45;

  // the head melts into the orb instead of starting at its skin
  alpha += exp(-t * 30.0) * (1.0 - smoothstep(0.0, 0.9, across)) * 0.35;
  col += white * head * (1.0 - smoothstep(0.0, 0.7, across)) * 0.35;

  alpha = clamp(alpha, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}
`

/** the orb's own bloom: a soft radial halo that ties the crystal into the sky */
const GLOW_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform float uTime;
layout(location = 0) out vec4 fragColor;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;
  float breathe = 0.92 + 0.08 * sin(uTime * 0.9);
  vec3 col = mix(vec3(0.72, 0.86, 1.0), vec3(1.0, 0.96, 0.90), exp(-r * 4.0));
  float a = exp(-r * 4.2) * 0.55 + exp(-r * 12.0) * 0.35;
  fragColor = vec4(col * a * breathe, a * breathe);
}
`

export function CometOrb({ layout }: { layout: Layout }) {
  const time = useRef(0)
  const group = useRef<THREE.Group>(null)

  const tailMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: TAIL_VERT,
        fragmentShader: TAIL_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uLength: { value: 1 },
          uWidth: { value: 1 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    [],
  )

  const glowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: TAIL_VERT,
        fragmentShader: GLOW_FRAG,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    [],
  )

  useEffect(
    () => () => {
      tailMat.dispose()
      glowMat.dispose()
    },
    [tailMat, glowMat],
  )

  const { x, y, r } = layout.dive
  const angle = Math.PI - 0.34
  const length = layout.mobile > 0.5 ? 1.75 : 2.55
  const width = layout.mobile > 0.5 ? 0.95 : 1.15

  useFrame((_, delta) => {
    time.current += Math.min(delta, 1 / 20)
    tailMat.uniforms.uTime.value = time.current
    glowMat.uniforms.uTime.value = time.current
    if (group.current) {
      // the fall breathes: a slow drift, nothing that reads as a floating prop
      group.current.position.y = y + Math.sin(time.current * 0.35) * 0.012
      group.current.position.x = x + Math.sin(time.current * 0.22 + 1.2) * 0.008
      group.current.rotation.z = -0.10 + Math.sin(time.current * 0.28) * 0.02
    }
  })

  return (
    <group ref={group} position={[x, y, 0]}>
      {/* the wake, drawn behind the orb */}
      <mesh
        material={tailMat}
        rotation={[0, 0, angle]}
        position={[Math.cos(angle) * length * 0.5, Math.sin(angle) * length * 0.5, -0.03]}
        renderOrder={10}
      >
        <planeGeometry args={[length, width, 1, 1]} />
      </mesh>

      {/* the crystal's halo */}
      <mesh material={glowMat} position={[0, 0, -0.01]} renderOrder={11} scale={r * 9}>
        <planeGeometry args={[1, 1]} />
      </mesh>

      <CrystalStarOrb layout={{ ...layout, orb: { x: 0, y: 0, r } }} showSpaceRings={false} />
    </group>
  )
}
