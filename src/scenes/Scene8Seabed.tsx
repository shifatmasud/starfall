import { ScanScene } from './scan/ScanScene'
import { Fit } from './scan/Fit'
import { LambisShell } from '../scans/models/LambisShell'
import { ReefFloor, ReefRock, ReefLife } from './reef/Reef'

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
      water={{ top: '#2f86a4', deep: '#07203a', fog: 0.15 }}
      sun={{ from: [-1.5, 10, -2], color: '#a8e6ff', intensity: 1.95 }}
      fill={{ sky: '#8adcf4', ground: '#2a6280', intensity: 1.6 }}
      camera={{ position: [0, 0.55, 0], target: [0, 0.25, -2.4], fov: 50 }}
      orb={{ position: [0, 0.22, -2.2], radius: 0.18 }}
      look={{ light: [-0.2, 1], tint: '#dcf4ff', rim: '#d8f4ff', haloColor: '#9ee0ff', halo: 0.42, bob: 0, bend: 2.15, gain: 1.08, core: [0.22, 0.16, 0.09] }}
      rays={{ x: 0.48, y: 1.15, color: '#b6ecff', strength: 0.42, haze: 0.2 }}
      glow={{ color: '#ffd699', intensity: 0.85, distance: 1.5 }}
      clear="#0a3858"
      poster={{ portrait: '/poster/scene8-portrait.webp', landscape: '/poster/scene8-landscape.webp' }}
      bloom={0.42}
      exposure={1.34}
      haze={0.13}
      shadowFloor="#1a3552"
      grade={0.45}
      saturation={1.1}
      gamma={1.16}
      splitTone={{ shadow: '#6f9fd0', highlight: '#ffe2b4', strength: 0.22 }}
      soften={{ amount: 0.24, radius: 2.6, mist: 0.006, mistColor: '#2c82a8' }}
    >
      <ReefFloor radius={26} />
      <ReefRock position={[-2.9, -0.15, -4.6]} scale={[1.9, 1.25, 1.6]} seed={3} />
      <ReefRock position={[2.8, -0.12, -4.2]} scale={[1.7, 1.1, 1.5]} seed={7} />
      <ReefRock position={[-3.9, -0.3, -7.4]} scale={[2.4, 1.5, 2.0]} seed={11} />
      <ReefRock position={[3.7, -0.28, -7.8]} scale={[2.2, 1.4, 1.9]} seed={15} />
      <ReefLife />
      <Fit size={0.2} position={[0.42, 0.02, -1.85]} rotation={[0, 0.8, 0]} tint="#cfe0e4" soft={0.85} rimColor="#9ce4ff" shadowTint="#16384a" sunDir={SUN8}>
        <LambisShell />
      </Fit>
    </ScanScene>
  )
}
