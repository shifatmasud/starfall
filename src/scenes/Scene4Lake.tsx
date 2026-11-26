import * as THREE from 'three'
import { ScanScene } from './scan/ScanScene'
import { Fit } from './scan/Fit'
import { WaterPlane } from './scan/WaterPlane'
import { GrassMedium02Field, type GrassInstance } from '../scans/models/GrassMedium02'
import { FlowerHeliophila } from '../scans/models/FlowerHeliophila'
import { scatterTufts, hash, sstep } from '../scans/scatter'
import { caps } from '../gl/capabilities'
import { NamaqualandBoulder02 } from '../scans/models/NamaqualandBoulder02'
import { Terrain } from './scan/Terrain'
import { SHARED_SKY } from './scan/sky'

// real relief, painterly light: the Bernese Alps across the lake, the Harder ridge on the right, the Boedeli pasture underfoot
const SUN4: [number, number, number] = [0.5, 0.55, -0.65]
const ALPS = { lit: '#9cadc6', shade: '#5f7699', snowLit: '#f4f7fc', snowShade: '#aebfd8', snowLine: 0.62, air: '#b4c8e0' }
const RIDGE = { lit: '#8fae52', shade: '#3c6236', air: '#a8c2cc' }
const BANK = { lit: '#a9b65e', shade: '#5f7a38', air: '#d0d8a0' }

/**
 * Scene 4 — Lake. The orb flies with a light streak over a meadow toward a mountain-bordered lake.
 *
 * World: the shared clear sky. Terrain from real elevation data (AWS terrain tiles): the Boedeli
 * pasture at Interlaken as the near bank, the Harder ridge as the hillside on the right, the Bernese
 * Alps as the far range across a calm lake that mirrors them. Props: scanned grass tufts, scanned
 * flowers whitened to the reference's daisies, a scanned boulder on the bank.
 */

/** meadow bank: scanned grass tufts as GPU instances, thinning toward the lake's edge and clear of the rock */
function meadow(count: number): GrassInstance[] {
  return scatterTufts({
    count, z: [0.4, -3.6], seed: 4, y: -0.005,
    tints: [new THREE.Color(2.2, 2.4, 1.1), new THREE.Color(2.9, 3.0, 1.4), new THREE.Color(3.6, 3.5, 1.9)],
    halfW: (z) => 0.62 * (0.6 - z) + 0.4,
    scale: [0.38, 0.4],
    mask: (x, z) => (1 - sstep(2.7, 3.3, -z) * 0.7) * sstep(0.28, 0.5, Math.hypot(x - 1.35, z + 2.2)),
  })
}
let grass: GrassInstance[] | null = null
const grassField = () => (grass ??= meadow(caps().lowTier ? 4000 : 12000))

/** small white scanned flowers scattered in the foreground drifts (Heliophila's foot is off its origin) */
const FLOWERS = Array.from({ length: 26 }, (_, i) => {
  const z = -0.5 - 2.6 * Math.pow(hash(i * 1.7, 2.2), 1.1)
  const x = (hash(i * 3.1, 5.5) * 2 - 1) * (0.7 * -z + 0.2)
  return { x, z, s: 1.0 + 0.6 * hash(i * 7.7, 1.3), r: hash(i * 2.9, 9.1) * 6.28 }
}).filter((f) => Math.hypot(f.x - 1.35, f.z + 2.2) > 0.5)

export function Scene4Lake() {
  return (
    <ScanScene
      hdri={SHARED_SKY}
      bgIntensity={1.25}
      exposure={1.1}
      haze={0.35}
      soften={{ amount: 0.25, radius: 3, mist: 0.12 }}
      envIntensity={1.4}
      sun={{ from: [4, 6, -3], color: '#fff2dc', intensity: 2.0 }}
      fill={{ sky: '#cfe2ff', ground: '#5a6a30', intensity: 0.6 }}
      camera={{ position: [0, 1.05, 0.2], target: [0, 0.62, -6], fov: 55 }}
      orb={{ position: [0.15, 1.15, -6.5], radius: 0.2 }}
      look={{ light: [0.6, 0.7], tint: '#f4f9ff', rim: '#f2f8ff', haloColor: '#d6ebff', halo: 0.45, bend: 2.0, gain: 1.5 }}
      streak={{ dir: [-1, -0.3], len: 0.85, width: 0.045, color: '#cfe6ff', strength: 1.0 }}
      clear="#9fb8d6"
      poster={{ portrait: '/poster/scene4-portrait.webp', landscape: '/poster/scene4-landscape.webp' }}
      bloom={0.45}
    >
      <WaterPlane near={3.5} y={0.02} wind={1.2} fetch={8000} chl={0.3} metersPerUnit={1.5} sunFrom={[7, 3, -8]} sunColor="#fff2dc" lift={0.9} shore={2.2} sparkle={1.0} skyBright={0.15} reflGain={0.75} />
      <Terrain dem="/tex/dem/meadow-h.webp" size={[30, 9]} relief={0.3} edge={0.01} position={[0, -0.08, -0.6]} sun={SUN4} haze={0.05} palette={BANK} segments={[96, 48]} />
      <Terrain dem="/tex/dem/ridge-h.webp" size={[30, 22]} relief={5.5} floor={0.05} position={[16, -0.2, -22]} yaw={0.9} sun={SUN4} haze={0.3} palette={RIDGE} />
      <Terrain dem="/tex/dem/alps-h.webp" size={[240, 60]} relief={10} floor={0.15} position={[-10, -0.4, -125]} yaw={Math.PI} sun={SUN4} haze={0.42} palette={ALPS} />
      <GrassMedium02Field instances={grassField()} sunFrom={[4, 6, -3]} sunColor="#fff2dc" sway={0.012} translucency={1.6} />
      {FLOWERS.map((f, i) => (
        <Fit key={i} size={0.12 * f.s} position={[f.x, 0, f.z]} rotation={[0, f.r, 0]} tint="#ffffff" emissive={['#fff8e8', 0.35]}>
          <FlowerHeliophila />
        </Fit>
      ))}
      <Fit size={0.7} position={[1.35, 0, -2.2]} rotation={[0, 0.8, 0]} tint="#9a9888">
        <NamaqualandBoulder02 />
      </Fit>
    </ScanScene>
  )
}
