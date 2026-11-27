import * as THREE from 'three'
import { ScanScene } from './scan/ScanScene'
import { Fit } from './scan/Fit'
import { WaterPlane } from './scan/WaterPlane'
import { NamaqualandBoulder02 } from '../scans/models/NamaqualandBoulder02'
import { PalmTree } from './scan/PalmTree'
import { RuinTemple } from './scan/Ruins'
import { OasisGround, POOL, oasisHeight, poolEdge } from './scan/OasisGround'
import { GrassMedium02Field, type GrassInstance } from '../scans/models/GrassMedium02'
import { hash, sstep } from '../scans/scatter'
import { caps } from '../gl/capabilities'
import { SandRocksSmall01 } from '../scans/models/SandRocksSmall01'
import { Terrain } from './scan/Terrain'
import { SHARED_SKY } from './scan/sky'

// real relief, painterly light: Erg Chebbi's star dunes far off, the Sossusvlei dune floor around the oasis
const SUN5: [number, number, number] = [-0.55, 0.45, -0.7]
const ERG = { lit: '#f1c48f', shade: '#b07a5c', air: '#e8cdb6' }

/**
 * Scene 5 — Desert oasis. The orb soars with a warm streak over desert rock and sparse trees.
 *
 * World: the shared clear sky. The pool sits in a bowl in the sand (OasisGround) whose water line
 * wanders with the dune noise, so the shore is irregular and the water feathers out over the shallow
 * sand instead of ending in a cut circle. Palms are built geometry (PalmTree: curved ringed trunks,
 * arching pinnate crowns), the ruins are a fluted sandstone colonnade (Ruins), and every prop is
 * placed at `oasisHeight(x, z)` so nothing floats on the carved ground. The far range is real relief
 * (Erg Chebbi, AWS terrain tiles).
 */

const PALMS: [number, number, number, number, number][] = [
  // x, z, height, lean, yaw
  [-6.4, -9.8, 4.1, -0.07, 0.4],
  [-3.2, -9.0, 4.7, 0.05, 2.1],
  [-1.4, -11.6, 3.5, -0.03, 1.2],
  [1.4, -12.4, 3.1, 0.05, 2.9],
  [3.6, -11.2, 2.9, -0.04, 0.9],
  [5.6, -13.8, 2.5, 0.06, 2.4],
  [7.8, -15.4, 2.3, -0.05, 1.6],
  [-8.8, -12.6, 2.8, 0.04, 0.2],
]

const ROCKS: [number, number, number][] = [
  [3.1, -2.3, 1.15], [-3.3, -1.9, 0.75], [-4.6, -4.2, 0.55], [2.2, -5.4, 0.45],
  [5.2, -6.2, 0.6], [-1.9, -1.1, 0.35], [1.1, -1.3, 0.3],
]

/** reeds and dry grass on the bank: dense on the wet rim, thinning up the sand */
function bankGrass(count: number): GrassInstance[] {
  const out: GrassInstance[] = []
  let i = 0
  while (out.length < count && i < count * 30) {
    i++
    const a = hash(i * 1.7, 3.1) * Math.PI * 2
    const d = poolEdge(a) * (0.82 + 0.9 * Math.pow(hash(i * 2.3, 8.8), 1.6))
    const x = POOL.x + Math.cos(a) * d
    const z = POOL.z + Math.sin(a) * d
    const y = oasisHeight(x, z)
    if (y < -0.05) continue
    const near = sstep(poolEdge(a) * 0.85, poolEdge(a) * 1.05, d)
    const far = 1 - sstep(poolEdge(a) * 1.5, poolEdge(a) * 2.6, d)
    if (hash(i * 5.3, 1.2) > near * far * 1.1) continue
    const t = hash(i * 6.1, 2.2)
    out.push({
      x, y: y - 0.01, z,
      scale: 0.5 + 0.75 * hash(i * 3.9, 8.8),
      yaw: hash(i * 4.7, 6.6) * Math.PI * 2,
      tuft: hash(i * 9.7, 4.4) < 0.6 ? 0 : 1,
      tint: new THREE.Color(2.6, 2.5, 1.25).lerp(new THREE.Color(3.4, 3.2, 1.7), t),
    })
  }
  return out
}
let reedField: GrassInstance[] | null = null
const reeds = () => (reedField ??= bankGrass(caps().lowTier ? 400 : 1400))

export function Scene5Desert() {
  return (
    <ScanScene
      hdri={SHARED_SKY}
      envIntensity={1.25}
      bgIntensity={1.0}
      sun={{ from: [-5, 7, -2], color: '#ffe6c2', intensity: 2.3 }}
      fill={{ sky: '#cfe0f5', ground: '#a0704a', intensity: 0.55 }}
      camera={{ position: [0, 2.7, 1.4], target: [0, 0.7, -6.4], fov: 55 }}
      orb={{ position: [0.75, 1.35, -5.2], radius: 0.2 }}
      look={{ light: [-0.6, 0.7], tint: '#fff8ee', rim: '#fff4e2', haloColor: '#ffe2b8', halo: 0.4, bend: 2.0, gain: 1.45 }}
      streak={{ dir: [1, -0.22], len: 0.92, width: 0.016, color: '#ffd9a0', strength: 0.85 }}
      clear="#d9b48a"
      poster={{ portrait: '/poster/scene5-portrait.webp', landscape: '/poster/scene5-landscape.webp' }}
      bloom={0.5}
      exposure={1.04}
      haze={0.1}
      soften={{ amount: 0.18, radius: 3, mist: 0.03 }}
    >
      <WaterPlane
        far={4.3}
        at={[POOL.x, POOL.z]}
        y={0.02}
        poolStretch={1.15}
        feather={1}
        spectrum="pool"
        peakWave={0.62}
        hs={0.016}
        bearing={290}
        detail={0.03}
        steep={0.35}
        flat={0.02}
        wind={0.18}
        fetch={300}
        chl={0.9}
        metersPerUnit={0.6}
        depth={11}
        bottom={[0.24, 0.2, 0.14]}
        tint={[0.5, 1.0, 0.95]}
        spread={1.5}
        sunFrom={[-5, 7, -2]}
        sunColor="#ffe6c2"
        lift={1.15}
        skyBright={0.55}
        reflGain={1.15}
      />
      <OasisGround />
      {/* the far dune range, real relief */}
      <Terrain dem="/tex/dem/erg-h.webp" size={[170, 60]} relief={11} floor={0.06} position={[0, -0.3, -62]} sun={SUN5} haze={0.42} palette={ERG} />
      {PALMS.map(([x, z, h, lean, yaw], i) => (
        <PalmTree key={`palm-${i}`} height={h} lean={lean} yaw={yaw} seed={i * 3 + 1} position={[x, oasisHeight(x, z), z]} fronds={14} />
      ))}
      <RuinTemple position={[-5.4, oasisHeight(-5.4, -13.4), -13.4]} yaw={0.18} scale={1.15} seed={4} />
      {ROCKS.map(([x, z, s], i) =>
        i % 2 === 0 ? (
          <Fit key={`rock-${i}`} size={s} position={[x, oasisHeight(x, z) - 0.02, z]} rotation={[0, i * 1.3, 0]} tint="#f2c89a" emissive={['#8a5a36', 0.28]}>
            <NamaqualandBoulder02 />
          </Fit>
        ) : (
          <Fit key={`rock-${i}`} size={s} position={[x, oasisHeight(x, z) - 0.02, z]} rotation={[0, i * 0.9, 0]} tint="#e8c49a" emissive={['#8a5a36', 0.3]}>
            <SandRocksSmall01 />
          </Fit>
        ),
      )}
      <GrassMedium02Field instances={reeds()} sunFrom={[-5, 7, -2]} sunColor="#ffe6c2" sway={0.01} translucency={1.4} />
    </ScanScene>
  )
}
