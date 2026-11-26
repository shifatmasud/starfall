import * as THREE from 'three'
import { ScanScene } from './scan/ScanScene'
import { Fit } from './scan/Fit'
import { WaterPlane } from './scan/WaterPlane'
import { GrassMedium02Field, type GrassInstance } from '../scans/models/GrassMedium02'
import { FlowerHeliophila } from '../scans/models/FlowerHeliophila'
import { scatterTufts, hash, sstep } from '../scans/scatter'
import { caps } from '../gl/capabilities'
import { RockMossSet02 } from '../scans/models/RockMossSet02'

/**
 * Scene 4 — Lake. The orb flies with a light streak over a meadow toward a mountain-bordered lake.
 *
 * World: Poly Haven `alps_field` (a photographed alpine meadow under peaks), ground-projected so its
 * own meadow is the near bank; beyond it a lake mirrors the photographed sky and peaks. Props: scanned grass clumps and mossy rocks along the
 * foreground, like the reference's flowered bank.
 */

/** meadow bank: scanned grass tufts as GPU instances, thinning toward the lake's edge and clear of the rock */
function meadow(count: number): GrassInstance[] {
  return scatterTufts({
    count, z: [-0.3, -3.5], seed: 4, y: -0.005,
    tints: [new THREE.Color(2.0, 2.5, 1.1), new THREE.Color(2.6, 3.1, 1.3), new THREE.Color(3.3, 3.6, 1.7)],
    halfW: (z) => 0.75 * -z + 0.3,
    scale: [0.38, 0.4],
    mask: (x, z) => (1 - sstep(2.7, 3.3, -z) * 0.7) * sstep(0.28, 0.5, Math.hypot(x - 1.35, z + 2.2)),
  })
}
let grass: GrassInstance[] | null = null
const grassField = () => (grass ??= meadow(caps().lowTier ? 2500 : 8000))

/** small white scanned flowers scattered in the foreground drifts (Heliophila's foot is off its origin) */
const FLOWERS = Array.from({ length: 26 }, (_, i) => {
  const z = -0.5 - 2.6 * Math.pow(hash(i * 1.7, 2.2), 1.1)
  const x = (hash(i * 3.1, 5.5) * 2 - 1) * (0.7 * -z + 0.2)
  return { x, z, s: 1.0 + 0.6 * hash(i * 7.7, 1.3), r: hash(i * 2.9, 9.1) * 6.28 }
}).filter((f) => Math.hypot(f.x - 1.35, f.z + 2.2) > 0.5)

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
      <WaterPlane near={3.5} y={0.02} wind={3} fetch={8000} chl={0.3} metersPerUnit={1.5} sunFrom={[7, 3, -8]} sunColor="#fff2dc" lift={1.6} shore={2.2} sparkle={1.3} skyBright={0.6} reflGain={1.2} />
      <GrassMedium02Field instances={grassField()} sunFrom={[4, 6, -3]} sunColor="#fff2dc" sway={0.012} translucency={1.6} />
      {FLOWERS.map((f, i) => (
        <group key={i} position={[f.x, 0, f.z]} rotation={[0, f.r, 0]} scale={f.s}>
          <FlowerHeliophila position={[-1.163, 0, 0.017]} />
        </group>
      ))}
      <Fit size={0.7} position={[1.35, 0, -2.2]} rotation={[0, 0.8, 0]}>
        <RockMossSet02 />
      </Fit>
    </ScanScene>
  )
}
