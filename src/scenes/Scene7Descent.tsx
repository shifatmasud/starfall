import { ScanScene } from './scan/ScanScene'
import { Fit } from './scan/Fit'
import { CoralAcropora } from '../scans/models/CoralAcropora'
import { CoralPocillopora } from '../scans/models/CoralPocillopora'
import { CoastRocks05 } from '../scans/models/CoastRocks05'
import { FishSchool } from './scan/Fish'
import { SeaFloor } from './scan/SeaFloor'

/**
 * Scene 7 — Underwater descent. The orb plunges through open water trailing bubbles, light shafts
 * from the surface above, the reef far below.
 *
 * No sky photograph exists under the sea, so the water is a depth-graded sea with exponential fog;
 * the reef below is Smithsonian CC0 coral photogrammetry on scanned rock, fading into the blue.
 */

export function Scene7Descent() {
  return (
    <ScanScene
      water={{ top: '#6fd4f6', deep: '#0d5c9c', fog: 0.030 }}
      sun={{ from: [-3, 10, 2], color: '#d8f6ff', intensity: 2.8 }}
      fill={{ sky: '#a8e4ff', ground: '#0a3350', intensity: 1.25 }}
      camera={{ position: [0, 0, 0], target: [-0.2, -0.3, -4], fov: 55 }}
      orb={{ position: [1.1, -1.1, -3.4], radius: 0.24 }}
      look={{ light: [-0.2, 1], tint: '#dff2ff', rim: '#dff4ff', haloColor: '#9fe0ff', halo: 0.42, bend: 2.2, gain: 1.25, core: [0.06, 0.14, 0.2] }}
      bubbles={{ dir: [-0.78, 0.63], len: 0.95, spread: 0.15, size: 0.017, count: 170 }}
      rays={{ x: 0.42, y: 1.12, color: '#d8f8ff', strength: 0.85, haze: 0.2 }}
      glow={{ color: '#9fe0ff', intensity: 1.2, distance: 3 }}
      clear="#0b5a9a"
      poster={{ portrait: '/poster/scene7-portrait.webp', landscape: '/poster/scene7-landscape.webp' }}
      bloom={0.6}
    >
      <SeaFloor y={-3.6} color="#3f5f66" size={2000} />
      <Fit size={5.0} position={[-3.2, -3.55, -7]} rotation={[0, 0.5, 0]} tint="#b6d0da">
        <CoastRocks05 />
      </Fit>
      <Fit size={2.0} position={[-4.2, -2.55, -6.0]} tint="#d8b0b8" emissive={['#7a4a58', 0.12]}>
        <CoralAcropora />
      </Fit>
      <Fit size={1.6} position={[1.8, -3.6, -5.8]} tint="#e0b898" emissive={['#8a5a40', 0.12]}>
        <CoralPocillopora />
      </Fit>
      <FishSchool center={[-0.6, -1.1, -6.4]} spread={[3.6, 1.2, 2.4]} count={30} size={0.16} color="#0e3348" seed={5} />
    </ScanScene>
  )
}
