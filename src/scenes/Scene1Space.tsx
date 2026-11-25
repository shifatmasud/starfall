import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PostFX } from '../gl/PostFX'
import { SceneCanvas } from '../components/SceneCanvas'
import { SpaceBackdrop } from './SpaceBackdrop'
import { CrystalStarOrb } from '../components/CrystalStarOrb'
import { Asteroids } from './Asteroids'
import { StarFlare } from './StarFlare'
import { CAM_Z, layoutFor, type Layout } from './layout'

/**
 * Scene 1 — Above the sky.
 *
 * A crystal star hangs over the Earth's limb: the planet's atmosphere along the bottom of the frame,
 * the star's light in the upper-right sky, a drift of scanned rock around the orb, and nothing else.
 * Full-bleed, no interface, the pointer's fluid trail the only interaction.
 */

/** A few centimetres of lens travel with the hand; never enough to move the composition. */
function Rig({ layout }: { layout: Layout }) {
  const camera = useThree((state) => state.camera)
  const target = useRef(new THREE.Vector2())
  useFrame((state, delta) => {
    const k = Math.min(1, delta * 2.2)
    target.current.x += (state.pointer.x * 0.055 - target.current.x) * k
    target.current.y += (state.pointer.y * 0.045 - target.current.y) * k
    camera.position.x = target.current.x
    camera.position.y = target.current.y
    camera.lookAt(target.current.x * 0.2, target.current.y * 0.2 + layout.orb.y * 0.25, 0)
  })
  return null
}

const FLAGS = {
  nopost: new URLSearchParams(location.search).has('nopost'),
  nobloom: new URLSearchParams(location.search).has('nobloom'),
}

function FrameProbe() {
  useFrame(() => {
    window.__ORB_FRAME__ = (window.__ORB_FRAME__ ?? 0) + 1
  })
  return null
}

function Scene({ layout }: { layout: Layout }) {
  return (
    <>
      <SpaceBackdrop layout={layout} />
      <Asteroids layout={layout} />
      <StarFlare layout={layout} />
      <CrystalStarOrb layout={layout} />
      <FrameProbe />
      <Rig layout={layout} />
      {FLAGS.nopost ? null : <PostFX bloom={FLAGS.nobloom ? 0 : 0.62} exposure={1.06} />}
    </>
  )
}

function Inner() {
  const size = useThree((state) => state.size)
  const layout = useMemo(() => layoutFor(size.width, size.height), [size.width, size.height])
  return <Scene layout={layout} />
}

export function Scene1Space() {
  return (
    <SceneCanvas
      clear="#04060c"
      camera={{ position: [0, 0, CAM_Z], fov: 40, near: 0.05, far: 60 }}
      poster={{ portrait: '/poster/scene1-portrait.webp', landscape: '/poster/scene1-landscape.webp' }}
    >
      <Inner />
    </SceneCanvas>
  )
}
