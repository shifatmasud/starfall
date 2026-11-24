import * as THREE from 'three'

/**
 * Caustics + underwater light, shared by every water-side material.
 *
 * `REUSE_AUDIT.md` §4.4 and `REFERENCES.md` §16 both say the same thing: do not
 * simulate caustics per pixel. A real caustic is the bright cellular network a
 * rippled surface focuses sunlight into — thin hard-edged bright lines around
 * soft pools, moving slowly, never repeating. shade-verse ships a physically
 * baked tile and animates it the standard way: two copies drifting apart,
 * `min()` to keep the lines thin, a tiny per-channel offset for the dispersion
 * fringe.
 *
 * ORB-Journey has no caustic asset to copy, so the tile is **baked here once on
 * the CPU** — a periodic Voronoi cell-edge network (the hard lines) filtered by
 * periodic ridged value noise (the soft pools) — and then sampled exactly the
 * way shade-verse samples its PNG. The result is a handful of texture fetches
 * per pixel instead of per-pixel trigonometry: the first per-pixel version of
 * this file cost seconds per frame under SwiftShader, and a phone has no room
 * for that.
 *
 * Everything here is GLSL ES 3.00 and designed to be *included* in another
 * material's fragment shader:
 *
 *   import { CAUSTICS_GLSL, UW_GLSL, createCausticUniforms } from './caustics'
 *   material = new THREE.ShaderMaterial({
 *     glslVersion: THREE.GLSL3,
 *     uniforms: { ...createCausticUniforms() },
 *     fragmentShader: CAUSTICS_GLSL + UW_GLSL + `... my main ...`,
 *   })
 */

/** Absorption of fresh lake water, per metre, R/G/B (Pope & Fry 1997, clear water). */
export const LAKE_ABSORPTION = new THREE.Vector3(0.075, 0.022, 0.016)

/** In-scattered colour of the lake body: the teal a clear lake fogs toward. */
export const LAKE_SCATTER = new THREE.Color('#2d6f72')

/** Richest caustic strength we ship; materials scale it down with depth. */
export const CAUSTIC_STRENGTH = 1.15

/* ------------------------------------------------------------------------ *
 * The tile: periodic Voronoi (hard cell edges) inside periodic ridged noise
 * (soft pools). Periodic on purpose — it has to tile in both directions or the
 * drift shows a seam.
 * ------------------------------------------------------------------------ */

const hash = (x: number, y: number, period: number) => {
  const xi = ((x % period) + period) % period
  const yi = ((y % period) + period) % period
  let h = xi * 374761393 + yi * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) >>> 0) / 4294967296
}

/** periodic value noise: integer lattice with the lattice wrapped at `period` */
function valueNoise(x: number, y: number, period: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash(xi, yi, period)
  const b = hash(xi + 1, yi, period)
  const c = hash(xi, yi + 1, period)
  const d = hash(xi + 1, yi + 1, period)
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy
}

/** distance to the nearest cell border (F2 - F1), periodic over `period` cells */
function voronoiEdge(x: number, y: number, period: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  let f1 = 8
  let f2 = 8
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i
      const cy = yi + j
      const ox = hash(cx, cy, period) * 0.82 + 0.09
      const oy = hash(cx + 19, cy + 7, period) * 0.82 + 0.09
      const dx = i + ox - (x - xi)
      const dy = j + oy - (y - yi)
      const d = dx * dx + dy * dy
      if (d < f1) {
        f2 = f1
        f1 = d
      } else if (d < f2) {
        f2 = d
      }
    }
  }
  return Math.sqrt(f2) - Math.sqrt(f1)
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** One caustic layer at uv (0..1 tiles once). */
function layer(u: number, v: number) {
  const cells = 11
  const e = 1 - smoothstep(0.012, 0.115, voronoiEdge(u * cells, v * cells, cells))
  // ridged: 1 - |2n - 1| creases where the noise crosses 0.5 (soft bright pools)
  let pool = 0
  let amp = 0.5
  let scale = 3
  for (let o = 0; o < 3; o++) {
    const n = valueNoise(u * scale, v * scale, scale)
    pool += amp * (1 - Math.abs(n * 2 - 1))
    scale *= 2
    amp *= 0.5
  }
  return e * (0.62 + 0.55 * pool) + pool * pool * 0.3
}

function buildCausticTile(size: number) {
  const data = new Uint8Array(size * size * 4)
  let max = 1e-4
  const field = new Float32Array(size * size)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const value = layer(i / size, j / size)
      field[j * size + i] = value
      if (value > max) max = value
    }
  }
  const gain = 1.55 / max
  for (let k = 0; k < size * size; k++) {
    const v = Math.min(255, Math.round(Math.min(1, field[k] * gain) * 255))
    data[k * 4] = v
    data[k * 4 + 1] = v
    data[k * 4 + 2] = v
    data[k * 4 + 3] = 255
  }
  return data
}

let tileTexture: THREE.Texture | null = null

/** The one shared caustic tile (baked on first use, never mutated after). */
export function causticTile(): THREE.Texture {
  if (!tileTexture) {
    const size = 256
    const texture = new THREE.DataTexture(buildCausticTile(size), size, size, THREE.RGBAFormat, THREE.UnsignedByteType)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = 2
    texture.colorSpace = THREE.NoColorSpace
    texture.needsUpdate = true
    tileTexture = texture
  }
  return tileTexture
}

export type CausticUniforms = {
  /** x: pattern scale (1/m), y: strength, z: time, w: fringe gain */
  uCaus: { value: THREE.Vector4 }
  /** colour the caustic light takes after travelling through the water */
  uCausTint: { value: THREE.Color }
  uCausTex: { value: THREE.Texture }
}

/**
 * One shared set of caustic uniforms. Pass the *same object* to every material
 * that must agree on the pattern (water surface, kelp, bed) and advance
 * `uCaus.z` once per frame — two systems easing the same value is the house
 * rule's one forbidden thing (REUSE_AUDIT §5, rule 7).
 */
export function createCausticUniforms(): CausticUniforms {
  return {
    uCaus: { value: new THREE.Vector4(0.06, CAUSTIC_STRENGTH, 0, 0.6) },
    uCausTint: { value: new THREE.Color('#bff2e6') },
    uCausTex: { value: causticTile() },
  }
}

/** The shared uniforms of the *medium* (Beer-Lambert + in-scatter). */
export function createMediumUniforms(level = 0) {
  return {
    /** water surface height */
    uLevel: { value: level },
    /** absorption per metre (rgb) */
    uUwAbs: { value: LAKE_ABSORPTION.clone() },
    /** in-scatter colour */
    uUwScatter: { value: new THREE.Color(LAKE_SCATTER) },
    /** sun direction (world, pointing *toward* the sun) */
    uSunDir: { value: new THREE.Vector3(0.42, 0.78, 0.46).normalize() },
    /** how strongly the beams show (day/night / beat blend) */
    uUwBeam: { value: 1 },
  }
}

/* ------------------------------------------------------------------------ *
 * GLSL: exactly shade-verse's two drifting copies + min() + colour offset.
 * ------------------------------------------------------------------------ */

export const CAUSTICS_GLSL = /* glsl */ `
uniform sampler2D uCausTex;   // baked periodic tile: thin bright Voronoi edges in soft ridged pools
uniform vec4 uCaus;           // x scale (1/m), y strength, z time, w fringe
uniform vec3 uCausTint;

/* The tile is sampled three times with a small per-channel offset: real
   caustics show the fringe because water disperses. Two copies rotated against
   each other and min()ed keep the lines thin and stop the eye reading a repeat.
   (shade-verse src/caustics.ts, unchanged in structure.) */
vec3 causticsRGB(vec2 xz) {
  float t = uCaus.z;
  vec2 a = xz * uCaus.x + vec2(0.023, 0.011) * t;
  vec2 b = mat2(0.81, -0.59, 0.59, 0.81) * xz * uCaus.x * 1.19 + vec2(-0.017, 0.021) * t;
  float l2 = texture(uCausTex, b).r;
  vec2 o = vec2(0.0013, 0.0008) * uCaus.w;
  return vec3(min(texture(uCausTex, a + o).r, l2),
              min(texture(uCausTex, a).r, l2),
              min(texture(uCausTex, a - o).r, l2)) * uCaus.y;
}

/* One scalar tap: the dapple that lights kelp and rock, and the coarse focus
   that lights the god-rays (shade-verse reads the tile ~4x coarser for that). */
float causticDapple(vec2 xz) {
  vec2 a = xz * uCaus.x * 1.35 + vec2(0.023, 0.011) * uCaus.z;
  vec2 b = mat2(0.81, -0.59, 0.59, 0.81) * xz * uCaus.x * 1.6 + vec2(-0.017, 0.021) * uCaus.z;
  return min(texture(uCausTex, a).r, texture(uCausTex, b).r) * uCaus.y;
}

float causticFocus(vec2 xz) {
  vec2 a = xz * uCaus.x * 0.24 + vec2(0.023, 0.011) * uCaus.z * 0.35;
  vec2 b = mat2(0.81, -0.59, 0.59, 0.81) * xz * uCaus.x * 0.29 + vec2(-0.017, 0.021) * uCaus.z * 0.35;
  float f = 0.5 * (texture(uCausTex, a).r + texture(uCausTex, b).r);
  return smoothstep(0.20, 0.52, f);
}
`

/* ------------------------------------------------------------------------ *
 * The medium: Beer-Lambert with per-channel absorption (red dies first).
 * ------------------------------------------------------------------------ */

export const UW_GLSL = /* glsl */ `
uniform float uLevel;
uniform vec3 uUwAbs;
uniform vec3 uUwScatter;
uniform vec3 uSunDir;
uniform float uUwBeam;

/* path = metres of water the light crosses; returns what the eye sees through
   it. Per channel, exactly as shade-verse does it (REUSE_AUDIT §4.2): a lit
   object fades toward the in-scatter colour as its light is absorbed on the way
   in and out, and red is gone first. */
vec3 uwMedium(vec3 c, float path) {
  vec3 T = exp(-uUwAbs * max(path, 0.0));
  return c * T + uUwScatter * (1.0 - T);
}

/* Depth tint for something standing in the water, measured from the surface:
   the light that reaches it has come down *depth* metres, and the eye's ray
   comes back up *dist - depth*, so both paths go through the same medium. */
vec3 uwTint(vec3 c, float depth, float dist) {
  return uwMedium(c, max(depth, 0.0) * 0.75 + max(dist - depth, 0.0));
}

/* Fraction of the frame a pixel is underwater, given the depth of the fragment. */
float uwHaze(float depth) { return 1.0 - exp(-max(depth, 0.0) * 0.42); }

/* Custom ShaderMaterials write the framebuffer directly, so they have to do the
   sRGB transfer themselves — three only appends it to its built-in materials.
   Without this every colour authored as a hex comes out ~1.8 stops too dark
   (linear values displayed as if they were already encoded). */
vec3 uwSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
`
