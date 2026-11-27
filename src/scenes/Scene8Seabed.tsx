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
      water={{ top: '#6fd0e6', deep: '#12608a', fog: 0.072 }}
      sun={{ from: [-1.5, 10, -2], color: '#e2f6ff', intensity: 2.7 }}
      fill={{ sky: '#9fe4f6', ground: '#6a5636', intensity: 1.4 }}
      camera={{ position: [0, 0.55, 0], target: [0, 0.25, -2.4], fov: 50 }}
      orb={{ position: [0, 0.22, -2.2], radius: 0.17 }}
      look={{ light: [-0.2, 1], tint: '#fff4e6', rim: '#e6f6ff', haloColor: '#ffd9a0', halo: 0.38, bob: 0, bend: 2.2, gain: 1.2, core: [0.45, 0.3, 0.14] }}
      rays={{ x: 0.46, y: 1.12, color: '#cfeeff', strength: 0.8, haze: 0.2 }}
      glow={{ color: '#ffd9a0', intensity: 1.1, distance: 1.6 }}
      clear="#08324e"
      poster={{ portrait: '/poster/scene8-portrait.webp', landscape: '/poster/scene8-landscape.webp' }}
      bloom={0.55}
      soften={{ amount: 0.3, radius: 3.4, mist: 0.03 }}
    >
      <Fit size={16} position={[0, -0.55, -4]} rotation={[0, 0, 0]} strip="#e8d2ac" tint="#ffffff" emissive={['#8a6a3e', 0.16]} occlude={0.4}>
        <SandRocksSmall01 />
      </Fit>
      <Fit size={1.6} position={[-1.5, 0, -3.2]} rotation={[0, 0.7, 0]} tint="#9fb0a8">
        <CoastRocks05 />
      </Fit>
      <Fit size={1.4} position={[1.6, 0, -3.4]} rotation={[0, 2.4, 0]} tint="#a8b0a0">
        <CoastRocks05 />
      </Fit>
      <Fit size={0.7} position={[-1.05, -0.14, -2.7]} rotation={[0, 0.4, 0]} tint="#f0c8d2" emissive={['#7a4050', 0.08]} clipBelow={0.2} soft={1}>
        <CoralAcropora />
      </Fit>
      <Fit size={0.66} position={[0.95, -0.08, -2.55]} rotation={[0, 1.2, 0]} tint="#f0c8a4" emissive={['#8a5a38', 0.08]} clipBelow={0.2} soft={1}>
        <CoralPocillopora />
      </Fit>
      <Fit size={0.64} position={[1.5, -0.04, -2.9]} rotation={[0, 0.2, 0]} tint="#d6c8e8" emissive={['#5a4a70', 0.06]} clipBelow={0.2} soft={1}>
        <CoralPorites />
      </Fit>
      <Fit size={0.45} position={[-0.55, -0.09, -1.9]} rotation={[0, 2.0, 0]} tint="#e0c8a8" emissive={['#6a5038', 0.08]} clipBelow={0.2} soft={1}>
        <CoralFavia />
      </Fit>
      <Fit size={0.22} position={[0.45, 0, -1.75]} rotation={[0, 0.8, 0]}>
        <LambisShell />
      </Fit>
    </ScanScene>
  )
}
