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
 *
 * The water does the work: Beer–Lambert absorption of the red channel with distance (see ScanScene's
 * fog patch) turns the far floor back to cerulean, so the sand is a cool aquamarine mass lit by one
 * warm pool rather than a yellow field. Rocks and coral keep a blue shadow fill and a cyan rim.
 */

const SUN8: [number, number, number] = [-0.15, 0.95, -0.25]

export function Scene8Seabed() {
  return (
    <ScanScene
      water={{ top: '#63cde8', deep: '#125a86', fog: 0.11 }}
      sun={{ from: [-1.5, 10, -2], color: '#a8e6ff', intensity: 1.95 }}
      fill={{ sky: '#8adcf4', ground: '#2a6280', intensity: 1.6 }}
      camera={{ position: [0, 0.55, 0], target: [0, 0.25, -2.4], fov: 50 }}
      orb={{ position: [0, 0.22, -2.2], radius: 0.18 }}
      look={{ light: [-0.2, 1], tint: '#dcf4ff', rim: '#d8f4ff', haloColor: '#9ee0ff', halo: 0.42, bob: 0, bend: 2.15, gain: 1.08, core: [0.22, 0.16, 0.09] }}
      rays={{ x: 0.48, y: 1.15, color: '#b6ecff', strength: 0.55, haze: 0.26 }}
      glow={{ color: '#ffd699', intensity: 0.85, distance: 1.5 }}
      clear="#0a3858"
      poster={{ portrait: '/poster/scene8-portrait.webp', landscape: '/poster/scene8-landscape.webp' }}
      bloom={0.42}
      exposure={1.12}
      haze={0.1}
      shadowFloor="#1a3552"
      grade={0.45}
      soften={{ amount: 0.24, radius: 2.6, mist: 0.006, mistColor: '#2c82a8' }}
    >
      <Fit size={16} position={[0, -0.55, -4]} rotation={[0, 0, 0]} strip="#9ec6c6" tint="#ffffff" emissive={['#2f6076', 0.22]} occlude={0.35} soft={0.9} rimColor="#88dcfa" shadowTint="#163b58" sunDir={SUN8}>
        <SandRocksSmall01 />
      </Fit>
      <Fit size={1.65} position={[-1.45, -0.05, -3.1]} rotation={[0, 0.7, 0]} tint="#4e7c96" occlude={0.35} soft={0.95} rimColor="#78d4f0" shadowTint="#173854" sunDir={SUN8}>
        <CoastRocks05 />
      </Fit>
      <Fit size={1.45} position={[1.55, -0.04, -3.3]} rotation={[0, 2.4, 0]} tint="#54829a" occlude={0.35} soft={0.95} rimColor="#78d4f0" shadowTint="#173854" sunDir={SUN8}>
        <CoastRocks05 />
      </Fit>
      <Fit size={0.72} position={[-1.02, -0.14, -2.65]} rotation={[0, 0.4, 0]} tint="#d8a8c2" emissive={['#4a3250', 0.12]} clipBelow={0.2} soft={1} rimColor="#9ce4ff" shadowTint="#1e4264" sunDir={SUN8}>
        <CoralAcropora />
      </Fit>
      <Fit size={0.68} position={[0.92, -0.08, -2.5]} rotation={[0, 1.2, 0]} tint="#d8b0a0" emissive={['#4a3a48', 0.12]} clipBelow={0.2} soft={1} rimColor="#9ce4ff" shadowTint="#1e4264" sunDir={SUN8}>
        <CoralPocillopora />
      </Fit>
      <Fit size={0.66} position={[1.48, -0.04, -2.85]} rotation={[0, 0.2, 0]} tint="#9cb4dc" emissive={['#2c3e68', 0.1]} clipBelow={0.2} soft={1} rimColor="#9ce4ff" shadowTint="#1e4264" sunDir={SUN8}>
        <CoralPorites />
      </Fit>
      <Fit size={0.46} position={[-0.54, -0.09, -1.9]} rotation={[0, 2.0, 0]} tint="#b4a8b8" emissive={['#363854', 0.12]} clipBelow={0.2} soft={1} rimColor="#9ce4ff" shadowTint="#1e4264" sunDir={SUN8}>
        <CoralFavia />
      </Fit>
      <Fit size={0.22} position={[0.45, 0, -1.75]} rotation={[0, 0.8, 0]} tint="#b8ced8" soft={0.85} rimColor="#9ce4ff" shadowTint="#1e4264" sunDir={SUN8}>
        <LambisShell />
      </Fit>
    </ScanScene>
  )
}
