import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FluidTrail } from './fluidTrail'

/**
 * The post chain: scene → selective HDR bloom → the cursor trail's smear and silver fringe →
 * ACES filmic → the canvas.
 *
 * Selective, not global: the bright pass runs in linear light against a threshold of 1.0, and only
 * shaders that write above display white get there (the golden star's core, the god-ray shafts
 * through it, the water's sun glints). The sky, the meadow and the type sit under the threshold
 * and are untouched, so the bloom cannot wash the frame out — it can only halo what is genuinely
 * emissive.
 *
 * The trail is the surface-tension / Lusion field, ported 1:1 in `fluidTrail.ts`; here it is read
 * exactly as the reference reads it (a 9-tap smear along the paint velocity plus the phase-shifted
 * sine fringe in the fading wake).
 */

const QUAD_VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/** linear-light helpers (the scene is authored in display sRGB) */
export const SRGB_GLSL = /* glsl */ `
vec3 srgbToLinear(vec3 c) {
  c = max(c, 0.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
/* ACES filmic (Stephen Hill's fit of the RRT + ODT), the tone curve the whole frame lands on. */
const mat3 ACES_IN = mat3(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777
);
const mat3 ACES_OUT = mat3(
   1.60475, -0.10208, -0.00327,
  -0.53108,  1.10813, -0.07276,
  -0.07367, -0.00605,  1.07602
);
vec3 acesFilm(vec3 c) {
  c = ACES_IN * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  return clamp(ACES_OUT * (a / b), 0.0, 1.0);
}
`

const BRIGHT_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D tScene;
uniform vec2 uTexel;
uniform float uThreshold;
layout(location = 0) out vec4 fragColor;
${SRGB_GLSL}
void main() {
  // a 4-tap box keeps a 1-pixel emissive core from being missed by the downsample
  vec3 s = texture(tScene, vUv + vec2(-1.0, -1.0) * uTexel).rgb
         + texture(tScene, vUv + vec2( 1.0, -1.0) * uTexel).rgb
         + texture(tScene, vUv + vec2(-1.0,  1.0) * uTexel).rgb
         + texture(tScene, vUv + vec2( 1.0,  1.0) * uTexel).rgb;
  vec3 lin = srgbToLinear(s * 0.25);
  float lum = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  float knee = smoothstep(uThreshold * 0.72, uThreshold, lum);
  vec3 c = lin * knee;
  fragColor = vec4(c, 1.0);
}
`

const BLUR_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uDir;
layout(location = 0) out vec4 fragColor;
void main() {
  // 9-tap gaussian, weights sum to 1
  const float w0 = 0.2270270270;
  const float w1 = 0.1945945946;
  const float w2 = 0.1216216216;
  const float w3 = 0.0540540541;
  const float w4 = 0.0162162162;
  vec3 c = texture(tSrc, vUv).rgb * w0;
  c += (texture(tSrc, vUv + uDir * 1.0).rgb + texture(tSrc, vUv - uDir * 1.0).rgb) * w1;
  c += (texture(tSrc, vUv + uDir * 2.0).rgb + texture(tSrc, vUv - uDir * 2.0).rgb) * w2;
  c += (texture(tSrc, vUv + uDir * 3.0).rgb + texture(tSrc, vUv - uDir * 3.0).rgb) * w3;
  c += (texture(tSrc, vUv + uDir * 4.0).rgb + texture(tSrc, vUv - uDir * 4.0).rgb) * w4;
  fragColor = vec4(c, 1.0);
}
`

const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tTrail;
uniform vec2 uTrailTexel;
uniform float uBloom;
uniform float uExposure;
uniform float uTrailAmount;
uniform float uTrailMultiplier;
uniform float uTrailColorMultiplier;
uniform float uTrailShade;
uniform float uTrailRGBShift;
uniform float uTime;
layout(location = 0) out vec4 fragColor;
${SRGB_GLSL}

float bnoise(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

/* the reference's smooth (C1) in-texel reconstruction: one tap, no extra reads */
vec4 paint(vec2 uv) {
  vec2 sz = 1.0 / uTrailTexel, p = uv * sz + 0.5, i = floor(p), f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  return texture(tTrail, (i + f - 0.5) * uTrailTexel);
}

void main() {
  vec3 scene = texture(tScene, vUv).rgb;
  vec2 bn = vec2(bnoise(gl_FragCoord.xy), bnoise(gl_FragCoord.xy + 17.3));

  vec4 data = paint(vUv);
  float weight = (data.z + data.w) * 0.5;
  if (weight > 0.002) {
    vec2 vel = (0.5 - data.xy - 0.001) * 2.0 * weight;
    vec2 stepUv = vel * uTrailAmount / 4.0 * uTrailTexel * uTrailMultiplier;
    vec2 p = vUv + bn * stepUv;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 9; i++) {
      vec3 s = texture(tScene, p).rgb;
      acc += min(s, vec3(1.0));
      p += stepUv;
    }
    acc /= 9.0;
    scene = acc;
    // the wake fringe: strongest where the weight is low, gone above 0.4
    scene += sin(vec3(vel.x + vel.y) * 40.0 + vec3(0.0, 2.0, 4.0) * uTrailRGBShift)
           * smoothstep(0.4, -0.9, weight) * uTrailShade * max(abs(vel.x), abs(vel.y)) * uTrailColorMultiplier * 0.1;
  }

  vec3 lin = srgbToLinear(scene);
  lin += texture(tBloom, vUv).rgb * uBloom;
  vec3 mapped = acesFilm(lin * uExposure);
  vec3 outCol = linearToSrgb(mapped);
  // 1/255 dither where the frame is quantised
  outCol += (bnoise(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
  fragColor = vec4(outCol, 1.0);
}
`

export type PostFXProps = {
  /** bloom strength; 0 disables the bloom chain entirely (low tier) */
  bloom?: number
  exposure?: number
}

/** The live cursor-trail field, so any layer or the app's pointer listeners can paint it. */
export const trailRef: { current: FluidTrail | null } = { current: null }

export function PostFX({ bloom = 0.45, exposure = 1.06 }: PostFXProps) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const enabled = gl.capabilities.isWebGL2

  const trail = useMemo(() => {
    const instance = new FluidTrail(gl)
    trailRef.current = instance
    return instance
  }, [gl])

  useEffect(() => {
    return () => {
      trail.dispose()
      if (trailRef.current === trail) trailRef.current = null
    }
  }, [trail])

  const chain = useMemo(() => {
    const float = enabled ? !!gl.getContext().getExtension('EXT_color_buffer_float') || !!gl.getContext().getExtension('EXT_color_buffer_half_float') : false
    const type = float ? THREE.HalfFloatType : THREE.UnsignedByteType
    const sceneRT = new THREE.WebGLRenderTarget(1, 1, {
      type,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    })
    const bright = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter })
    const blurA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter })
    const blurB = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter })

    const brightMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: QUAD_VERT,
      fragmentShader: BRIGHT_FRAG,
      uniforms: { tScene: { value: sceneRT.texture }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.0 } },
      depthTest: false,
      depthWrite: false,
    })
    const blurMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    })
    const compositeMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tScene: { value: sceneRT.texture },
        tBloom: { value: blurA.texture },
        tTrail: { value: trail.texture },
        uTrailTexel: { value: new THREE.Vector2(1 / 256, 1 / 256) },
        uBloom: { value: bloom },
        uExposure: { value: exposure },
        uTrailAmount: { value: 3 },
        uTrailMultiplier: { value: 5 },
        uTrailColorMultiplier: { value: 10 },
        uTrailShade: { value: 1.25 },
        uTrailRGBShift: { value: 0.5 },
        uTime: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    })
    const quadScene = new THREE.Scene()
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMat)
    quad.frustumCulled = false
    quadScene.add(quad)
    return { sceneRT, bright, blurA, blurB, brightMat, blurMat, compositeMat, quadScene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), type }
  }, [gl, enabled, trail, bloom, exposure])

  const sizeRef = useRef('')

  useEffect(() => {
    return () => {
      chain.sceneRT.dispose()
      chain.bright.dispose()
      chain.blurA.dispose()
      chain.blurB.dispose()
      chain.brightMat.dispose()
      chain.blurMat.dispose()
      chain.compositeMat.dispose()
    }
  }, [chain])

  useFrame((state, delta) => {
    const width = gl.domElement.width
    const height = gl.domElement.height
    if (!width || !height) return
    const key = `${width}x${height}`
    if (key !== sizeRef.current) {
      sizeRef.current = key
      const bw = Math.max(1, width >> 2)
      const bh = Math.max(1, height >> 2)
      chain.sceneRT.setSize(width, height)
      chain.bright.setSize(bw, bh)
      chain.blurA.setSize(bw, bh)
      chain.blurB.setSize(bw, bh)
      chain.brightMat.uniforms.uTexel.value.set(1 / width, 1 / height)
    }
    // the trail is a screen-space field at the CSS viewport's size
    trail.resize(size.width, size.height)
    trail.update(Math.min(delta, 1 / 20))

    if (!enabled) {
      gl.setRenderTarget(null)
      gl.render(scene, camera)
      return
    }

    const prevTarget = gl.getRenderTarget()
    gl.setRenderTarget(chain.sceneRT)
    gl.clear()
    gl.render(scene, camera)

    if (bloom > 0) {
      chain.brightMat.uniforms.tScene.value = chain.sceneRT.texture
      chain.brightMat.uniforms.uThreshold.value = 1.0
      render(chain.brightMat, chain.bright)
      // two separable gaussian passes at quarter res, twice: a wide, soft halo
      for (let i = 0; i < 2; i++) {
        const r = 1.0 + i * 1.7
        chain.blurMat.uniforms.tSrc.value = i === 0 ? chain.bright.texture : chain.blurA.texture
        chain.blurMat.uniforms.uDir.value.set(r / chain.bright.width, 0)
        render(chain.blurMat, chain.blurB)
        chain.blurMat.uniforms.tSrc.value = chain.blurB.texture
        chain.blurMat.uniforms.uDir.value.set(0, r / chain.bright.height)
        render(chain.blurMat, chain.blurA)
      }
    }

    chain.compositeMat.uniforms.tTrail.value = trail.texture
    chain.compositeMat.uniforms.uBloom.value = bloom
    chain.compositeMat.uniforms.uExposure.value = exposure
    chain.compositeMat.uniforms.uTime.value = state.clock.elapsedTime
    chain.compositeMat.uniforms.uTrailTexel.value.copy(trail.texelSize)
    gl.setRenderTarget(null)
    gl.render(chain.quadScene, chain.camera)
    gl.setRenderTarget(prevTarget ?? null)
  }, 1)

  function render(material: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget) {
    const quad = chain.quadScene.children[0] as THREE.Mesh
    const previous = quad.material
    quad.material = material
    gl.setRenderTarget(to)
    gl.render(chain.quadScene, chain.camera)
    quad.material = previous
  }

  return null
}
