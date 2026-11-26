import { ScanScene } from './scan/ScanScene'
import { Fit } from './scan/Fit'
import { CoralAcropora } from '../scans/models/CoralAcropora'
import { CoralPocillopora } from '../scans/models/CoralPocillopora'
import { CoralPorites } from '../scans/models/CoralPorites'
import { CoralFavia } from '../scans/models/CoralFavia'
import { CoastRocks05 } from '../scans/models/CoastRocks05'
import { SandRocksSmall01 } from '../scans/models/SandRocksSmall01'
import { LambisShell } from '../scans/models/LambisShell'

/**
 * Scene 8 — Underwater bottom. The orb settles glowing on the sea floor amid coral and rock, light
 * shafts falling from the surface.
 *
 * The reef is real: four Smithsonian CC0 coral specimens (Acropora, Pocillopora, Porites, Favia),
 * Poly Haven scanned rock and a scanned conch shell, on a sandy floor of scanned sand-rock. The orb
 * carries a warm heart, the reference's glow, and lights the coral around it.
 */

export function Scene8Seabed() {
  return (
    <ScanScene
      water={{ top: '#3fb0d8', deep: '#042a44', fog: 0.12 }}
      sun={{ from: [0.5, 10, -2], color: '#bfeaff', intensity: 2.0 }}
      fill={{ sky: '#6cc8ec', ground: '#3a3020', intensity: 0.9 }}
      camera={{ position: [0, 0.55, 0], target: [0, 0.25, -2.4], fov: 50 }}
      orb={{ position: [0, 0.22, -2.2], radius: 0.22 }}
      look={{ light: [-0.2, 1], tint: '#fff4e6', rim: '#e6f6ff', haloColor: '#ffd9a0', halo: 0.7, bob: 0, bend: 2.0, gain: 1.4, core: [0.9, 0.6, 0.3] }}
      rays={{ x: 0.5, y: 1.12, color: '#8fe0ff', strength: 0.4, haze: 0.4 }}
      glow={{ color: '#ffd9a0', intensity: 1.1, distance: 1.6 }}
      clear="#08324e"
      poster={{ portrait: '/poster/scene8-portrait.webp', landscape: '/poster/scene8-landscape.webp' }}
      bloom={0.65}
    >
      <Fit size={14} position={[0, -0.6, -4]} rotation={[0, 0, 0]} tint="#fff0d0">
        <SandRocksSmall01 />
      </Fit>
      <Fit size={1.6} position={[-1.5, 0, -3.2]} rotation={[0, 0.7, 0]} tint="#9fb0a8">
        <CoastRocks05 />
      </Fit>
      <Fit size={1.4} position={[1.6, 0, -3.4]} rotation={[0, 2.4, 0]} tint="#a8b0a0">
        <CoastRocks05 />
      </Fit>
      <Fit size={0.9} position={[-1.0, 0.1, -2.6]} rotation={[0, 0.4, 0]}>
        <CoralAcropora />
      </Fit>
      <Fit size={0.7} position={[0.95, 0.05, -2.5]} rotation={[0, 1.2, 0]}>
        <CoralPocillopora />
      </Fit>
      <Fit size={0.6} position={[1.5, 0.1, -2.9]} rotation={[0, 0.2, 0]}>
        <CoralPorites />
      </Fit>
      <Fit size={0.45} position={[-0.55, 0, -1.9]} rotation={[0, 2.0, 0]}>
        <CoralFavia />
      </Fit>
      <Fit size={0.22} position={[0.45, 0, -1.75]} rotation={[0, 0.8, 0]}>
        <LambisShell />
      </Fit>
    </ScanScene>
  )
}
