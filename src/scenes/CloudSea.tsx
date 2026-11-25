import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Layout } from './layout'

/**
 * The morning sky over the cloud sea — one painted pass, baked once.
 *
 * Panel 2's picture is a *painting*: a warm sun just above the horizon's left of centre, pastel blue
 * thinning into peach-gold haze, a sea of cumulus with cream tops and lavender undersides, and a
 * snow-capped range on the right emerging from the cloud. All of it is one shader: the gradient, the
 * sun and its beams, the far range, then four cloud layers painted back to front, each shaded by its
 * own density slope so its tops catch the sun and its hollows fall into violet. Soft, high-key, no
 * hard CG edges — and rendered once into a texture, so the frame stays cheap on a CPU rasterizer.
 */

const VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const SKY_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform vec2 uSun;
uniform float uAspect;
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

float fbm(vec2 p, int oct) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * vn(p);
    p = p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

/**
 * One bank of cumulus.
 *
 * The density is a field, biased by height so the bank sits on its base line and breaks into heads
 * above it. Its light is not painted on: the field's own slope gives a surface normal, and one warm
 * sun from the upper left shades every head — cream on the lit side, warm grey in the body, violet
 * only where the surface turns away. That is what gives the bank volume instead of a silhouette.
 */
vec4 bank(vec2 uv, vec2 sun, float baseY, float thick, float scale, float cover,
          vec3 lit, vec3 shade, float seed) {
  vec2 p = uv * vec2(uAspect, 1.0);
  vec2 o = vec2(seed, seed * 0.7);
  float nC = fbm(p * scale + o, 4);
  float nX = fbm(p * scale + o + vec2(0.35, 0.0), 4);
  float nY = fbm(p * scale + o + vec2(0.0, 0.35), 4);
  float drift = (fbm(vec2(uv.x * uAspect * 1.6 + seed * 3.1, 8.0), 3) - 0.5) * thick * 1.5;
  float bias = (uv.y - baseY + drift) * (1.15 / max(thick, 0.01));
  float dens = smoothstep(cover, cover + 0.10, nC + bias);
  if (dens <= 0.003) return vec4(0.0);

  // the surface: the field's gradient, tilted toward the viewer
  vec2 grad = vec2(nX - nC, nY - nC) * 2.6;
  vec3 N = normalize(vec3(-grad, 1.0));
  vec3 L = normalize(vec3(-0.55, -0.75, 0.55));       // light from the upper left, like the sun
  float lam = clamp(dot(N, L), 0.0, 1.0);
  float sky = 0.5 + 0.5 * N.y;

  float sunNear = 1.0 - smoothstep(0.10, 0.95, length((uv - sun) * vec2(uAspect * 0.62, 1.0)));
  vec3 col = shade + (lit - shade) * pow(lam, 1.15);
  col = mix(col, col * vec3(1.06, 1.00, 0.94), lam);
  col += vec3(0.10, 0.12, 0.18) * sky * 0.35;          // the sky's own light in the hollows
  col = mix(col, vec3(1.0, 0.87, 0.68), sunNear * pow(lam, 2.0) * 0.55);
  // the crown's edge: the thin warm rim that makes a cloud read as a cloud
  float near = smoothstep(0.0, 0.10, dens) * (1.0 - smoothstep(0.10, 0.55, dens));
  col = mix(col, vec3(1.0, 0.95, 0.86), near * (0.25 + 0.45 * sunNear));
  return vec4(col, dens);
}

/** the range on the right: snow-tipped peaks standing in the morning haze */
vec4 range(vec2 uv, float hz) {
  if (uv.x < 0.44) return vec4(0.0);
  float u = (uv.x - 0.44) / 0.56;
  float r1 = pow(1.0 - abs(fbm(vec2(u * 5.0, 2.0), 4) - 0.5) * 2.0, 2.4);
  float r2 = pow(1.0 - abs(fbm(vec2(u * 11.0 + 4.0, 7.0), 3) - 0.5) * 2.0, 3.2);
  float envelope = sin(clamp(u, 0.0, 1.0) * 3.14159 * 0.95);
  float ridge = hz - 0.02 - (r1 * 0.85 + r2 * 0.30) * 0.19 * envelope;
  float m = smoothstep(ridge - 0.003, ridge + 0.003, uv.y);
  m *= smoothstep(0.0, 0.16, u) * (1.0 - smoothstep(0.82, 1.0, u));
  if (m <= 0.002) return vec4(0.0);
  float snow = 1.0 - smoothstep(ridge + 0.004, ridge + 0.070, uv.y);
  vec3 rock = mix(vec3(0.16, 0.20, 0.34), vec3(0.42, 0.45, 0.60), smoothstep(0.05, 0.85, snow));
  rock = mix(rock, vec3(1.0, 0.99, 1.0), snow * 0.80);
  // the rock takes the sun on its left faces
  rock *= 0.85 + 0.35 * smoothstep(0.0, 0.6, fbm(vec2(u * 26.0, uv.y * 40.0), 3));
  rock = mix(vec3(0.76, 0.74, 0.86), rock, 0.70);       // aerial perspective
  return vec4(rock, m);
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);          // y down, like the plate
  const float hz = 0.485;

  // ---- sky: deep morning blue above, peach-gold haze at the horizon
  vec3 col = mix(vec3(0.045, 0.135, 0.375), vec3(0.14, 0.31, 0.60), smoothstep(0.0, 0.24, uv.y));
  col = mix(col, vec3(0.38, 0.55, 0.80), smoothstep(0.16, 0.38, uv.y));
  col = mix(col, vec3(0.82, 0.66, 0.50), smoothstep(0.38, 0.50, uv.y));

  // a warm wash on the sun's side of the sky
  float side = 1.0 - smoothstep(0.0, 1.0, length((uv - uSun) * vec2(uAspect * 0.55, 1.0)));
  col = mix(col, vec3(1.0, 0.78, 0.52), side * 0.40);

  // ---- the sun: a small disc inside a wide warm bloom, with the low sun's flat haze bands
  vec2 sp = (uv - uSun) * vec2(uAspect, 1.0);
  float r = length(sp);
  col += vec3(1.0, 0.97, 0.90) * exp(-r * 62.0) * 1.7;
  col += vec3(1.0, 0.89, 0.70) * exp(-r * 15.0) * 0.36;
  col += vec3(1.0, 0.80, 0.56) * exp(-r * 4.4) * 0.14;
  col += vec3(1.0, 0.87, 0.67) * exp(-abs(sp.y) * 32.0) * exp(-abs(sp.x) * 1.7) * 0.09;

  // ---- high cirrus: two thin veils stretched along the sky, catching the sun
  float c1 = fbm(vec2(uv.x * uAspect * 3.4 + uv.y * 0.8, uv.y * 22.0), 4);
  float veil = smoothstep(0.44, 0.76, c1) * smoothstep(0.02, 0.08, uv.y) * (1.0 - smoothstep(0.08, 0.30, uv.y));
  col = mix(col, vec3(1.0, 0.92, 0.82), veil * 0.34);
  float c2 = fbm(vec2(uv.x * uAspect * 6.0 - uv.y * 2.0, uv.y * 36.0 + 5.0), 4);
  float veil2 = smoothstep(0.48, 0.78, c2) * smoothstep(0.0, 0.04, uv.y) * (1.0 - smoothstep(0.04, 0.20, uv.y));
  col = mix(col, vec3(1.0, 0.94, 0.86), veil2 * 0.22);

  // ---- the range on the right, standing in the haze behind the clouds
  vec4 rng = range(uv, hz);
  col = mix(col, rng.rgb, rng.a);

  // ---- the cloud sea, painted back to front: three banks of cumulus at three distances
  vec4 b0 = bank(uv, uSun, hz + 0.02, 0.10, 8.0, 0.44,
                 vec3(1.0, 0.97, 0.92), vec3(0.60, 0.60, 0.74), 3.0);
  col = mix(col, b0.rgb, b0.a * 0.92);

  vec4 b1 = bank(uv, uSun, 0.600, 0.20, 4.2, 0.42,
                 vec3(1.0, 0.94, 0.84), vec3(0.52, 0.52, 0.68), 17.0);
  col = mix(col, b1.rgb, b1.a * 0.96);

  vec4 b2 = bank(uv, uSun, 0.815, 0.28, 2.1, 0.40,
                 vec3(1.0, 0.92, 0.82), vec3(0.42, 0.42, 0.60), 41.0);
  col = mix(col, b2.rgb, b2.a * 0.98);

  // ---- sunbeams: broad soft rays fanning out of the sun, only where the air is thick
  vec2 beamDir = uv - uSun;
  float ang = atan(beamDir.y, beamDir.x);
  float rays = fbm(vec2(ang * 9.0, 3.0), 3);
  float beam = smoothstep(0.55, 0.85, rays) * smoothstep(0.05, 0.25, length(beamDir)) * (1.0 - smoothstep(0.55, 0.95, length(beamDir)));
  col += vec3(1.0, 0.92, 0.78) * beam * 0.16;

  // ---- morning haze: a breath of warm light near the sun over everything
  float haze = 1.0 - smoothstep(0.04, 0.70, length((uv - uSun) * vec2(uAspect * 0.6, 1.0)));
  col = mix(col, vec3(1.0, 0.92, 0.82), haze * 0.10);
  col = mix(col, vec3(0.70, 0.78, 0.95), smoothstep(0.62, 1.0, uv.y) * 0.05);

  // the bake's own grade: deepen the tone and hold the colour, so the morning keeps its blue and
  // its gold through the film curve instead of washing to grey
  col = pow(max(col, 0.0), vec3(1.22));
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, 1.16);
  col = mix(col, col * vec3(1.03, 1.00, 0.96), 0.5);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

export function CloudSea({ layout }: { layout: Layout }) {
  const gl = useThree((state) => state.gl)
  const dpr = useThree((state) => state.viewport.dpr)

  const target = useMemo(
    () =>
      new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      }),
    [],
  )

  const uniforms = useMemo(
    () => ({
      uRes: { value: new THREE.Vector2(1, 1) },
      uSun: { value: new THREE.Vector2(0.47, 0.11) },
      uAspect: { value: 1.6 },
    }),
    [],
  )

  const sky = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERT,
        fragmentShader: SKY_FRAG,
        uniforms,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      }),
    [uniforms],
  )

  const display = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERT,
        fragmentShader: /* glsl */ `
          precision highp float;
          in vec2 vUv;
          uniform sampler2D uBaked;
          layout(location = 0) out vec4 fragColor;
          void main() { fragColor = vec4(texture(uBaked, vUv).rgb, 1.0); }
        `,
        uniforms: { uBaked: { value: target.texture } },
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      }),
    [target],
  )

  const bake = useMemo(() => {
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sky)
    mesh.frustumCulled = false
    scene.add(mesh)
    return { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) }
  }, [sky])

  const baked = useRef('')

  useEffect(
    () => () => {
      target.dispose()
      sky.dispose()
      display.dispose()
    },
    [target, sky, display],
  )

  useFrame(() => {
    const w = gl.domElement.width
    const h = gl.domElement.height
    if (!w || !h) return
    const key = `${w}x${h}`
    if (key === baked.current) return
    baked.current = key

    target.setSize(w, h)
    uniforms.uRes.value.set(w, h)
    uniforms.uAspect.value = layout.aspect
    // the sun sits a little left of centre, low in the sky; the plate's own framing
    uniforms.uSun.value.set(layout.sun.x, layout.sun.y)

    const previous = gl.getRenderTarget()
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(bake.scene, bake.camera)
    gl.setRenderTarget(previous)
    void dpr
  })

  return (
    <mesh frustumCulled={false} renderOrder={-100} material={display}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
