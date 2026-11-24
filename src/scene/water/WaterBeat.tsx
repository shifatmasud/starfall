import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, type RefObject } from 'react'
import * as THREE from 'three'
import { AirWaterSplit, WaterlineSolver } from './AirWaterSplit'
import { createCausticUniforms } from './caustics'
import { KelpForest, type KelpOptions } from './KelpForest'
import { LakeWater, createLake, createWaterlineUniforms, type LakeConfig, type LakePalette } from './LakeWater'
import { LAKE_LEVEL } from '../world/Terrain'
import { WaterTrailFBO } from './WaterTrailFBO'
import { WaterFX, DeepBubbles } from './WaterFX'
import { Seabed } from './Seabed'

/**
 * Stream 3 in one component: lake surface, hover/scrub trails, the air–water
 * split line and the underwater kelp forest.
 *
 * Mount it once inside the journey's Canvas, under whatever renders the orb.
 * It owns nothing outside `src/scene/water/`, so the beat drops in without
 * touching the scene clock, the camera rig or the sound:
 *
 * ```tsx
 * const orb = useRef<THREE.Group>(null)
 * // ... in the Canvas:
 * <WaterBeat orbRef={orb} level={0} size={180} tier={low ? 'low' : 'high'} />
 * ```
 *
 * The camera in Beat 4 → Beat 5 must actually cross `level`: the split line is
 * solved from the real camera height, and while the lens is well above the
 * surface the line and its tint simply do not run (zero cost, no flicker).
 */
export type WaterBeatProps = {
  /** anything `createLake` accepts; usually only `level`, `center`, `size` */
  lake?: LakeConfig
  /** live orb transform — the lake splashes it in and bobs it while it floats */
  orbRef?: RefObject<THREE.Object3D | null>
  orbRadius?: number
  /** kelp bed; defaults to the lake centre */
  kelp?: KelpOptions
  palette?: LakePalette
  /** 'low' halves the trail field and the sheet's vertex count */
  tier?: 'low' | 'high'
  /** world direction toward the sun, shared with the rest of the scene */
  sunDir?: THREE.Vector3
}

export function WaterBeat({
  lake: lakeConfig,
  orbRef,
  orbRadius = 0.62,
  kelp,
  palette,
  tier = 'high',
  sunDir,
}: WaterBeatProps) {
  const gl = useThree((state) => state.gl)
  const config = useMemo<LakeConfig>(
    () => ({ ...lakeConfig, detail: lakeConfig?.detail ?? (tier === 'low' ? 96 : undefined) }),
    [lakeConfig, tier],
  )
  const lake = useMemo(() => createLake(config), [config])
  const caustics = useMemo(() => createCausticUniforms(), [])
  const waterline = useMemo(() => createWaterlineUniforms(), [])
  const solver = useMemo(() => new WaterlineSolver(lake, waterline), [lake, waterline])
  const trail = useMemo(
    () =>
      new WaterTrailFBO(gl, {
        center: [0, -300],
        extent: 240,
        resolution: tier === 'low' ? 192 : 384,
      }),
    [gl, lake, tier],
  )

  useEffect(() => () => trail.dispose(), [trail])

  useFrame((_state, delta) => {
    // one clock owns the caustic pattern, as the house rules demand
    caustics.uCaus.value.z = (caustics.uCaus.value.z + Math.min(delta, 0.1)) % 3600
  })

  return (
    <>
      <KelpForest lake={lake} options={kelp ?? { center: [0, -404], radius: 30, count: 40, height: 10 }} caustics={caustics} sunDir={sunDir} />
      <LakeWater
        lake={lake}
        waterline={waterline}
        trail={trail}
        caustics={caustics}
        orbRef={orbRef}
        orbRadius={orbRadius}
        palette={palette}
        sunDir={sunDir}
      />
      <AirWaterSplit lake={lake} solver={solver} caustics={caustics} sunDir={sunDir} />
      <Seabed />
      <WaterFX lake={lake} orbRef={orbRef} />
      <DeepBubbles center={[0, LAKE_LEVEL - 7.4, -404]} />
    </>
  )
}
