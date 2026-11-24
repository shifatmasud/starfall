/**
 * Stream 2 — Realistic Meadow, Wildflowers, Shrubs & Forest.
 *
 * One import for the whole world:
 * ```tsx
 * import { World, LAKE_LEVEL } from './scene/world'
 * <World tier={tier} progressRef={progressRef} />
 * ```
 *
 * The world is laid against the app's column: ground **y = 0**, water line
 * **`LAKE_LEVEL` = −1.6**, cloud base y = 46, lens falling from (0, 64, 30) to
 * (0, −6.2, 9) with the orb at the origin. Mount `WaterBeat` with
 * `lake={{ level: LAKE_LEVEL, center: [0, 0] }}` so the surface meets the shore.
 */
export { World } from './World'
export type { WorldProps } from './World'

export { Terrain } from './Terrain'
export { MeadowGrass } from './MeadowGrass'
export { Wildflowers } from './Wildflowers'
export { ForestTrees } from './ForestTrees'

export {
  LAKE_LEVEL,
  sampleTerrain,
  heightAt,
  terrainNormal,
  slopeAt,
  isUnderWater,
  waterDepthAt,
  TERRAIN_BOUNDS,
} from './Terrain'

export { STATIONS, ORB_CURVE, orbAt, tangentAt, stationAt } from './path'

export { SUN_DIR, PALETTE, createWorldUniforms } from './shared'
export type { Tier, ValueSource, WorldUniforms } from './shared'
