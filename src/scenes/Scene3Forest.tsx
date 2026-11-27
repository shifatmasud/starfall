import { ScanScene } from './scan/ScanScene'
import { RockMossSet02 } from '../scans/models/RockMossSet02'
import { TreeStump01 } from '../scans/models/TreeStump01'
import { Fern02 } from '../scans/models/Fern02'
import { RootCluster01 } from '../scans/models/RootCluster01'
import { Fit } from './scan/Fit'
import { SunShafts, Bokeh, SoftGlow } from './scan/LensFX'
import { FlowerHeliophila } from '../scans/models/FlowerHeliophila'
import { FirTrunk } from '../scans/models/FirTrunk'
import { MossCarpet } from '../scans/models/MossCarpet'
import { RockMossBoulder } from '../scans/models/RockMossBoulder'
import { GrassMedium02Field, type GrassInstance } from '../scans/models/GrassMedium02'
import { caps } from '../gl/capabilities'
import * as THREE from 'three'

/**
 * Scene 3 — Forest. The orb rests on a sunlit, mossy forest floor.
 *
 * World: Poly Haven `forest_slope` (a photographed forest, sun through the trees), ground-projected,
 * its leaf-litter floor mostly covered by a carpet of scanned moss (ambientCG Moss002) with a dirt
 * path and bare drifts showing through. Props, all photogrammetry scans: a big mossy boulder low in
 * the bottom-left foreground, smaller moss-covered rocks, a scanned fir trunk closing the right of the
 * frame like the reference's great trunk, a tree stump and a root cluster at its foot, ferns, a dense
 * field of scanned grass tufts (GPU instanced), and the small white flowers of a scanned Heliophila scattered through the foreground.
 * The sun sits top left as in panel 3, its shafts (LensFX SunShafts) fanning down toward the orb,
 * which rests mid-frame in a soft warm glow (LensFX SoftGlow); out-of-focus highlights (LensFX Bokeh)
 * sit in the foreground, bottom right, as in the reference.
 */

/** The scanned Heliophila mesh sits off its origin; this re-centres it so position is the plant's foot. */
function Flower({ p, s = 1, r = 0 }: { p: [number, number, number]; s?: number; r?: number }) {
  return (
    <group position={p} rotation={[0, r, 0]} scale={s}>
      <FlowerHeliophila position={[-1.163, 0, 0.017]} />
    </group>
  )
}

// foot positions of the white flowers: a drift along the right foreground, a few at the left rocks
const FLOWERS: [number, number, number, number, number][] = [
  [0.62, 0, -1.35, 0.42, 0.3], [0.86, 0, -1.55, 0.38, 1.7], [0.45, 0, -1.05, 0.34, 2.6], [0.98, 0, -1.85, 0.42, 4.0],
  [1.15, 0, -2.1, 0.48, 0.9], [-0.72, 0, -1.55, 0.36, 1.1], [-0.92, 0, -1.95, 0.4, 2.9], [-0.5, 0, -1.7, 0.3, 4.4],
  [0.3, 0, -2.15, 0.3, 1.4], [-1.35, 0, -2.6, 0.44, 2.3], [1.45, 0, -2.5, 0.44, 5.5],
]

const hash = (x: number, y: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return h - Math.floor(h)
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Where the grass grows: dense, clumped drifts over the moss inside the camera's view, thinning on
 * the dirt path (the same curve the moss carpet leaves bare), clear of the orb's footprint, the
 * foreground boulder and the fir trunk. Tufts are kept short near the orb so it stays sitting *in*
 * the growth, as in panel 3, not hidden by it. Deterministic, so every render is the same field.
 */
function scatterGrass(count: number): GrassInstance[] {
  const out: GrassInstance[] = []
  const olive = new THREE.Color(1.0, 1.12, 0.8), gold = new THREE.Color(1.3, 1.22, 0.95), deep = new THREE.Color(0.72, 0.85, 0.6)
  let i = 0
  while (out.length < count && i < count * 20) {
    i++
    const z = -0.3 - 3.0 * Math.pow(hash(i * 1.37, 7.1), 1.15)
    const halfW = 0.62 * -z + 0.25
    const x = (hash(i * 2.11, 3.3) * 2 - 1) * halfW
    // clumps, not an even lawn
    const clump = sstep(0.22, 0.55, vnoise(x * 2.4 + 3.1, z * 2.4 - 1.7) * 0.7 + vnoise(x * 7.0, z * 7.0) * 0.3)
    const pathX = 0.05 - 0.18 * -z + 0.02 * Math.sin(-z * 2.1)
    const pathW = 0.1 + 0.05 * -z
    const path = sstep(pathW * 0.5, pathW * 1.2, Math.abs(x - pathX))
    const orbD = Math.hypot(x - 0.1, (z + 1.55) * 1.2)
    const orb = sstep(0.17, 0.3, orbD)
    const rock = sstep(0.28, 0.42, Math.hypot(x + 0.42, z + 0.5))
    const trunk = sstep(0.3, 0.45, Math.hypot(x - 1.17, z + 2.2))
    const keep = clump * (0.25 + 0.75 * path) * orb * rock * trunk
    if (hash(i * 5.3, 1.9) > keep) continue
    const r = hash(i * 9.7, 4.4)
    // two scanned tuft shapes, the small one more often
    const tuft = r < 0.55 ? 0 : 1
    const nearOrb = 1 - sstep(0.3, 0.7, orbD)
    const scale = 0.75 * (0.28 + 0.32 * hash(i * 3.9, 8.8)) * (1 - 0.4 * nearOrb) * (0.75 + 0.25 * sstep(-0.4, -1.6, z)) * (0.8 + 0.25 * sstep(-1.5, -4, z))
    const t = hash(i * 6.1, 2.2)
    const tint = deep.clone().lerp(olive, sstep(0.0, 0.6, t)).lerp(gold, sstep(0.55, 1.0, t))
    out.push({ x, y: -0.005, z, scale, yaw: hash(i * 4.7, 6.6) * Math.PI * 2, tuft, tint })
  }
  return out
}

const GRASS_SUN: [number, number, number] = [-3, 4, -4]
let grass: GrassInstance[] | null = null
const grassField = () => (grass ??= scatterGrass(caps().lowTier ? 2500 : 7000))

export function Scene3Forest() {
  return (
    <ScanScene
      hdri="/scans/hdri/forest_slope.webp"
      ground={{ height: 1.6, radius: 40 }}
      envIntensity={1.3}
      bgIntensity={0.55}
      skyYaw={70}
      sun={{ from: [-3, 4, -4], color: '#fff3e0', intensity: 2.6 }}
      fill={{ sky: '#dfe6e4', ground: '#3d4538', intensity: 0.8 }}
      camera={{ position: [0, 0.18, 0], target: [0.11, 0.06, -1.6], fov: 50 }}
      orb={{ position: [0.1, 0.16, -1.55], radius: 0.16 }}
      look={{ light: [-0.6, 0.8], tint: '#f7faf6', rim: '#c8d6d2', haloColor: '#ffe6bd', halo: 0.3, bob: 0, bend: 2.0, gain: 1.22, core: [0.1, 0.07, 0.03] }}
      glow={{ color: '#ffe2b0', intensity: 1.4, distance: 1.6 }}
      clear="#1d2a22"
      poster={{ portrait: '/poster/scene3-portrait.webp', landscape: '/poster/scene3-landscape.webp' }}
      bloom={0.42}
      exposure={1.06}
      haze={0.16}
      soften={{ amount: 0.24, radius: 3, mist: 0.02 }}
    >
      {/* the great trunk closing the right of the frame: a scanned fir (Poly Haven fir_tree_01) */}
      <FirTrunk position={[1.17, -0.05, -2.2]} rotation={[0, 2.4, 0]} scale={1.1} />
      <FirTrunk position={[-1.48, -0.05, -3.2]} rotation={[0, 0.9, 0]} scale={0.9} />
      {/* the green moss floor: ambientCG Moss002, a real scan displaced by its own height map */}
      <MossCarpet />
      {/* the big mossy boulder in the bottom-left foreground, low and close to the lens (one scanned rock) */}
      <Fit size={0.78} position={[-0.36, -0.2, -0.56]} rotation={[0, 0.7, 0]}>
        <RockMossBoulder rock="rock10" />
      </Fit>
      <RockMossSet02 position={[-1.7, 0, -3.4]} rotation={[0, 0.4, 0]} scale={0.42} />
      <Fit size={0.75} position={[1.05, -0.08, -1.9]} rotation={[0, 2.0, 0]}>
        <RockMossBoulder rock="rock13" />
      </Fit>
      <RootCluster01 position={[1.9, 0, -3.4]} rotation={[0, -0.8, 0]} scale={0.45} />
      <TreeStump01 position={[1.5, 0, -3.2]} rotation={[0, 0.6, 0]} scale={0.6} />
      <Fern02 position={[-1.1, 0, -2.0]} rotation={[0, 1.2, 0]} scale={0.6} />
      <Fern02 position={[0.9, 0, -2.9]} rotation={[0, -0.5, 0]} scale={0.7} />
      <RockMossSet02 position={[-0.75, -0.05, -0.9]} rotation={[0, 2.2, 0]} scale={0.22} />
      <RockMossSet02 position={[0.9, -0.06, -1.25]} rotation={[0, 0.9, 0]} scale={0.18} />
      {/* dense wild grass over the moss: Poly Haven grass_medium_02 scans as GPU instances */}
      <GrassMedium02Field instances={grassField()} sunFrom={GRASS_SUN} sunColor="#fff0d0" sway={0.012} translucency={0.9} />
      {/* panel 3's sun: top left, its shafts fanning down and right toward the orb */}
      <SunShafts x={0.27} y={1.0} color="#fff0d8" strength={0.5} haze={0.45} reach={1.6} />
      {/* the sun's burst itself, wide and warm in the top-left canopy */}
      <SoftGlow x={0.27} y={0.97} radius={0.3} color="#fff0cc" strength={0.42} />
      {/* the warm light the orb gathers and spills on the haze and the moss around it */}
      <SoftGlow x={0.5} y={0.4} radius={0.16} color="#ffe6c0" strength={0.16} />
      {/* the luminous mist behind the orb: the backlit forest dissolving into haze */}
      <SoftGlow x={0.5} y={0.58} radius={0.42} color="#e8eee0" strength={0.24} />
      <Bokeh
        color="#fff2d6"
        discs={[
          [0.86, 0.1, 0.03, 0.22], [0.92, 0.17, 0.022, 0.16], [0.81, 0.05, 0.035, 0.18], [0.96, 0.07, 0.026, 0.14],
          [0.75, 0.12, 0.018, 0.12], [0.89, 0.27, 0.015, 0.12],
        ]}
      />
      {FLOWERS.map(([x, y, z, s, r], i) => (
        <Flower key={i} p={[x, y, z]} s={s * 0.9} r={r} />
      ))}
    </ScanScene>
  )
}
