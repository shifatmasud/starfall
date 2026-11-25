import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import {
  BlendFunction,
  BloomEffect,
  DepthOfFieldEffect,
  Effect,
  EffectComposer,
  EffectPass,
  RenderPass,
} from 'postprocessing'
import { FluidTrail } from './fluidTrail'

/**
 * The post chain, built on `postprocessing` rather than hand-rolled passes.
 *
 * Order is the photographic order, which is the whole point of this file:
 *   1. depth of field  (the library's DepthOfFieldEffect: a real circle of confusion from the
 *      depth buffer, so near ground and far trunks go soft while the pearl's band stays sharp)
 *   2. threshold bloom (only what is genuinely above display white haloes: the pearl's core, sun
 *      through leaves, water glints)
 *   3. the pointer trail's smear and fringe, then the grade and lens vignette
 *
 * The trail stays because it is the site's own interaction, ported as an Effect so it runs inside
 * the library's pass rather than beside it.
 */

/** linear-light helpers plus the ACES filmic curve the whole frame lands on */
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

/** the trail's smear and silver fringe, then grade, all in one effect at the end of the chain */
const TrailGradeShader = /* glsl */ `
uniform sampler2D tTrail;
uniform vec2 uTrailTexel;
uniform float uExposure;
uniform float uTrailAmount;
uniform float uTrailMultiplier;
uniform float uTrailColorMultiplier;
uniform float uTrailShade;
uniform float uTrailRGBShift;
uniform float uTime;
uniform float uGrade;
${SRGB_GLSL}

vec4 paint(vec2 uv) {
  vec2 sz = 1.0 / uTrailTexel, p = uv * sz + 0.5, i = floor(p), f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  return texture(tTrail, (i + f - 0.5) * uTrailTexel);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 scene = inputColor.rgb;
  vec2 bn = vec2(bnoise(gl_FragCoord.xy), bnoise(gl_FragCoord.xy + 17.3));

  vec4 data = paint(uv);
  float weight = (data.z + data.w) * 0.5;
  if (weight > 0.002) {
    vec2 vel = (0.5 - data.xy - 0.001) * 2.0 * weight;
    vec2 stepUv = vel * uTrailAmount / 4.0 * uTrailTexel * uTrailMultiplier;
    vec2 p = uv + bn * stepUv;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 9; i++) {
      acc += min(texture(inputBuffer, p).rgb, vec3(1.0));
      p += stepUv;
    }
    acc /= 9.0;
    scene = acc;
    scene += sin(vec3(vel.x + vel.y) * 40.0 + vec3(0.0, 2.0, 4.0) * uTrailRGBShift)
           * smoothstep(0.4, -0.9, weight) * uTrailShade * max(abs(vel.x), abs(vel.y)) * uTrailColorMultiplier * 0.1;
  }

  vec3 lin = srgbToLinear(scene);
  vec3 mapped = acesFilm(lin * uExposure);
  vec3 outCol = linearToSrgb(mapped);

  // grade: split tone (cool shade, warm light), a little contrast, and a lens vignette
  float lum = dot(outCol, vec3(0.2126, 0.7152, 0.0722));
  outCol = mix(vec3(lum), outCol, mix(1.0, 1.18, uGrade));
  outCol = (outCol - 0.5) * mix(1.0, 1.1, uGrade) + 0.5;
  outCol += vec3(-0.018, -0.004, 0.03) * (1.0 - smoothstep(0.05, 0.55, lum)) * uGrade;
  outCol += vec3(0.028, 0.015, -0.022) * smoothstep(0.45, 1.0, lum) * uGrade;
  vec2 lens = uv - 0.5;
  outCol *= 1.0 - dot(lens, lens) * mix(0.0, 0.55, uGrade);
  outCol = clamp(outCol, 0.0, 1.0);
  outCol += (bnoise(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
  outputColor = vec4(outCol, inputColor.a);
}
`

class TrailGradeEffect extends Effect {
  constructor(trail: THREE.Texture, texel: THREE.Vector2, exposure: number) {
    super('TrailGradeEffect', TrailGradeShader, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, THREE.Uniform>([
        ['tTrail', new THREE.Uniform(trail)],
        ['uTrailTexel', new THREE.Uniform(texel.clone())],
        ['uExposure', new THREE.Uniform(exposure)],
        ['uTrailAmount', new THREE.Uniform(3)],
        ['uTrailMultiplier', new THREE.Uniform(5)],
        ['uTrailColorMultiplier', new THREE.Uniform(10)],
        ['uTrailShade', new THREE.Uniform(1.25)],
        ['uTrailRGBShift', new THREE.Uniform(0.5)],
        ['uTime', new THREE.Uniform(0)],
        ['uGrade', new THREE.Uniform(1)],
      ]),
    })
  }
}

export type PostFXProps = {
  /** bloom strength; 0 disables bloom (low tier) */
  bloom?: number
  exposure?: number
  /** where the lens is focused, in world units from the camera; 0 focuses on the frame's centre ray */
  focusDistance?: number
}

/** The live cursor-trail field, so any layer or the app's pointer listeners can paint it. */
export const trailRef: { current: FluidTrail | null } = { current: null }

export function PostFX({ bloom = 0.45, exposure = 1.24, focusDistance = 0 }: PostFXProps) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera as THREE.PerspectiveCamera)
  const size = useThree((state) => state.size)

  // the trail field is the same ported one; only its consumer changed
  const trail = useMemo(() => new FluidTrail(gl), [gl])
  useEffect(() => {
    trailRef.current = trail
    return () => {
      trail.dispose()
      if (trailRef.current === trail) trailRef.current = null
    }
  }, [trail])

  const composer = useMemo(() => {
    const float = !!gl.getContext().getExtension('EXT_color_buffer_half_float')
    const comp = new EffectComposer(gl, {
      frameBufferType: float ? THREE.HalfFloatType : THREE.UnsignedByteType,
      multisampling: 0,
    })
    comp.addPass(new RenderPass(scene, camera))

    const dof = new DepthOfFieldEffect(camera, {
      focusDistance: 0.02,
      focalLength: 0.035,
      bokehScale: 1.15,
      resolutionScale: 1.0,
    })
    dof.blendMode.opacity.value = 1

    const bloomEffect = new BloomEffect({
      blendFunction: BlendFunction.ADD,
      luminanceThreshold: 0.97,
      luminanceSmoothing: 0.18,
      intensity: 0,
      mipmapBlur: true,
      radius: 0.72,
    })

    const trailGrade = new TrailGradeEffect(trail.texture, trail.texelSize, exposure)

    comp.addPass(new EffectPass(camera, dof, bloomEffect, trailGrade))
    return { comp, dof, bloomEffect, trailGrade }
  }, [gl, scene, camera, trail, exposure])

  useEffect(() => {
    return () => composer.comp.dispose()
  }, [composer])

  useEffect(() => {
    composer.bloomEffect.intensity = bloom
    const u = composer.trailGrade.uniforms.get('uExposure')
    if (u) u.value = exposure
  }, [composer, bloom, exposure])

  useEffect(() => {
    composer.comp.setSize(size.width, size.height)
  }, [composer, size.width, size.height])

  useFrame((state, delta) => {
    trail.resize(size.width, size.height)
    trail.update(Math.min(delta, 1 / 20))

    // focus rides the camera's own forward axis: whatever the composer puts in the middle band is
    // what is sharp, which is how the reference is focused
    const far = camera.far || 1000
    const dist = focusDistance > 0 ? focusDistance : 38
    const coc = composer.dof.circleOfConfusionMaterial as unknown as { uniforms: Record<string, THREE.Uniform> }
    const focus = coc.uniforms.focusDistance
    if (focus) focus.value = THREE.MathUtils.clamp(dist / far, 0, 1)

    const t = composer.trailGrade.uniforms
    t.get('tTrail')!.value = trail.texture
    ;(t.get('uTrailTexel')!.value as THREE.Vector2).copy(trail.texelSize)
    t.get('uTime')!.value = state.clock.elapsedTime

    composer.comp.render(delta)
  }, 1)

  return null
}
