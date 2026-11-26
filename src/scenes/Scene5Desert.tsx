import * as THREE from 'three'
import { ScanScene } from './scan/ScanScene'
import { Fit } from './scan/Fit'
import { WaterPlane } from './scan/WaterPlane'
import { NamaqualandBoulder02 } from '../scans/models/NamaqualandBoulder02'
import { ScanPalm } from './scan/ScanPalm'
import { GrassMedium02Field, type GrassInstance } from '../scans/models/GrassMedium02'
import { scatterTufts, sstep } from '../scans/scatter'
import { caps } from '../gl/capabilities'
import { SandRocksSmall01 } from '../scans/models/SandRocksSmall01'

/**
 * Scene 5 — Desert. The orb soars with a warm streak over desert rock and sparse trees.
 *
 * World: Poly Haven `goegap` (a photographed Namaqualand desert, red sand and koppies under a clear
 * sky), ground-projected. Props, all scans: palms built from scanned bark and fern fronds, scanned
 * grass tufts as GPU instances around the pool, granite boulders and sandstone rocks for the ruins'
 * massing, around an oasis pool that mirrors the photographed sky.
 */

const ROCKS: [number, number, number][] = [[-1.8, -5.5, 1.3], [2.9, -4.2, 0.9], [-0.9, -1.9, 0.5], [0.9, -1.6, 0.4], [-3.0, -7.0, 0.3], [3.4, -7.0, 0.3], [2.4, -5.2, 0.6]]
/** soft grass and reed drifts around the oasis: scanned tufts as GPU instances, kept off boulders, thinner and shorter near the camera */
function oasisGrass(count: number): GrassInstance[] {
  return scatterTufts({
    count, z: [-1.0, -7.5], seed: 5, y: 0,
    halfW: (z) => 0.8 * -z + 0.6,
    scale: [0.6, 0.6],
    tints: [new THREE.Color(1.4, 1.6, 0.8), new THREE.Color(1.9, 2.0, 1.0), new THREE.Color(2.4, 2.3, 1.3)],
    mask: (x, z) => ROCKS.reduce((m, [rx, rz, r]) => m * sstep(r * 0.8, r * 1.3, Math.hypot(x - rx, z - rz)), 1) * sstep(3.0, 3.6, Math.hypot(x + 0.8, (z + 5.4) * 0.8)),
  })
}
let grass: GrassInstance[] | null = null
const grassField = () => (grass ??= oasisGrass(caps().lowTier ? 600 : 2600))

export function Scene5Desert() {
  return (
    <ScanScene
      hdri="/scans/hdri/goegap.webp"
      ground={{ height: 1.8, radius: 70 }}
      envIntensity={1.3}
      bgIntensity={1.0}
      sun={{ from: [-5, 7, -2], color: '#ffe6c2', intensity: 2.4 }}
      fill={{ sky: '#cfe0f5', ground: '#a0704a', intensity: 0.5 }}
      camera={{ position: [0, 1.2, 0], target: [0, 0.8, -5], fov: 55 }}
      orb={{ position: [-0.4, 1.15, -3.0], radius: 0.22 }}
      look={{ light: [-0.6, 0.7], tint: '#fff8ee', rim: '#fff4e2', haloColor: '#ffe2b8', halo: 0.45, bend: 2.0, gain: 1.45 }}
      streak={{ dir: [1, -0.25], len: 0.9, width: 0.05, color: '#ffd9a0', strength: 1.0 }}
      clear="#d9b48a"
      poster={{ portrait: '/poster/scene5-portrait.webp', landscape: '/poster/scene5-landscape.webp' }}
      bloom={0.6}
      exposure={1.2}
      haze={0.4}
      soften={{ amount: 0.3, radius: 3, mist: 0.18 }}
    >
      <WaterPlane far={2.6} at={[-0.8, -5.4]} y={0.015} wind={2.5} fetch={300} chl={0.03} metersPerUnit={0.6} depth={1.6} sunFrom={[-5, 7, -2]} sunColor="#ffe6c2" lift={0.8} skyBright={0} />
      <ScanPalm height={3.0} position={[-3.0, 0, -7.0]} yaw={0.4} />
      <ScanPalm height={2.5} position={[-1.8, 0, -8.0]} yaw={1.7} fronds={8} />
      <ScanPalm height={2.2} position={[2.0, 0, -9.0]} yaw={0.9} fronds={8} />
      <ScanPalm height={1.9} position={[3.4, 0, -7.0]} yaw={2.4} fronds={7} />
      <GrassMedium02Field instances={grassField()} sunFrom={[-5, 7, -2]} sunColor="#ffe6c2" sway={0.01} translucency={1.4} />
      <Fit size={2.2} position={[-1.8, 0, -5.5]} rotation={[0, 0.3, 0]}>
        <NamaqualandBoulder02 />
      </Fit>
      <Fit size={1.3} position={[2.9, 0, -4.2]} rotation={[0, 1.4, 0]}>
        <NamaqualandBoulder02 />
      </Fit>
      <Fit size={0.9} position={[-0.9, 0, -1.9]} rotation={[0, 0.2, 0]}>
        <SandRocksSmall01 />
      </Fit>
      <Fit size={0.7} position={[0.9, 0, -1.6]} rotation={[0, 2.6, 0]}>
        <SandRocksSmall01 />
      </Fit>
    </ScanScene>
  )
}
