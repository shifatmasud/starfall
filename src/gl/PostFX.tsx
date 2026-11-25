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

/**
 * The fluid trail's refraction (surface-tension's ScreenPaintDistortion slot, order 75).
 *
 * The field is a liquid surface over the finished frame: where it is at rest nothing is touched, and
 * where the brush has passed the surface tilts, so the whole picture behind it — stars, Earth, the
 * orb, the rocks — bends through it. The tilt is read from the field's own gradient: the frame is
 * displaced along the slope, each channel by a slightly different amount, so the wake carries a crisp
 * chromatic fringe on its edge; the brush velocity drags the image a touch further, the crest catches
 * a thin silver highlight, and the frame outside the wake is returned exactly as it arrived.
 */
const DistortShader = /* glsl */ `
uniform sampler2D tTrail;
uniform vec2 uTrailTexel;
uniform vec2 uBead;
uniform float uAspect;
uniform float uZoom;
uniform float uTrailAmount;
uniform float uTrailShade;
uniform float uTrailRGBShift;
${SRGB_GLSL}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 bn = vec2(bnoise(gl_FragCoord.xy + 17.0), bnoise(gl_FragCoord.xy + 29.0));

  // the field arrives pre-reconstructed at 2x: one plain tap, plus the reference's blue-noise dither
  vec4 data = texture(tTrail, uv);
  data += (vec4(bn.yx, bn.xy) - 0.5) * (1.0 / 255.0);
  float weight = (data.z + data.w) * 0.5;

  if (weight < 0.0025) {
    // nothing painted here: the frame is untouched, to the pixel
    outputColor = vec4(inputColor.rgb, inputColor.a);
    return;
  }

  // the surface's tilt under this pixel: the weight field's slope, in field texels
  vec2 tx = uTrailTexel * 2.0;
  float wl = texture(tTrail, uv - vec2(tx.x, 0.0)).z;
  float wr = texture(tTrail, uv + vec2(tx.x, 0.0)).z;
  float wd = texture(tTrail, uv - vec2(0.0, tx.y)).z;
  float wu = texture(tTrail, uv + vec2(0.0, tx.y)).z;
  vec2 slope = vec2(wr - wl, wu - wd);
  float tilt = length(slope);

  // the bead: the liquid under the finger is a lens, so the picture inside the wake magnifies and
  // slides toward it, strongest where the paint is thickest
  vec2 toBead = (uv - uBead) * vec2(uAspect, 1.0);
  float beadR = length(toBead);
  float bead = weight * smoothstep(0.13, 0.02, beadR);

  // the lens: magnify inside the bead and bend the frame down the slope at its edge, scaled by the
  // weight so the image matches the liquid it crosses
  vec2 off = -toBead * bead * uZoom - slope * uTrailAmount * weight;
  // the bead's own lens is a gentle swell; the refraction lives on the wake's edges
  // a short, liquid bend rather than a tear
  float ol = length(off);
  if (ol > 0.008) off *= 0.008 / ol;
  float edge = smoothstep(0.006, 0.10, tilt);
  float dispersion = uTrailRGBShift * (0.02 + 0.95 * edge);

  vec3 col;
  col.r = texture(inputBuffer, uv + off * (1.0 + dispersion)).r;
  col.g = texture(inputBuffer, uv + off).g;
  col.b = texture(inputBuffer, uv + off * (1.0 - dispersion)).b;

  // liquid glass: a thin silver crest where the surface is steepest, a cool sheen inside the bead,
  // and the faint pastel fringe the reference's wake carries where the film is thinnest
  float crest = smoothstep(0.004, 0.07, tilt) * weight;
  col += vec3(0.74, 0.84, 1.0) * crest * 0.16 * uTrailShade;
  col += vec3(0.60, 0.74, 1.0) * bead * 0.055 * uTrailShade;
  col += vec3(0.86, 0.90, 1.0) * weight * 0.015 * uTrailShade;
  float film = weight * 1.4 + (data.x - data.y) * 0.9 + slope.x * 3.0;
  vec3 iridescence = 0.5 + 0.5 * cos(6.28318 * (film + vec3(0.0, 0.33, 0.67)));
  float thinFilm = smoothstep(0.03, 0.12, weight) * (1.0 - smoothstep(0.32, 0.66, weight));
  col += (iridescence - 0.5) * thinFilm * 0.02 * uTrailShade;

  outputColor = vec4(clamp(col, 0.0, 1.0), inputColor.a);
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
        ['uBead', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))],
        ['uAspect', new THREE.Uniform(1.6)],
        ['uZoom', new THREE.Uniform(0.22)],
        ['uTrailAmount', new THREE.Uniform(0.18)],
        ['uTrailShade', new THREE.Uniform(1.0)],
        ['uTrailRGBShift', new THREE.Uniform(0.30)],
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

/** the last point of contact, in CSS pixels: the centre of the liquid bead */
const bead = { x: 0.5, y: 0.5 }

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
  // because a pointer stream stops the moment the page starts a native scroll. A stroke opens on
  // down and closes on up/leave, so the next contact snaps to the live finger instead of dragging
  // a line back from where the last one ended.
  useEffect(() => {
    const feed = (x: number, y: number) => {
      bead.x = x
      bead.y = y
      trail.pointer(x, y)
    }
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      feed(event.clientX, event.clientY)
    }
    const onPointerEnd = () => {
      trail.release()
    }
    const onTouch = (event: TouchEvent) => {
      const touch = event.changedTouches[0] || event.touches[0]
      if (touch) feed(touch.clientX, touch.clientY)
    }
    const onTouchStart = (event: TouchEvent) => {
      onTouch(event)
    }
    const onTouchEnd = () => {
      trail.release()
    }
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('pointerdown', onPointer, { passive: true })
    window.addEventListener('pointerup', onPointerEnd)
    window.addEventListener('pointercancel', onPointerEnd)
    window.addEventListener('pointerleave', onPointerEnd)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouch, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)
    window.addEventListener('blur', onPointerEnd)
    return () => {
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('pointerup', onPointerEnd)
      window.removeEventListener('pointercancel', onPointerEnd)
      window.removeEventListener('pointerleave', onPointerEnd)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouch)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      window.removeEventListener('blur', onPointerEnd)
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
    ;(d.get('uBead')!.value as THREE.Vector2).set(bead.x / size.width, 1 - bead.y / size.height)
    d.get('uAspect')!.value = size.width / Math.max(1, size.height)
    const t = composer.final.uniforms.get('uTime')
    if (t) t.value = state.clock.elapsedTime
    composer.comp.render(delta)
  }, 1)

  return null
}
