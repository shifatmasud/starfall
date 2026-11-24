/**
 * Planting helpers — where things may grow.
 *
 * The world is a stage set: a meadow shelf behind the lens, a wooded pool in
 * front of it, the far bank and the valley walls. Plants are dropped by region
 * (weighted, so the ground nearest the lens is the densest), rejected on water,
 * cliff or the sightline, and snapped to `sampleTerrain` so every root is on the
 * drawn surface.
 */
import { LAKE_LEVEL, sampleTerrain, slopeAt } from './Terrain'
/**
 * The corridor the star travels is kept clear: plants within `sightline` metres of the spline's
 * ground projection are rejected, so nothing ever stands between the lens and the star.
 */
const SIGHTLINE: Array<[number, number]> = [
  [0, 60],
  [0, 10],
  [0, -40],
  [0, -120],
  [0, -220],
  [0, -330],
]

export function distanceToSightline(x: number, z: number): number {
  let best = Infinity
  for (let i = 0; i < SIGHTLINE.length - 1; i++) {
    const [ax, az] = SIGHTLINE[i]
    const [bx, bz] = SIGHTLINE[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const len = dx * dx + dz * dz
    const t = len > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len)) : 0
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)))
  }
  return best
}

export type Rand = () => number

export type Box = {
  x: [number, number]
  z: [number, number]
  /** relative share of the population; the near bank gets the most */
  weight: number
}

export type Spot = { x: number; z: number; y: number }

export type KeepFn = (x: number, z: number, y: number, slope: number) => boolean

/** Land that is comfortably dry and not a cliff. */
export const dryLand: KeepFn = (_x, _z, y, slope) => y > LAKE_LEVEL + 0.32 && slope < 0.46

/** The wet margin: ground just above and just below the water line. */
export const marshLand: KeepFn = (_x, _z, y, slope) => y > LAKE_LEVEL - 0.55 && y < LAKE_LEVEL + 0.7 && slope < 0.55

/** Barely above the water — iris and sedge country. */
export const shoreLand: KeepFn = (_x, _z, y, slope) => y > LAKE_LEVEL + 0.1 && y < LAKE_LEVEL + 1.5 && slope < 0.6

/** Woodland floor: dry, but allowed to be steeper. */
export const forestFloor: KeepFn = (_x, _z, y, slope) => y > LAKE_LEVEL + 1.2 && slope < 0.7

function pickBox(rnd: Rand, boxes: Box[]): Box {
  const total = boxes.reduce((sum, b) => sum + b.weight, 0)
  let r = rnd() * total
  for (const box of boxes) {
    r -= box.weight
    if (r <= 0) return box
  }
  return boxes[boxes.length - 1]
}

/** Weighted rejection sampling across boxes; returns the accepted spots. */
export function scatter(
  rnd: Rand,
  count: number,
  boxes: Box[],
  keep: KeepFn,
  opts: { sightline?: number; avoidTrunks?: Array<[number, number, number]> } = {},
): Spot[] {
  const out: Spot[] = []
  let guard = 0
  const limit = count * 26
  while (out.length < count && guard < limit) {
    guard++
    const box = pickBox(rnd, boxes)
    const x = box.x[0] + (box.x[1] - box.x[0]) * rnd()
    const z = box.z[0] + (box.z[1] - box.z[0]) * rnd()
    if (opts.sightline && distanceToSightline(x, z) < opts.sightline) continue
    let blocked = false
    if (opts.avoidTrunks) {
      for (const [tx, tz, tr] of opts.avoidTrunks) {
        if (Math.hypot(x - tx, z - tz) < tr) {
          blocked = true
          break
        }
      }
    }
    if (blocked) continue
    const slope = slopeAt(x, z)
    const y = sampleTerrain(x, z)
    if (!keep(x, z, y, slope)) continue
    out.push({ x, z, y })
  }
  return out
}

/** Rejection sampling along a terrain contour — the water's edge, wherever it is. */
export function alongContour(
  rnd: Rand,
  count: number,
  boxes: Box[],
  band: [number, number],
  keep: KeepFn,
  sightline = 0,
): Spot[] {
  const out: Spot[] = []
  let guard = 0
  const limit = count * 120
  while (out.length < count && guard < limit) {
    guard++
    const box = pickBox(rnd, boxes)
    const x = box.x[0] + (box.x[1] - box.x[0]) * rnd()
    const z = box.z[0] + (box.z[1] - box.z[0]) * rnd()
    const y = sampleTerrain(x, z)
    const above = y - LAKE_LEVEL
    if (above < band[0] || above > band[1]) continue
    if (sightline && distanceToSightline(x, z) < sightline) continue
    const slope = slopeAt(x, z)
    if (!keep(x, z, y, slope)) continue
    out.push({ x, z, y })
  }
  return out
}
