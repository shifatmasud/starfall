import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { PostFX } from '../gl/PostFX'
import { SceneCanvas } from '../components/SceneCanvas'
import { Sky } from './scene2/Sky'
import { Peak } from './scene2/Peak'
import { CloudSea } from './scene2/CloudSea'
import { Orb } from './scan/ScanScene'
import { at, sizeAt } from './scene2/frame'
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

      {/* one real summit out of the cloud sea, mid-distance on the right: the Matterhorn's own DEM */}
      <Peak aspect={layout.aspect} u={0.862} v={0.345} z={-28} size={8.2} yaw={0.5} />

      <CloudSea layout={layout} layer="back" renderOrder={-2} />
      {/* the glass meteor, low right of centre, its wake running up-left for a third of the frame */}
      <Orb
        orb={{ position: at(0.53, 0.56, -6, layout.aspect), radius: sizeAt(0.064, 0, -6, layout.aspect)[0] / 2 }}
        streak={{ dir: [-0.33 * layout.aspect, 0.23], len: Math.hypot(0.33 * layout.aspect, 0.23), width: 0.03, color: '#ffe2b0', strength: 1.25 }}
        look={{ light: [-0.25, 0.9], tint: '#f6f2ff', rim: '#fff4e2', haloColor: '#ffe6c0', halo: 0.45, gain: 1.08 }}
        glow={{ color: '#ffdcb0', intensity: 4, distance: 10 }}
      />
      <CloudSea layout={layout} layer="front" renderOrder={2} />

      <FrameProbe />
      <Rig layout={layout} />
      {new URLSearchParams(location.search).has('nopost') ? null : <PostFX bloom={0.7} exposure={1.0} haze={0.35} soften={{ amount: 0.55, radius: 3.5, mist: 0.06 }} />}
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
