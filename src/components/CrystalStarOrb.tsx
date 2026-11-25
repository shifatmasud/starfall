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
  float down = 1.0 - smoothstep(-0.55, 0.10, dir.y);
  vec3 col = mix(vec3(0.016, 0.026, 0.056), vec3(0.010, 0.026, 0.064), down);
  col += vec3(0.16, 0.36, 0.80) * pow(down, 1.7) * 1.05;
  float s = max(dot(dir, normalize(vec3(0.80, 0.62, 0.20))), 0.0);
  col += vec3(1.0, 0.90, 0.76) * pow(s, 22.0) * 2.2;
  col += vec3(0.55, 0.70, 1.0) * pow(s, 4.0) * 0.08;
  return col;
}

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  vec3 L = normalize(uSun);
  float sunSide = smoothstep(-0.45, 0.85, dot(N, L));

  // the interior: space bent through clear crystal, never a painted pearl
  vec3 refr = refract(-V, N, 1.0 / 1.62);
  vec3 inside = backdrop(refr);

  // sunlit cloud caught inside the glass: fine horizontal amber/ice strata drifting slowly
  vec2 lp = vec2(vObj.x * 1.7 + vObj.z * 0.35, vObj.y * 6.0 + vObj.z * 0.6);
  float band1 = fbm(lp + vec2(uTime * 0.018, uTime * 0.011));
  float band2 = fbm(lp * 2.3 + vec2(-uTime * 0.024, uTime * 0.006));
  // the bands are caught cloud in the glass: soft masses, never ruled lines
  float strata = smoothstep(0.44, 0.80, band1 * 0.72 + band2 * 0.28);
  // the bands gather across the middle of the ball and thin out toward its poles
  strata *= 0.30 + 0.70 * smoothstep(0.95, 0.05, abs(vObj.y));
  float swirl = smoothstep(0.45, 0.80, fbm(lp * 1.4 + vec2(uTime * 0.020, -uTime * 0.014)));

  vec3 amber = vec3(1.0, 0.66, 0.30);
  vec3 ice = vec3(0.60, 0.80, 1.0);

  // clear body: the sky behind survives, cooled a little, warmed on the sun side
  vec3 col = inside * (1.05 + 0.40 * sunSide);
  col += ice * 0.075 * (0.35 + fres);
  // the golden refracted strata — the plate's warm streaks, hottest where the light enters
  col += vec3(1.0, 0.82, 0.44) * strata * (1.25 + 1.85 * sunSide) * (0.45 + 0.85 * fres);
  col += vec3(1.0, 0.86, 0.58) * swirl * (0.30 + 0.70 * sunSide) * 0.42;

  // the star at the heart of the crystal: a broad golden fire with a white-hot centre, big enough
  // to read as the light source the whole ball is lit by
  float coreD = clamp(dot(-N, normalize(vec3(0.30, 0.05, 0.95))), 0.0, 1.0);
  col += vec3(1.0, 0.74, 0.42) * pow(coreD, 1.2) * 1.25;
  col += vec3(1.0, 0.84, 0.58) * pow(coreD, 2.6) * 1.90;
  col += vec3(1.0, 0.94, 0.80) * pow(coreD, 6.0) * 1.60;
  col += vec3(1.0, 0.99, 0.97) * pow(coreD, 18.0) * 1.10;
  // the glass itself holds the light: a soft core down the middle, never a dark marble
  col += vec3(1.0, 0.84, 0.60) * pow(ndv, 2.4) * 0.55;
  // and a thin caustic line where the crystal's edge bends the star's light
  float caustic = pow(1.0 - abs(vObj.x * 1.15 + vObj.y * 0.35 - 0.05), 26.0);
  col += vec3(1.0, 0.94, 0.84) * caustic * 0.35 * (0.4 + 0.6 * sunSide);

  // the shell: one thin bright line, white where it faces the star and cool elsewhere
  float rim = pow(1.0 - ndv, 7.5);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 900.0);
  float lit = smoothstep(-0.45, 0.95, dot(N, L));
  col += mix(ice, vec3(1.0, 0.92, 0.78), lit) * rim * (0.85 + 2.30 * lit);
  col += vec3(1.0, 0.99, 0.96) * spec * 13.0;
  col += vec3(1.0, 0.90, 0.74) * pow(max(dot(N, H), 0.0), 120.0) * 0.35 * sunSide;

  // a warm bloom off the sunward shoulder, as on the plate
  float shoulder = smoothstep(0.15, 1.0, dot(N, normalize(vec3(1.0, 0.16, 0.30)))) * pow(1.0 - ndv, 1.4);
  col += vec3(1.0, 0.80, 0.56) * shoulder * 0.60;

  // glass, not paint: transparent in the middle, gathering at the silhouette
  float alpha = clamp(0.14 + 0.52 * fres + 0.55 * rim + 0.45 * spec + 0.28 * strata * sunSide, 0.12, 1.0);
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
uniform float uOrbR;
uniform vec3 uTint;
layout(location = 0) out vec4 fragColor;
void main() {
  // a gaussian band rather than a tube: a smooth line at any resolution, with a soft glow
  float rr = length(vLocal);
  float x = (rr - uBand) / uWidth;
  float band = exp(-x * x);
  float core = exp(-x * x * 8.0);
  // the near arc crosses the ball in front and the star's light catches it there; the far arc is
  // hidden behind the glass, so it fades out exactly over the ball's silhouette
  float near = smoothstep(-0.10 * uBand, 0.35 * uBand, vLocal.y);
  float overBall = near * (1.0 - smoothstep(uOrbR * 0.88, uOrbR * 1.02, abs(vLocal.x)));
  float behindBall = (1.0 - near) * (1.0 - smoothstep(uOrbR * 0.96, uOrbR * 1.10, length(vLocal / vec2(1.0, 0.62))));
  vec3 tint = mix(uTint, vec3(1.0, 0.93, 0.82), overBall * 0.8);
  float gain = (0.55 + 1.15 * overBall) * (1.0 - behindBall * 0.92);
  fragColor = vec4(tint * (band * 0.55 + core * 0.95) * uOpacity * gain, 1.0);
}
`

export function CrystalStarOrb({ layout, showSpaceRings = true }: { layout: Layout; showSpaceRings?: boolean }) {
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
              uOrbR: { value: 1 },
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
      <group ref={rings} visible={showSpaceRings} rotation={[1.12, 0, -0.24]}>
        {[
          { radius: 1.52, width: 0.075, mat: 0 },
          { radius: 1.74, width: 0.060, mat: 1 },
          { radius: 1.98, width: 0.048, mat: 2 },
        ].map((ring, i) => {
          const band = ring.radius * r * (layout.mobile ? 0.74 : 1)
          const material = ringMaterials[ring.mat]
          material.uniforms.uBand.value = band
          material.uniforms.uWidth.value = ring.width * r
          material.uniforms.uOrbR.value = r
          return (
            <mesh key={i} material={material} renderOrder={30}>
              <planeGeometry args={[band * 2.7, band * 2.7]} />
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
