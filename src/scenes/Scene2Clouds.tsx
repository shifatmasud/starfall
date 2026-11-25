import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { PostFX } from '../gl/PostFX'
import { SceneCanvas } from '../components/SceneCanvas'
import { Sky } from './scene2/Sky'
import { Range } from './scene2/Range'
import { CloudSea } from './scene2/CloudSea'
import { CometOrb } from './CometOrb'
import { CAM_Z, layoutFor, type Layout } from './layout'

/**
 * Scene 2 — Into the clouds.
 *
 * The crystal star falls into a morning sea of cumulus. Four units, each its own file: the air
 * (`Sky`), the range standing in it (`Ridge`), the sea itself, which is the real PMNDRS cloud —
 * drei's `<Clouds>` — and the orb with its comet wake. The post chain is the same
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
    camera.position.x = Math.sin(t * 0.06) * 0.03
    camera.position.y = Math.cos(t * 0.045) * 0.016
    camera.lookAt(0, layout.dive.y * 0.15, 0)
  })
  return null
}

function Scene({ layout }: { layout: Layout }) {
  return (
    <>
      {/* The cloud material carries its own lighting: a billboard always faces the camera, so a
          directional light would light every puff identically and flatten the sea. Neutral ambient at
          unity leaves the puff shader in charge of the colour; the range bakes its own sun. */}
      {/* Lambert divides by π, so unity ambient would render a white puff at 0.32 — set the light to
          the value that makes the material's white actually white */}
      <ambientLight intensity={Math.PI} color="#ffffff" />

      {/* the air: distant cloud and rock fade into the horizon's own colour */}
      <fog attach="fog" args={['#cfdceb', 30, 130]} />

      <Sky layout={layout} />

      {/* real scanned ground: the Alps around the Matterhorn, displaced from a heightmap */}
      <Range
        aspect={layout.aspect}
        zNear={-62}
        zFar={-104}
        u0={-0.75}
        u1={1.15}
        baseY={-6.0}
        topY={5.4}
        haze={0.80}
        snowLine={2700}
        riseIn={0.35}
        sinkIn={0.45}
        columns={140}
        rows={48}
        flip
      />
      <Range
        aspect={layout.aspect}
        zNear={-30}
        zFar={-70}
        u0={0.42}
        u1={1.34}
        baseY={-3.4}
        topY={7.6}
        haze={0.42}
        snowLine={2850}
        riseIn={0.14}
        sinkIn={0.30}
        columns={220}
        rows={64}
      />

      <CloudSea layout={layout} layer="back" renderOrder={-2} />
      <CometOrb layout={layout} place={{ u: 0.445, v: 0.585, z: -6, frac: 0.088 }} />
      <CloudSea layout={layout} layer="front" renderOrder={2} />

      <FrameProbe />
      <Rig layout={layout} />
      {new URLSearchParams(location.search).has('nopost') ? null : <PostFX bloom={0.5} exposure={1.0} />}
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
    <SceneCanvas
      clear="#cfdceb"
      camera={{ position: [0, 0, CAM_Z], fov: 40, near: 0.05, far: 90 }}
      poster={{ portrait: '/poster/scene2-portrait.webp', landscape: '/poster/scene2-landscape.webp' }}
    >
      <Inner />
    </SceneCanvas>
  )
}
