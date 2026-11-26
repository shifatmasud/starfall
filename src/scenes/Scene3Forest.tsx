import { ScanScene } from './scan/ScanScene'
import { RockMossSet02 } from '../scans/models/RockMossSet02'
import { TreeStump01 } from '../scans/models/TreeStump01'
import { Fern02 } from '../scans/models/Fern02'
import { RootCluster01 } from '../scans/models/RootCluster01'

/**
 * Scene 3 — Forest. The orb rests on a sunlit forest floor.
 *
 * World: Poly Haven `forest_slope` (a photographed forest, sun through the trees), ground-projected
 * so its own leaf-litter floor runs under the orb. Props, all photogrammetry scans: a moss-covered
 * rock set, a tree stump and a root cluster framing the right like the reference's great trunk,
 * and ferns.
 */

export function Scene3Forest() {
  return (
    <ScanScene
      hdri="/scans/hdri/forest_slope.webp"
      ground={{ height: 1.6, radius: 40 }}
      envIntensity={1.6}
      skyYaw={90}
      sun={{ from: [-3, 4, -4], color: '#ffe8c0', intensity: 2.2 }}
      rays={{ x: 0.2, y: 0.93, color: '#ffe2a8', strength: 0.45, haze: 0.5 }}
      fill={{ sky: '#dfe9d0', ground: '#4a3a22', intensity: 0.8 }}
      camera={{ position: [0, 0.32, 0], target: [0, 0.2, -1.6], fov: 50 }}
      orb={{ position: [0, 0.17, -1.55], radius: 0.19 }}
      look={{ light: [-0.5, 0.8], tint: '#f4f8ff', rim: '#f6fbff', haloColor: '#d8ecff', halo: 0.5, bob: 0, bend: 2.0, gain: 1.7 }}
      glow={{ color: '#cfe6ff', intensity: 0.6, distance: 1.2 }}
      clear="#1d2a22"
      poster={{ portrait: '/poster/scene3-portrait.webp', landscape: '/poster/scene3-landscape.webp' }}
      bloom={0.5}
    >
      <RockMossSet02 position={[-1.6, 0, -3.0]} rotation={[0, 0.4, 0]} scale={0.7} />
      <RootCluster01 position={[1.9, 0, -3.4]} rotation={[0, -0.8, 0]} scale={0.45} />
      <TreeStump01 position={[1.25, 0, -2.4]} rotation={[0, 0.6, 0]} scale={0.8} />
      <Fern02 position={[-1.1, 0, -2.0]} rotation={[0, 1.2, 0]} scale={0.6} />
      <Fern02 position={[0.9, 0, -2.9]} rotation={[0, -0.5, 0]} scale={0.7} />
      <RockMossSet02 position={[-1.0, -0.03, -1.15]} rotation={[0, 2.2, 0]} scale={0.16} />
    </ScanScene>
  )
}
