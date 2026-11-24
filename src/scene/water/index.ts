/**
 * Stream 3 of ORB-Journey: lake water, interactive hover/scrub trails, the
 * air–water split line and the underwater kelp forest.
 *
 * Everything here lives inside `src/scene/water/`; mounting is a single
 * `<WaterBeat />` (see `WaterBeat.tsx`), so nothing else in the app has to know
 * how the beat is built.
 */
export * from './caustics'
export * from './WaterTrailFBO'
export * from './LakeWater'
export * from './AirWaterSplit'
export * from './KelpForest'
export * from './WaterBeat'
