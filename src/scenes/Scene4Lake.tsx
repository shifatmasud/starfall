import { ScanScene } from './scan/ScanScene'
import { Fit } from './scan/Fit'
import { WaterPlane } from './scan/WaterPlane'
import { GrassMedium01 } from '../scans/models/GrassMedium01'
import { RockMossSet02 } from '../scans/models/RockMossSet02'

/**
 * Scene 4 — Lake. The orb flies with a light streak over a meadow toward a mountain-bordered lake.
 *
 * World: Poly Haven `alps_field` (a photographed alpine meadow under peaks), ground-projected so its
 * own meadow is the near bank; beyond it a lake mirrors the photographed sky and peaks. Props: scanned grass clumps and mossy rocks along the
 * foreground, like the reference's flowered bank.
 */

const GRASS: [number, number, number][] = [
  [-1.1, -1.6, 0.5], [-0.6, -1.3, 0.4], [0.7, -1.4, 0.45], [1.2, -1.9, 0.55], [-1.5, -2.3, 0.5], [0.2, -1.2, 0.35], [1.6, -1.3, 0.5],
]

export function Scene4Lake() {
  return (
    <ScanScene
      hdri="/scans/hdri/alps_field.webp"
      ground={{ height: 1.7, radius: 60 }}
      envIntensity={1.4}
      sun={{ from: [4, 6, -3], color: '#fff2dc', intensity: 2.0 }}
      fill={{ sky: '#cfe2ff', ground: '#5a6a30', intensity: 0.6 }}
      camera={{ position: [0, 0.75, 0], target: [0, 0.55, -4], fov: 55 }}
      orb={{ position: [0.9, 1.05, -3.4], radius: 0.18 }}
      look={{ light: [0.6, 0.7], tint: '#f4f9ff', rim: '#f2f8ff', haloColor: '#d6ebff', halo: 0.45, bend: 2.0, gain: 1.5 }}
      streak={{ dir: [-1, -0.3], len: 0.85, width: 0.045, color: '#cfe6ff', strength: 1.0 }}
      clear="#9fb8d6"
      poster={{ portrait: '/poster/scene4-portrait.webp', landscape: '/poster/scene4-landscape.webp' }}
      bloom={0.45}
    >
      <WaterPlane near={3.5} y={0.02} wind={3} fetch={8000} chl={0.3} metersPerUnit={1.5} sunFrom={[7, 3, -8]} sunColor="#fff2dc" lift={4} shore={2.2} sparkle={1.3} skyBright={0.6} reflGain={1.2} />
      {GRASS.map(([x, z, s], i) => (
        <Fit key={i} size={s} position={[x, 0, z]} rotation={[0, i * 1.7, 0]}>
          <GrassMedium01 />
        </Fit>
      ))}
      <Fit size={0.7} position={[1.35, 0, -2.2]} rotation={[0, 0.8, 0]}>
        <RockMossSet02 />
      </Fit>
    </ScanScene>
  )
}
