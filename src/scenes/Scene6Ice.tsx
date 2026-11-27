import { ScanScene } from './scan/ScanScene'
import { Fit } from './scan/Fit'
import { WaterPlane } from './scan/WaterPlane'
import { A_ICE } from '../physics/optics'
import { NamaqualandBoulder02 } from '../scans/models/NamaqualandBoulder02'
import { Terrain } from './scan/Terrain'
import { SHARED_SKY } from './scan/sky'

/**
 * Scene 6 — Ocean (Ice). The orb glides with a cold streak low over blue water past ice.
 *
 * World: the shared clear sky over open water that mirrors it, and on the horizon the ice front:
 * real relief of the Saint Elias range (USGS NED via AWS terrain tiles), clad in snow and blue shade. The bergs are scanned granite boulders, whitened to ice with a cold inner glow: the
 * angular massing of real rock, the colour of the reference's bergs.
 */

const BERGS: [number, number, number, number][] = [
  [-1.0, -3.9, 1.7, 0.3], [1.7, -5.2, 2.7, 2.1], [-0.5, -1.8, 0.35, 1.2], [0.4, -6.5, 0.6, 2.8], [4.5, -11.0, 2.4, 0.9],
  [-4.5, -10.0, 2.0, 1.9], [-1.8, -7.0, 0.5, 0.4], [1.2, -1.9, 0.3, 1.0], [-3.0, -4.5, 0.4, 2.2], [2.8, -6.0, 0.45, 0.6],
  [-0.2, -12.0, 0.9, 1.4], [6.5, -7.5, 0.7, 2.5],
  // the brash of small floes scattered to the horizon
  [-5.5, -6.0, 0.5, 0.7], [-3.6, -14.0, 0.8, 2.0], [1.8, -16.0, 0.7, 0.2], [-7.5, -18.0, 1.1, 1.1], [3.6, -20.0, 0.9, 2.4],
  [-2.2, -24.0, 1.0, 0.8], [7.5, -22.0, 1.2, 1.7], [-9.0, -12.0, 0.8, 2.9], [0.8, -9.0, 0.35, 0.5], [-2.8, -2.6, 0.3, 1.8],
  [3.5, -2.8, 0.35, 2.6], [5.0, -4.5, 0.4, 0.4], [-6.2, -3.6, 0.45, 1.3], [10.0, -15.0, 0.9, 0.6]
]

// ice SSS: Beer–Lambert through ~1.5 m of ice with Warren & Brandt (2008) absorption: red is absorbed first, light leaves blue.
// Kept low: a berg is opaque dense ice lit by the sun, not a lamp — the blue belongs in the shadowed faces and thin skirts.
const ICE = { color: A_ICE.map((a) => Math.exp(-a * 1.5 * 8)) as [number, number, number], strength: 0.55, power: 3, ambient: 0.1 }

// the far ice front: real relief of the Saint Elias range over Disenchantment Bay, clad white
const ICEFRONT = { lit: '#f6f9ff', shade: '#9db5d8', snowLit: '#ffffff', snowShade: '#b4c8e6', snowLine: 0.15, air: '#d4e4f4' }

export function Scene6Ice() {
  return (
    <ScanScene
      hdri={SHARED_SKY}
      bgIntensity={1.0}
      envIntensity={1.3}
      sun={{ from: [2, 9, 4], color: '#fff6ec', intensity: 2.9 }}
      fill={{ sky: '#cfe6ff', ground: '#2a5a7a', intensity: 0.45 }}
      camera={{ position: [0, 2.4, 0], target: [0, 0.4, -6], fov: 55 }}
      orb={{ position: [0.55, 1.35, -4.2], radius: 0.18 }}
      look={{ light: [0.5, 0.75], tint: '#eef8ff', rim: '#eaf6ff', haloColor: '#cfe9ff', halo: 0.45, bend: 2.0, gain: 1.45 }}
      streak={{ dir: [-1, -0.25], len: 0.9, width: 0.016, color: '#bfe2ff', strength: 0.9 }}
      clear="#7fa8c8"
      poster={{ portrait: '/poster/scene6-portrait.webp', landscape: '/poster/scene6-landscape.webp' }}
      bloom={0.55}
      exposure={1.02}
      haze={0.12}
      soften={{ amount: 0.16, radius: 3, mist: 0.03 }}
    >
      <WaterPlane near={0} y={0.0} spectrum="sea" peakWave={2.9} hs={0.16} bearing={250} detail={0.06} steep={0.75} flat={0.01} spread={1.7} bands={14} wind={3.0} fetch={30000} chl={0.9} metersPerUnit={2.5} sunFrom={[9, 2.4, -8]} sunColor="#fff6e6" lift={2.7} tint={[0.62, 1.06, 1.12]} sparkle={1.7} skyBright={1.15} reflGain={1.35} />
      <Terrain dem="/tex/dem/icefront-h.webp" size={[190, 60]} relief={26} floor={0.04} position={[0, 0, -112]} sun={[0.4, 0.3, -0.85]} haze={0.12} palette={ICEFRONT} />
      {BERGS.map(([x, z, s, r], i) => (
        // cut ice, not a boulder: the scan's mass stood up, faceted flat, and floated low in the water
        <Fit
          key={i}
          size={s}
          position={[x, -0.16 * s, z]}
          rotation={[0, r, 0]}
          strip="#eaf4ff"
          tint="#ffffff"
          emissive={['#bfe0ff', 0.03]}
          roughness={0.52}
          sss={ICE}
          occlude={0.85}
          stretch={1.25 + 0.5 * (i % 3)}
          flat
        >
          <NamaqualandBoulder02 />
        </Fit>
      ))}
    </ScanScene>
  )
}
