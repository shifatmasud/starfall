/**
 * The forest register: Scots pine, silver birch, English oak, weeping willow and
 * hazel understorey.
 *
 * No cones, no icospheres. Each trunk is a tapered tube along a curved spine;
 * each crown is a set of alpha-tested cards cut from real photographic foliage
 * (CC0, from shade-verse) arranged as needle shelves, leaf sprays or a hanging
 * curtain. Everything of one species lands in two merged meshes (wood + foliage),
 * so the whole forest costs about a dozen draw calls.
 *
 * Where things grow follows the shot: pines close the far bank and the valley
 * walls, birches stand at the meadow's edge, oaks sit on the ridge, and the
 * willows are placed by hand where their strands can reach the pool in front of
 * the lens.
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import {
  ATLAS,
  Geo,
  GLSL_LIGHT,
  GLSL_WIND,
  PALETTE,
  atlasRect,
  color,
  createBarkMaterial,
  createFoliageMaterial,
  mulberry32,
  range,
  type Tier,
  type WorldUniforms,
} from './shared'
import { sampleTerrain } from './Terrain'
import { forestFloor, scatter, type Box, type KeepFn, type Spot } from './planting'

const S = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const P = (key: keyof typeof PALETTE) => color(PALETTE[key])
const UP = new THREE.Vector3(0, 1, 0)

const RECTS = {
  pine: atlasRect(ATLAS.pineTwig),
  leafA: atlasRect(ATLAS.leafA),
  leafB: atlasRect(ATLAS.leafB),
  leafC: atlasRect(ATLAS.leafC),
  leafD: atlasRect(ATLAS.leafD),
  leafE: atlasRect(ATLAS.leafE),
  leafF: atlasRect(ATLAS.leafF),
  leafG: atlasRect(ATLAS.leafG),
  shrubA: atlasRect(ATLAS.shrubA),
  shrubB: atlasRect(ATLAS.shrubB),
  shrubBig: atlasRect(ATLAS.shrubBig),
} as const

/** The far bank and the valley walls — the forest that closes the view. */
const PINE_GROUND: Box[] = [
  // the clearing's corridor: a wall of tall pines left and right of the star
  { x: [-52, -11], z: [-40, 70], weight: 4.2 },
  { x: [11, 52], z: [-40, 70], weight: 4.2 },
  // the wooded sides of the meadow
  { x: [-120, -46], z: [-16, 60], weight: 1.4 },
  { x: [46, 120], z: [-16, 60], weight: 1.4 },
  // the ridge behind the forest
  { x: [-90, 90], z: [88, 130], weight: 1.2 },
]

const BIRCH_GROUND: Box[] = [
  // silver birches stand at the corridor's edge, closest to the lens
  { x: [-24, -11], z: [-36, 56], weight: 3.0 },
  { x: [11, 24], z: [-36, 56], weight: 3.0 },
  { x: [30, 52], z: [10, 44], weight: 1 },
  { x: [-52, -30], z: [10, 44], weight: 1 },
]

const OAK_GROUND: Box[] = [
  { x: [-110, -30], z: [6, 80], weight: 1.8 },
  { x: [30, 110], z: [6, 80], weight: 1.8 },
  { x: [-72, 72], z: [80, 120], weight: 1.4 },
]

const HAZEL_GROUND: Box[] = [
  { x: [12, 44], z: [18, 76], weight: 2.4 },
  { x: [-44, -12], z: [18, 76], weight: 2.4 },
  { x: [-46, 46], z: [-18, -10], weight: 1.4 },
  { x: [-80, 80], z: [40, 90], weight: 1.2 },
]

/** Willows are hand-placed: each one has to reach the water from the bank. */
const WILLOW_SPOTS: Array<[number, number]> = [
  [-13.5, -18.5],
  [-2.5, -19.6],
  [11.5, -18.8],
  [-17, 2.5],
  [18, -2.5],
]

/* ------------------------------- helpers -------------------------------- */

/** Curved trunk spine: `t` runs 0 at the root to 1 at the tip. */
function spine(base: THREE.Vector3, height: number, leanX: number, leanZ: number, bend: number, seed: number, rings = 9): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1)
    const w = Math.pow(t, 1.45)
    pts.push(
      S(
        base.x + leanX * w + Math.sin(t * 2.3 + seed) * bend * t,
        base.y + height * t,
        base.z + leanZ * w + Math.cos(t * 1.9 + seed * 1.7) * bend * t * 0.8,
      ),
    )
  }
  return pts
}

type TreeCtx = { rnd: () => number }

/* -------------------------------- pine ---------------------------------- */

function buildPines(ctx: TreeCtx, spots: Spot[]): { wood: Geo; needles: Geo } {
  const wood = new Geo()
  const needles = new Geo()
  const rnd = ctx.rnd

  for (const spot of spots) {
    const h = range(rnd, 10, 22)
    const r0 = range(rnd, 0.28, 0.62)
    const seed = rnd() * 6.28
    const points = spine(
      S(spot.x, spot.y - 0.15, spot.z),
      h,
      range(rnd, -1.2, 1.2),
      range(rnd, -1.2, 1.2),
      range(rnd, 0.5, 1.5),
      seed,
    )

    // three bark bands: grey fissured base → the orange upper trunk → dull crown bark
    const grey = P('pineBarkLow')
    const orange = P('pineBarkOrange')
    const high = P('pineBarkHigh')
    wood.windFor(0, seed)
    wood.tube({
      points,
      radii: points.map((_, i) => {
        const t = i / (points.length - 1)
        return r0 * Math.pow(1 - t, 1.35) + 0.05
      }),
      radial: 8,
      colorAt: (ring) => {
        const t = ring / (points.length - 1)
        if (t < 0.34) return grey.clone().lerp(orange, (t / 0.34) * 0.5)
        if (t < 0.52) return orange.clone().lerp(high, (t - 0.34) / 0.18)
        return high
      },
      sway: (t) => t * t * 0.3,
    })

    // needle shelves: flat twig plates at different heights (a pagoda, not a cone)
    const crownBase = 0.34
    const crownR = range(rnd, 4.6, 7.2)
    const shelves = 6 + Math.floor(rnd() * 2)
    for (let s = 0; s < shelves; s++) {
      const t = crownBase + (s / (shelves - 1)) * (0.99 - crownBase)
      const idx = Math.min(points.length - 1, Math.round(t * (points.length - 1)))
      const centre = points[idx]
      const curve = Math.min(1, Math.max(0.06, (t - crownBase + 0.1) / (1 - crownBase)))
      const spread = crownR * Math.sin(Math.PI * Math.pow(curve, 0.72))
      const twigs = 22 + Math.floor(rnd() * 8)
      for (let i = 0; i < twigs; i++) {
        const a = (i / twigs) * Math.PI * 2 + s * 1.1 + rnd() * 0.35
        const outward = S(Math.cos(a), 0, Math.sin(a))
        const tangent = new THREE.Vector3().crossVectors(UP, outward).normalize()
        const len = spread * range(rnd, 0.85, 1.35)
        // a twig stands at 45–70° so the crown has volume from every angle,
        // not just from above (a flat shelf disappears when seen edge-on)
        const tilt = range(rnd, -0.35, 0.75)
        const up = outward.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(UP, Math.sin(tilt)).normalize()
        const side = tangent.clone().applyAxisAngle(outward, range(rnd, -0.5, 0.5))
        needles.windFor(0.85 + t * 0.15, seed + i * 0.7)
        needles.leaf({
          centre: centre
            .clone()
            .addScaledVector(outward, len * 0.42)
            .add(S(0, range(rnd, -1.6, 1.8) + 0.05, 0)),
          right: side,
          up,
          width: len * 1.18,
          height: len * 0.86,
          rect: RECTS.pine,
          top: color('#D6DFC0'),
          bottom: color('#93A07F'),
        })
      }
    }
    // leader tuft
    needles.windFor(1, seed)
    const top = points[points.length - 1]
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      const outward = S(Math.cos(a), 0, Math.sin(a))
      needles.leaf({
        centre: top.clone().addScaledVector(outward, 0.35).add(S(0, 0.15, 0)),
        right: new THREE.Vector3().crossVectors(UP, outward).normalize(),
        up: outward.clone().multiplyScalar(0.7).addScaledVector(UP, 0.7).normalize(),
        width: 0.8,
        height: 1.2,
        rect: RECTS.pine,
        top: color('#C6CFAF'),
        bottom: color('#8B977C'),
      })
    }
  }
  return { wood, needles }
}

/* -------------------------------- birch ---------------------------------- */

function buildBirches(ctx: TreeCtx, spots: Spot[]): { wood: Geo; leaves: Geo } {
  const wood = new Geo()
  const leaves = new Geo()
  const rnd = ctx.rnd

  for (const spot of spots) {
    const h = range(rnd, 10, 15)
    const seed = rnd() * 6.28
    const base = S(spot.x, spot.y - 0.12, spot.z)
    const main = spine(base, h, range(rnd, -1.2, 1.2), range(rnd, -1.2, 1.2), range(rnd, 0.6, 1.6), seed)
    wood.windFor(0, seed)
    wood.tube({
      points: main,
      radii: main.map((_, i) => 0.2 * Math.pow(1 - i / (main.length - 1), 1.1) + 0.03),
      radial: 9,
      colorAt: (ring) => {
        const t = ring / (main.length - 1)
        return P('birchBark').clone().multiplyScalar(t < 0.18 ? 0.82 : 1)
      },
      sway: (t) => t * t * 0.55,
    })

    // one fork, so the crown is not a single pole
    const forkT = 0.55
    const forkBase = main[Math.round(forkT * (main.length - 1))]
    const fork = spine(forkBase, h * 0.42, range(rnd, 1.2, 2.4) * (rnd() < 0.5 ? -1 : 1), range(rnd, -1.4, 1.4), 0.7, seed + 2)
    wood.tube({
      points: fork,
      radii: fork.map((_, i) => 0.1 * Math.pow(1 - i / (fork.length - 1), 1.2) + 0.02),
      radial: 7,
      colorAt: () => P('birchBark').clone().multiplyScalar(0.95),
      sway: (t) => 0.4 + t * t * 0.5,
    })

    // canopy: drooping sprays of individual leaves, read as a haze not a mass
    const crownCentre = main[Math.round(0.82 * (main.length - 1))]
    const sprays = 18
    for (let sb = 0; sb < sprays; sb++) {
      const a = (sb / sprays) * Math.PI * 2 + rnd() * 0.6
      const outward = S(Math.cos(a), 0, Math.sin(a))
      const reach = range(rnd, 1.0, 2.6)
      const anchor = crownCentre.clone().addScaledVector(outward, reach * 0.5).add(S(0, range(rnd, -0.6, 0.9), 0))
      const leafCount = 9
      for (let l = 0; l < leafCount; l++) {
        const t = l / (leafCount - 1)
        const drift = outward.clone().multiplyScalar(reach * (0.35 + t * 0.7))
        const droop = -t * range(rnd, 0.7, 1.3)
        const leafCentre = anchor.clone().add(drift).add(S(0, droop, 0)).addScaledVector(outward, range(rnd, -0.2, 0.2))
        const size = range(rnd, 0.42, 0.72)
        const yaw = a + range(rnd, -0.9, 0.9)
        leaves.windFor(0.55 + t * 0.4, seed + sb * 0.9 + l)
        leaves.leaf({
          centre: leafCentre,
          right: S(Math.cos(yaw + Math.PI / 2), 0, Math.sin(yaw + Math.PI / 2)),
          up: S(Math.cos(yaw), -0.45, Math.sin(yaw)).normalize(),
          width: size * 1.05,
          height: size * 2.15,
          rect: l % 2 === 0 ? RECTS.leafA : RECTS.leafC,
          top: color('#D3E0AE'),
          bottom: color('#93A87A'),
        })
      }
      // the thin twig the leaves hang from
      leaves.windFor(0.5, seed + sb)
      leaves.ribbon({
        points: [
          crownCentre,
          anchor.clone().add(S(0, 0.1, 0)),
          anchor.clone().add(outward.clone().multiplyScalar(reach * 0.5)).add(S(0, -0.9, 0)),
        ],
        widths: [0.02, 0.014, 0.006],
        sides: [S(-Math.sin(a), 0, Math.cos(a)), S(-Math.sin(a), 0, Math.cos(a)), S(-Math.sin(a), 0, Math.cos(a))],
        colors: [P('birchBarkShade'), P('birchBarkShade'), P('birchBarkShade')],
      })
    }
  }
  return { wood, leaves }
}

/* --------------------------------- oak ----------------------------------- */

function buildOaks(ctx: TreeCtx, spots: Spot[]): { wood: Geo; leaves: Geo } {
  const wood = new Geo()
  const leaves = new Geo()
  const rnd = ctx.rnd

  for (const spot of spots) {
    const h = range(rnd, 17, 26)
    const seed = rnd() * 6.28
    const base = S(spot.x, spot.y - 0.2, spot.z)
    const points = spine(base, h * 0.62, range(rnd, -1.8, 1.8), range(rnd, -1.8, 1.8), range(rnd, 0.8, 1.9), seed)
    wood.windFor(0, seed)
    wood.tube({
      points,
      radii: points.map((_, i) => 0.6 * Math.pow(1 - i / (points.length - 1), 1.2) + 0.18),
      radial: 8,
      colorAt: () => P('oakBark'),
      sway: (t) => t * t * 0.22,
    })

    // broad, wider-than-tall crown built from leaf cards in a flattened ellipsoid
    const crown = points[points.length - 1]
    const spreadX = range(rnd, 8, 11)
    const spreadY = range(rnd, 5, 7)
    // clusters of real leaves, not one giant leaf: an oak crown is a mass of
    // 10 cm leaves, and at 40 m that reads as weight rather than a sticker
    const clusters = 44
    for (let i = 0; i < clusters; i++) {
      const a = rnd() * Math.PI * 2
      const rr = Math.pow(rnd(), 0.55)
      const cx = crown.x + Math.cos(a) * spreadX * rr
      const cz = crown.z + Math.sin(a) * spreadX * rr * 0.85
      const cy = crown.y + range(rnd, -0.5, 1) * spreadY + 0.5
      const leavesInCluster = 6
      for (let k = 0; k < leavesInCluster; k++) {
        const la = rnd() * Math.PI * 2
        const lr = Math.pow(rnd(), 0.6) * 1.25
        const yaw = la + range(rnd, -0.4, 0.4)
        const size = range(rnd, 0.72, 1.15)
        leaves.windFor(0.3, seed + i + k)
        leaves.leaf({
          centre: S(cx + Math.cos(la) * lr, cy + range(rnd, -0.5, 0.6), cz + Math.sin(la) * lr),
          right: S(Math.cos(yaw), 0, Math.sin(yaw)),
          up: S(Math.cos(yaw + 1.5), 0.5, Math.sin(yaw + 1.5)).normalize(),
          width: size * 0.9,
          height: size,
          rect: k % 3 === 0 ? RECTS.shrubA : k % 3 === 1 ? RECTS.shrubB : RECTS.leafD,
          top: color('#A8B98F'),
          bottom: color('#7D8F6B'),
        })
      }
    }
    // three heavy limbs reaching into the crown
    for (let b = 0; b < 3; b++) {
      const a = (b / 3) * Math.PI * 2 + seed
      const limb = spine(
        points[Math.round(points.length * 0.62)],
        spreadY * 0.8,
        Math.cos(a) * spreadX * 0.6,
        Math.sin(a) * spreadX * 0.6,
        0.4,
        seed + b,
        4,
      )
      wood.tube({
        points: limb,
        radii: limb.map((_, i) => 0.26 * (1 - i / 3) + 0.06),
        radial: 6,
        colorAt: () => P('oakBark').clone().multiplyScalar(0.94),
        sway: (t) => 0.3 + t * 0.3,
      })
    }
  }
  return { wood, leaves }
}

/* -------------------------------- willow --------------------------------- */

function buildWillows(ctx: TreeCtx, spots: Array<[number, number]>): { wood: Geo; strands: Geo } {
  const wood = new Geo()
  const strands = new Geo()
  const rnd = ctx.rnd
  const level = -1.6

  for (const [sx, sz] of spots) {
    const groundY = sampleTerrain(sx, sz)
    if (groundY < level + 0.1) continue
    const seed = rnd() * 6.28
    const h = range(rnd, 9.5, 12.5)
    const base = S(sx, groundY - 0.1, sz)
    const main = spine(base, h * 0.42, 0.4, -0.3, 0.6, seed)
    wood.windFor(0, seed)
    wood.tube({
      points: main,
      radii: main.map((_, k) => 0.44 * Math.pow(1 - k / (main.length - 1), 1.2) + 0.16),
      radial: 8,
      colorAt: (_r, around) => (around > 0.6 && around < 0.85 ? P('willowBarkLit') : P('willowBark')),
      sway: (t) => t * t * 0.2,
    })
    const crown = main[main.length - 1]
    for (let b = 0; b < 4; b++) {
      const a = (b / 4) * Math.PI * 2 + 0.6
      const limb = spine(crown, h * 0.46, Math.cos(a) * 2.6, Math.sin(a) * 2.6, 0.9, seed + b, 4)
      wood.tube({
        points: limb,
        radii: limb.map((_, k) => 0.14 * (1 - k / 3) + 0.04),
        radial: 6,
        colorAt: () => P('willowBark'),
        sway: (t) => 0.3 + t * 0.4,
      })
    }

    // the crown itself: overlapping leaf cards in a flattened dome, so the willow is never a bare fork
    const crownLeaves = 210
    for (let i = 0; i < crownLeaves; i++) {
      const a = rnd() * Math.PI * 2
      const rr = Math.pow(rnd(), 0.55)
      const ring = 0.8 + rr * 4.6
      const lx = crown.x + Math.cos(a) * ring
      const lz = crown.z + Math.sin(a) * ring * 0.9
      const ly = crown.y + range(rnd, -1.6, 2.6) * (1.0 - rr * 0.35)
      const yaw = a + range(rnd, -1.1, 1.1)
      const size = range(rnd, 0.42, 0.8)
      strands.windFor(0.35 + rr * 0.4, seed + i)
      strands.leaf({
        centre: S(lx, ly, lz),
        right: S(Math.cos(yaw + Math.PI / 2), 0, Math.sin(yaw + Math.PI / 2)),
        up: S(Math.cos(yaw), -0.5, Math.sin(yaw)).normalize(),
        width: size * 1.05,
        height: size * 2.1,
        rect: i % 3 === 0 ? RECTS.leafF : i % 3 === 1 ? RECTS.leafA : RECTS.leafC,
        top: color('#C8D69C'),
        bottom: color('#8FA36F'),
      })
    }

    // the curtain: hanging strands, denser toward the outside, some reaching the water
    const strandCount = 84
    const lit = P('willowStrand')
    const dark = P('willowStrandShade')
    for (let s = 0; s < strandCount; s++) {
      const a = rnd() * Math.PI * 2
      const ring = 1.2 + Math.pow(rnd(), 0.45) * 4.8
      const ax = crown.x + Math.cos(a) * ring
      const az = crown.z + Math.sin(a) * ring
      const ay = crown.y + range(rnd, -1.5, 0.9)
      const len = Math.min(ay - level - 0.06, range(rnd, 4.5, 10))
      if (len < 1.2) continue
      const outward = S(Math.cos(a), 0, Math.sin(a))
      const side = S(-Math.sin(a), 0, Math.cos(a))
      const pts: THREE.Vector3[] = []
      for (let k = 0; k <= 4; k++) {
        const t = k / 4
        pts.push(
          S(ax + outward.x * len * 0.22 * Math.pow(t, 1.5), ay - len * t, az + outward.z * len * 0.22 * Math.pow(t, 1.5)),
        )
      }
      strands.ribbon({
        points: pts,
        widths: [0.1, 0.12, 0.105, 0.07, 0.022],
        sides: [side, side, side, side, side],
        colors: [lit, lit.clone().lerp(dark, 0.3), lit.clone().lerp(dark, 0.55), dark, dark],
        sway: (t) => 0.12 + t * t * 0.95,
      })
      // a leaf ladder along the strand so it is not a flat ribbon up close
      for (let k = 1; k < 4; k++) {
        const t = k / 4
        const p = pts[k]
        strands.windFor(0.2 + t * t * 0.9, seed + s + k)
        strands.leaf({
          centre: p.clone().addScaledVector(side, 0.035),
          right: side,
          up: outward.clone().multiplyScalar(0.5).add(S(0, 0.85, 0)).normalize(),
          width: 0.22,
          height: 0.42,
          rect: RECTS.leafF,
          top: color('#C4D39A'),
          bottom: color('#94A874'),
        })
      }
    }
  }
  return { wood, strands }
}

/* --------------------------------- hazel --------------------------------- */

function buildHazel(ctx: TreeCtx, spots: Spot[]): { wood: Geo; leaves: Geo } {
  const wood = new Geo()
  const leaves = new Geo()
  const rnd = ctx.rnd

  for (const spot of spots) {
    const seed = rnd() * 6.28
    const h = range(rnd, 3.4, 5.6)
    const base = S(spot.x, spot.y - 0.1, spot.z)
    // a dome of arcs: stems leave the ground at 30–45° and bend back down
    const arcs = 8
    for (let a = 0; a < arcs; a++) {
      const ang = (a / arcs) * Math.PI * 2 + seed + rnd() * 0.4
      const reach = range(rnd, 1.4, 3.0)
      const up = h * range(rnd, 0.55, 0.95)
      const pts: THREE.Vector3[] = []
      for (let k = 0; k <= 3; k++) {
        const t = k / 3
        pts.push(
          S(
            base.x + Math.cos(ang) * reach * Math.pow(t, 0.85),
            base.y + up * (t - 0.42 * t * t),
            base.z + Math.sin(ang) * reach * Math.pow(t, 0.85),
          ),
        )
      }
      wood.windFor(0.5, seed + a)
      wood.tube({
        points: pts,
        radii: [0.055, 0.04, 0.026, 0.012],
        radial: 5,
        colorAt: () => P('hazelWood'),
        sway: (t) => 0.2 + t * 0.8,
      })
      // leaf plates along the arc
      for (let k = 1; k <= 2; k++) {
        const t = k / 3
        const p = pts[k]
        const yaw = ang + range(rnd, -0.8, 0.8)
        leaves.windFor(0.35 + t * 0.5, seed + a * 3 + k)
        leaves.leaf({
          centre: p.clone().add(S(0, 0.05, 0)),
          right: S(Math.cos(yaw), 0, Math.sin(yaw)),
          up: S(Math.cos(yaw + 1.4), 0.35, Math.sin(yaw + 1.4)).normalize(),
          width: range(rnd, 0.34, 0.5),
          height: range(rnd, 0.44, 0.66),
          rect: k === 1 ? RECTS.shrubA : RECTS.leafD,
          top: P('hazelLeafLit'),
          bottom: P('hazelLeafShade'),
        })
      }
    }
  }
  return { wood, leaves }
}

/* ------------------------------ strand material --------------------------- */

/** Willow curtain: vertex colours, no texture, sway strongest at the tips. */
function createStrandMaterial(uniforms: WorldUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...uniforms },
    vertexShader: /* glsl */ `
      ${GLSL_WIND}
      attribute vec2 aWind;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;

      void main() {
        float sway = clamp(aWind.x, 0.0, 1.0);
        vec3 p = position;
        vec2 gust = gustField(p.xz);
        float b = breath(aWind.y);
        p.x += (gust.x * 0.5 + b * 0.5) * sway * 0.55;
        p.z += (gust.y * 0.5 + b * 0.45) * sway * 0.55;
        p.xz += orbPush(p, 4.0);
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vColor = color;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_LIGHT}
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;

      layout(location = 0) out vec4 fragColor;

      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 col = toonStep(vColor, n);
        vec3 viewDir = normalize(vWorld - cameraPosition);
        float back = pow(max(dot(viewDir, uSun), 0.0), 1.6);
        col += vColor * vec3(1.2, 1.25, 0.7) * back * 0.3;
        float dist = length(vWorld - cameraPosition);
        col = applyHaze(col, dist, 120.0, 340.0);
        fragColor = vec4(col, 1.0);
      }
    `,
    vertexColors: true,
    side: THREE.DoubleSide,
  })
}

/* -------------------------------- component ------------------------------ */

const treeLand: KeepFn = (x, z, y, slope) => y > -1.0 && slope < 0.72 && forestFloor(x, z, y, slope)

export function ForestTrees({ uniforms, tier }: { uniforms: WorldUniforms; tier: Tier }) {
  const built = useMemo(() => {
    const rnd = mulberry32(0x7b1e4d)
    const high = tier !== 'low'
    const pines = buildPines(
      { rnd },
      scatter(rnd, high ? 120 : 56, PINE_GROUND, treeLand, { sightline: 5 }),
    )
    const birches = buildBirches(
      { rnd },
      scatter(rnd, high ? 34 : 14, BIRCH_GROUND, treeLand, { sightline: 4.5 }),
    )
    const oaks = buildOaks(
      { rnd },
      scatter(rnd, high ? 26 : 10, OAK_GROUND, treeLand, { sightline: 14 }),
    )
    const willows = buildWillows({ rnd }, WILLOW_SPOTS.slice(0, high ? 5 : 3))
    const hazel = buildHazel(
      { rnd },
      scatter(rnd, high ? 90 : 34, HAZEL_GROUND, treeLand, { sightline: 3.5 }),
    )
    // eslint-disable-next-line no-console
    console.log('[forest]', {
      pines: pines.wood.triangleCount,
      needles: pines.needles.triangleCount,
      birch: birches.wood.triangleCount,
      birchLeaves: birches.leaves.triangleCount,
      oak: oaks.wood.triangleCount,
      oakLeaves: oaks.leaves.triangleCount,
      willow: willows.wood.triangleCount,
      strands: willows.strands.triangleCount,
      hazel: hazel.wood.triangleCount,
    })
    return { pines, birches, oaks, willows, hazel }
  }, [tier])

  const materials = useMemo(
    () => ({
      pineBark: createBarkMaterial({ uniforms, mode: 0 }),
      birchBark: createBarkMaterial({ uniforms, mode: 1 }),
      plainBark: createBarkMaterial({ uniforms, mode: 2 }),
      pineNeedles: createFoliageMaterial({
        uniforms,
        translucency: 0.55,
        swayAmount: 0.24,
        tint: color('#B4C79A'),
        depthShade: 0.14,
      }),
      birchLeaves: createFoliageMaterial({
        uniforms,
        translucency: 0.7,
        swayAmount: 0.4,
        tint: color('#AFC486'),
        depthShade: 0.1,
      }),
      oakLeaves: createFoliageMaterial({
        uniforms,
        translucency: 0.3,
        swayAmount: 0.22,
        tint: color('#8FA37B'),
        depthShade: 0.2,
      }),
      hazelLeaves: createFoliageMaterial({
        uniforms,
        translucency: 0.5,
        swayAmount: 0.34,
        tint: color('#9DB075'),
        depthShade: 0.16,
      }),
      strands: createStrandMaterial(uniforms),
    }),
    [uniforms],
  )

  const geometries = useMemo(() => {
    const { pines, birches, oaks, willows, hazel } = built
    const nonEmpty = (g: Geo) => g.triangleCount > 0
    return {
      pineWood: nonEmpty(pines.wood) ? pines.wood.build() : null,
      pineNeedles: nonEmpty(pines.needles) ? pines.needles.build() : null,
      birchWood: nonEmpty(birches.wood) ? birches.wood.build() : null,
      birchLeaves: nonEmpty(birches.leaves) ? birches.leaves.build() : null,
      oakWood: nonEmpty(oaks.wood) ? oaks.wood.build() : null,
      oakLeaves: nonEmpty(oaks.leaves) ? oaks.leaves.build() : null,
      willowWood: nonEmpty(willows.wood) ? willows.wood.build() : null,
      willowStrands: nonEmpty(willows.strands) ? willows.strands.build() : null,
      hazelWood: nonEmpty(hazel.wood) ? hazel.wood.build() : null,
      hazelLeaves: nonEmpty(hazel.leaves) ? hazel.leaves.build() : null,
    }
  }, [built])

  useEffect(
    () => () => {
      for (const g of Object.values(geometries)) g?.dispose()
      for (const m of Object.values(materials)) m.dispose()
    },
    [geometries, materials],
  )

  const draw = (geometry: THREE.BufferGeometry | null, material: THREE.ShaderMaterial) =>
    geometry ? <mesh geometry={geometry} material={material} frustumCulled={false} /> : null

  return (
    <>
      {draw(geometries.pineWood, materials.pineBark)}
      {draw(geometries.pineNeedles, materials.pineNeedles)}
      {draw(geometries.birchWood, materials.birchBark)}
      {draw(geometries.birchLeaves, materials.birchLeaves)}
      {draw(geometries.oakWood, materials.plainBark)}
      {draw(geometries.oakLeaves, materials.oakLeaves)}
      {draw(geometries.willowWood, materials.plainBark)}
      {draw(geometries.willowStrands, materials.strands)}
      {draw(geometries.hazelWood, materials.plainBark)}
      {draw(geometries.hazelLeaves, materials.hazelLeaves)}
    </>
  )
}
