import * as THREE from 'three'
import type { RGB } from '../../physics/optics'

/**
 * Subsurface scattering for scanned materials: the sun's light that passes *through* a thin or translucent
 * body and leaves toward the viewer (leaves, thin ice).
 *
 * The transmitted radiance is T(λ)·E·(back-lit wrap + forward lobe), where T is a measured spectral
 * transmittance (optics.ts: LEAF_TRANSMITTANCE from Gates 1965 / PROSPECT; ice from Warren & Brandt 2008
 * absorption through the body thickness by Beer–Lambert). Added to the direct diffuse light of the
 * first directional light (the scene's sun).
 */
export type SSS = { color: RGB; strength: number; power?: number; distortion?: number }

export function applySSS(mat: THREE.Material, sss: SSS) {
  const m = mat as THREE.MeshStandardMaterial
  const key = `sss-${sss.color.join(',')}-${sss.strength}-${sss.power ?? 3}-${sss.distortion ?? 0.3}`
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSssCol = { value: new THREE.Vector3(...sss.color) }
    shader.uniforms.uSssStr = { value: sss.strength }
    shader.uniforms.uSssPow = { value: sss.power ?? 3 }
    shader.uniforms.uSssDist = { value: sss.distortion ?? 0.3 }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSssCol; uniform float uSssStr; uniform float uSssPow; uniform float uSssDist;')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
{
  vec3 Ls = directionalLights[0].direction;
  vec3 Ns = geometryNormal;
  float back = saturate(dot(-Ns, Ls));
  float fwd = pow(saturate(dot(geometryViewDir, -(Ls + Ns * uSssDist))), uSssPow);
  reflectedLight.directDiffuse += uSssCol * directionalLights[0].color * uSssStr * (0.55 * back + fwd) * (0.4 + 0.6 * diffuseColor.rgb);
}
#endif`,
      )
  }
  m.customProgramCacheKey = () => key
  m.needsUpdate = true
}
