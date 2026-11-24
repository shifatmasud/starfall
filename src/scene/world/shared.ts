/**
 * Shared kit for the botanical world: palette, one clock/sun/haze uniform block,
 * the toon + haze GLSL used by every world material, a deterministic RNG and a
 * small geometry builder (positions / normals / vertex colours / UVs / wind).
 *
 * COLOUR SPACE. Every world material is a raw GLSL3 `ShaderMaterial`, so three
 * never inserts a colour-space or tone-mapping chunk for us. The whole world is
 * therefore authored directly in display sRGB — the same numbers as the CSS
 * palette — and `foliage-atlas.png` is sampled with `NoColorSpace` so texels
 * arrive as the sRGB values they were painted with. That keeps the painted,
 * flat-value house look exact instead of drifting through linear/sRGB mixes.
 *
 * SHADERS. `THREE.GLSL3` makes three prepend `#version 300 es` and alias
 * `attribute`/`varying`; every fragment shader below declares its own
 * `layout(location = 0) out vec4 fragColor`.
 */
import * as THREE from 'three'

/** `mid` behaves like `high` — the app's quality module has three tiers. */
export type Tier = 'low' | 'mid' | 'high'

/* ------------------------------------------------------------------ *
 * Integration helpers — accept whatever the app already has on hand. *
 * ------------------------------------------------------------------ */

/** A scroll/pointer source: a ref, a framer-motion MotionValue, a getter or a plain value. */
export type ValueSource<T> = T | (() => T) | { current: T } | { get: () => T }

export function readValue<T>(source: ValueSource<T> | undefined, fallback: T): T {
  if (source === undefined || source === null) return fallback
  if (typeof source === 'function') return (source as () => T)()
  if (typeof source === 'object') {
    const maybe = source as { get?: () => T; current?: T }
    if (typeof maybe.get === 'function') return maybe.get()
    if (maybe.current !== undefined) return maybe.current
  }
  return source as T
}

/* ----------------------------- palette ----------------------------- */

export const PALETTE = {
  // meadow / terrain
  meadowLit: '#8a9a4c',
  meadowMid: '#4f6129',
  meadowShade: '#2c3820',
  litterLit: '#5d5236',
  litterMid: '#3d3a26',
  litterShade: '#2a281c',
  sand: '#8B7B58',
  bedShallow: '#4A5138',
  bedDeep: '#242B22',
  // grass (REFERENCES §A.1 — three greens from the painted pine + one sun rim)
  grassShade: '#2b3a1e',
  grassMid: '#4a5c2c',
  grassLit: '#7b9440',
  grassRim: '#d0dd8e',
  // flowers
  daisyRayLit: '#F7F3E8',
  daisyRayShade: '#CFCCBC',
  daisyDisc: '#E8C24A',
  daisyDiscDeep: '#B07F26',
  butterLit: '#F2C63C',
  butterShade: '#A87516',
  lavenderLit: '#8A79AB',
  lavenderShade: '#4A3F63',
  lavenderLeaf: '#8C9384',
  cloverLeaf: '#5E7548',
  cloverCrescent: '#C9D6B4',
  cloverHead: '#EFEDE2',
  cloverAged: '#B79C93',
  irisLit: '#67599F',
  irisShade: '#332A5C',
  irisSignal: '#D9C24E',
  irisLeaf: '#5C7052',
  cattailSpike: '#6B4A32',
  cattailSpikeLit: '#9A7150',
  cattailLeaf: '#7C8A5A',
  fernLit: '#A3BB6C',
  fernMid: '#7C9256',
  fernShade: '#4C5E38',
  fernStem: '#7A3B44',
  // trees
  pineBarkLow: '#5F574E',
  pineBarkOrange: '#8A5A36',
  pineBarkHigh: '#6E5F4E',
  pineNeedle: '#5E6E4A',
  birchBark: '#E9E6DC',
  birchBarkShade: '#8C887E',
  birchLeaf: '#8FAA5C',
  oakBark: '#5B5145',
  oakLeaf: '#54643F',
  willowBark: '#4F4A42',
  willowBarkLit: '#6E6A5E',
  willowStrand: '#8FA05A',
  willowStrandShade: '#54633A',
  hazelWood: '#5E5646',
  hazelLeafLit: '#78924F',
  hazelLeafShade: '#3A4A32',
  // air
  haze: '#C4CEC3',
  hazeWarm: '#D6D2BC',
  shadowTint: '#7E90A6',
} as const

/**
 * Palette colour as *raw sRGB* numbers. `new THREE.Color(hex)` would convert the
 * value into three's linear working space, and a raw shader that writes it
 * straight to the buffer would then come out far too dark — so the conversion is
 * undone here and the whole world stays in display space.
 */
export const color = (hex: string) => new THREE.Color(hex).convertLinearToSRGB()

/* --------------------------- light & air --------------------------- */

/** Direction *towards* the sun: ahead of the walker and slightly right, low. */
export const SUN_DIR = new THREE.Vector3(0.34, 0.42, -0.84).normalize()

/**
 * The single uniform block every world material shares. One object is created
 * by `<World>` and handed down, so time, sun, haze and the orb position can
 * never disagree between terrain, grass, flowers and trees.
 */
export type WorldUniforms = {
  uTime: { value: number }
  uOrb: { value: THREE.Vector3 }
  uOrbStrength: { value: number }
  uSun: { value: THREE.Vector3 }
  uHaze: { value: THREE.Color }
  uHazeStart: { value: number }
  uHazeEnd: { value: number }
  uFog: { value: number }
  uTex: { value: THREE.Texture | null }
}

export type WorldUniformOptions = {
  /** Kept by reference: pass the atmosphere's live sun vector and the world follows it. */
  sun?: THREE.Vector3
  /** A hex string, or the atmosphere's live colour (kept by reference). */
  haze?: string | THREE.Color
  hazeStart?: number
  hazeEnd?: number
}

export function createWorldUniforms(options: WorldUniformOptions = {}): WorldUniforms {
  return {
    uTime: { value: 0 },
    uOrb: { value: new THREE.Vector3(0, 0, 0) },
    uOrbStrength: { value: 1 },
    uSun: { value: options.sun ?? SUN_DIR.clone() },
    uHaze: { value: options.haze instanceof THREE.Color ? options.haze : color(options.haze ?? PALETTE.haze) },
    uHazeStart: { value: options.hazeStart ?? 70 },
    uHazeEnd: { value: options.hazeEnd ?? 320 },
    uFog: { value: 1 },
    uTex: { value: null },
  }
}

/* ------------------------------ GLSL ------------------------------ */

/**
 * Optical light, not a cel ramp: wrap-diffuse sunlight over a cool sky ambient, a warm bounce from
 * the meadow, and an exponential aerial perspective. The name is kept (`toonStep`) because every
 * plant, bark and foliage material in the world calls it in one place — but there are no value
 * steps any more: the curve is continuous, the way a photograph's is.
 */
export const GLSL_LIGHT = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uHaze;
uniform float uFog;
uniform vec3 uOrb;

/* the fallen star's own light: warm, close, and gone within a few metres */
vec3 orbGlow(vec3 world, vec3 base) {
  vec3 d = world - uOrb;
  float g = exp(-dot(d, d) * 0.08);
  return base * vec3(1.30, 0.98, 0.58) * g * 0.75;
}

vec3 toonStep(vec3 base, vec3 n) {
  vec3 nd = normalize(n);
  float ndl = dot(nd, normalize(uSun));
  // wrap diffuse: leaves and blades scatter, so the terminator is soft and the shadow never black
  float wrap = clamp((ndl + 0.40) / 1.40, 0.0, 1.0);
  float sky = 0.55 + 0.45 * clamp(nd.y, 0.0, 1.0);
  float sunUp = 0.55 + 0.45 * clamp(uSun.y, 0.0, 1.0);

  vec3 ambient = base * vec3(0.52, 0.62, 0.76) * (0.34 + 0.40 * sky);
  vec3 sunlit = base * vec3(1.10, 1.05, 0.90) * (0.62 + 0.60 * wrap) * sunUp;
  vec3 bounce = base * vec3(1.04, 0.98, 0.70) * 0.10 * (1.0 - wrap) * sky;
  return ambient + sunlit + bounce;
}

/* exponential aerial perspective: distant layers melt into the horizon instead of ending at it */
vec3 applyHaze(vec3 col, float dist, float start, float end) {
  float f = 1.0 - exp(-max(dist - start * 0.25, 0.0) * 0.0032 * uFog);
  return mix(col, uHaze, clamp(f, 0.0, 0.94));
}
`

/**
 * Wind shared by grass, flowers and foliage.
 * Three layers, as specified: a travelling gust field (world space), a slow
 * per-plant breath (0.13 Hz with a 0.25 Hz harmonic, love-letter's cadence) and
 * a fast tip flutter. The orb pushes nearby plants away with a gaussian falloff.
 */
export const GLSL_WIND = /* glsl */ `
uniform float uTime;
uniform vec3 uOrb;
uniform float uOrbStrength;

vec2 gustField(vec2 xz) {
  float g1 = sin(dot(xz, vec2(0.055, 0.041)) - uTime * 0.55);
  float g2 = sin(dot(xz, vec2(-0.091, 0.074)) - uTime * 0.95 + 1.7);
  float g3 = sin(dot(xz, vec2(0.028, -0.020)) - uTime * 0.31 + 4.1);
  return vec2(0.62 * g1 + 0.30 * g2 + 0.22 * g3, 0.34 * g2 - 0.26 * g1);
}

float breath(float phase) {
  return sin(uTime * 0.80 + phase) * 0.34 + sin(uTime * 1.55 + phase * 1.7) * 0.12;
}

float flutter(float phase) {
  return sin(uTime * 6.5 + phase * 3.1);
}

vec2 orbPush(vec3 worldPos, float radius) {
  vec2 d = worldPos.xz - uOrb.xz;
  float r2 = dot(d, d);
  float falloff = exp(-r2 / (radius * radius));
  float vertical = exp(-pow((worldPos.y - uOrb.y) * 0.55, 2.0));
  return normalize(d + 1e-4) * falloff * vertical * uOrbStrength;
}
`

/* ------------------------------ RNG ------------------------------- */

/** Deterministic PRNG so every rebuild (tier swap, remount) plants the same world. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rand = () => number
export const range = (r: Rand, min: number, max: number) => min + (max - min) * r()
export const pick = <T,>(r: Rand, items: readonly T[]): T => items[Math.floor(r() * items.length) % items.length]

/* -------------------------- foliage atlas ------------------------- */

/** 4 × 3 cells of 256 px in `public/textures/flora/foliage-atlas.png`. */
export const ATLAS_SIZE = 1024
export const ATLAS_CELLS = { cols: 4, rows: 3, px: 256 } as const

export type AtlasCell = [col: number, row: number]
export const ATLAS = {
  pineTwig: [0, 0] as AtlasCell,
  shrubBig: [2, 0] as AtlasCell,
  shrubA: [1, 0] as AtlasCell,
  shrubB: [3, 0] as AtlasCell,
  leafA: [0, 1] as AtlasCell,
  leafB: [1, 1] as AtlasCell,
  leafC: [2, 1] as AtlasCell,
  leafD: [3, 1] as AtlasCell,
  leafE: [0, 2] as AtlasCell,
  leafF: [1, 2] as AtlasCell,
  leafG: [2, 2] as AtlasCell,
  leafH: [3, 2] as AtlasCell,
} as const

/** UV rect `[u0, v0, u1, v1]` for a cell, with a hair of inset to stop bleed. */
export function atlasRect(cell: AtlasCell, inset = 0.004): [number, number, number, number] {
  const { cols, rows } = ATLAS_CELLS
  const [c, r] = cell
  const du = 1 / cols
  const dv = 1 / rows
  const u0 = c * du + inset * du
  const u1 = (c + 1) * du - inset * du
  // v runs bottom-up in GL, the atlas is authored top-down
  const v0 = 1 - (r + 1) * dv + inset * dv
  const v1 = 1 - r * dv - inset * dv
  return [u0, v0, u1, v1]
}

/* ------------------------- geometry builder ----------------------- */

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _n = new THREE.Vector3()

/**
 * Accumulates one draw-call's worth of geometry. Everything the world draws is
 * merged into a handful of these (one per material), which is what keeps the
 * draw-call count near 20 while the meadow stays dense.
 */
export class Geo {
  readonly position: number[] = []
  readonly normal: number[] = []
  readonly color: number[] = []
  readonly uv: number[] = []
  /** per-vertex `(swayWeight, phase)` — foliage/strand wind reads this. */
  readonly wind: number[] = []
  readonly index: number[] = []

  private sway = 0
  private phase = 0

  /** Every vertex added after this call carries the same wind pair. */
  windFor(sway: number, phase: number): this {
    this.sway = sway
    this.phase = phase
    return this
  }

  private vert(p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color, u: number, v: number): number {
    this.position.push(p.x, p.y, p.z)
    this.normal.push(n.x, n.y, n.z)
    this.color.push(c.r, c.g, c.b)
    this.uv.push(u, v)
    this.wind.push(this.sway, this.phase)
    return this.position.length / 3 - 1
  }

  tri(
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    c0: THREE.Color,
    c1: THREE.Color,
    c2: THREE.Color,
    uv0: [number, number] = [0, 0],
    uv1: [number, number] = [1, 0],
    uv2: [number, number] = [0, 1],
    n?: THREE.Vector3,
  ): this {
    const normal = n ?? faceNormal(p0, p1, p2)
    const i0 = this.vert(p0, normal, c0, uv0[0], uv0[1])
    const i1 = this.vert(p1, normal, c1, uv1[0], uv1[1])
    const i2 = this.vert(p2, normal, c2, uv2[0], uv2[1])
    this.index.push(i0, i1, i2)
    return this
  }

  quad(
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
    c0: THREE.Color,
    c1: THREE.Color,
    c2: THREE.Color,
    c3: THREE.Color,
    uv0: [number, number],
    uv1: [number, number],
    uv2: [number, number],
    uv3: [number, number],
    n?: THREE.Vector3,
  ): this {
    const normal = n ?? faceNormal(p0, p1, p2)
    const i0 = this.vert(p0, normal, c0, uv0[0], uv0[1])
    const i1 = this.vert(p1, normal, c1, uv1[0], uv1[1])
    const i2 = this.vert(p2, normal, c2, uv2[0], uv2[1])
    const i3 = this.vert(p3, normal, c3, uv3[0], uv3[1])
    this.index.push(i0, i1, i2, i0, i2, i3)
    return this
  }

  /** One leaf as two triangles — the workhorse for dense canopies. */
  leaf(opts: {
    centre: THREE.Vector3
    right: THREE.Vector3
    up: THREE.Vector3
    width: number
    height: number
    rect: [number, number, number, number]
    top: THREE.Color
    bottom: THREE.Color
    droop?: number
    normal?: THREE.Vector3
  }): this {
    const { centre, right, up, width, height, rect, top, bottom } = opts
    const droop = opts.droop ?? 0
    const n = (opts.normal ?? new THREE.Vector3().crossVectors(right, up)).clone().normalize()
    const [u0, v0, u1, v1] = rect
    const w = width * 0.5
    const h = height * 0.5
    const p0 = centre.clone().addScaledVector(right, -w).addScaledVector(up, -h)
    const p1 = centre.clone().addScaledVector(right, w).addScaledVector(up, -h)
    const p2 = centre.clone().addScaledVector(right, w).addScaledVector(up, h).addScaledVector(n, droop)
    const p3 = centre.clone().addScaledVector(right, -w).addScaledVector(up, h).addScaledVector(n, droop)
    return this.quad(p0, p1, p2, p3, bottom, bottom, top, top, [u0, v0], [u1, v0], [u1, v1], [u0, v1], n)
  }

  /** Flat card in world space: `centre` + `right`/`up` half-extent basis. */
  card(opts: {
    centre: THREE.Vector3
    right: THREE.Vector3
    up: THREE.Vector3
    width: number
    height: number
    rect: [number, number, number, number]
    top: THREE.Color
    bottom: THREE.Color
    /** cup along the card normal, in world units at the edges */
    cup?: number
    /** droop at the free (top) end, in world units */
    droop?: number
    /** normal to write; defaults to right × up */
    normal?: THREE.Vector3
  }): this {
    const { centre, right, up, width, height, rect, top, bottom } = opts
    const cup = opts.cup ?? 0
    const droop = opts.droop ?? 0
    const n = (opts.normal ?? new THREE.Vector3().crossVectors(right, up)).clone().normalize()
    const [u0, v0, u1, v1] = rect
    // 3 × 3 grid so a card can cup and droop instead of reading as a flat sprite
    const i: number[][] = []
    for (let row = 0; row < 3; row++) {
      const ty = row / 2
      const line: number[] = []
      for (let col = 0; col < 3; col++) {
        const tx = col / 2 - 0.5
        _a.copy(centre)
          .addScaledVector(right, tx * width)
          .addScaledVector(up, (ty - 0.5) * height)
          .addScaledVector(n, cup * (tx * tx * 4 - 1) + droop * ty * ty)
        const c = ty < 0.5 ? bottom.clone().lerp(top, ty * 2) : top
        const uu = u0 + (u1 - u0) * (col / 2)
        const vv = v1 + (v0 - v1) * ty
        line.push(this.vert(_a, n, c, uu, vv))
      }
      i.push(line)
    }
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const a = i[row][col]
        const b = i[row][col + 1]
        const c = i[row + 1][col + 1]
        const d = i[row + 1][col]
        this.index.push(a, b, c, a, c, d)
      }
    }
    return this
  }

  /**
   * A ribbon through `points`, `+/- width` along `sides`, with a per-point colour
   * ramp. Used for blades, iris/cattail leaves, willow strands, fern rachises.
   */
  ribbon(opts: {
    points: THREE.Vector3[]
    widths: number[]
    sides: THREE.Vector3[]
    colors: THREE.Color[]
    /** optional explicit UVs per point (textured ribbons) */
    uvs?: [number, number, number, number][]
    sway?: (t: number) => number
  }): this {
    const { points, widths, sides, colors, uvs } = opts
    const n = points.length
    const left: number[] = []
    const right: number[] = []
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1)
      if (opts.sway) this.windFor(opts.sway(t), this.phase)
      const tangent = new THREE.Vector3()
      if (k === 0) tangent.subVectors(points[1], points[0])
      else if (k === n - 1) tangent.subVectors(points[n - 1], points[n - 2])
      else tangent.subVectors(points[k + 1], points[k - 1])
      if (tangent.lengthSq() < 1e-9) tangent.set(0, 1, 0)
      tangent.normalize()
      const side = sides[k]
      const normal = new THREE.Vector3().crossVectors(tangent, side).normalize()
      if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1)
      _a.copy(points[k]).addScaledVector(side, widths[k])
      _b.copy(points[k]).addScaledVector(side, -widths[k])
      const uvL: [number, number] = uvs ? [uvs[k][0], uvs[k][1]] : [0, t]
      const uvR: [number, number] = uvs ? [uvs[k][2], uvs[k][3]] : [1, t]
      left.push(this.vert(_a, normal, colors[k], uvL[0], uvL[1]))
      right.push(this.vert(_b, normal, colors[k], uvR[0], uvR[1]))
    }
    for (let k = 0; k < n - 1; k++) {
      this.index.push(left[k], right[k], right[k + 1], left[k], right[k + 1], left[k + 1])
    }
    return this
  }

  /** Tapered tube along a spine — trunks, branches, hazel arcs, cattail spikes. */
  tube(opts: {
    points: THREE.Vector3[]
    radii: number[]
    radial?: number
    colorAt: (ring: number, around: number) => THREE.Color
    uvScale?: [number, number]
    sway?: (t: number) => number
  }): this {
    const { points, radii, colorAt } = opts
    const radial = opts.radial ?? 7
    const rings = points.length
    const ringStart: number[] = []
    const frameUp = new THREE.Vector3(0, 1, 0)
    for (let r = 0; r < rings; r++) {
      const t = r / (rings - 1)
      if (opts.sway) this.windFor(opts.sway(t), this.phase)
      const tangent = new THREE.Vector3()
      if (r === 0) tangent.subVectors(points[1], points[0])
      else if (r === rings - 1) tangent.subVectors(points[rings - 1], points[rings - 2])
      else tangent.subVectors(points[r + 1], points[r - 1])
      if (tangent.lengthSq() < 1e-9) tangent.set(0, 1, 0)
      tangent.normalize()
      const ref = Math.abs(tangent.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : frameUp
      const sideA = new THREE.Vector3().crossVectors(tangent, ref).normalize()
      const sideB = new THREE.Vector3().crossVectors(tangent, sideA).normalize()
      ringStart.push(this.position.length / 3)
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * Math.PI * 2
        const outward = new THREE.Vector3()
          .addScaledVector(sideA, Math.cos(a))
          .addScaledVector(sideB, Math.sin(a))
          .normalize()
        _a.copy(points[r]).addScaledVector(outward, radii[r])
        const uv: [number, number] = [j / radial, t * (opts.uvScale?.[1] ?? 1)]
        this.vert(_a, outward, colorAt(r, j / radial), uv[0], uv[1])
      }
    }
    for (let r = 0; r < rings - 1; r++) {
      for (let j = 0; j < radial; j++) {
        const j2 = (j + 1) % radial
        const a = ringStart[r] + j
        const b = ringStart[r] + j2
        const c = ringStart[r + 1] + j2
        const d = ringStart[r + 1] + j
        this.index.push(a, b, c, a, c, d)
      }
    }
    return this
  }

  get triangleCount(): number {
    return this.index.length / 3
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wind, 2))
    g.setIndex(this.index)
    g.computeBoundingSphere()
    if (g.boundingSphere) g.boundingSphere.radius += 1.5
    return g
  }
}

function faceNormal(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3): THREE.Vector3 {
  _c.subVectors(p1, p0)
  _n.subVectors(p2, p0)
  const n = new THREE.Vector3().crossVectors(_c, _n)
  if (n.lengthSq() < 1e-10) return new THREE.Vector3(0, 1, 0)
  return n.normalize()
}

/* --------------------------- materials ---------------------------- */

export type PlantMaterialOptions = {
  uniforms: WorldUniforms
  /** 0 = matte petal, 1 = buttercup's specular sheen */
  gloss?: number
  translucency?: number
  /** wind amplitude in world units at sway = 1 */
  swayAmount?: number
  side?: THREE.Side
}

/**
 * Vertex-coloured flowers, leaves and ferns. One material per species so each
 * can carry its own gloss / translucency / sway while still drawing its whole
 * population in a single instanced call.
 */
export function createPlantMaterial({
  uniforms,
  gloss = 0,
  translucency = 0.22,
  swayAmount = 0.35,
  side = THREE.DoubleSide,
}: PlantMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      ...uniforms,
      uGloss: { value: gloss },
      uTranslucency: { value: translucency },
      uSwayAmount: { value: swayAmount },
    },
    vertexShader: /* glsl */ `
      ${GLSL_WIND}
      uniform float uSwayAmount;
      attribute vec2 aWind;   // sway weight, phase
      attribute vec2 aVar;    // phase jitter, tint
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vTint;

      void main() {
        vec3 local = position;
        float sway = clamp(aWind.x, 0.0, 1.0);
        float phase = aWind.y + aVar.x;

        vec4 instanced = instanceMatrix * vec4(local, 1.0);
        float iscale = length(instanceMatrix[1].xyz);
        vec2 bend = gustField(instanced.xz) * 0.42
                  + vec2(cos(phase), sin(phase)) * breath(phase) * 0.34;
        bend += orbPush(instanced.xyz, 4.6) * 2.1;

        vec3 world = instanced.xyz;
        world.xz += bend * sway * sway * uSwayAmount * iscale;

        vWorld = world;
        vNormal = normalize(mat3(instanceMatrix) * normal);
        vColor = color;
        vTint = aVar.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_LIGHT}
      uniform float uGloss;
      uniform float uTranslucency;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying float vTint;

      layout(location = 0) out vec4 fragColor;

      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 base = vColor * mix(0.92, 1.06, vTint);
        vec3 col = toonStep(base, n);

        vec3 viewDir = normalize(vWorld - cameraPosition);
        float back = pow(max(dot(viewDir, uSun), 0.0), 1.8);
        col += base * vec3(1.25, 1.18, 0.72) * back * uTranslucency;
        // the star's warm light, when it passes close
        col += orbGlow(vWorld, base);

        if (uGloss > 0.0) {
          vec3 h = normalize(uSun - viewDir);
          float spec = pow(max(dot(n, h), 0.0), 28.0);
          col += vec3(1.0, 0.96, 0.78) * spec * uGloss;
        }

        float dist = length(vWorld - cameraPosition);
        col = applyHaze(col, dist, 120.0, 340.0);
        fragColor = vec4(col, 1.0);
      }
    `,
    vertexColors: true,
    side,
  })
}

export type BarkMaterialOptions = {
  uniforms: WorldUniforms
  /** 0 = pine orange band, 1 = birch white with fissures, 2 = plain dark bark */
  mode?: number
}

/** Trunk/branch material: vertex colours + fissure noise, toon-lit, hazed. */
export function createBarkMaterial({ uniforms, mode = 0 }: BarkMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      ...uniforms,
      uBarkMode: { value: mode },
    },
    vertexShader: /* glsl */ `
      ${GLSL_WIND}
      attribute vec2 aWind;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;

      void main() {
        vec3 p = position;
        // trunks only move a few centimetres, weighted towards the crown
        float sway = aWind.x;
        float phase = aWind.y;
        p.x += sin(uTime * 0.55 + phase) * 0.035 * sway * sway;
        p.z += cos(uTime * 0.43 + phase * 1.3) * 0.028 * sway * sway;

        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vColor = color;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_LIGHT}
      uniform float uBarkMode;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;

      layout(location = 0) out vec4 fragColor;

      float hash21(vec2 p) {
        return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
      }

      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 base = vColor;

        if (uBarkMode > 0.5 && uBarkMode < 1.5) {
          // silver birch: dark diamond fissures, horizontal papery breaks
          float y = vWorld.y;
          vec2 cell = vec2(atan(n.z, n.x) * 1.6, y * 2.4);
          vec2 g = floor(cell);
          float r = hash21(g);
          float diamond = abs(fract(cell.x) - 0.5) + abs(fract(cell.y) - 0.5) * 1.6;
          float fissure = step(0.62, diamond) * step(0.55, r);
          float band = smoothstep(0.02, 0.0, abs(fract(y * 0.9 + r) - 0.5) - 0.46);
          base = mix(base, vec3(0.22, 0.21, 0.2), fissure * 0.55 + band * 0.3);
        } else if (uBarkMode > 1.5) {
          // plain furrowed bark: vertical striations
          float stripe = sin(vWorld.y * 9.0 + atan(n.z, n.x) * 6.0) * 0.5 + 0.5;
          base *= 0.82 + 0.3 * stripe;
        } else {
          // scots pine: flaky plates
          float plate = hash21(floor(vec2(atan(n.z, n.x) * 5.0, vWorld.y * 3.2)));
          base *= 0.86 + 0.28 * plate;
        }

        vec3 col = toonStep(base, n);
        float dist = length(vWorld - cameraPosition);
        col = applyHaze(col, dist, 120.0, 340.0);
        fragColor = vec4(col, 1.0);
      }
    `,
    vertexColors: true,
    side: THREE.DoubleSide,
  })
}

export type FoliageMaterialOptions = {
  uniforms: WorldUniforms
  /** 0..1 how strongly the thin leaf lets the sun through */
  translucency?: number
  /** wind amplitude in world units at sway = 1 */
  swayAmount?: number
  /** tint multiplied into the atlas texel */
  tint?: THREE.Color
  /** extra darkening at the card base so overlaps stack without banding */
  depthShade?: number
}

/** Alpha-tested leaf/needle cards. One material per species (they differ in wind). */
export function createFoliageMaterial({
  uniforms,
  translucency = 0.45,
  swayAmount = 0.28,
  tint,
  depthShade = 0.18,
}: FoliageMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      ...uniforms,
      uTranslucency: { value: translucency },
      uSwayAmount: { value: swayAmount },
      uTint: { value: tint ?? new THREE.Color(1, 1, 1) },
      uDepthShade: { value: depthShade },
    },
    vertexShader: /* glsl */ `
      ${GLSL_WIND}
      uniform float uSwayAmount;
      attribute vec2 aWind;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec2 vUv;
      varying float vDepth;

      void main() {
        float sway = clamp(aWind.x, 0.0, 1.0);
        vec3 p = position;
        vec2 gust = gustField(p.xz);
        float b = breath(aWind.y);
        float f = flutter(aWind.y) * 0.35;
        p.x += (gust.x * 0.55 + b * 0.42 + f * 0.15) * uSwayAmount * sway * sway;
        p.z += (gust.y * 0.55 + b * 0.30 + f * 0.15) * uSwayAmount * sway * sway;
        p.x += orbPush(p, 4.2).x * 0.22 * sway;
        p.z += orbPush(p, 4.2).y * 0.22 * sway;

        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vUv = uv;
        vColor = color;
        vNormal = normalize(mat3(modelMatrix) * normal);
        // cards sit at different depths; used to break up flat foliage masses
        vDepth = clamp(uv.y, 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_LIGHT}
      uniform sampler2D uTex;
      uniform float uTranslucency;
      uniform vec3 uTint;
      uniform float uDepthShade;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec2 vUv;
      varying float vDepth;

      layout(location = 0) out vec4 fragColor;

      void main() {
        vec4 texel = texture(uTex, vUv);
        if (texel.a < 0.42) discard;

        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 base = texel.rgb * vColor * uTint;

        vec3 col = toonStep(base, n);

        // thin-leaf translucency: light coming through from behind reads warm
        vec3 viewDir = normalize(vWorld - cameraPosition);
        float back = pow(max(dot(viewDir, uSun), 0.0), 2.2);
        vec3 through = base * vec3(1.35, 1.30, 0.82);
        col += through * back * uTranslucency;

        // keep the overlap between cards readable instead of muddy
        col *= mix(1.0 - uDepthShade, 1.0, vDepth);

        float dist = length(vWorld - cameraPosition);
        col = applyHaze(col, dist, 120.0, 340.0);
        fragColor = vec4(col, 1.0);
      }
    `,
    vertexColors: true,
    side: THREE.DoubleSide,
  })
}
