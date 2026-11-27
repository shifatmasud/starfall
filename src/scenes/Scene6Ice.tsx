import { ScanScene } from './scan/ScanScene'
import { WaterPlane } from './scan/WaterPlane'
import { Terrain } from './scan/Terrain'
import { SHARED_SKY } from './scan/sky'
import { IceBergs } from './ice/IceBergs'

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

// the far ice front: real relief of the Saint Elias range over Disenchantment Bay, clad white
const ICEFRONT = { lit: '#dfeaf6', shade: '#9db8d8', snowLit: '#f8fbff', snowShade: '#c2d6ec', snowLine: 0.2, air: '#dceaf8' }

export function Scene6Ice() {
  return (
    <ScanScene
      hdri={SHARED_SKY}
      bgIntensity={1.08}
      envIntensity={1.35}
      sun={{ from: [6, 3.2, -12], color: '#fff5e6', intensity: 2.35 }}
      fill={{ ground: '#4a769c', intensity: 0.9 }}
      camera={{ position: [0, 2.35, 0], target: [0, 0.42, -6], fov: 55 }}
      orb={{ position: [0.55, 1.35, -4.2], radius: 0.19 }}
      look={{ light: [0.5, 0.75], tint: '#f2f9ff', rim: '#eef7ff', haloColor: '#d4ecff', halo: 0.5, bend: 2.0, gain: 1.45 }}
      streak={{ dir: [-1, -0.25], len: 0.8, width: 0.016, color: '#cbe6ff', strength: 0.45 }}
      fog={{ color: '#d8eaf8', sunColor: '#fff4e4', near: 14, far: 108, mie: 0.65, heightFalloff: 0.04 }}
      clear="#94b8d8"
      poster={{ portrait: '/poster/scene6-portrait.webp', landscape: '/poster/scene6-landscape.webp' }}
      bloom={0.38}
      exposure={1.62}
      haze={0.12}
      shadowFloor="#243a56"
      grade={0.45}
      saturation={0.8}
      gamma={1.05}
      splitTone={{ shadow: '#7fa0cf', highlight: '#fff0d8', strength: 0.2 }}
      soften={{ amount: 0.22, radius: 2.5, mist: 0.005, mistColor: '#dcecf8' }}
    >
      <WaterPlane near={0} y={0.0} spectrum="sea" peakWave={2.9} hs={0.14} bearing={242} detail={0.06} steep={0.42} flat={0.02} spread={1.9} bands={16} wind={3.2} fetch={30000} chl={0.45} metersPerUnit={2.5} sunFrom={[6, 2.8, -14]} sunColor="#fff6e6" lift={3.4} tint={[0.6, 0.88, 1.05]} sparkle={1.6} skyBright={0.55} reflGain={1.15} />
      <Terrain dem="/tex/dem/icefront-h.webp" size={[230, 70]} relief={15} floor={0.04} position={[0, 0.2, -128]} sun={[0.45, 0.32, -0.82]} haze={0.42} palette={ICEFRONT} />
      <IceBergs sunDir={[0.45, 0.32, -0.82]} />
    </ScanScene>
  )
}
