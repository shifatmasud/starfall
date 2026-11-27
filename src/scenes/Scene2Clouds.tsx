import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { PostFX } from '../gl/PostFX'
import { SceneCanvas } from '../components/SceneCanvas'
import { Sky } from './scene2/Sky'
import { Peak } from './scene2/Peak'
import { CloudSea } from './scene2/CloudSea'
import { Orb } from './scan/ScanScene'
import { SunShafts } from './scan/LensFX'
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
      <Peak aspect={layout.aspect} u={0.815} v={0.315} z={-30} size={7.4} yaw={0.5} />

      <CloudSea layout={layout} layer="back" renderOrder={-2} sss={0.045} reach={0.12} soft={0.6} />
      {/* the glass meteor, low right of centre, its wake running up-left for a third of the frame */}
      <Orb
        orb={{ position: at(0.48, 0.46, -6, layout.aspect), radius: sizeAt(0.050, 0, -6, layout.aspect)[0] / 2 }}
        streak={{ dir: [-0.42 * layout.aspect, 0.26], len: 0.85 * Math.hypot(0.42 * layout.aspect, 0.26), width: 0.014, color: '#fff3de', strength: 1.1 }}
        look={{ light: [-0.25, 0.9], tint: '#fff6ea', rim: '#ffd9a8', haloColor: '#ffcf92', halo: 0.6, gain: 1.5, core: [0.55, 0.34, 0.13] }}
        glow={{ color: '#ffdcb0', intensity: 3.2, distance: 12 }}
      />
      <CloudSea layout={layout} layer="front" renderOrder={2} sss={0.07} reach={0.4} soft={0.5} />

      {/* god rays: the low sun's light fanning down through the cloud tops */}
      <SunShafts x={layout.sun.x} y={1 - layout.sun.y} color="#ffe4bc" strength={0.09} haze={0.08} reach={1.2} />

      <FrameProbe />
      <Rig layout={layout} />
      {new URLSearchParams(location.search).has('nopost') ? null : <PostFX bloom={0.55} exposure={1.0} haze={0.22} soften={{ amount: 0.4, radius: 3.0, mist: 0.02 }} />}
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
