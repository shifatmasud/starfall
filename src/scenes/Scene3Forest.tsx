import { ScanScene } from './scan/ScanScene'
import { RockMossSet02 } from '../scans/models/RockMossSet02'
import { TreeStump01 } from '../scans/models/TreeStump01'
import { Fern02 } from '../scans/models/Fern02'
import { RootCluster01 } from '../scans/models/RootCluster01'
import { GrassMedium01 } from '../scans/models/GrassMedium01'
import { Fit } from './scan/Fit'
import { SunShafts, Bokeh } from './scan/LensFX'
import { FlowerHeliophila } from '../scans/models/FlowerHeliophila'

/**
 * Scene 3 — Forest. The orb rests on a sunlit, mossy forest floor.
 *
 * World: Poly Haven `forest_slope` (a photographed forest, sun through the trees), ground-projected
 * so its own leaf-litter floor runs under the orb. Props, all photogrammetry scans: moss-covered
 * rocks, a tree stump and a root cluster framing the right like the reference's great trunk, ferns,
 * grass tufts, and the small white flowers of a scanned Heliophila scattered through the foreground.
 * The sun sits high left, its shafts (LensFX SunShafts) reaching down to the orb; out-of-focus
 * highlights (LensFX Bokeh) sit in the foreground, bottom right, as in the reference.
 */

/** The scanned Heliophila mesh sits off its origin; this re-centres it so position is the plant's foot. */
function Flower({ p, s = 1, r = 0 }: { p: [number, number, number]; s?: number; r?: number }) {
  return (
    <group position={p} rotation={[0, r, 0]} scale={s}>
      <FlowerHeliophila position={[-1.163, 0, 0.017]} />
    </group>
  )
}

// foot positions of the white flowers: a drift along the right foreground, a few at the left rocks
const FLOWERS: [number, number, number, number, number][] = [
  [0.55, 0, -1.05, 0.55, 0.3], [0.72, 0, -1.2, 0.5, 1.7], [0.4, 0, -0.85, 0.45, 2.6], [0.85, 0, -1.45, 0.6, 4.0],
  [0.62, 0, -0.75, 0.4, 5.1], [1.05, 0, -1.7, 0.7, 0.9], [0.3, 0, -1.25, 0.35, 3.3], [0.95, 0, -1.0, 0.5, 2.1],
  [-0.62, 0, -1.25, 0.45, 1.1], [-0.8, 0, -1.6, 0.55, 2.9], [-0.45, 0, -1.4, 0.35, 4.4], [-1.0, 0, -1.9, 0.6, 0.2],
  [0.22, 0, -1.9, 0.35, 1.4], [-0.25, 0, -2.0, 0.3, 3.8], [1.3, 0, -2.2, 0.6, 5.5], [-1.3, 0, -2.3, 0.6, 2.3],
]

// green tufts [x, z, size]: low growth around the orb and through the foreground, as in the reference
const TUFTS: [number, number, number][] = [
  [-0.55, -1.15, 0.45], [0.45, -1.3, 0.5], [-0.15, -0.9, 0.35], [0.8, -1.0, 0.4], [-0.95, -1.5, 0.55],
  [0.15, -1.75, 0.5], [1.1, -1.6, 0.55], [-0.35, -2.1, 0.6],
]

export function Scene3Forest() {
  return (
    <ScanScene
      hdri="/scans/hdri/forest_slope.webp"
      ground={{ height: 1.6, radius: 40 }}
      envIntensity={1.6}
      skyYaw={90}
      sun={{ from: [-3, 4, -4], color: '#ffe0a8', intensity: 2.6 }}
      fill={{ sky: '#e2ead0', ground: '#3f4a22', intensity: 0.85 }}
      camera={{ position: [0, 0.3, 0], target: [0, 0.2, -1.6], fov: 50 }}
      orb={{ position: [0, 0.17, -1.55], radius: 0.19 }}
      look={{ light: [-0.5, 0.8], tint: '#f4f8ff', rim: '#f6fbff', haloColor: '#d8ecff', halo: 0.25, bob: 0, bend: 2.0, gain: 1.3 }}
      glow={{ color: '#cfe6ff', intensity: 0.3, distance: 1.0 }}
      clear="#1d2a22"
      poster={{ portrait: '/poster/scene3-portrait.webp', landscape: '/poster/scene3-landscape.webp' }}
      bloom={0.6}
    >
      <RockMossSet02 position={[-1.6, 0, -3.0]} rotation={[0, 0.4, 0]} scale={0.7} />
      <RootCluster01 position={[1.9, 0, -3.4]} rotation={[0, -0.8, 0]} scale={0.45} />
      <TreeStump01 position={[1.25, 0, -2.4]} rotation={[0, 0.6, 0]} scale={0.8} />
      <Fern02 position={[-1.1, 0, -2.0]} rotation={[0, 1.2, 0]} scale={0.6} />
      <Fern02 position={[0.9, 0, -2.9]} rotation={[0, -0.5, 0]} scale={0.7} />
      <RockMossSet02 position={[-0.75, -0.05, -0.9]} rotation={[0, 2.2, 0]} scale={0.22} />
      <RockMossSet02 position={[0.9, -0.06, -1.25]} rotation={[0, 0.9, 0]} scale={0.18} />
      {/* low green growth through the foreground: the scanned grass clump, fitted small */}
      {TUFTS.map(([x, z, sz], i) => (
        <Fit key={'t' + i} size={sz * 5} position={[x, -0.01, z]} rotation={[0, i * 2.3, 0]}>
          <GrassMedium01 />
        </Fit>
      ))}
      <SunShafts x={0.27} y={0.97} color="#ffeccc" strength={0.75} haze={0.42} reach={1.45} />
      <Bokeh
        color="#fff2d6"
        discs={[
          [0.86, 0.1, 0.03, 0.22], [0.92, 0.17, 0.022, 0.16], [0.81, 0.05, 0.035, 0.18], [0.96, 0.07, 0.026, 0.14],
          [0.75, 0.12, 0.018, 0.12], [0.89, 0.27, 0.015, 0.12],
        ]}
      />
      {FLOWERS.map(([x, y, z, s, r], i) => (
        <Flower key={i} p={[x, y, z]} s={s * 1.9} r={r} />
      ))}
    </ScanScene>
  )
}
