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
      water={{ top: '#58c6e2', deep: '#0a3f5e', fog: 0.085 }}
      sun={{ from: [-1.5, 10, -2], color: '#d8f4ff', intensity: 2.6 }}
      fill={{ sky: '#8fdcf2', ground: '#4a3c24', intensity: 1.35 }}
      camera={{ position: [0, 0.55, 0], target: [0, 0.25, -2.4], fov: 50 }}
      orb={{ position: [0, 0.22, -2.2], radius: 0.22 }}
      look={{ light: [-0.2, 1], tint: '#fff4e6', rim: '#e6f6ff', haloColor: '#ffd9a0', halo: 0.7, bob: 0, bend: 2.0, gain: 1.4, core: [0.9, 0.6, 0.3] }}
      rays={{ x: 0.46, y: 1.12, color: '#cfeeff', strength: 0.62, haze: 0.26 }}
      glow={{ color: '#ffd9a0', intensity: 1.1, distance: 1.6 }}
      clear="#08324e"
      poster={{ portrait: '/poster/scene8-portrait.webp', landscape: '/poster/scene8-landscape.webp' }}
      bloom={0.65}
    >
      <Fit size={14} position={[0, -0.6, -4]} rotation={[0, 0, 0]} tint="#fff0cc" emissive={['#7a5a34', 0.30]}>
        <SandRocksSmall01 />
      </Fit>
      <Fit size={1.6} position={[-1.5, 0, -3.2]} rotation={[0, 0.7, 0]} tint="#9fb0a8">
        <CoastRocks05 />
      </Fit>
      <Fit size={1.4} position={[1.6, 0, -3.4]} rotation={[0, 2.4, 0]} tint="#a8b0a0">
        <CoastRocks05 />
      </Fit>
      <Fit size={0.62} position={[-1.05, 0.05, -2.7]} rotation={[0, 0.4, 0]} tint="#e8c2cc" emissive={['#7a4050', 0.10]}>
        <CoralAcropora />
      </Fit>
      <Fit size={0.60} position={[0.95, 0.05, -2.55]} rotation={[0, 1.2, 0]} tint="#e8c0a0" emissive={['#8a5a38', 0.10]}>
        <CoralPocillopora />
      </Fit>
      <Fit size={0.6} position={[1.5, 0.1, -2.9]} rotation={[0, 0.2, 0]} tint="#c8bcd8" emissive={['#5a4a70', 0.08]}>
        <CoralPorites />
      </Fit>
      <Fit size={0.45} position={[-0.55, 0, -1.9]} rotation={[0, 2.0, 0]} tint="#e0c8a8" emissive={['#6a5038', 0.08]}>
        <CoralFavia />
      </Fit>
      <Fit size={0.22} position={[0.45, 0, -1.75]} rotation={[0, 0.8, 0]}>
        <LambisShell />
      </Fit>
    </ScanScene>
  )
}
