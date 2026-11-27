import * as THREE from 'three'

/**
 * The painterly material factory — one response model for every surface in the garden scenes.
 *
 * Every prop, terrain sheet and seabed in scenes 3–8 is routed through here, so a clay dune, a
 * greybox ruin, a scanned boulder and a branching coral share one way of catching light:
 *
 *   • a roughness floor and ceiling (0.65–0.95): no soap-bubble specular, no dead matte either
 *   • world-space triplanar brushwork: a value-noise stroke that breaks the flat albedo into paint,
 *     plus a macro-value octave that groups the strokes into patches the way a painter blocks a
 *     foreground, injected into albedo and (one cheap octave) into the shading normal
 *   • a wrapped diffuse term with a coloured rim and a back-lit bleed, so the terminator is soft
 *   • optional scrolling Voronoi caustics projected in world XZ (the underwater panels), added as
 *     light on the surfaces that face the surface, never as a texture pasted on the floor
 *
 * All terms are fragment-only: zero extra draw calls, zero extra triangles.
 */

/** the shared clock every painted material reads, advanced once per frame by PaintClock */
export const paintClock = { value: 0 }

const COMMON_GLSL = /* glsl */ `
  varying vec3 vPaintWorldNormal;
  varying vec3 vPaintWorldPos;
  uniform float uPainterlySoft;
  uniform vec3 uPainterlyRim;
  uniform vec3 uPainterlyShadow;
  uniform vec3 uPainterlySun;
  uniform float uPainterlyRipple;
  uniform float uPaintBrush;
  uniform float uPaintCaustics;
  uniform float uPaintCausticScale;
  uniform float uPaintTime;
  uniform vec2 uPaintRough;

  float pMod289(float x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  float pHash(vec3 p){
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float pNoise(vec3 x){
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = pHash(i);
    float n100 = pHash(i + vec3(1.0, 0.0, 0.0));
    float n010 = pHash(i + vec3(0.0, 1.0, 0.0));
    float n110 = pHash(i + vec3(1.0, 1.0, 0.0));
    float n001 = pHash(i + vec3(0.0, 0.0, 1.0));
    float n101 = pHash(i + vec3(1.0, 0.0, 1.0));
    float n011 = pHash(i + vec3(0.0, 1.0, 1.0));
    float n111 = pHash(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z);
  }
  float pFbm(vec3 p){
    return pNoise(p) * 0.58 + pNoise(p * 2.07 + 11.3) * 0.29 + pNoise(p * 4.13 + 3.7) * 0.13;
  }
  vec2 pHash2(vec2 p){
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  // two scrolling Voronoi layers, domain-warped twice: the net bends and breathes instead of
  // drawing straight polygon edges across the sand
  float pCaustic(vec2 uv){
    vec3 wq = vec3(uv * 0.5, uPaintTime * 0.05);
    vec2 warp = vec2(pFbm(wq), pFbm(wq + 23.7)) - 0.5;
    vec2 wuv = uv + warp * 1.1;

    float acc = 0.0;
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      vec2 q = wuv * (1.6 + fk * 0.85) + vec2(fk * 0.37 + uPaintTime * 0.055, fk * 0.71 - uPaintTime * 0.04);
      // a finer warp inside the cell lookup, so no edge inside the net is straight either
      q += (vec2(pNoise(vec3(q * 0.4, uPaintTime * 0.04)),
                 pNoise(vec3(q * 0.4 + 9.1, uPaintTime * 0.04))) - 0.5) * 0.55;

      vec2 i = floor(q);
      vec2 f = fract(q);
      float f1 = 8.0;
      float f2 = 8.0;
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y));
          vec2 o = pHash2(i + g);
          // the cell centre itself drifts, so the filaments wander
          o += (vec2(pNoise(vec3(i + g + fk * 7.0, uPaintTime * 0.05)),
                     pNoise(vec3(i + g + fk * 13.0 + 5.0, uPaintTime * 0.05))) - 0.5) * 0.55;
          float d = length(g + o - f);
          if (d < f1) { f2 = f1; f1 = d; }
          else if (d < f2) { f2 = d; }
        }
      }
      // wide, soft filaments: a smoothstep shoulder rather than a line
      acc += (1.0 - smoothstep(0.0, 0.34, f2 - f1)) * (1.0 - smoothstep(0.45, 1.25, f1));
    }
    // patchy light: the whole net brightens and fades as one sheet of rippling light
    acc *= 0.18 + 1.15 * pFbm(vec3(wuv * 0.16, uPaintTime * 0.02));
    return acc * 0.5;
  }
`

export type PaintOptions = {
  /** the painterly softening, 0..1 (eased normal, the softened shading model) */
  soft: number
  rimColor?: string
  shadowTint?: string
  sunDir?: [number, number, number]
  /** wind ripples in the shading normal (sand) */
  ripple?: number
  /** brushwork strength, 0..1: world-space stroke + macro value noise in albedo and normal */
  brush?: number
  /** brush scale: how large a stroke is, in world units (0.35 = a hand's width) */
  brushScale?: number
  /** scrolling Voronoi caustics, 0..1 (underwater surfaces) */
  caustics?: number
  /** caustic tiling in world units */
  causticScale?: number
  /** roughness floor and ceiling for dielectrics: kills plastic highlights and dead matte */
  roughen?: [number, number]
}

/**
 * Route a MeshStandardMaterial through the factory. Idempotent per material: the options are part of
 * the program cache key, so two materials with different paint get different programs.
 */
export function paintMaterial(mat: THREE.MeshStandardMaterial, opts: PaintOptions) {
  const {
    soft,
    rimColor = '#fff0d4',
    shadowTint = '#5a6e8c',
    sunDir = [0.4, 0.7, -0.5],
    ripple = 0,
    brush = 0,
    brushScale = 0.35,
    caustics = 0,
    causticScale = 1.6,
    roughen = [0.65, 0.95],
  } = opts

  const key = `paint-${soft.toFixed(2)}-${rimColor}-${shadowTint}-r${ripple.toFixed(2)}-b${brush.toFixed(2)}@${brushScale}-c${caustics.toFixed(2)}@${causticScale}-q${roughen[0]}-${roughen[1]}`
  const prev = mat.onBeforeCompile
  const prevKey = mat.customProgramCacheKey?.bind(mat)

  mat.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|${key}`
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer)
    shader.uniforms.uPainterlySoft = { value: soft }
    shader.uniforms.uPainterlyRim = { value: new THREE.Color(rimColor) }
    shader.uniforms.uPainterlyShadow = { value: new THREE.Color(shadowTint) }
    shader.uniforms.uPainterlySun = { value: new THREE.Vector3(...sunDir).normalize() }
    shader.uniforms.uPainterlyRipple = { value: ripple }
    shader.uniforms.uPaintBrush = { value: brush }
    shader.uniforms.uPaintCaustics = { value: caustics }
    shader.uniforms.uPaintCausticScale = { value: causticScale }
    shader.uniforms.uPaintTime = paintClock
    shader.uniforms.uPaintRough = { value: new THREE.Vector2(roughen[0], roughen[1]) }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPaintWorldNormal;
        varying vec3 vPaintWorldPos;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 paintWp = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          paintWp = instanceMatrix * paintWp;
        #endif
        paintWp = modelMatrix * paintWp;
        vPaintWorldPos = paintWp.xyz;
        vPaintWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_GLSL}`)

      // the roughness window: dielectrics only ever sit between painted matte and dry paint
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor, uPaintRough.x, uPaintRough.y);`,
      )

      // wind ripples: the sand's own micro-relief, in the shading normal
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (uPainterlyRipple > 0.001) {
          float rp = sin(vPaintWorldPos.x * 6.3 + sin(vPaintWorldPos.z * 2.7) * 1.4)
                   * cos(vPaintWorldPos.z * 9.1 + sin(vPaintWorldPos.x * 1.9) * 0.9);
          float rq = sin(vPaintWorldPos.x * 17.0 + vPaintWorldPos.z * 5.0) * 0.5;
          normal = normalize(normal + vec3((rp * 0.55 + rq * 0.45) * uPainterlyRipple * 0.22, rp * uPainterlyRipple * 0.12, 0.0));
          diffuseColor.rgb *= 1.0 + rp * uPainterlyRipple * 0.09;
        }
        if (uPaintBrush > 0.001) {
          // the brush drags the shading normal: two extra taps, differenced in world XZ, which is
          // where every painted surface here lives (a CPU rasterizer cannot afford three)
          vec3 bwp = vPaintWorldPos * (1.15 / max(0.05, uPaintBrush * 3.2 + 0.35));
          float be = 0.26;
          float b0 = pNoise(bwp);
          vec2 bg = vec2(pNoise(bwp + vec3(be, 0.0, 0.0)) - b0,
                         pNoise(bwp + vec3(0.0, 0.0, be)) - b0) / be;
          vec3 bView = (viewMatrix * vec4(bg.x, 0.0, bg.y, 0.0)).xyz;
          normal = normalize(normal + bView * uPaintBrush * 0.05);
        }`,
      )

      // lift the baked-in dark texels before lighting: no black specks, ever
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float texLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float speckLift = smoothstep(0.18, 0.01, texLum) * uPainterlySoft;
        diffuseColor.rgb = mix(diffuseColor.rgb, max(diffuseColor.rgb, uPainterlyShadow * 0.42), speckLift * 0.85);
        if (uPaintBrush > 0.001) {
          // the stroke is a 3D noise field in world space (no seams, no triplanar taps): one octave
          // for the brush, one macro octave that groups the strokes the way paint is blocked in
          float tri = pNoise(vPaintWorldPos * uPaintBrush * 2.2 + 3.0);
          float macro = pNoise(vPaintWorldPos * uPaintBrush * 0.5 + 5.0);
          float v = (tri - 0.5) * 0.85 + (macro - 0.5) * 0.75;
          diffuseColor.rgb *= clamp(1.0 + v * uPaintBrush, 0.55, 1.45);
        }`,
      )

      // soft light, coloured shadow fill, grazing rim, back-lit lift, then caustics
      .replace(
        '#include <opaque_fragment>',
        `vec3 pN = normalize(vPaintWorldNormal);
        vec3 pV = normalize(cameraPosition - vPaintWorldPos);
        vec3 pL = normalize(uPainterlySun);
        float wrapLight = pow(clamp(dot(pN, pL) * 0.5 + 0.5, 0.0, 1.0), 1.35);
        float backScatter = pow(clamp(dot(-pV, pL) * 0.5 + 0.5, 0.0, 1.0), 2.2);
        float fresnel = pow(1.0 - max(dot(pN, pV), 0.0), 3.0);

        vec3 bounceFill = diffuseColor.rgb * uPainterlyShadow * (0.16 * (1.0 - wrapLight) * uPainterlySoft);
        vec3 rimGlow = uPainterlyRim * fresnel * (0.07 + 0.16 * backScatter) * uPainterlySoft;
        vec3 sssGlow = diffuseColor.rgb * uPainterlyRim * (0.1 * wrapLight * backScatter) * uPainterlySoft;

        outgoingLight += bounceFill + rimGlow + sssGlow;

        if (uPaintCaustics > 0.001) {
          float facing = clamp(pN.y, 0.0, 1.0);
          float lamp = pCaustic(vPaintWorldPos.xz * uPaintCausticScale);
          outgoingLight += vec3(0.42, 0.9, 1.0) * lamp * uPaintCaustics * (0.25 + 0.75 * facing);
        }
        #include <opaque_fragment>`,
      )
  }
  mat.needsUpdate = true
}
