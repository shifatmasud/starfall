import { useMemo } from 'react'
import { ScanScene } from './scan/ScanScene'
import { WaterPlane } from './scan/WaterPlane'
import { Terrain } from './scan/Terrain'
import { SoftShadow } from './scan/SoftShadow'
import { SHARED_SKY } from './scan/sky'
import { DuneField, POOL, oasisHeight, type ShadowCaster } from './oasis/DuneField'
import { DatePalm } from './oasis/DatePalm'
import { Ruins } from './oasis/Ruins'
import { OasisShrubs, SandstoneBoulder } from './oasis/OasisFoliage'
import { caps } from '../gl/capabilities'

const SUN5: [number, number, number] = [-5, 6.5, -3]
const SUN5_NORM: [number, number, number] = [-0.57, 0.74, -0.34]
const ERG = { lit: '#f7d8b4', shade: '#c49678', air: '#f4dec8' }

const PALMS: { x: number; z: number; h: number; lean: number; yaw: number; seed: number }[] = [
  // Left framing grove beside the colonnade (matches reference tall hero palms)
  { x: -7.9, z: -14.4, h: 4.0, lean: 0.14, yaw: 0.4, seed: 1 },
  { x: -6.4, z: -13.6, h: 4.5, lean: 0.18, yaw: 1.9, seed: 2 },
  { x: -4.6, z: -14.2, h: 4.2, lean: -0.12, yaw: 2.8, seed: 3 },
  { x: -9.6, z: -13.4, h: 3.4, lean: 0.15, yaw: 0.9, seed: 4 },
  // Mid-distance oasis palms curving behind the pool
  { x: -1.2, z: -15.2, h: 3.2, lean: -0.1, yaw: 1.1, seed: 5 },
  { x: 2.4, z: -15.6, h: 3.6, lean: 0.13, yaw: 2.3, seed: 6 },
  { x: 4.8, z: -17.0, h: 3.0, lean: -0.11, yaw: 0.5, seed: 7 },
  { x: 6.6, z: -19.0, h: 2.7, lean: 0.09, yaw: 1.7, seed: 8 },
]

const BOULDERS: { x: number; z: number; scale: [number, number, number]; yaw: number; seed: number }[] = [
  // Foreground right stepped rock outcrop (echoes reference bottom-right rock mass)
  { x: 2.75, z: -2.05, scale: [1.35, 0.62, 0.95], yaw: 0.35, seed: 11 },
  { x: 3.65, z: -2.55, scale: [1.1, 0.52, 0.85], yaw: 1.4, seed: 12 },
  { x: 2.05, z: -2.55, scale: [0.68, 0.36, 0.55], yaw: 2.2, seed: 13 },
  // Foreground left-center sandstone slab near shoreline
  { x: -1.65, z: -2.45, scale: [0.85, 0.38, 0.62], yaw: 0.8, seed: 14 },
  { x: -2.45, z: -2.85, scale: [0.55, 0.28, 0.48], yaw: 2.6, seed: 15 },
  // Right shoreline cluster
  { x: 4.35, z: -5.6, scale: [0.78, 0.42, 0.65], yaw: 1.1, seed: 16 },
]

export function Scene5Desert() {
  const casters = useMemo<ShadowCaster[]>(() => {
    const list: ShadowCaster[] = [
      // Ruin colonnade & sanctuary shadow footprint
      { x: -5.4, z: -13.0, rx: 3.6, rz: 2.1, strength: 0.85 },
      { x: -2.6, z: -13.4, rx: 1.8, rz: 1.4, strength: 0.72 },
    ]
    for (const p of PALMS) {
      list.push({ x: p.x, z: p.z, rx: 1.35, rz: 1.35, strength: 0.72 })
    }
    for (const b of BOULDERS) {
      list.push({ x: b.x, z: b.z, rx: b.scale[0] * 1.15, rz: b.scale[2] * 1.15, strength: 0.68 })
    }
    return list
  }, [])

  return (
    <ScanScene
      hdri={SHARED_SKY}
      envIntensity={0.78}
      bgIntensity={1.12}
      sun={{ from: [-6, 4.5, -2.5], color: '#ffe0b8', intensity: 3.1 }}
      fill={{ sky: '#d8e8fa', ground: '#b07a52', intensity: 0.4 }}
      camera={{ position: [0, 2.35, 1.35], target: [-0.25, 0.78, -6.4], fov: 53 }}
      orb={{ position: [0.65, 1.36, -5.2], radius: 0.21 }}
      look={{ light: [-0.6, 0.7], tint: '#fff9f0', rim: '#fff5e6', haloColor: '#ffe4bc', halo: 0.34, bend: 2.0, gain: 1.1 }}
      streak={{ dir: [1, -0.22], len: 0.72, width: 0.012, color: '#ffe2bc', strength: 0.34 }}
      fog={{ color: '#efd4b6', sunColor: '#ffecc8', near: 18, far: 96, mie: 0.45, heightFalloff: 0.04 }}
      clear="#e6cbb0"
      poster={{ portrait: '/poster/scene5-portrait.webp', landscape: '/poster/scene5-landscape.webp' }}
      bloom={0.34}
      exposure={1.42}
      haze={0.08}
      shadowFloor="#241f22"
      grade={0.45}
      saturation={0.74}
      gamma={1.2}
      splitTone={{ shadow: '#7d94bb', highlight: '#ffd7a6', strength: 0.26 }}
      soften={{ amount: 0.2, radius: 2.4, mist: 0.005, mistColor: '#f5e2cc' }}
    >
      {/* Measured NOAA NDBC pool spectrum with deep teal-emerald absorption & clear palm reflection */}
      <WaterPlane
        far={4.5}
        at={[POOL.x, POOL.z]}
        y={0.02}
        poolStretch={1.12}
        feather={0.55}
        spectrum="pool"
        peakWave={0.62}
        hs={0.012}
        bearing={290}
        detail={0.025}
        steep={0.28}
        flat={0.02}
        wind={0.14}
        fetch={300}
        chl={0.55}
        metersPerUnit={0.6}
        depth={12}
        bottom={[0.12, 0.2, 0.18]}
        tint={[0.16, 0.46, 0.48]}
        spread={1.5}
        sunFrom={SUN5}
        sunColor="#ffebd0"
        lift={0.5}
        skyBright={0.62}
        reflGain={1.55}
      />

      {/* Wind-sculpted dune terrain with carved pool basin & analytical directional shadows */}
      <DuneField casters={casters} sunDir={SUN5_NORM} />

      {/* Distant Erg Chebbi dune ridge dissolving into golden atmospheric haze */}
      <Terrain
        dem="/tex/dem/erg-h.webp"
        size={[185, 66]}
        relief={11.5}
        floor={0.06}
        position={[0, -0.25, -58]}
        sun={SUN5_NORM}
        haze={0.62}
        palette={ERG}
      />

      {/* Classical sandstone colonnade & sanctuary dome on the left bank */}
      <Ruins position={[-5.4, oasisHeight(-5.4, -13.2) - 0.04, -13.2]} yaw={0.22} scale={1.05} sunDir={SUN5_NORM} />
      <SoftShadow position={[-5.4, oasisHeight(-5.4, -13.2) + 0.01, -13.2]} radius={2.6} stretch={[1.5, 0.9]} rotation={0.22} opacity={0.42} color="#6b4e42" />

      {/* Generated pinnate date palms with curved ringed trunks */}
      {PALMS.map((p, i) => {
        const y = oasisHeight(p.x, p.z)
        return (
          <group key={`palm-${i}`}>
            <DatePalm position={[p.x, y - 0.04, p.z]} height={p.h} lean={p.lean} yaw={p.yaw} seed={p.seed} sunDir={SUN5_NORM} />
            <SoftShadow position={[p.x, y + 0.01, p.z]} radius={0.65} stretch={[1.4, 0.8]} rotation={0.45} opacity={0.38} color="#6b4e42" />
          </group>
        )
      })}

      {/* Stratified sandstone boulders along the shoreline & right promontory */}
      {BOULDERS.map((b, i) => {
        const y = oasisHeight(b.x, b.z)
        return (
          <group key={`rock-${i}`}>
            <SandstoneBoulder position={[b.x, y - 0.08, b.z]} scale={b.scale} yaw={b.yaw} seed={b.seed} sunDir={SUN5_NORM} />
            <SoftShadow position={[b.x, y + 0.01, b.z]} radius={b.scale[0] * 1.1} stretch={[1.3, 0.9]} rotation={0.4} opacity={0.36} color="#6b4e42" />
          </group>
        )
      })}

      {/* Lush golden-sage shoreline reed clusters */}
      <OasisShrubs count={caps().lowTier ? 180 : 440} sunDir={SUN5_NORM} />
    </ScanScene>
  )
}

