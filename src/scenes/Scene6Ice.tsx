import { ScanScene } from './scan/ScanScene'
import { Fit } from './scan/Fit'
import { WaterPlane } from './scan/WaterPlane'
import { A_ICE } from '../physics/optics'
import { NamaqualandBoulder02 } from '../scans/models/NamaqualandBoulder02'
import { Terrain } from './scan/Terrain'
import { SHARED_SKY } from './scan/sky'

/**
 * Scene 6 — Ocean (Ice). The orb glides with a cold streak low over turquoise water past ice.
 *
 * World: the shared clear sky over open water that mirrors it, and on the horizon the ice front:
 * real relief of the Saint Elias range (USGS NED via AWS terrain tiles), clad in snow and blue shade.
 * The bergs are scanned granite boulders, whitened to ice with a cold inner glow: the angular massing
 * of real rock, the colour of the reference's bergs — smooth and painted, never faceted.
 *
 * The air is silver-blue (fog 14 → 108 m, strong Mie toward the low sun), so the far ice front and the
 * horizon dissolve together; the sea carries the measured Arctic spectrum with a broad sun path.
 */

const BERGS: [number, number, number, number][] = [
  [-1.0, -3.9, 1.7, 0.3], [1.7, -5.2, 2.7, 2.1], [-0.5, -1.8, 0.35, 1.2], [0.4, -6.5, 0.6, 2.8], [4.5, -11.0, 2.4, 0.9],
  [-4.5, -10.0, 2.0, 1.9], [-1.8, -7.0, 0.5, 0.4], [1.2, -1.9, 0.3, 1.0], [-3.0, -4.5, 0.4, 2.2], [2.8, -6.0, 0.45, 0.6],
  [-0.2, -12.0, 0.9, 1.4], [6.5, -7.5, 0.7, 2.5],
  // the brash of small floes scattered to the horizon
  [-5.5, -6.0, 0.5, 0.7], [-3.6, -14.0, 0.8, 2.0], [1.8, -16.0, 0.7, 0.2], [-7.5, -18.0, 1.1, 1.1], [3.6, -20.0, 0.9, 2.4],
  [-2.2, -24.0, 1.0, 0.8], [7.5, -22.0, 1.2, 1.7], [-9.0, -12.0, 0.8, 2.9], [0.8, -9.0, 0.35, 0.5], [-2.8, -2.6, 0.3, 1.8],
  [3.5, -2.8, 0.35, 2.6], [5.0, -4.5, 0.4, 0.4], [-6.2, -3.6, 0.45, 1.3], [10.0, -15.0, 0.9, 0.6],
]

// ice SSS: Beer–Lambert through ~1.5 m of ice with Warren & Brandt (2008) absorption: red is absorbed first, light leaves blue.
// Kept low: a berg is opaque dense ice lit by the sun, not a lamp — the blue belongs in the shadowed faces and thin skirts.
const ICE = { color: A_ICE.map((a) => Math.exp(-a * 1.4 * 7)) as [number, number, number], strength: 0.48, power: 2.6, ambient: 0.14 }

// the far ice front: real relief of the Saint Elias range over Disenchantment Bay, clad white
const ICEFRONT = { lit: '#f4f8ff', shade: '#a4bddc', snowLit: '#ffffff', snowShade: '#bfd2ec', snowLine: 0.15, air: '#d8e8f8' }

export function Scene6Ice() {
  return (
    <ScanScene
      hdri={SHARED_SKY}
      bgIntensity={1.08}
      envIntensity={1.35}
      sun={{ from: [6, 3.2, -12], color: '#fff5e6', intensity: 2.35 }}
      fill={{ sky: '#d8ecff', ground: '#4a769c', intensity: 0.85 }}
      camera={{ position: [0, 2.35, 0], target: [0, 0.42, -6], fov: 55 }}
      orb={{ position: [0.55, 1.35, -4.2], radius: 0.19 }}
      look={{ light: [0.5, 0.75], tint: '#f2f9ff', rim: '#eef7ff', haloColor: '#d4ecff', halo: 0.5, bend: 2.0, gain: 1.45 }}
      streak={{ dir: [-1, -0.25], len: 0.8, width: 0.016, color: '#cbe6ff', strength: 0.45 }}
      fog={{ color: '#d8eaf8', sunColor: '#fff4e4', near: 14, far: 108, mie: 0.65, heightFalloff: 0.04 }}
      clear="#94b8d8"
      poster={{ portrait: '/poster/scene6-portrait.webp', landscape: '/poster/scene6-landscape.webp' }}
      bloom={0.38}
      exposure={1.04}
      haze={0.12}
      shadowFloor="#243a56"
      grade={0.45}
      soften={{ amount: 0.22, radius: 2.5, mist: 0.005, mistColor: '#dcecf8' }}
    >
      <WaterPlane near={0} y={0.0} spectrum="sea" peakWave={2.9} hs={0.14} bearing={242} detail={0.06} steep={0.42} flat={0.02} spread={1.9} bands={16} wind={3.2} fetch={30000} chl={0.85} metersPerUnit={2.5} sunFrom={[6, 2.8, -14]} sunColor="#fff6e6" lift={1.5} tint={[0.5, 0.9, 1.02]} sparkle={1.3} skyBright={0.7} reflGain={1.15} />
      <Terrain dem="/tex/dem/icefront-h.webp" size={[210, 64]} relief={26} floor={0.04} position={[0, 0, -106]} sun={[0.45, 0.32, -0.82]} haze={0.48} palette={ICEFRONT} />
      {BERGS.map(([x, z, s, r], i) => (
        // cut ice, not a boulder: the scan's mass stood up and floated low in the water, painted smooth
        <Fit
          key={i}
          size={s}
          position={[x, -0.18 * s, z]}
          rotation={[0, r, 0]}
          strip="#eef6ff"
          tint="#ffffff"
          emissive={['#c8e4ff', 0.0]}
          roughness={0.66}
          sss={ICE}
          occlude={0.55}
          soft={0.8}
          rimColor="#fff2e0"
          shadowTint="#769ac8"
          sunDir={[0.45, 0.32, -0.82]}
          stretch={1.15 + 0.35 * (i % 3)}
        >
          <NamaqualandBoulder02 />
        </Fit>
      ))}
    </ScanScene>
  )
}
