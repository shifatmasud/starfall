import * as THREE from 'three'
import { ScanScene } from './scan/ScanScene'
import { Fit } from './scan/Fit'
import { WaterPlane } from './scan/WaterPlane'
import { GrassMedium02Field, type GrassInstance } from '../scans/models/GrassMedium02'
import { FlowerHeliophila } from '../scans/models/FlowerHeliophila'
import { hash, sstep } from '../scans/scatter'
import { caps } from '../gl/capabilities'
import { NamaqualandBoulder02 } from '../scans/models/NamaqualandBoulder02'
import { Terrain } from './scan/Terrain'
import { SHARED_SKY } from './scan/sky'
import { Bank, bankHeight, SHORE_LINE } from './scan/Bank'
import { Conifers } from './scan/Conifer'

// real relief, painterly light: the Bernese Alps across the lake, the Harder ridge on the right, the Boedeli pasture underfoot
const SUN4: [number, number, number] = [0.5, 0.55, -0.65]
// the range is an atmospheric periwinkle wall, not a navy cut-out: the haze does most of the work
const ALPS = { lit: '#9cb2d4', shade: '#6680a8', snowLit: '#ffffff', snowShade: '#c6d8f0', snowLine: 0.48, air: '#cfe0f5' }
const RIDGE = { lit: '#6b8556', shade: '#455e4c', air: '#bfd4e6' }

/**
 * Scene 4 — Lake. The orb flies with a light streak over a meadow toward a mountain-bordered lake.
 *
 * Composition follows the panel: the pasture rises from the lower left and runs across the frame, its
 * shore line receding to the right (Bank), the lake lies beyond as a near mirror (measured Lake
 * Michigan ripple field, planar reflection of the range and the sky), the right bank is a forested
 * slope with conifers, and the Bernese Alps close the horizon with their snow line.
 *
 * The valley is a mist chamber: fog 12 → 118 m thinned by altitude, so the far shore and the lower
 * slopes dissolve while the snow line floats clear; the grass is luminous chartreuse with a
 * forward-scattering tip, so the meadow reads as a lit lawn rather than a field of dark needles.
 */

/** daisies and grass scattered on the bank, each at the bank's own height */
function bankGrass(count: number): GrassInstance[] {
  const out: GrassInstance[] = []
  let i = 0
  while (out.length < count && i < count * 20) {
    i++
    const z = 1.6 - 8.6 * Math.pow(hash(i * 1.31, 5.7), 1.15)
    const x = (hash(i * 2.17, 3.3) * 2 - 1) * 9.5
    const y = bankHeight(x, z)
    const shore = SHORE_LINE(x)
    if (z < shore + 0.35) continue // no grass in the water
    // avoid the boulder
    if (Math.hypot(x - 3.4, z + 2.2) < 0.9) continue
    const t = hash(i * 6.1, 2.2)
    const deep = new THREE.Color(1.16, 1.36, 0.76).lerp(new THREE.Color(1.42, 1.62, 0.92), t)
    const light = new THREE.Color(1.78, 1.88, 1.12)
    out.push({
      x, y: y - 0.01, z,
      scale: 0.36 + 0.32 * hash(i * 3.9, 8.8),
      yaw: hash(i * 4.7, 6.6) * Math.PI * 2,
      tuft: hash(i * 9.7, 4.4) < 0.65 ? 0 : 1,
      tint: deep.lerp(light, sstep(0.25, 1, t)),
    })
  }
  return out
}
let grass: GrassInstance[] | null = null
const grassField = () => (grass ??= bankGrass(caps().lowTier ? 4200 : 14000))

/** white daisies: dense drifts in the foreground, thinning toward the water */
const FLOWERS = Array.from({ length: 300 }, (_, i) => {
  const z = 1.4 - 8.2 * Math.pow(hash(i * 1.7, 2.2), 1.05)
  const x = (hash(i * 3.1, 5.5) * 2 - 1) * 9.2
  return { x, z, s: 0.9 + 0.8 * hash(i * 7.7, 1.3), r: hash(i * 2.9, 9.1) * 6.28 }
}).filter((f) => f.z > SHORE_LINE(f.x) + 0.5 && Math.hypot(f.x - 3.4, f.z + 2.2) > 0.7)

/** conifers: the treeline on the right slope, a small stand on the left point, the far shore */
const PINES: [number, number, number, number, number][] = [
  [8.5, 0, -9.5, 3.4, 1], [10.6, 0.2, -12.2, 4.2, 2], [12.9, 0.6, -15.5, 5.0, 3], [9.4, 0, -16.8, 3.8, 4],
  [15.6, 1.2, -19.0, 5.6, 5], [13.4, 0.8, -22.5, 4.8, 6], [17.8, 1.6, -24.0, 6.2, 7], [11.2, 0.4, -26.0, 4.4, 8],
  [-8.4, 0, -9.0, 3.2, 9], [-10.2, 0, -11.4, 4.0, 10], [-9.0, 0, -14.2, 3.4, 11], [-12.5, 0, -16.0, 4.6, 12],
  [20.5, 2.2, -28.0, 6.8, 13], [23.0, 3.0, -31.0, 7.4, 14], [6.5, 0, -14.0, 2.6, 15], [-5.6, 0, -12.0, 2.2, 16],
]

export function Scene4Lake() {
  return (
    <ScanScene
      hdri={SHARED_SKY}
      bgIntensity={1.22}
      exposure={1.06}
      haze={0.1}
      shadowFloor="#1d2a3e"
      grade={0.45}
      soften={{ amount: 0.22, radius: 2.4, mist: 0.005, mistColor: '#d4e4f7' }}
      envIntensity={0.95}
      sun={{ from: [4, 6, -3], color: '#fff3de', intensity: 2.25 }}
      fill={{ sky: '#d8e8ff', ground: '#4e6238', intensity: 0.5 }}
      camera={{ position: [0, 1.05, 0.2], target: [0, 0.65, -6], fov: 55 }}
      orb={{ position: [0.15, 1.15, -6.5], radius: 0.21 }}
      look={{ light: [0.6, 0.7], tint: '#f6fbff', rim: '#f4f9ff', haloColor: '#d8ecff', halo: 0.5, bend: 2.0, gain: 1.5 }}
      streak={{ dir: [-1, -0.3], len: 0.8, width: 0.016, color: '#d4e8ff', strength: 0.42 }}
      fog={{ color: '#cfe0f4', sunColor: '#fff2de', near: 12, far: 118, mie: 0.5, heightFalloff: 0.045 }}
      clear="#b4cce6"
      poster={{ portrait: '/poster/scene4-portrait.webp', landscape: '/poster/scene4-landscape.webp' }}
      bloom={0.34}
    >
      <WaterPlane near={0} y={0.02} spectrum="lake" peakWave={1.7} hs={0.016} bearing={200} detail={0.02} steep={0.32} flat={0.07} wind={0.14} fetch={8000} chl={0.08} metersPerUnit={1.5} sunFrom={[7, 3, -8]} sunColor="#fff2dc" lift={0.6} sparkle={0.08} skyBright={0.3} reflGain={1.12} />
      <Bank />
      <Terrain dem="/tex/dem/ridge-h.webp" size={[34, 34]} relief={9.5} floor={0.02} position={[21, -0.7, -34]} yaw={0.9} sun={SUN4} haze={0.58} palette={RIDGE} />
      <Terrain dem="/tex/dem/alps-h.webp" size={[240, 60]} relief={36} floor={0.08} position={[-10, -0.6, -118]} yaw={Math.PI} sun={SUN4} haze={0.55} palette={ALPS} />
      <Conifers trees={PINES} soft={0.75} sunDir={SUN4} />
      <GrassMedium02Field instances={grassField()} sunFrom={[4, 6, -3]} sunColor="#fff3de" sway={0.012} translucency={2.1} />
      {FLOWERS.map((f, i) => (
        <Fit key={i} size={0.18 * f.s} position={[f.x, bankHeight(f.x, f.z), f.z]} rotation={[0, f.r, 0]} tint="#ffffff" emissive={['#fff8e8', 0.35]} soft={0.6}>
          <FlowerHeliophila />
        </Fit>
      ))}
      <Fit size={0.85} position={[3.4, bankHeight(3.4, -2.2) - 0.05, -2.2]} rotation={[0, 0.8, 0]} tint="#b8b6a4" soft={0.9} rimColor="#fff4dc" shadowTint="#5a6c7a" sunDir={SUN4}>
        <NamaqualandBoulder02 />
      </Fit>
    </ScanScene>
  )
}
