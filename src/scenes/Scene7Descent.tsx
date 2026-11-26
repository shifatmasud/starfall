import { ScanScene } from './scan/ScanScene'
import { Fit } from './scan/Fit'
import { CoralAcropora } from '../scans/models/CoralAcropora'
import { CoralPocillopora } from '../scans/models/CoralPocillopora'
import { CoastRocks05 } from '../scans/models/CoastRocks05'

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
      water={{ top: '#7fdcf2', deep: '#0a4a70', fog: 0.06 }}
      sun={{ from: [1, 10, 1], color: '#bfeaff', intensity: 2.2 }}
      fill={{ sky: '#7fd0f0', ground: '#06243a', intensity: 0.9 }}
      camera={{ position: [0, 0, 0], target: [0, -0.9, -4], fov: 55 }}
      orb={{ position: [0.15, -1.0, -3.4], radius: 0.24 }}
      look={{ light: [-0.2, 1], tint: '#e8f8ff', rim: '#dff4ff', haloColor: '#9fe0ff', halo: 0.6, bend: 2.0, gain: 1.5, core: [0.15, 0.3, 0.4] }}
      bubbles={{ dir: [-0.25, 1], len: 0.75, spread: 0.12, size: 0.012, count: 110 }}
      rays={{ x: 0.3, y: 1.15, color: '#9fe6ff', strength: 0.35, haze: 0.5 }}
      glow={{ color: '#9fe0ff', intensity: 1.2, distance: 3 }}
      clear="#0b3c5c"
      poster={{ portrait: '/poster/scene7-portrait.webp', landscape: '/poster/scene7-landscape.webp' }}
      bloom={0.6}
    >
      <Fit size={5.0} position={[0, -4.2, -7]} rotation={[0, 0.5, 0]} tint="#9fb6c0">
        <CoastRocks05 />
      </Fit>
      <Fit size={2.0} position={[-2.0, -3.4, -6.0]}>
        <CoralAcropora />
      </Fit>
      <Fit size={1.6} position={[1.8, -3.5, -5.8]}>
        <CoralPocillopora />
      </Fit>
    </ScanScene>
  )
}
