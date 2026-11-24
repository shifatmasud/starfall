import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { MotionValue } from 'framer-motion'
import { OrbScene, type OrbNumberRef, type OrbPointerRef } from '../orb'
import { LAKE_LEVEL, World } from '../world'
import { LAST, orbAt } from '../world/path'
import { sampleTerrain } from '../world/Terrain'
import { WaterBeat } from '../water'
import { atmosphere } from './atmosphereState'
import { TIER } from './quality'

/**
 * Integration slots for Streams 1–3.
 *
 * Stream 4 (this stream) owns the sky, the weather, the camera, the audio and the UI shell; the orb
 * (`src/scene/orb/`), the world (`src/scene/world/`) and the water (`src/scene/water/`) are built in
 * parallel. These three components are the only place `src/App.tsx` reaches for them, so the final
 * integration pass is a one-line import each — nothing else in the app has to change.
 *
 * Contract for every slot:
 *   · `progress` is the document scroll (0 → 1) as one MotionValue; read it with `.get()` inside
 *     `useFrame`, never with a React subscription (one clock, one value — house rule 7).
 *   · the world column is: cloud base **y = 46**, ground **y = 0**, water line **y = -1.6**,
 *     and the lens travels **y = 64 → -6.2** along the five beats; place geometry against that.
 *   · the camera is owned by `CameraRig`; a slot must not move the camera.
 *   · everything is WebGL2 / GLSL ES 3.00, and there is **no halo shell on the orb**.
 */

export type StageProps = {
  progress: MotionValue<number>
}

/* ------------------------------------------------------------------------ *
 * The stage's single shared scratch
 *
 * The orb is the protagonist of a *world*, so three systems need the same
 * transform per frame: the grass bends around it (`World.orbPosRef`), the lake
 * splashes and bobs it (`WaterBeat.orbRef`), and the lens needs to frame it.
 * One object holds it, written by `OrbSlot` before the others read it.
 * ------------------------------------------------------------------------ */

const stage = {
  /** the orb's group, once it is mounted (the lake reads its world position) */
  object: null as THREE.Object3D | null,
  /** where that group sits this frame, in world metres */
  position: new THREE.Vector3(0, 90.6, 4),
}

/** Stable ref the lake can hold; `current` follows the mount/unmount of the orb. */
export const orbObjectRef: { current: THREE.Object3D | null } = {
  get current() {
    return stage.object
  },
}

/** Stable read-only view of the orb's world position (`World` bends grass around it). */
const orbPosition = { get: () => stage.position }

const ORB_RADIUS = 0.62

/**
 * The lake reflects the sky it is under.
 *
 * `atmosphere` rewrites its colour objects in place every frame; these four are
 * the water's copies, refreshed from it by `WaterSkySync`. Two reasons for a copy
 * rather than the references: the reflection has to be a little darker than the
 * dome itself (a mirror at grazing angle reads hotter than the sky it mirrors),
 * and the lake owns its uniforms, so nothing outside this file should be able to
 * write them.
 */
const WATER_PALETTE = {
  skyHorizon: new THREE.Color('#c8ccd0'),
  skyZenith: new THREE.Color('#6d7f92'),
  sun: new THREE.Color('#ffe3b0'),
  shore: new THREE.Color('#26332c'),
}

/** How much of the sky survives in the reflection (art direction, tuned visually). */
const WATER_REFLECT = { horizon: 0.58, zenith: 0.58, sun: 0.9, shore: 0.55 }

function WaterSkySync() {
  useFrame(() => {
    WATER_PALETTE.skyHorizon.copy(atmosphere.horizon).multiplyScalar(WATER_REFLECT.horizon)
    WATER_PALETTE.skyZenith.copy(atmosphere.zenith).multiplyScalar(WATER_REFLECT.zenith)
    WATER_PALETTE.sun.copy(atmosphere.sun).multiplyScalar(WATER_REFLECT.sun)
    WATER_PALETTE.shore.copy(atmosphere.land).multiplyScalar(WATER_REFLECT.shore)
  })
  return null
}

/**
 * The orb's on-screen size. A phone's frame is ~3× narrower than a laptop's at
 * the same vertical fov, so the rings would clip; 390 px lands on 0.58×.
 */
function stageScale(aspect: number): number {
  return THREE.MathUtils.clamp(aspect / 1.6, 0.58, 1)
}

/** Pointer in -1..1 NDC, `null` until the hand has actually moved. */
function usePointerRef(): OrbPointerRef {
  const pointer = useThree((state) => state.pointer)
  const moved = useRef(false)
  useEffect(() => {
    const onMove = () => {
      moved.current = true
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])
  return useMemo(
    () => ({
      get current() {
        return moved.current ? pointer : null
      },
    }),
    [pointer],
  )
}

/* ------------------------------------------------------------------------ *
 * Slots
 * ------------------------------------------------------------------------ */

export function OrbSlot({ progress }: StageProps) {
  const group = useRef<THREE.Group>(null)
  const aspect = useThree((state) => state.size.width / Math.max(1, state.size.height))
  const pointerRef = usePointerRef()

  // the orb's children read scroll through a plain `{ current }` getter: one
  // source, no React subscription, never a frame behind the camera
  const progressRef: OrbNumberRef = useMemo(
    () => ({
      get current() {
        return progress.get()
      },
    }),
    [progress],
  )

  const scale = stageScale(aspect)

  useEffect(() => {
    stage.object = group.current
    return () => {
      stage.object = null
    }
  }, [])

  useFrame(() => {
    const node = group.current
    if (!node) return
    const p = Math.min(1, Math.max(0, progress.get()))
    const u = p * LAST
    orbAt(p, stage.position)

    // buoyancy: while the star skims the water it rides the swell and cants with it
    const above = stage.position.y - LAKE_LEVEL
    const wet = THREE.MathUtils.smoothstep(1.4, 0.4, Math.abs(above)) * (1 - THREE.MathUtils.smoothstep(1.0, -0.4, above)) 
    const time = performance.now() / 1000
    const bob = Math.sin(time * 2.2) * 0.05 + Math.sin(time * 1.27 + 1.4) * 0.026
    stage.position.y += bob * wet
    node.position.copy(stage.position)
    node.scale.setScalar(scale)
    node.rotation.z = Math.sin(time * 1.9 + 0.7) * 0.06 * wet
    node.rotation.x = Math.cos(time * 1.55) * 0.045 * wet
    node.rotation.y += (Math.sin(u * 0.9) * 0.06 - node.rotation.y) * 0.02
  })

  return (
    <group ref={group} name="orb-stage">
      <OrbScene progressRef={progressRef} pointerRef={pointerRef} tier={TIER === 'low' ? 'low' : 'high'} />
    </group>
  )
}

export function WorldSlot({ progress }: StageProps) {
  return (
    <World
      tier={TIER}
      progressRef={progress}
      orbPosRef={orbPosition}
      sunDir={atmosphere.sunDir}
      haze={atmosphere.haze}
    />
  )
}

export function WaterSlot(_props: StageProps) {
  const aspect = useThree((state) => state.size.width / Math.max(1, state.size.height))
  const lake = useMemo(
    () => ({
      level: LAKE_LEVEL,
      center: [0, -200] as [number, number],
      size: 1600,
      bedSize: 780,
      maxBed: 0,
      depth: 11,
      basinRadius: 220,
      detail: 256,
      bedAt: (x: number, z: number) => sampleTerrain(x, z),
    }),
    [],
  )
  return (
    <>
      <WaterSkySync />
      <WaterBeat
        orbRef={orbObjectRef}
        orbRadius={ORB_RADIUS * stageScale(aspect)}
        lake={lake}
        palette={WATER_PALETTE}
        tier={TIER === 'low' ? 'low' : 'high'}
        sunDir={atmosphere.sunDir}
      />
    </>
  )
}
