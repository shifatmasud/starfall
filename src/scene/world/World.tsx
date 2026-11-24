/**
 * Stream 2 — the botanical world, as one mountable component.
 *
 * ```tsx
 * <World tier="high" progressRef={progressRef} orbPosRef={orbPosRef} />
 * ```
 *
 * Mount it as a sibling of the orb inside the same `<Canvas>`. The valley is
 * authored in world metres with the walk starting at z≈+46 and the lake at
 * z≈-45; `path.ts` holds the matching camera/orb stations. Terrain, grass,
 * flowers and trees all read one shared uniform block, so the clock, the sun,
 * the haze and the orb position can never drift apart between them.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createWorldUniforms, readValue, type Tier, type ValueSource, type WorldUniforms } from './shared'
import { Terrain } from './Terrain'
import { MeadowGrass } from './MeadowGrass'
import { Wildflowers } from './Wildflowers'
import { ForestTrees } from './ForestTrees'
import { Horizon } from './Horizon'
import { SeaProps } from './SeaProps'
import { GodShafts } from './GodShafts'
import { orbAt } from './path'
import { atmosphere, journey } from '../atmosphere/atmosphereState'

export type WorldProps = {
  /** `low` halves every plant population and drops the far grass layer. */
  tier?: Tier
  /** Journey progress 0..1 — a ref, a MotionValue, a getter or a number. */
  progressRef?: ValueSource<number>
  /** Where the orb is drawn; when omitted the world follows the journey path. */
  orbPosRef?: ValueSource<THREE.Vector3>
  /** Live sun direction (pass `atmosphere.sunDir`); the world follows it each frame. */
  sunDir?: THREE.Vector3
  /** Haze colour: a hex string, or the atmosphere's live colour object. */
  haze?: string | THREE.Color
}

function loadFoliageAtlas(): THREE.Texture {
  const loader = new THREE.TextureLoader()
  const tex = loader.load(`${import.meta.env.BASE_URL}textures/flora/foliage-atlas.png`)
  // authored in sRGB, sampled raw: the whole world works in display space
  tex.colorSpace = THREE.NoColorSpace
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 4
  return tex
}

export function World({ tier = 'high', progressRef, orbPosRef, sunDir, haze }: WorldProps) {
  const root = useRef<THREE.Group>(null)
  const texture = useMemo(() => loadFoliageAtlas(), [])

  const uniforms: WorldUniforms = useMemo(() => {
    const block = createWorldUniforms({ sun: sunDir, haze })
    block.uTex.value = texture
    return block
  }, [sunDir, haze, texture])

  useEffect(() => () => texture.dispose(), [texture])

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uFog.value = atmosphere.fog
    // chapter one lives above the weather: the valley only appears as the star enters the clouds
    if (root.current) root.current.visible = journey.u > 1.15
    if (orbPosRef !== undefined) {
      const p = readValue(orbPosRef, uniforms.uOrb.value)
      uniforms.uOrb.value.copy(p)
    } else {
      uniforms.uOrb.value.copy(orbAt(readValue(progressRef, 0.42)))
    }
  })

  return (
    <group name="orb-journey-world" ref={root}>
      <Terrain uniforms={uniforms} />
      <MeadowGrass uniforms={uniforms} tier={tier} />
      <Wildflowers uniforms={uniforms} tier={tier} />
      <ForestTrees uniforms={uniforms} tier={tier} />
      <Horizon />
      <SeaProps />
      <GodShafts />
    </group>
  )
}
