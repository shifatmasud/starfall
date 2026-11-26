import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Layout } from '../layout'

/**
 * The morning sky — the air, light and high cirrus of panel 2, and nothing else.
 *
 * The clouds and the mountains are real geometry in their own files now, so this pass paints only
 * what is genuinely three hundred kilometres away: the blue overhead cooling into pale gold at the
 * horizon, a sun that is a small white disc inside a wide warm halo, the thin veils of cirrus catching
 * it, and the faint fan of light the low sun throws through the haze. Baked once per viewport into a
 * texture — on a phone that is the difference between one draw call and a per-pixel storm.
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
uniform vec2 uSun;
uniform float uAspect;
uniform float uHorizon;
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

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);              // y down, like the plate
  // the gradient was authored for a horizon at 0.52; squeeze it onto wherever the horizon is
  float gy = uv.y * 0.52 / uHorizon;

  // ---- the gradient: saturated blue overhead, cooling through lilac, to warm pale gold at the horizon
  vec3 col = mix(vec3(0.035, 0.180, 0.470), vec3(0.080, 0.290, 0.620), smoothstep(0.0, 0.16, gy));
  col = mix(col, vec3(0.230, 0.450, 0.720), smoothstep(0.13, 0.30, gy));
  col = mix(col, vec3(0.610, 0.700, 0.820), smoothstep(0.26, 0.42, gy));
  col = mix(col, vec3(0.930, 0.855, 0.780), smoothstep(0.40, 0.56, gy));

  // a warm wash on the sun's side, wide enough to be light rather than a lamp
  vec2 sp = (uv - uSun) * vec2(uAspect, 1.0);
  float r = length(sp);
  float wash = exp(-r * 3.4);
  col += vec3(1.0, 0.80, 0.52) * wash * 0.48;
  col = mix(col, vec3(1.0, 0.90, 0.76), smoothstep(0.20, 0.015, r) * 0.26);

  // ---- high cirrus: two veils stretched by the wind, lit warm where they face the sun
  float c1 = fbm(vec2(uv.x * uAspect * 3.1 + uv.y * 1.4, uv.y * 21.0 - 3.0), 5);
  float veil1 = smoothstep(0.44, 0.74, c1) * smoothstep(0.0, 0.05, uv.y) * (1.0 - smoothstep(0.10, 0.34, uv.y));
  float c2 = fbm(vec2(uv.x * uAspect * 7.5 - uv.y * 3.2, uv.y * 44.0 + 7.0), 4);
  float veil2 = smoothstep(0.50, 0.80, c2) * smoothstep(0.0, 0.03, uv.y) * (1.0 - smoothstep(0.06, 0.24, uv.y));
  vec3 veilCol = mix(vec3(0.98, 0.92, 0.86), vec3(1.0, 0.88, 0.72), smoothstep(0.15, 0.0, r) * 0.7);
  col = mix(col, veilCol, clamp(veil1 * 0.26 + veil2 * 0.15, 0.0, 0.40));

  // a third, lower band of thinner stuff that only shows against the blue
  float c3 = fbm(vec2(uv.x * uAspect * 2.2 + 5.0, uv.y * 13.0 + 2.0), 3);
  col = mix(col, vec3(0.96, 0.94, 0.94), smoothstep(0.56, 0.80, c3) * 0.04);

  // ---- the sun: a small disc, a tight core and a wide fan of light through the haze
  float disc = 1.0 - smoothstep(0.0075, 0.0125, r);
  col = mix(col, vec3(1.0, 0.985, 0.955), disc);
  col += vec3(1.0, 0.97, 0.90) * exp(-r * 52.0) * 0.95;
  col += vec3(1.0, 0.92, 0.80) * exp(-r * 17.0) * 0.34;
  col += vec3(1.0, 0.84, 0.62) * exp(-r * 6.0) * 0.22;

  // ---- sunbeams: not a star filter, only the soft radial structure of light through thin haze
  float ang = atan(sp.y, sp.x);
  float rays = fbm(vec2(ang * 8.0, 5.0), 3) * 0.65 + fbm(vec2(ang * 21.0, 11.0), 3) * 0.35;
  float beam = smoothstep(0.52, 0.86, rays) * smoothstep(0.03, 0.13, r) * (1.0 - smoothstep(0.28, 0.80, r));
  col += vec3(1.0, 0.93, 0.82) * beam * 0.10;

  // ---- the cloud sea's own light: the bright band the sun pours into the tops, well under the horizon
  float haze = 1.0 - smoothstep(0.02, 0.42, length((uv - uSun) * vec2(uAspect * 0.75, 1.0)));
  col = mix(col, vec3(1.0, 0.94, 0.86), haze * 0.10);
  float band = smoothstep(uHorizon - 0.18, uHorizon, uv.y) * (1.0 - smoothstep(uHorizon - 0.01, uHorizon + 0.06, uv.y));
  col = mix(col, vec3(1.0, 0.90, 0.74), band * 0.34 * (0.45 + 0.55 * haze));

  // the corners fall away a touch, as a long lens does
  vec2 lens = (uv - 0.5) * vec2(1.0, 1.15);
  col *= 1.0 - dot(lens, lens) * 0.18;

  // hold the colour through the film curve: the blue must stay blue and the gold must stay gold
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, 1.10);
  col = clamp(col, 0.0, 1.0);

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

export function Sky({ layout }: { layout: Layout }) {
  const gl = useThree((state) => state.gl)

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
      uSun: { value: new THREE.Vector2(0.47, 0.16) },
      uAspect: { value: 1.6 },
      uHorizon: { value: 0.37 },
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
        fragmentShader: DISPLAY_FRAG,
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
    uniforms.uAspect.value = layout.aspect
    uniforms.uSun.value.set(layout.sun.x, layout.sun.y)

    const previous = gl.getRenderTarget()
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(bake.scene, bake.camera)
    gl.setRenderTarget(previous)
  })

  return (
    <mesh frustumCulled={false} renderOrder={-100} material={display}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
