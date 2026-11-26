import * as THREE from 'three'

/**
 * The cloud puff's material: drei's MeshLambertMaterial with light that goes *through* the cloud.
 *
 * drei's <Clouds> subclasses the material it is given and sets its own `onBeforeCompile` (the
 * per-puff opacity). This class keeps that and runs after it, adding to the fragment:
 *
 *   subsurface scattering  sunlight passes through thin cloud and comes out the far side: the thinner
 *                          the puff at a pixel (its own alpha) and the closer that pixel lies to the
 *                          sun on screen, the more warm light it carries. A forward-scattering lobe,
 *                          so edges toward the sun glow — the silver lining of panel 2.
 *   powder                 thick cores stay a touch darker and cooler than thin wisps, so a billow
 *                          reads as volume, not as a flat cut-out
 *   soft edges             the puff's alpha is eased so its fringe dissolves into the next puff and
 *                          into the sky with no rim
 *
 * Billboards always face the camera, so everything is done in screen space against the sun's place
 * in the frame (`uSun`, 0..1, y down, as the sky uses).
 */
export type CloudLight = {
  sun: THREE.Vector2
  sunColor: THREE.Color
  /** overall strength of the light through the cloud */
  sss: number
  /** how far from the sun the glow reaches, in frame heights */
  reach: number
  /** how much the fringe is feathered (0 = drei's own edge) */
  soft: number
}

export function cloudLightMaterial(light: CloudLight) {
  const uniforms = {
    uSun: { value: light.sun },
    uSunColor: { value: light.sunColor },
    uSss: { value: light.sss },
    uReach: { value: light.reach },
    uSoft: { value: light.soft },
    uRes: { value: new THREE.Vector2(1, 1) },
  }

  class CloudLightMaterial extends THREE.MeshLambertMaterial {
    static uniforms = uniforms
    private _inner: ((shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void) | null = null

    constructor() {
      super()
      // drei assigns its own onBeforeCompile after this constructor; keep it and run ours after
      Object.defineProperty(this, 'onBeforeCompile', {
        configurable: true,
        get: () => (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => {
          this._inner?.(shader, renderer)
          Object.assign(shader.uniforms, uniforms)
          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <common>',
              `#include <common>
uniform vec2 uSun;
uniform vec3 uSunColor;
uniform float uSss;
uniform float uReach;
uniform float uSoft;
uniform vec2 uRes;`,
            )
            .replace(
              'gl_FragColor = vec4(outgoingLight, diffuseColor.a * vOpacity);',
              `{
  float a = diffuseColor.a;
  // where this pixel is against the sun, in frame heights
  vec2 sp = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
  vec2 d = (sp - uSun) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(d);
  // forward scattering: a tight lobe at the sun and a broad one across the sea
  float lobe = exp(-r / (uReach * 0.25)) + 0.45 * exp(-r / uReach);
  // thin cloud passes light; thick cores hold it
  float thin = 1.0 - smoothstep(0.05, 0.85, a);
  vec3 col = outgoingLight;
  // powder: cores a little deeper and cooler than wisps
  col *= mix(vec3(0.94, 0.95, 1.0), vec3(1.0), thin * 0.8 + 0.2);
  // the light through the cloud, warm, strongest at the sunward fringe
  vec3 glow = uSunColor * uSss * lobe * (0.25 + 1.6 * thin);
  // shaded tones take the transmitted light too, so shadow edges glow rather than cut
  col += glow * mix(vec3(1.0), col, 0.35);
  // soft fringe: ease the alpha so puffs melt into each other and the sky
  float alpha = pow(a, 1.0 + uSoft) * (1.0 - uSoft * 0.15);
  gl_FragColor = vec4(col, alpha * vOpacity);
}`,
            )
        },
        set: (fn) => {
          this._inner = fn
        },
      })
    }

    customProgramCacheKey() {
      return 'cloud-light-' + this.uuid
    }
  }

  return { Material: CloudLightMaterial, uniforms }
}
