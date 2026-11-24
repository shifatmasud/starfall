import * as THREE from 'three'

/**
 * The eight chapters of The Fallen Star, and the one scroll value they are sampled with.
 *
 * One table, sampled once per frame into a preallocated object, so the sky dome, the clouds, the
 * god-rays, the fog, the water and the weather all read the same numbers (one clock, one value).
 *
 * Story: the star begins in space above Earth (1), falls into the morning sky (2), crosses the
 * wildflower hills (3), skims the meadow (4), passes through the forest canopy (5), comes out over
 * the reeds and the mist (6), touches the lake and holds the seam (7), and comes to rest on the
 * deep ocean floor (8).
 */

export type SkyState = {
  name: string
  zenith: string
  mid: string
  horizon: string
  sun: string
  haze: string
  land: string
  cloudLit: string
  cloudShade: string
  cloudRim: string
  sunDir: [number, number, number]
  sunPower: number
  /** haze thickness near the horizon (0..1) */
  mist: number
  rain: number
  snow: number
  /** the cloud-sea plane */
  sea: number
  /** crepuscular shafts in the dome */
  shaft: number
  /** Snell's window / surface brightness overhead (underwater) */
  window: number
  /** 0 = light sky (ink nav), 1 = dark sky (cream nav) */
  tone: number
  /** star field in the dome (1 above the atmosphere) */
  stars: number
  /** milky-way / nebula veil */
  nebula: number
  /** exponential aerial-perspective density for the world (1 = the morning's thick air) */
  fog: number
}

export const SKY_STATES: SkyState[] = [
  {
    // 01 · above the world — space, stars, Earth's atmosphere glowing along the limb
    name: 'above the world',
    zenith: '#04060d',
    mid: '#0a1730',
    horizon: '#2f5f86',
    sun: '#ffe6b4',
    haze: '#8fb6d8',
    land: '#0a1622',
    cloudLit: '#f3e6cf',
    cloudShade: '#5b718b',
    cloudRim: '#ffe9c4',
    sunDir: [-0.58, 0.26, -0.77],
    sunPower: 1.25,
    mist: 0.14,
    rain: 0,
    snow: 0,
    sea: 1,
    shaft: 1.1,
    window: 0,
    tone: 1,
    stars: 1,
    nebula: 1,
    fog: 0.25,
  },
  {
    // 02 · falling into the morning sky — golden hour, cloud tops lit from the right
    name: 'morning sky',
    zenith: '#4d7bab',
    mid: '#a5c0d2',
    horizon: '#fbdfb2',
    sun: '#ffe9c2',
    haze: '#f6dcb8',
    land: '#b9b7a6',
    cloudLit: '#fff4e2',
    cloudShade: '#c9b3ab',
    cloudRim: '#ffeecb',
    sunDir: [0.42, 0.28, -0.86],
    sunPower: 1.15,
    mist: 0.58,
    rain: 0,
    snow: 0,
    sea: 0.92,
    shaft: 0.85,
    window: 0,
    tone: 0,
    stars: 0.2,
    nebula: 0.18,
    fog: 1.0,
  },
  {
    // 03 · the forest canopy — sun through leaves, green shade, warm shafts
    name: 'the canopy',
    zenith: '#9db28f',
    mid: '#cfd2ad',
    horizon: '#f7e9c4',
    sun: '#fff2ce',
    haze: '#e6dcbc',
    land: '#46583a',
    cloudLit: '#fff4dc',
    cloudShade: '#b9b6a4',
    cloudRim: '#ffe9bc',
    sunDir: [0.36, 0.6, -0.72],
    sunPower: 0.9,
    mist: 0.2,
    rain: 0,
    snow: 0,
    sea: 0.1,
    shaft: 0.95,
    window: 0,
    tone: 1,
    stars: 0,
    nebula: 0,
    fog: 0.9,
  },
  {
    // 04 · the lake in the meadow — a calm bright morning, wildflowers lit from the side
    name: 'the lake',
    zenith: '#4f86c0',
    mid: '#a9cbdb',
    horizon: '#eef0df',
    sun: '#fff7e0',
    sunPower: 1.1,
    haze: '#e6ecdf',
    land: '#b2c4ab',
    cloudLit: '#ffffff',
    cloudShade: '#c9cdd6',
    cloudRim: '#fffbee',
    sunDir: [0.45, 0.42, -0.79],
    mist: 0.36,
    rain: 0,
    snow: 0,
    sea: 0.4,
    shaft: 0.7,
    window: 0,
    tone: 0,
    stars: 0,
    nebula: 0,
    fog: 0.9,
  },
  {
    // 05 · the desert oasis — hot bright morning over warm dunes and a turquoise pond
    name: 'the desert',
    zenith: '#4a86c8',
    mid: '#bdd3da',
    horizon: '#f7e0b2',
    sun: '#fff3d2',
    haze: '#efd8b4',
    land: '#c9a874',
    cloudLit: '#fff6e6',
    cloudShade: '#cdbfae',
    cloudRim: '#fff0d2',
    sunDir: [0.52, 0.55, -0.66],
    sunPower: 1.2,
    mist: 0.26,
    rain: 0,
    snow: 0,
    sea: 0.16,
    shaft: 0.62,
    window: 0,
    tone: 0,
    stars: 0,
    nebula: 0,
    fog: 0.9,
  },
  {
    // 06 · the Icelandic pond — a cool overcast morning, mist on black stone
    name: 'the ice',
    zenith: '#8fb4cf',
    mid: '#d2e2e8',
    horizon: '#fae4bd',
    sun: '#fff0c8',
    haze: '#eae4d4',
    land: '#dfe8ec',
    cloudLit: '#fdf7ec',
    cloudShade: '#b6c6cd',
    cloudRim: '#fff1d4',
    sunDir: [0.42, 0.36, -0.83],
    sunPower: 1.05,
    mist: 0.62,
    rain: 0,
    snow: 0,
    sea: 0.12,
    shaft: 0.24,
    window: 0,
    tone: 0,
    stars: 0,
    nebula: 0,
    fog: 1.0,
  },
  {
    // 07 · the open sea — a high bright morning, turquoise water, icebergs, palms
    name: 'the open sea',
    zenith: '#3f7cbb',
    mid: '#9cc6dc',
    horizon: '#eaf2ee',
    sun: '#fff8e6',
    haze: '#dce9e6',
    land: '#9fb3a8',
    cloudLit: '#ffffff',
    cloudShade: '#c4cfd8',
    cloudRim: '#fffdf2',
    sunDir: [0.3, 0.62, -0.72],
    sunPower: 1.2,
    mist: 0.28,
    rain: 0,
    snow: 0,
    sea: 0.2,
    shaft: 0.6,
    window: 0,
    tone: 0,
    stars: 0,
    nebula: 0,
    fog: 0.85,
  },
  {
    // 08 · under the deep sea — the star at rest on the ocean floor
    name: 'the deep',
    zenith: '#3b8792',
    mid: '#12525e',
    horizon: '#0a2a32',
    sun: '#eafbf4',
    haze: '#1b5560',
    land: '#07222a',
    cloudLit: '#63aeb4',
    cloudShade: '#0c3a45',
    cloudRim: '#a8e3dc',
    sunDir: [0.04, 1, -0.1],
    sunPower: 1.0,
    mist: 0.2,
    rain: 0,
    snow: 1,
    sea: 0,
    shaft: 0.9,
    window: 1,
    tone: 1,
    stars: 0,
    nebula: 0,
    fog: 1.0,
  },
]

export type Atmosphere = {
  zenith: THREE.Color
  mid: THREE.Color
  horizon: THREE.Color
  sun: THREE.Color
  haze: THREE.Color
  land: THREE.Color
  cloudLit: THREE.Color
  cloudShade: THREE.Color
  cloudRim: THREE.Color
  sunDir: THREE.Vector3
  sunPower: number
  mist: number
  rain: number
  snow: number
  sea: number
  shaft: number
  window: number
  tone: number
  stars: number
  nebula: number
  fog: number
  /** the sky's own brightness, for the nav tone switch */
  luma: number
  name: string
}

const scratch = new THREE.Color()

export function createAtmosphere(): Atmosphere {
  const first = SKY_STATES[0]
  return {
    zenith: new THREE.Color(first.zenith),
    mid: new THREE.Color(first.mid),
    horizon: new THREE.Color(first.horizon),
    sun: new THREE.Color(first.sun),
    haze: new THREE.Color(first.haze),
    land: new THREE.Color(first.land),
    cloudLit: new THREE.Color(first.cloudLit),
    cloudShade: new THREE.Color(first.cloudShade),
    cloudRim: new THREE.Color(first.cloudRim),
    sunDir: new THREE.Vector3(...first.sunDir),
    sunPower: first.sunPower,
    mist: first.mist,
    rain: first.rain,
    snow: first.snow,
    sea: first.sea,
    shaft: first.shaft,
    window: first.window,
    tone: first.tone,
    stars: first.stars,
    nebula: first.nebula,
    fog: first.fog,
    luma: 0.5,
    name: first.name,
  }
}

const mix = (a: number, b: number, f: number) => a + (b - a) * f
const smooth = (f: number) => f * f * (3 - 2 * f)

/** One shared sample of the current weather, rewritten every frame by whichever layer runs first. */
export const atmosphere: Atmosphere = createAtmosphere()

/** u: 0 → 7 across the eight chapters. */
export function sampleAtmosphere(u: number, out: Atmosphere = atmosphere) {
  const clamped = Math.min(SKY_STATES.length - 1, Math.max(0, u))
  const i = Math.min(SKY_STATES.length - 2, Math.floor(clamped))
  const f = smooth(Math.min(1, Math.max(0, clamped - i)))
  const a = SKY_STATES[i]
  const b = SKY_STATES[i + 1]

  const lerp = (key: 'zenith' | 'mid' | 'horizon' | 'sun' | 'haze' | 'land' | 'cloudLit' | 'cloudShade' | 'cloudRim') => {
    scratch.set(a[key])
    out[key].copy(scratch).lerp(scratch.set(b[key]), f)
  }
  lerp('zenith')
  lerp('mid')
  lerp('horizon')
  lerp('sun')
  lerp('haze')
  lerp('land')
  lerp('cloudLit')
  lerp('cloudShade')
  lerp('cloudRim')

  out.sunDir.set(
    mix(a.sunDir[0], b.sunDir[0], f),
    mix(a.sunDir[1], b.sunDir[1], f),
    mix(a.sunDir[2], b.sunDir[2], f),
  ).normalize()

  out.sunPower = mix(a.sunPower, b.sunPower, f)
  out.mist = mix(a.mist, b.mist, f)
  out.rain = mix(a.rain, b.rain, f)
  out.snow = mix(a.snow, b.snow, f)
  out.sea = mix(a.sea, b.sea, f)
  out.shaft = mix(a.shaft, b.shaft, f)
  out.window = mix(a.window, b.window, f)
  out.tone = mix(a.tone, b.tone, f)
  out.stars = mix(a.stars, b.stars, f)
  out.nebula = mix(a.nebula, b.nebula, f)
  out.fog = mix(a.fog, b.fog, f)
  out.name = f < 0.5 ? a.name : b.name
  out.luma = 0.2126 * out.horizon.r + 0.7152 * out.horizon.g + 0.0722 * out.horizon.b
}

/**
 * The scene clock: the camera spline is the only writer, every other layer reads.
 * Keeping it out of React avoids a re-render per scroll frame.
 */
export const journey = {
  /** 0 → 7 across the eight chapters */
  u: 0,
  /** 0 → 1 document scroll */
  p: 0,
  beat: 0,
  time: 0,
  /** the pointer in -1..1, mirrored for layers that want parallax */
  px: 0,
  py: 0,
}
