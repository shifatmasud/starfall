import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { PostFX } from '../gl/PostFX'
import { CloudSea } from './CloudSea'
import { CometOrb } from './CometOrb'
import { CAM_Z, layoutFor, type Layout } from './layout'

/**
 * Scene 2 — Into the clouds.
 *
 * A crystal star falls out of the morning sky, trailing a cold comet wake, while the sun breaks over
 * a sea of clouds and a snow-tipped range burns at the horizon. Full-bleed, no interface: the painted
 * sky is baked once, the orb and its wake are the only live geometry, and the post chain is the same
 * Bloom → ACES → ScreenPaint → SMAA as scene 1.
 */

function FrameProbe() {
  useFrame(() => {
    window.__ORB_FRAME__ = (window.__ORB_FRAME__ ?? 0) + 1
  })
  return null
}

/** A slow lens drift, a few centimetres of parallax across the cloud sea. */
function Rig({ layout }: { layout: Layout }) {
  const camera = useThree((state) => state.camera)
  useFrame((state) => {
    const t = state.clock.elapsedTime
    camera.position.x = Math.sin(t * 0.06) * 0.035
    camera.position.y = Math.cos(t * 0.045) * 0.018
    camera.lookAt(0, layout.dive.y * 0.15, 0)
  })
  return null
}

function Scene({ layout }: { layout: Layout }) {
  return (
    <>
      <CloudSea layout={layout} />
      <CometOrb layout={layout} />
      <FrameProbe />
      <Rig layout={layout} />
      <PostFX bloom={0.42} exposure={1.02} />
    </>
  )
}

function Inner() {
  const size = useThree((state) => state.size)
  const layout = useMemo(() => layoutFor(size.width, size.height), [size.width, size.height])
  return <Scene layout={layout} />
}

export function Scene2Clouds() {
  return (
    <Canvas
      flat
      dpr={Math.min(window.devicePixelRatio || 1, 2)}
      camera={{ position: [0, 0, CAM_Z], fov: 40, near: 0.05, far: 60 }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: new URLSearchParams(location.search).has('qa'),
      }}
      onCreated={({ gl }) => {
        gl.setClearColor('#c9d6e6', 1)
        window.__ORB_FRAME__ = 0
      }}
    >
      <Inner />
    </Canvas>
  )
}
