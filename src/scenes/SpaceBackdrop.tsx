import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Layout } from './layout'

/**
 * Space, its stars and the Earth's limb — one painted pass.
 *
 * The sky, the star field and the planet are a single shader because they are one image: the stars
 * are occluded by the planet because they are evaluated before it, the atmosphere's haze lands on
 * them, and the planet's light washes back up into the dark. It is expensive per pixel and completely
 * still, so it is rendered once into a texture (and again only when the viewport changes) and then
 * sampled with one tap per frame. On a CPU rasterizer that is the difference between a slideshow and
 * a scene; on a GPU it costs a single bootstrap frame.
 *
 * Stars are a hashed grid in device pixels rather than a point cloud: every star has a sub-pixel
 * position and a radius in pixels, so the field stays crisp at any DPR and never depends on a
 * driver's idea of `gl_PointSize`.
 */

const HEAVY_VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const HEAVY_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uDpr;
uniform float uAspect;
uniform vec2 uEarth;
uniform float uRadius;
uniform vec2 uStar;
uniform float uDebug;
layout(location = 0) out vec4 fragColor;

float h21(vec2 p) {
  // a lattice hash that is non-zero at integer points: the fract-multiply variant collapses to 0
  // on the lattice, which silently flattens every value noise built on it
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 h22(vec2 p) {
  float a = dot(p, vec2(127.1, 311.7));
  float b = dot(p, vec2(269.5, 183.3));
  return fract(sin(vec2(a, b)) * 43758.5453);
}

float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = h21(i);
  float b = h21(i + vec2(1.0, 0.0));
  float c = h21(i + vec2(0.0, 1.0));
  float d = h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, int oct) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    s += a * vn(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

float h31(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float vn3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = h31(i);
  float n100 = h31(i + vec3(1.0, 0.0, 0.0));
  float n010 = h31(i + vec3(0.0, 1.0, 0.0));
  float n110 = h31(i + vec3(1.0, 1.0, 0.0));
  float n001 = h31(i + vec3(0.0, 0.0, 1.0));
  float n101 = h31(i + vec3(1.0, 0.0, 1.0));
  float n011 = h31(i + vec3(0.0, 1.0, 1.0));
  float n111 = h31(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

float fbm3(vec3 p, int oct) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    s += a * vn3(p);
    p = p * 2.03 + vec3(1.7, 9.2, 4.1);
    a *= 0.5;
  }
  return s;
}

vec3 starLayer(vec2 px, float cell, float prob, float gain, float seed) {
  vec2 cellPx = vec2(cell);
  vec2 g = floor(px / cellPx);
  vec2 f = fract(px / cellPx);
  vec2 h = h22(g + seed);
  vec2 spot = 0.5 + (h - 0.5) * 0.72;
  float dist = length((f - spot) * cellPx);
  float mag = pow(h21(g + seed + 3.7), 4.0);
  float radius = (0.45 + 1.05 * mag) * uDpr;
  float core = 1.0 - smoothstep(radius * 0.22, radius + 0.5 * uDpr, dist);
  float gate = step(h21(g + seed + 11.0), prob);
  vec3 tint = mix(vec3(1.0, 0.90, 0.78), vec3(0.70, 0.83, 1.0), h21(g + seed + 5.0));
  return tint * core * (0.32 + 3.6 * mag) * gate * gain;
}

vec3 sky(vec2 p) {
  float v = clamp(p.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(vec3(0.014, 0.021, 0.042), vec3(0.006, 0.008, 0.017), smoothstep(0.10, 0.92, v));
  c = mix(vec3(0.024, 0.036, 0.066), c, smoothstep(0.0, 0.34, v));
  // the sky is a gradient, not a place: no nebula banks, nothing that competes with the star
  float n = fbm(p * vec2(1.15, 1.5) + vec2(4.2, 1.3), 3);
  c += vec3(0.003, 0.005, 0.011) * smoothstep(0.55, 0.98, n);
  // the star's own quad paints the flare; the sky only lifts the very base of it
  vec2 starP = vec2((uStar.x + uAspect) * 0.5, uStar.y);
  float ds = length(p - starP);
  c += vec3(0.55, 0.62, 0.88) * exp(-ds * 60.0) * 0.10;
  float de = max(0.0, length(p - uEarth) - uRadius);
  c += vec3(0.06, 0.14, 0.34) * exp(-de * 5.0) * 0.22;
  return c;
}

void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y * 2.0 - 1.0);
  vec2 px = vUv * uRes;
  vec3 col = sky(p);

  col += starLayer(px, 92.0, 0.45, 0.72, 1.0);
  col += starLayer(px, 52.0, 0.16, 0.55, 17.0);
  col += starLayer(px, 27.0, 0.09, 0.38, 43.0);

  vec2 q = p - uEarth;
  float rr = length(q);
  float d = rr - uRadius;
  float above = max(d, 0.0);

  // the atmosphere: a thin hot crest, then the wide blue scatter above it
  float ang2 = atan(q.y, q.x);
  float arc = 0.62 + 0.38 * fbm(vec2(ang2 * 3.4, 3.0), 4);
  // painted air, not a neon tube: light gathered along the arc, warm where the sun catches it
  col += vec3(0.98, 0.99, 1.0) * exp(-above * 120.0) * 0.55 * arc;
  col += vec3(1.0, 0.95, 0.86) * exp(-above * 55.0) * 0.34 * arc;
  col += vec3(1.0, 0.88, 0.70) * exp(-above * 26.0) * 0.16 * arc * smoothstep(-1.2, 0.2, p.x);
  col += vec3(0.34, 0.58, 1.0) * exp(-above * 46.0) * 0.28 * arc;
  col += vec3(0.14, 0.32, 0.72) * exp(-above * 15.0) * 0.22;
  col += vec3(0.05, 0.12, 0.32) * exp(-above * 5.0) * 0.12;

  if (d < 0.0) {
    float z = sqrt(max(0.0, 1.0 - (rr * rr) / (uRadius * uRadius)));
    vec3 n = vec3(q.x / uRadius, q.y / uRadius, z);

    // painter's coordinates: arc length along the limb and depth below it, so the cloud field
    // follows the planet's curve the way the reference's painted surface does — no polar stretching
    float ang = atan(q.y, q.x);
    float arc = ang * uRadius;
    float depth = -d;
    vec2 sp = vec2(arc * 4.5, depth * 8.0);

    vec2 warp = vec2(fbm(sp * 1.5 + vec2(3.1, 0.7), 3), fbm(sp * 1.5 + vec2(8.3, 4.2), 3)) - 0.5;
    float broad = fbm(sp * 1.15 + warp * 1.5, 4);
    float detail = fbm(sp * 5.0 + warp * 2.0, 4);
    float fine = fbm(sp * 18.0 + warp * 2.4, 4);
    float micro = fbm(sp * 46.0 + warp * 2.0, 3);

    // cumulus heads: broad banks of small, bright puffs rather than a streaky smear
    float mass = broad * 0.46 + detail * 0.34 + fine * 0.16 + micro * 0.08;
    float cover = smoothstep(0.45, 0.62, mass);
    float tops = smoothstep(0.48, 0.64, detail * 0.42 + fine * 0.42 + micro * 0.24);
    float puffs = smoothstep(0.54, 0.78, detail * 0.5 + fine * 0.38 + micro * 0.22);

    vec3 sea = mix(vec3(0.014, 0.042, 0.098), vec3(0.030, 0.090, 0.195), fbm(sp * 1.8 + 5.0, 3));
    float land = smoothstep(0.58, 0.74, fbm(sp * 1.1 + vec2(21.0, 9.0), 3));
    vec3 rock = vec3(0.050, 0.052, 0.062) * (0.8 + 0.45 * fbm(sp * 9.0, 3));
    vec3 ground = mix(sea, rock, land * 0.7);

    // sunlit cream on the puff heads, blue-grey only in the lee of the bank
    vec3 cloud = mix(vec3(0.44, 0.50, 0.64), vec3(1.0, 0.99, 0.97), tops);
    cloud = mix(cloud, vec3(1.0, 0.93, 0.80), puffs * 0.55);
    ground *= 1.0 - cover * 0.30;
    vec3 surf = mix(ground, cloud, cover * 0.88);

    vec3 sunDir = normalize(vec3(0.52, 0.62, 0.58));
    float ndl = clamp(dot(n, sunDir) * 1.3 + 0.12, 0.0, 1.0);
    surf *= 0.72 + 0.76 * pow(ndl, 0.85);
    surf += vec3(1.0, 0.88, 0.70) * cover * tops * 0.20 * ndl;
    // the air over the sea: a thin blue veil so the surface never reads as a cut-out
    surf = mix(surf, vec3(0.30, 0.50, 0.86), clamp(exp(d * 26.0) * 0.30, 0.0, 0.22));

    float inside = exp(d * 70.0);
    surf = mix(surf, vec3(0.30, 0.52, 0.90), clamp(inside * 0.8, 0.0, 0.34));
    surf += vec3(0.36, 0.60, 1.0) * inside * 0.30;
    surf += vec3(0.90, 0.96, 1.0) * exp(d * 90.0) * 0.34;

    col = surf;
  }

  if (uDebug > 0.5) {
    fragColor = vec4(step(d, 0.0), clamp(-d, 0.0, 1.0), col.b, 1.0);
    return;
  }

  col *= 1.0 - 0.10 * smoothstep(0.55, 1.35, length(p * vec2(0.62, 0.75)));
  fragColor = vec4(col, 1.0);
}
`

const DISPLAY_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D uBaked;
layout(location = 0) out vec4 fragColor;
void main() { fragColor = vec4(texture(uBaked, vUv).rgb, 1.0); }
`

export function SpaceBackdrop({ layout }: { layout: Layout }) {
  const gl = useThree((state) => state.gl)
  const size = useThree((state) => state.size)
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
      uDpr: { value: 1 },
      uAspect: { value: 1.5 },
      uEarth: { value: new THREE.Vector2() },
      uRadius: { value: 4 },
      uStar: { value: new THREE.Vector2() },
      uDebug: { value: 0 },
    }),
    [],
  )

  const heavy = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: HEAVY_VERT,
        fragmentShader: HEAVY_FRAG,
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
        vertexShader: HEAVY_VERT,
        fragmentShader: DISPLAY_FRAG,
        uniforms: { uBaked: { value: target.texture } },
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      }),
    [target],
  )

  // a private quad + scene to render the painting into its texture
  const bake = useMemo(() => {
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), heavy)
    mesh.frustumCulled = false
    scene.add(mesh)
    return { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) }
  }, [heavy])

  const baked = useRef('')

  useEffect(() => {
    return () => {
      target.dispose()
      heavy.dispose()
      display.dispose()
    }
  }, [target, heavy, display])

  useFrame(() => {
    const w = gl.domElement.width
    const h = gl.domElement.height
    if (!w || !h) return
    const key = `${w}x${h}`
    if (key === baked.current) return
    baked.current = key

    target.setSize(w, h)
    uniforms.uRes.value.set(w, h)
    uniforms.uDpr.value = dpr
    uniforms.uAspect.value = layout.aspect
    uniforms.uEarth.value.set(layout.earth.cx, layout.earth.cy)
    uniforms.uRadius.value = layout.earth.r
    uniforms.uStar.value.set(layout.star.x, layout.star.y)
    uniforms.uDebug.value = new URLSearchParams(location.search).has('dbg') ? 1 : 0

    const previous = gl.getRenderTarget()
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(bake.scene, bake.camera)
    gl.setRenderTarget(previous)
  })

  void size

  return (
    <mesh frustumCulled={false} renderOrder={-100} material={display}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
