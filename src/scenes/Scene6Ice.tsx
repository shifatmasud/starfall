import { ScanScene } from './scan/ScanScene'
import { Fit } from './scan/Fit'
import { WaterPlane } from './scan/WaterPlane'
import { NamaqualandBoulder02 } from '../scans/models/NamaqualandBoulder02'

/**
 * Scene 6 — Ocean (Ice). The orb glides with a cold streak low over blue water past ice.
 *
 * World: Poly Haven `passendorf_snow` (a photographed winter sky over a snowy plain, low sun),
 * its flat horizon carried over by open water that mirrors that sky. The bergs are scanned granite boulders, whitened to ice with a cold inner glow: the
 * angular massing of real rock, the colour of the reference's bergs.
 */

const BERGS: [number, number, number, number][] = [
  [-1.6, -2.6, 1.3, 0.3], [1.9, -3.2, 1.7, 2.1], [-0.5, -1.8, 0.35, 1.2], [0.4, -6.5, 0.6, 2.8], [4.5, -11.0, 2.4, 0.9],
  [-4.5, -10.0, 2.0, 1.9], [-1.8, -7.0, 0.5, 0.4], [1.2, -1.9, 0.3, 1.0], [-3.0, -4.5, 0.4, 2.2], [2.8, -6.0, 0.45, 0.6],
  [-0.2, -12.0, 0.9, 1.4], [6.5, -7.5, 0.7, 2.5]
]

export function Scene6Ice() {
  return (
    <ScanScene
      hdri="/scans/hdri/passendorf_snow.webp"
      bgIntensity={1.25}
      envIntensity={1.3}
      skyYaw={90}
      sun={{ from: [3, 5, -4], color: '#f4f8ff', intensity: 2.2 }}
      fill={{ sky: '#d8ecff', ground: '#2a5a7a', intensity: 0.7 }}
      camera={{ position: [0, 1.5, 0], target: [0, 0.3, -5], fov: 55 }}
      orb={{ position: [0.9, 0.85, -3.4], radius: 0.18 }}
      look={{ light: [0.5, 0.75], tint: '#eef8ff', rim: '#eaf6ff', haloColor: '#cfe9ff', halo: 0.45, bend: 2.0, gain: 1.45 }}
      streak={{ dir: [-1, -0.25], len: 0.9, width: 0.045, color: '#bfe2ff', strength: 1.0 }}
      clear="#7fa8c8"
      poster={{ portrait: '/poster/scene6-portrait.webp', landscape: '/poster/scene6-landscape.webp' }}
      bloom={0.45}
    >
      <WaterPlane color="#8cc0e8" near={0} y={0.0} roughness={0.14} />
      {BERGS.map(([x, z, s, r], i) => (
        <Fit key={i} size={s} position={[x, -0.05, z]} rotation={[0, r, 0]} tint="#ffffff" emissive={['#d8ecfa', 0.6]} roughness={0.3} stretch={0.8}>
          <NamaqualandBoulder02 />
        </Fit>
      ))}
    </ScanScene>
  )
}
