import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { ScanScene } from './scan/ScanScene'
import { WaterPlane } from './scan/WaterPlane'
import { SoftShadow } from './scan/SoftShadow'
import { Terrain } from './scan/Terrain'
import { SHARED_SKY } from './scan/sky'
import { caps } from '../gl/capabilities'
import { LakeGround, lakeHeight, type PineShadowCaster } from './lake/LakeGround'
import { LAKE_PINES, LakePines, type PinePlacement } from './lake/LakePines'
import { LakeShore } from './lake/LakeShore'
import { LakeRange } from './lake/LakeRange'
import { LakeMeadow, LakesideBoulder } from './lake/LakeMeadow'

const SUN4_POS: [number, number, number] = [7.0, 8.0, 6.0]
const SUN4_DIR: [number, number, number] = [0.5, 0.6, 0.5]

const BOULDERS: { x: number; z: number; scale: [number, number, number]; yaw: number; seed: number }[] = [
  { x: 3.15, z: -4.65, scale: [0.44, 0.24, 0.36], yaw: 0.7, seed: 3 },
  { x: 3.65, z: -4.95, scale: [0.32, 0.18, 0.28], yaw: 2.1, seed: 4 },
  { x: -3.25, z: -4.85, scale: [0.42, 0.22, 0.34], yaw: 1.3, seed: 5 },
]

const SLOPE_TREELINE: PinePlacement[] = [
  { x: 11.2, z: -15.2, height: 3.1, yaw: 0.5, lean: 0.02, tint: '#cde0de' },
  { x: 12.8, z: -16.8, height: 3.5, yaw: 1.7, lean: -0.02, tint: '#c6dce2' },
  { x: 14.6, z: -18.5, height: 3.9, yaw: 2.4, lean: 0.01, tint: '#bfd6e6' },
  { x: 16.5, z: -20.4, height: 4.2, yaw: 0.9, lean: -0.02, tint: '#b8d2ea' },
  { x: 18.4, z: -22.6, height: 4.5, yaw: 2.1, lean: 0.02, tint: '#b2ceee' },
  { x: 20.5, z: -25.0, height: 4.8, yaw: 1.3, lean: -0.01, tint: '#accaf0' },
  { x: 8.6, z: -17.5, height: 2.5, yaw: 2.8, lean: 0.02, tint: '#c4dae4' },
  { x: 10.4, z: -20.2, height: 2.9, yaw: 0.4, lean: -0.02, tint: '#bdd6e8' },
  { x: 12.6, z: -23.0, height: 3.3, yaw: 1.9, lean: 0.01, tint: '#b6d2ec' },
  { x: 15.0, z: -26.2, height: 3.7, yaw: 2.6, lean: -0.01, tint: '#b0ceee' },
]

const RECEDING_SLOPE_NEAR = {
  lit: '#92ac6c',
  shade: '#5c7872',
  air: '#c6dcf4',
}

/** Soft low-opacity cumulus puffs above the right alpine summit (/tex/cloud-puff.webp) */
function HorizonClouds() {
  const tex = useTexture('/tex/cloud-puff.webp')
  const puffs = useMemo(
    () => [
      { pos: [16, 15.5, -104] as [number, number, number], scale: [36, 15, 1] as [number, number, number], opacity: 0.2 },
      { pos: [28, 18.0, -108] as [number, number, number], scale: [44, 18, 1] as [number, number, number], opacity: 0.22 },
      { pos: [-16, 12.5, -112] as [number, number, number], scale: [38, 13, 1] as [number, number, number], opacity: 0.16 },
    ],
    [],
  )

  return (
    <group>
      {puffs.map((p, i) => (
        <mesh key={i} position={p.pos} scale={p.scale} renderOrder={-10}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={tex}
            color="#ffffff"
            transparent
            opacity={p.opacity}
            depthWrite={false}
            fog={false}
            blending={THREE.NormalBlending}
          />
        </mesh>
      ))}
    </group>
  )
}

export function Scene4Lake() {
  const allPines = useMemo(() => [...LAKE_PINES, ...SLOPE_TREELINE], [])

  const casters = useMemo<PineShadowCaster[]>(() => {
    const list: PineShadowCaster[] = LAKE_PINES.map((p) => ({
      x: p.x,
      z: p.z,
      radius: p.height * 0.34,
      height: p.height,
    }))
    for (const b of BOULDERS) {
      list.push({
        x: b.x,
        z: b.z,
        radius: b.scale[0] * 1.15,
        height: b.scale[1] * 2.2,
      })
    }
    return list
  }, [])

  const lowTier = caps().lowTier

  return (
    <ScanScene
      hdri={SHARED_SKY}
      skyYaw={150}
      bgIntensity={0.8}
      envIntensity={1.45}
      sun={{ from: SUN4_POS, color: '#fff3dc', intensity: 2.15 }}
      fill={{ ground: '#6c8842', intensity: 1.05 }}
      camera={{ position: [0, 1.42, 0.3], target: [-0.1, 0.5, -7.0], fov: 55 }}
      orb={{ position: [-0.55, 1.14, -5.8], radius: 0.19 }}
      look={{
        light: [0.62, 0.72],
        tint: '#f6fbff',
        rim: '#f4faff',
        haloColor: '#d8ecff',
        halo: 0.44,
        bend: 2.05,
        gain: 1.48,
      }}
      streak={{ dir: [-1, -0.34], len: 0.45, width: 0.02, color: '#d4e8ff', strength: 0.38 }}
      fog={{
        color: '#dcebfa',
        sunColor: '#fff6e8',
        near: 22,
        far: 155,
        mie: 0.58,
        heightFalloff: 0.055,
      }}
      clear="#c4dcf6"
      poster={{ portrait: '/poster/scene4-portrait.webp', landscape: '/poster/scene4-landscape.webp' }}
      bloom={0.4}
      exposure={1.2}
      haze={0.1}
      shadowFloor="#2c4260"
      grade={0.3}
      saturation={1.05}
      splitTone={{ shadow: '#7c9ac6', highlight: '#ffeed6', strength: 0.1 }}
      soften={{ amount: 0.26, radius: 2.2, mist: 0.014, mistColor: '#e0eeff' }}
    >
      {/* Deep blue lake (#3d6ea8 mid, #2c5480 far) with crisp mirrored mountain range & zero white smears */}
      <WaterPlane
        near={0}
        y={0.02}
        spectrum="lake"
        peakWave={1.55}
        hs={0.016}
        bearing={215}
        detail={0.045}
        steep={0.36}
        flat={0.05}
        spread={1.75}
        bands={18}
        wind={4.4}
        fetch={8000}
        chl={0.28}
        metersPerUnit={1.4}
        depth={18}
        bottom={[0.02, 0.05, 0.12]}
        tint={[0.30, 0.52, 0.86]}
        sunFrom={[9.0, 6.5, -34.0]}
        sunColor="#fff2dc"
        lift={0.46}
        sparkle={0.5}
        skyBright={0.08}
        reflGain={0.8}
      />

      {/* High-contrast sunlit/shaded meadow ground + 680 foreground turf tufts + 320 yellow blooms */}
      <LakeGround casters={casters} sunDir={SUN4_DIR} />

      {/* Pale pebble shore & delicate broken waterline lace */}
      <LakeShore />

      {/* Distant pale-blue peaks, ridged hero alpine summit & 280 forest-belt conifer spires */}
      <LakeRange />
      <HorizonClouds />

      {/* Gentle receding lower-right pasture terrace */}
      <Terrain
        dem="/tex/dem/ridge-h.webp"
        size={[64, 42]}
        segments={[64, 26]}
        relief={7.5}
        floor={0.03}
        position={[32, -0.7, -38]}
        yaw={0.75}
        sun={SUN4_DIR}
        haze={0.26}
        palette={RECEDING_SLOPE_NEAR}
      />

      {/* Airy layered pines + receding right-shoreline treeline */}
      <LakePines trees={allPines} sunDir={SUN4_DIR} />
      {LAKE_PINES.map((p, i) => (
        <SoftShadow
          key={`pine-sh-${i}`}
          position={[p.x, lakeHeight(p.x, p.z) + 0.01, p.z]}
          radius={p.height * 0.28}
          stretch={[1.45, 0.85]}
          rotation={-0.65}
          opacity={0.72}
          color="#5f6b33"
        />
      ))}

      {/* 3 small moss-flecked shoreline boulders */}
      {BOULDERS.map((b, i) => {
        const y = lakeHeight(b.x, b.z)
        return (
          <group key={`boulder-${i}`}>
            <LakesideBoulder position={[b.x, y - 0.04, b.z]} scale={b.scale} yaw={b.yaw} seed={b.seed} sunDir={SUN4_DIR} />
            <SoftShadow
              position={[b.x, y + 0.01, b.z]}
              radius={b.scale[0] * 1.05}
              stretch={[1.35, 0.9]}
              rotation={-0.6}
              opacity={0.66}
              color="#5f6b33"
            />
          </group>
        )
      })}

      {/* Budget-safe 3,200 grass tufts + 480 drift-clustered daisies (total scene ~165k tris) */}
      <LakeMeadow
        grassCount={lowTier ? 790 : 1900}
        daisyCount={lowTier ? 92 : 280}
        sunDir={SUN4_DIR}
      />
    </ScanScene>
  )
}
