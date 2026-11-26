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
import { Terrain } from './scan/Terrain'
import { SHARED_SKY } from './scan/sky'

// real relief, painterly light: Erg Chebbi's star dunes far off, the Sossusvlei dune floor around the oasis
const SUN5: [number, number, number] = [-0.55, 0.45, -0.7]
const ERG = { lit: '#f1c48f', shade: '#b07a5c', air: '#e8cdb6' }
const SAND = { lit: '#f0cf9e', shade: '#b98a62', air: '#ecd4b4' }

/**
 * Scene 5 — Desert. The orb soars with a warm streak over desert rock and sparse trees.
 *
 * World: the shared clear sky. Terrain from real elevation data (AWS terrain tiles): the Sossusvlei
 * dune floor around the oasis, Erg Chebbi's star dunes as the far range. Props, all scans: palms built from scanned bark and fern fronds, scanned
 * grass tufts as GPU instances around the pool, granite boulders and sandstone rocks for the ruins'
 * massing, around an oasis pool that mirrors the photographed sky.
 */

const ROCKS: [number, number, number][] = [[-3.6, -4.9, 1.3], [2.6, -2.6, 1.0], [-1.1, -1.4, 0.5], [-0.3, -1.2, 0.4], [-3.0, -7.0, 0.3], [3.4, -7.0, 0.3], [2.4, -5.2, 0.6]]
/** soft grass and reed drifts around the oasis: scanned tufts as GPU instances, kept off boulders, thinner and shorter near the camera */
function oasisGrass(count: number): GrassInstance[] {
  return scatterTufts({
    count, z: [-1.0, -7.5], seed: 5, y: 0,
    halfW: (z) => 0.8 * -z + 0.6,
    scale: [0.95, 0.95],
    tints: [new THREE.Color(2.4, 2.4, 1.2), new THREE.Color(3.0, 2.9, 1.5), new THREE.Color(3.6, 3.3, 1.8)],
    mask: (x, z) => ROCKS.reduce((m, [rx, rz, r]) => m * sstep(r * 0.8, r * 1.3, Math.hypot(x - rx, z - rz)), 1) * sstep(2.9, 3.5, Math.hypot(x - 0.2, (z + 6.2) * 0.8)),
  })
}
let grass: GrassInstance[] | null = null
const grassField = () => (grass ??= oasisGrass(caps().lowTier ? 300 : 900))

export function Scene5Desert() {
  return (
    <ScanScene
      hdri={SHARED_SKY}
      envIntensity={1.3}
      bgIntensity={1.0}
      sun={{ from: [-5, 7, -2], color: '#ffe6c2', intensity: 2.4 }}
      fill={{ sky: '#cfe0f5', ground: '#a0704a', intensity: 0.5 }}
      camera={{ position: [0, 1.9, 1.0], target: [0, 0.75, -6], fov: 55 }}
      orb={{ position: [0.5, 1.25, -5.0], radius: 0.2 }}
      look={{ light: [-0.6, 0.7], tint: '#fff8ee', rim: '#fff4e2', haloColor: '#ffe2b8', halo: 0.45, bend: 2.0, gain: 1.45 }}
      streak={{ dir: [1, -0.25], len: 0.9, width: 0.05, color: '#ffd9a0', strength: 1.0 }}
      clear="#d9b48a"
      poster={{ portrait: '/poster/scene5-portrait.webp', landscape: '/poster/scene5-landscape.webp' }}
      bloom={0.6}
      exposure={1.2}
      haze={0.5}
      soften={{ amount: 0.3, radius: 3, mist: 0.18 }}
    >
      <WaterPlane far={3.1} at={[0.2, -6.2]} y={0.015} wind={0.18} fetch={300} chl={0.02} metersPerUnit={0.6} depth={2.6} sunFrom={[-5, 7, -2]} sunColor="#ffe6c2" lift={0.42} skyBright={0.18} reflGain={0.95} shore={2.4} />
      <Terrain dem="/tex/dem/sand-h.webp" size={[60, 36]} relief={3.0} edge={0.02} position={[0, -0.03, -12]} sun={SUN5} haze={0.12} palette={SAND} segments={[160, 96]} basins={[[0.2, -6.2, 3.5], [1.9, -5.4, 2.7], [-1.7, -7.0, 2.9], [0, -1, 3.5]]} />
      <Terrain dem="/tex/dem/erg-h.webp" size={[160, 50]} relief={9} floor={0.08} position={[0, -0.2, -60]} sun={SUN5} haze={0.38} palette={ERG} />
      <ScanPalm height={3.6} position={[-4.2, 0, -6.2]} yaw={0.4} />
      <ScanPalm height={3.1} position={[-3.3, 0, -8.4]} yaw={1.7} variant={1} />
      <ScanPalm height={2.7} position={[-5.4, 0, -8.8]} yaw={0.9} variant={2} />
      <ScanPalm height={2.4} position={[-6.2, 0, -5.6]} yaw={2.9} variant={1} />
      <ScanPalm height={2.3} position={[1.6, 0, -12.5]} yaw={2.4} variant={2} />
      <ScanPalm height={1.9} position={[3.8, 0, -13.5]} yaw={1.1} />
      {/* the ruins: weathered sandstone columns, a lintel and fallen blocks on the left, as in the panel */}
      {[
        [-1.55, -4.15, 5.4, 0.95, 0.04],
        [-2.15, -4.45, 4.3, 0.80, -0.10],
        [-1.05, -4.95, 3.4, 0.68, 0.14],
        [-2.75, -5.25, 2.8, 0.58, -0.04],
      ].map(([x, z, h, w, tilt], i) => (
        <Fit key={`col-${i}`} size={w} position={[x, 0.55, z]} rotation={[tilt, i * 0.5, tilt * 0.6]} tint="#e8c49a" emissive={['#8a5a36', 0.35]} stretch={h / w}>
          <SandRocksSmall01 />
        </Fit>
      ))}
      <group position={[-1.85, 5.15, -4.3]} rotation={[0, 0.15, 0.02]}>
        <Fit size={2.0} tint="#e2bd92" emissive={['#8a5a36', 0.3]} stretch={0.32}>
          <SandRocksSmall01 />
        </Fit>
      </group>
      <Fit size={1.3} position={[-2.6, 0, -3.9]} rotation={[0, 1.1, 0]} tint="#e6c196" emissive={['#8a5a36', 0.3]} stretch={0.45}>
        <SandRocksSmall01 />
      </Fit>
      <GrassMedium02Field instances={grassField()} sunFrom={[-5, 7, -2]} sunColor="#ffe6c2" sway={0.01} translucency={1.4} />
      <Fit size={2.2} position={[-3.6, 0, -4.9]} rotation={[0, 0.3, 0]} tint="#f2c89a" emissive={['#8a5a36', 0.45]}>
        <NamaqualandBoulder02 />
      </Fit>
      <Fit size={1.6} position={[2.6, 0, -2.6]} rotation={[0, 1.4, 0]} tint="#f2c89a" emissive={['#8a5a36', 0.45]}>
        <NamaqualandBoulder02 />
      </Fit>
      <Fit size={0.9} position={[-1.1, 0, -1.4]} rotation={[0, 0.2, 0]} tint="#f6d2a8" emissive={['#8a5a36', 0.45]}>
        <SandRocksSmall01 />
      </Fit>
      <Fit size={0.7} position={[-0.3, 0, -1.2]} rotation={[0, 2.6, 0]} tint="#f6d2a8" emissive={['#8a5a36', 0.45]}>
        <SandRocksSmall01 />
      </Fit>
    </ScanScene>
  )
}
