import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import {
  BlendFunction,
  BloomEffect,
  Effect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
} from 'postprocessing'
import { FluidTrail } from './fluidTrail'

/**
 * The post chain, in Lusion's order (handbook ch.8): Bloom (10) → Final grade / ACES (30) →
 * ScreenPaint distortion (75) → SMAA (500).
 *
 *   1. the scene is drawn into a half-float buffer
 *   2. bloom, thresholded at display white, so only the star's core, the orb's crest and the
 *      atmosphere's edge halo
 *   3. the final grade: exposure, ACES filmic, split tone, a lens vignette, a 1/255 dither — this is
 *      the frame that leaves the renderer, display-encoded
 *   4. the pointer trail's distortion (surface-tension's ScreenPaintDistortion, ported as an Effect):
 *      the 8-bit field is blue-noise dithered, the frame is smeared along the paint velocity in nine
 *      jittered taps, and the wake carries the reference's phase-shifted sine fringe
 *   5. SMAA on the finished image
 *
 * The simulation itself (brush, curl, push, blur pyramid, 2× display field) lives in `fluidTrail.ts`.
 */

const SRGB_GLSL = /* glsl */ `
vec3 srgbToLinear(vec3 c) {
  c = max(c, 0.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
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
float bnoise(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
`

/** Lusion's Final pass: exposure, ACES, grade, vignette, dither. */
const FinalShader = /* glsl */ `
uniform float uExposure;
uniform float uGrade;
uniform float uTime;
${SRGB_GLSL}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 lin = srgbToLinear(inputColor.rgb);
  vec3 mapped = acesFilm(lin * uExposure);
  vec3 col = linearToSrgb(mapped);

  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, mix(1.0, 1.10, uGrade));
  col = (col - 0.5) * mix(1.0, 1.06, uGrade) + 0.5;
  col += vec3(-0.012, -0.003, 0.020) * (1.0 - smoothstep(0.05, 0.55, lum)) * uGrade;
  col += vec3(0.018, 0.010, -0.014) * smoothstep(0.45, 1.0, lum) * uGrade;

  vec2 lens = uv - 0.5;
  col *= 1.0 - dot(lens, lens) * mix(0.0, 0.42, uGrade);

  col = clamp(col, 0.0, 1.0);
  col += (bnoise(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
  outputColor = vec4(col, inputColor.a);
}
`

/** SurfacePaintDistortion: the smear and the wake fringe, on the display-encoded frame. */
const DistortShader = /* glsl */ `
uniform sampler2D tTrail;
uniform vec2 uTrailTexel;
uniform float uTrailAmount;
uniform float uTrailMultiplier;
uniform float uTrailColorMultiplier;
uniform float uTrailShade;
uniform float uTrailRGBShift;
${SRGB_GLSL}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 bn = vec2(bnoise(gl_FragCoord.xy + 17.0), bnoise(gl_FragCoord.xy + 29.0));

  // the field arrives pre-reconstructed at 2×: one plain tap, plus the reference's blue-noise dither
  vec4 data = texture(tTrail, uv);
  data += (vec4(bn.yx, bn.xy) - 0.5) * (1.0 / 255.0);
  float weight = (data.z + data.w) * 0.5;

  if (weight < 0.002) {
    // nothing painted here: the untouched frame, and its alpha marks it as untouched
    outputColor = vec4(clamp(inputColor.rgb, 0.0, 1.0), inputColor.a);
    return;
  }

  vec2 vel = (0.5 - data.xy - 0.001) * 2.0 * weight;
  vec2 stepUv = vel * uTrailAmount / 4.0 * uTrailTexel * uTrailMultiplier;
  vec2 p = uv + bn * stepUv;                       // jittered first tap kills banding
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 9; i++) {
    acc += min(texture(inputBuffer, p).rgb, vec3(1.0));
    p += stepUv;
  }
  acc /= 9.0;

  // the wake fringe: strongest where the paint is thin, gone above 0.4
  acc += sin(vec3(vel.x + vel.y) * 40.0 + vec3(0.0, 2.0, 4.0) * uTrailRGBShift)
       * (1.0 - smoothstep(-0.9, 0.4, weight))
       * uTrailShade * max(abs(vel.x), abs(vel.y)) * uTrailColorMultiplier;

  outputColor = vec4(clamp(acc, 0.0, 1.0), inputColor.a * 0.997);
}
`

class FinalEffect extends Effect {
  constructor(exposure: number) {
    super('FinalEffect', FinalShader, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, THREE.Uniform>([
        ['uExposure', new THREE.Uniform(exposure)],
        ['uGrade', new THREE.Uniform(0.35)],
        ['uTime', new THREE.Uniform(0)],
      ]),
    })
  }
}

class DistortEffect extends Effect {
  constructor(trail: THREE.Texture, texel: THREE.Vector2) {
    super('DistortEffect', DistortShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['tTrail', new THREE.Uniform(trail)],
        ['uTrailTexel', new THREE.Uniform(texel.clone())],
        ['uTrailAmount', new THREE.Uniform(3)],
        ['uTrailMultiplier', new THREE.Uniform(5)],
        ['uTrailColorMultiplier', new THREE.Uniform(10)],
        ['uTrailShade', new THREE.Uniform(1.25)],
        ['uTrailRGBShift', new THREE.Uniform(0.5)],
      ]),
    })
  }
}

export type PostFXProps = {
  bloom?: number
  exposure?: number
}

/** The live cursor-trail field, so the app's pointer listeners can paint it. */
export const trailRef: { current: FluidTrail | null } = { current: null }

export function PostFX({ bloom = 0.62, exposure = 1.06 }: PostFXProps) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera as THREE.PerspectiveCamera)
  const size = useThree((state) => state.size)

  const trail = useMemo(() => new FluidTrail(gl), [gl])
  useEffect(() => {
    trailRef.current = trail
    return () => {
      trail.dispose()
      if (trailRef.current === trail) trailRef.current = null
    }
  }, [trail])

  // The brush. Pointer events cover mouse and pen; the finger is read from touch events as well,
  // because a pointer stream stops the moment the page starts a native scroll.
  useEffect(() => {
    const feed = (x: number, y: number) => trail.pointer(x, y)
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      feed(event.clientX, event.clientY)
    }
    const onTouch = (event: TouchEvent) => {
      const touch = event.changedTouches[0] || event.touches[0]
      if (touch) feed(touch.clientX, touch.clientY)
    }
    const leave = () => trail.release()
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('touchstart', onTouch, { passive: true })
    window.addEventListener('touchmove', onTouch, { passive: true })
    window.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('touchstart', onTouch)
      window.removeEventListener('touchmove', onTouch)
      window.removeEventListener('pointerleave', leave)
    }
  }, [trail])

  const composer = useMemo(() => {
    const float = !!gl.getContext().getExtension('EXT_color_buffer_half_float')
    const comp = new EffectComposer(gl, {
      frameBufferType: float ? THREE.HalfFloatType : THREE.UnsignedByteType,
      multisampling: 0,
    })
    comp.addPass(new RenderPass(scene, camera))

    const bloomEffect = new BloomEffect({
      blendFunction: BlendFunction.ADD,
      luminanceThreshold: 0.98,
      luminanceSmoothing: 0.12,
      intensity: 0,
      mipmapBlur: true,
      radius: 0.78,
    })
    const final = new FinalEffect(exposure)
    const distort = new DistortEffect(trail.texture, trail.texelSize)
    const smaa = new SMAAEffect()

    comp.addPass(new EffectPass(camera, bloomEffect))
    comp.addPass(new EffectPass(camera, final))
    comp.addPass(new EffectPass(camera, distort))
    comp.addPass(new EffectPass(camera, smaa))
    return { comp, bloomEffect, final, distort }
  }, [gl, scene, camera, trail, exposure])

  useEffect(() => () => composer.comp.dispose(), [composer])

  useEffect(() => {
    composer.bloomEffect.intensity = bloom
    const u = composer.final.uniforms.get('uExposure')
    if (u) u.value = exposure
  }, [composer, bloom, exposure])

  useEffect(() => {
    composer.comp.setSize(size.width, size.height)
  }, [composer, size.width, size.height])

  useFrame((state, delta) => {
    trail.resize(size.width, size.height)
    trail.update(Math.min(delta, 1 / 20))
    const d = composer.distort.uniforms
    d.get('tTrail')!.value = trail.texture
    ;(d.get('uTrailTexel')!.value as THREE.Vector2).copy(trail.texelSize)
    const t = composer.final.uniforms.get('uTime')
    if (t) t.value = state.clock.elapsedTime
    composer.comp.render(delta)
  }, 1)

  return null
}
