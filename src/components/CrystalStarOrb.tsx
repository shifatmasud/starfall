import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Layout } from '../scenes/layout'

/**
 * The crystal star: a pearlescent glass sphere with a warm core and three thin rings.
 *
 * Not a lit ball. The body is a thin glass shell — the space behind it is refracted through the
 * surface, an iridescent film drifts across it, a golden-white star burns inside, and the ring light
 * reflects off the shell's inner face. Values above display white are deliberate: the bloom's bright
 * pass turns only the crest and the specular into the halo the plate has.
 */

const VERT = /* glsl */ `
out vec3 vN;
out vec3 vV;
out vec3 vObj;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vObj = normalize(position);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const FRAG = /* glsl */ `
precision highp float;
in vec3 vN;
in vec3 vV;
in vec3 vObj;
uniform float uTime;
uniform vec3 uSun;
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

/** what the glass sees: dark space, the Earth's blue low down, the star's light above right */
vec3 backdrop(vec3 dir) {
  float down = smoothstep(0.10, -0.55, dir.y);
  vec3 col = mix(vec3(0.020, 0.030, 0.058), vec3(0.012, 0.028, 0.062), down);
  col += vec3(0.16, 0.36, 0.78) * pow(down, 1.7) * 1.15;
  float s = max(dot(dir, normalize(vec3(0.80, 0.62, 0.20))), 0.0);
  col += vec3(1.0, 0.90, 0.76) * pow(s, 26.0) * 2.6;
  col += vec3(0.55, 0.70, 1.0) * pow(s, 4.0) * 0.10;
  return col;
}

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.6);
  vec3 L = normalize(uSun);

  // the interior: space bent through the shell, and the shell's own film
  vec3 refr = refract(-V, N, 1.0 / 1.52);
  vec3 inside = backdrop(refr);

  vec2 lp = vec2(vObj.x * 2.0 + vObj.z * 0.6, vObj.y * 2.4 + vObj.z * 1.1);
  float swirl = fbm(lp * 1.6 + vec2(uTime * 0.020, -uTime * 0.014));
  float swirl2 = fbm(lp * 3.4 - vec2(uTime * 0.030, uTime * 0.010));

  // the sunward half of the glass runs warm gold, the far half stays cold and see-through
  float sunSide = smoothstep(-0.35, 0.85, dot(N, L));
  vec3 film = mix(vec3(0.55, 0.76, 1.0), vec3(1.0, 0.78, 0.42), sunSide * 0.85 + swirl * 0.15);

  vec3 col = inside * (0.65 + 0.45 * sunSide);
  col += vec3(0.07, 0.10, 0.16) * (0.30 + 0.70 * swirl);
  col += film * (0.10 + 0.50 * fres) * (0.45 + 1.10 * swirl);
  col += vec3(1.0, 0.74, 0.38) * smoothstep(0.60, 0.95, swirl2) * (0.12 + 0.50 * fres) * (0.35 + 0.65 * sunSide);

  // the star at the centre, burning through the glass
  float core = pow(clamp(dot(-N, normalize(vec3(0.10, 0.02, 1.0))), 0.0, 1.0), 6.0);
  col += vec3(1.0, 0.90, 0.72) * core * 1.10;
  col += vec3(1.0, 0.97, 0.90) * pow(core, 4.0) * (1.5 + 1.2 * sunSide);

  // the shell: a hard white crest all round, hottest on the sun side
  float rim = pow(1.0 - ndv, 9.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 620.0);
  float lit = smoothstep(-0.35, 0.9, dot(N, L));
  col += vec3(0.94, 0.98, 1.0) * rim * (0.55 + 2.0 * lit);
  col += vec3(1.0, 0.99, 0.96) * spec * 9.0;
  col += vec3(1.0, 0.92, 0.80) * pow(max(dot(N, H), 0.0), 70.0) * 0.45 * sunSide;

  // the ring's reflection: a second, softer crest just inside the silhouette
  float shell = smoothstep(0.30, 0.42, ndv) * smoothstep(0.56, 0.44, ndv);
  col += vec3(0.86, 0.93, 1.0) * shell * (0.10 + 0.22 * lit);

  // a warm bloom off the ball's sunward shoulder, as on the plate
  float shoulder = smoothstep(0.0, 0.95, dot(N, normalize(vec3(1.0, 0.18, 0.32)))) * pow(1.0 - ndv, 1.6);
  col += vec3(1.0, 0.84, 0.64) * shoulder * 0.50;

  // the shell is glass, not paint: the sky behind it must survive
  float alpha = clamp(0.42 + 0.45 * fres + 0.55 * spec + 0.35 * rim, 0.35, 1.0);
  fragColor = vec4(col, alpha);
}
`

const RING_VERT = /* glsl */ `
out vec3 vV;
out vec2 vLocal;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vLocal = position.xy;
  vV = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const RING_FRAG = /* glsl */ `
precision highp float;
in vec3 vV;
in vec2 vLocal;
uniform float uOpacity;
uniform float uBand;
uniform float uWidth;
uniform vec3 uTint;
layout(location = 0) out vec4 fragColor;
void main() {
  // a gaussian band rather than a tube: a one-pixel line at any resolution, with a soft glow
  float rr = length(vLocal);
  float x = (rr - uBand) / uWidth;
  float band = exp(-x * x);
  float core = exp(-x * x * 9.0);
  fragColor = vec4(uTint * (band * 0.55 + core * 0.85) * uOpacity, 1.0);
}
`

export function CrystalStarOrb({ layout }: { layout: Layout }) {
  const orb = useRef<THREE.Mesh>(null)
  const rings = useRef<THREE.Group>(null)
  const time = useRef(0)

  const glass = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uSun: { value: new THREE.Vector3(0.62, 0.72, 0.34).normalize() },
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.FrontSide,
      }),
    [],
  )

  const ringMaterials = useMemo(
    () =>
      [0.80, 0.40, 0.20].map(
        (o) =>
          new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: RING_VERT,
            fragmentShader: RING_FRAG,
            uniforms: {
              uOpacity: { value: o },
              uBand: { value: 1 },
              uWidth: { value: 0.012 },
              uTint: { value: new THREE.Color(o > 0.8 ? '#ffffff' : '#cfe4ff') },
            },
            transparent: false,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide,
          }),
      ),
    [],
  )

  useEffect(
    () => () => {
      glass.dispose()
      ringMaterials.forEach((m) => m.dispose())
    },
    [glass, ringMaterials],
  )

  useFrame((_, delta) => {
    time.current += Math.min(delta, 1 / 20)
    glass.uniforms.uTime.value = time.current
    if (orb.current) orb.current.rotation.y = Math.sin(time.current * 0.09) * 0.12 + 0.16
    if (rings.current) rings.current.rotation.y = Math.sin(time.current * 0.06) * 0.05
  })

  const { x, y, r } = layout.orb

  return (
    <group position={[x, y, 0]}>
      {/* the ring system, tilted so the near arc crosses the ball's lower third */}
      <group ref={rings} rotation={[1.36, 0, -0.20]}>
        {[
          { radius: 2.72, width: 0.040, mat: 0 },
          { radius: 3.12, width: 0.032, mat: 1 },
          { radius: 3.54, width: 0.026, mat: 2 },
        ].map((ring, i) => {
          const band = ring.radius * r * (layout.mobile ? 0.62 : 1)
          const material = ringMaterials[ring.mat]
          material.uniforms.uBand.value = band
          material.uniforms.uWidth.value = ring.width * r
          return (
            <mesh key={i} material={material} renderOrder={30}>
              <ringGeometry args={[band * (1 - ring.width * 3.0), band * (1 + ring.width * 3.0), 720, 1]} />
            </mesh>
          )
        })}
      </group>

      <mesh ref={orb} material={glass} renderOrder={20}>
        <sphereGeometry args={[r, 96, 64]} />
      </mesh>
    </group>
  )
}
