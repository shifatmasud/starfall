/**
 * The eight chapters of Starfall, as light and colour rather than geometry.
 *
 * Every value here was sampled from the reference sheet: vivid, high-chroma skies, hard sun,
 * strong rim light, deep shadow. The look is stylized-PBR — real forms, real shadows, saturated
 * colour — not the flat painted register the first build used.
 *
 * One table, interpolated once per frame, so sky, fog, sun, water and the orb all agree.
 */

export type ChapterPalette = {
  id: string
  /** three-stop sky gradient, bottom to top */
  horizon: string
  mid: string
  zenith: string
  /** the sun / key light */
  sun: string
  sunDir: [number, number, number]
  sunPower: number
  /** sky bounce, the shadow fill */
  ambient: string
  ambientPower: number
  /** aerial perspective */
  fog: string
  fogDensity: number
  /** ground plane */
  ground: string
  groundAlt: string
  /** 0 = no water in this chapter's bowl */
  water: string | null
  waterDeep: string | null
  /** star field */
  stars: number
  /** 0 = palette gradient sky, 1 = the photographed CC0 sky (clouds and all) */
  skyMix: number
  /** the orb's resting place for this chapter, relative to the diorama centre */
  orb: [number, number, number]
  /** how big the pearl is here, in world units of radius; the forest wants a marble you could pick
   *  up, space wants a moon. Defaults to 3.1. */
  orbScale?: number
  /** camera key: where the lens sits, and what it is looking at */
  cam: { pos: [number, number, number]; look: [number, number, number]; fov: number }
  /** what is planted here */
  props: {
    pines?: number
    birches?: number
    rocks?: number
    palms?: number
    kelp?: number
    icebergs?: number
    flowers?: number
    ruins?: boolean
    castle?: boolean
    far?: number
  }
  /** the orb streaks through this chapter rather than sitting in it */
  streak: boolean
}

const SPACE: ChapterPalette = {
  id: 'space',
  horizon: '#3f7ac8',
  mid: '#123a86',
  zenith: '#030510',
  sun: '#fff1cf',
  sunDir: [-0.6, 0.35, -0.5],
  sunPower: 1.5,
  ambient: '#4d7ec8',
  ambientPower: 0.55,
  fog: '#12356e',
  fogDensity: 0.0009,
  ground: '#2f6ab0',
  groundAlt: '#5f9ad8',
  water: null,
  waterDeep: null,
  stars: 1,
  skyMix: 0,
  orb: [-7, 15, -24],
  cam: { pos: [0, 14, 34], look: [6, -18, -120], fov: 46 },
  props: { rocks: 6 },
  streak: false,
}

const SKY: ChapterPalette = {
  id: 'sky',
  horizon: '#dff1ff',
  mid: '#8cc9f2',
  zenith: '#2e7fd4',
  sun: '#fff6e0',
  sunDir: [0.35, 0.55, -0.75],
  sunPower: 2.1,
  ambient: '#bcdcff',
  ambientPower: 0.7,
  fog: '#d8ecff',
  fogDensity: 0.00085,
  ground: '#8fb4c8',
  groundAlt: '#c8dcea',
  water: null,
  waterDeep: null,
  stars: 0,
  skyMix: 0.4,
  orb: [2, 12, -30],
  cam: { pos: [0, 13, 26], look: [6, 8, -80], fov: 48 },
  props: { castle: true, far: 4 },
  streak: true,
}

const FOREST: ChapterPalette = {
  id: 'forest',
  horizon: '#e6f3ee',
  mid: '#9ed2b8',
  zenith: '#3f7fae',
  sun: '#fff8e8',
  // raking, not overhead: a near-zenith sun is stopped dead by the canopy, which is what left the
  // floor lit by ambient only and the whole chapter reading murky green
  sunDir: [0.36, 0.66, -0.44],
  sunPower: 6.2,
  ambient: '#e8f6d8',
  ambientPower: 3.2,
  fog: '#d3e6c9',
  fogDensity: 0.007,
  ground: '#5d7c45',
  groundAlt: '#c9c0a3',
  water: null,
  waterDeep: null,
  stars: 0,
  skyMix: 0,
  orb: [2.2, 1.5, -7],
  orbScale: 1.6,
  cam: { pos: [-1.2, 1.7, 14], look: [1.2, 1.45, -30], fov: 56 },
  props: { pines: 44, birches: 18, rocks: 22, flowers: 220, ruins: true, far: 4 },
  streak: false,
}

const LAKE: ChapterPalette = {
  id: 'lake',
  horizon: '#eaf7ff',
  mid: '#8fc9ef',
  zenith: '#3a86d8',
  sun: '#fff8e2',
  sunDir: [0.46, 0.62, 0.56],
  sunPower: 3.2,
  ambient: '#c6e2f4',
  ambientPower: 1.15,
  fog: '#dcefff',
  fogDensity: 0.001,
  ground: '#4f8f3c',
  groundAlt: '#84c45c',
  water: '#2f86a8',
  waterDeep: '#0f4a6a',
  stars: 0,
  skyMix: 0.92,
  orb: [9, 6.5, -46],
  cam: { pos: [0, 4.3, 20], look: [0, 13.5, -90], fov: 48 },
  props: { birches: 14, pines: 10, rocks: 18, flowers: 320, castle: true, far: 4 },
  streak: true,
}

const DESERT: ChapterPalette = {
  id: 'desert',
  horizon: '#f6e7c4',
  mid: '#9fd0e8',
  zenith: '#3f93d8',
  sun: '#fff3d0',
  sunDir: [0.55, 0.52, -0.62],
  sunPower: 2.5,
  ambient: '#e0c9a0',
  ambientPower: 0.7,
  fog: '#f0dcb4',
  fogDensity: 0.0016,
  ground: '#e0b878',
  groundAlt: '#c99a5c',
  water: '#3fb2c4',
  waterDeep: '#1a6f88',
  stars: 0,
  skyMix: 0.45,
  orb: [0, 4.6, -22],
  cam: { pos: [-2, 4, 18], look: [0, 4, -34], fov: 48 },
  props: { palms: 20, rocks: 24, ruins: true, far: 4 },
  streak: true,
}

const ICE: ChapterPalette = {
  id: 'ice',
  horizon: '#e8f6ff',
  mid: '#9ad4f2',
  zenith: '#4a9fe0',
  sun: '#ffffff',
  sunDir: [0.3, 0.42, -0.85],
  sunPower: 2.2,
  ambient: '#cfeaff',
  ambientPower: 0.8,
  fog: '#e2f2ff',
  fogDensity: 0.0015,
  ground: '#1f6f9e',
  groundAlt: '#3f9ac4',
  water: '#14618f',
  waterDeep: '#08334f',
  stars: 0,
  skyMix: 0.55,
  orb: [0, 4.6, -22],
  cam: { pos: [0, 3.2, 18], look: [0, 3.2, -34], fov: 50 },
  props: { icebergs: 24, rocks: 12, far: 4 },
  streak: true,
}

const SEA: ChapterPalette = {
  id: 'sea',
  horizon: '#eafaff',
  mid: '#8fd8f0',
  zenith: '#2196d8',
  sun: '#fffbe8',
  sunDir: [0.25, 0.62, -0.74],
  sunPower: 2.2,
  ambient: '#a8e8f8',
  ambientPower: 0.75,
  fog: '#d6f2ff',
  fogDensity: 0.0011,
  ground: '#1a7fa8',
  groundAlt: '#2fa8c8',
  water: '#12a8c8',
  waterDeep: '#0a5578',
  stars: 0,
  skyMix: 0.8,
  orb: [0, 4.6, -22],
  cam: { pos: [0, 2.6, 16], look: [0, 3.4, -34], fov: 50 },
  props: { palms: 6, icebergs: 12, rocks: 10, far: 4 },
  streak: true,
}

const DEEP: ChapterPalette = {
  id: 'deep',
  horizon: '#1a5f9a',
  mid: '#0f4a86',
  zenith: '#03203f',
  sun: '#dff6ff',
  sunDir: [0.1, 0.9, -0.2],
  sunPower: 1.0,
  ambient: '#2f8fb8',
  ambientPower: 0.6,
  fog: '#0c3f70',
  fogDensity: 0.013,
  ground: '#123f63',
  groundAlt: '#1d5a80',
  water: null,
  waterDeep: null,
  stars: 0,
  skyMix: 0,
  orb: [0, 2.4, -14],
  cam: { pos: [0, 2.6, 14], look: [0, 3.2, -26], fov: 50 },
  props: { rocks: 30, kelp: 40 },
  streak: false,
}

export const CHAPTERS: ChapterPalette[] = [SPACE, SKY, FOREST, LAKE, DESERT, ICE, SEA, DEEP]

/** The diorama centre of chapter i, in world space. */
export const chapterZ = (i: number) => -i * 185

export type Live = {
  horizon: [number, number, number]
  mid: [number, number, number]
  zenith: [number, number, number]
  sun: [number, number, number]
  ambient: [number, number, number]
  fog: [number, number, number]
  sunDir: [number, number, number]
  sunPower: number
  ambientPower: number
  fogDensity: number
  stars: number
  skyMix: number
  orbScale: number
}

const hex = (value: string): [number, number, number] => {
  const n = parseInt(value.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const mix3 = (a: [number, number, number], b: [number, number, number], f: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
  a[2] + (b[2] - a[2]) * f,
]

const smooth = (f: number) => f * f * (3 - 2 * f)

export const live: Live = {
  horizon: hex(SPACE.horizon),
  mid: hex(SPACE.mid),
  zenith: hex(SPACE.zenith),
  sun: hex(SPACE.sun),
  ambient: hex(SPACE.ambient),
  fog: hex(SPACE.fog),
  sunDir: [...SPACE.sunDir],
  sunPower: SPACE.sunPower,
  ambientPower: SPACE.ambientPower,
  fogDensity: SPACE.fogDensity,
  stars: SPACE.stars,
  skyMix: SPACE.skyMix,
  orbScale: SPACE.orbScale ?? 3.1,
}

/** Sample the table at u = 0..7 into the shared `live` record. */
export function sampleLive(u: number) {
  const clamp = Math.min(CHAPTERS.length - 1, Math.max(0, u))
  const i = Math.min(CHAPTERS.length - 2, Math.floor(clamp))
  const f = smooth(Math.min(1, Math.max(0, clamp - i)))
  if (u >= CHAPTERS.length - 1) {
    const last = CHAPTERS[CHAPTERS.length - 1]
    live.horizon = hex(last.horizon)
    live.mid = hex(last.mid)
    live.zenith = hex(last.zenith)
    live.sun = hex(last.sun)
    live.ambient = hex(last.ambient)
    live.fog = hex(last.fog)
    live.sunDir = [...last.sunDir]
    live.sunPower = last.sunPower
    live.ambientPower = last.ambientPower
    live.fogDensity = last.fogDensity
    live.stars = last.stars
    live.skyMix = last.skyMix
    live.orbScale = last.orbScale ?? 3.1
    return
  }
  const a = CHAPTERS[i]
  const b = CHAPTERS[i + 1]
  live.horizon = mix3(hex(a.horizon), hex(b.horizon), f)
  live.mid = mix3(hex(a.mid), hex(b.mid), f)
  live.zenith = mix3(hex(a.zenith), hex(b.zenith), f)
  live.sun = mix3(hex(a.sun), hex(b.sun), f)
  live.ambient = mix3(hex(a.ambient), hex(b.ambient), f)
  live.fog = mix3(hex(a.fog), hex(b.fog), f)
  live.sunDir = [
    a.sunDir[0] + (b.sunDir[0] - a.sunDir[0]) * f,
    a.sunDir[1] + (b.sunDir[1] - a.sunDir[1]) * f,
    a.sunDir[2] + (b.sunDir[2] - a.sunDir[2]) * f,
  ]
  live.sunPower = a.sunPower + (b.sunPower - a.sunPower) * f
  live.ambientPower = a.ambientPower + (b.ambientPower - a.ambientPower) * f
  live.fogDensity = a.fogDensity + (b.fogDensity - a.fogDensity) * f
  live.stars = a.stars + (b.stars - a.stars) * f
  live.skyMix = a.skyMix + (b.skyMix - a.skyMix) * f
  live.orbScale = (a.orbScale ?? 3.1) + ((b.orbScale ?? 3.1) - (a.orbScale ?? 3.1)) * f
}
