import { useMemo } from 'react'
import * as THREE from 'three'
import { ScanScene } from './scan/ScanScene'
import { SunShafts, Bokeh, Petals, SoftGlow } from './scan/LensFX'
import { Fit } from './scan/Fit'
import { Scatter } from './scan/Scatter'
import { caps } from '../gl/caps'
import { MossCarpet } from '../scans/models/MossCarpet'
import { RockMossBoulder } from '../scans/models/RockMossBoulder'
import { RockMossSet02 } from '../scans/models/RockMossSet02'
import { TreeStump01 } from '../scans/models/TreeStump01'
import { RootCluster01 } from '../scans/models/RootCluster01'
import { Fern02 } from '../scans/models/Fern02'
import { GrassMedium02 } from '../scans/models/GrassMedium02'
import { FlowerHeliophila } from '../scans/models/FlowerHeliophila'
import { FirTrunk } from '../scans/models/FirTrunk'

/**
 * Scene 3 — the forest floor. The panel is a low camera on a sunlit mossy floor
 * under tall conifers: a sun-flare top-left raking shafts down through the trees,
 * the orb resting on the path at centre, mossy boulders framing it close left and
 * right, white flowers catching light. Every element is a real scan: the conifers,
 * slope and sky are the photographed Forest Slope panorama (Poly Haven), projected
 * onto the ground so the camera stands inside it; the boulder and rock set,
 * stump, roots, fern, the CC0 grass clump and Cape-everlasting flowers and the
 * fir trunk are Poly Haven photogrammetry. The moss carpet is real moss_02 scan
 * texture on a ground mesh displaced by a real height map (Motion Forge Pictures).
 */

// The worn path from the camera to the orb: x drifts slightly as it recedes.
const onPath = (x: number, z: number) => Math.abs(x - (0.04 - z * 0.05)) < 0.12 + -z * 0.05

export default function Scene3Forest() {
  const grass = useMemo(() => {
    const out: { position: [number, number, number]; rotation: [number, number, number]; scale: number; tint: THREE.Color }[] = []
    const N = caps().lowTier ? 2500 : 7000
    const olive = new THREE.Color(1.0, 1.12, 0.8), gold = new THREE.Color(1.3, 1.22, 0.95), deep = new THREE.Color(0.72, 0.85, 0.6)
    let s = 11
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < N; i++) {
      const z = -0.2 - Math.pow(r(), 1.2) * 4.3
      const x = (r() - 0.5) * 2 * (0.5 + -z * 0.85)
      if (onPath(x, z) && r() < 0.88) continue
      if (Math.hypot(x - 0.1, (z + 1.55) * 1.2) < 0.26) continue
      if (Math.hypot(x + 0.42, z + 0.5) < 0.42) continue
      if (Math.hypot(x - 1.17, z + 2.2) < 0.3) continue
      const scale = 0.75 * (0.28 + 0.32 * r() + Math.min(0.4, -z * 0.06))
      const sun = Math.max(0, 1 - Math.hypot(x + 0.5, z + 2.2) / 2.2)
      const tint = new THREE.Color().copy(r() < 0.3 ? deep : olive).lerp(gold, sun * 0.7)
      out.push({ position: [x, -0.02, z], rotation: [0, r() * Math.PI * 2, 0], scale, tint })
    }
    return out
  }, [])
  return (
    <ScanScene
      env="/scans/hdri/forest_slope.webp"
      envIntensity={1.3}
      skyYaw={70}
      bgIntensity={0.55}
      ground={{ height: 1.6, radius: 26 }}
      sun={{ from: [-3, 4, -4], color: '#fff3e0', intensity: 2.6 }}
      fill={{ sky: '#dfe6e4', ground: '#3d4538', intensity: 0.8 }}
      camera={{ position: [0, 0.18, 0], target: [0.11, 0.06, -1.6], fov: 50 }}
      orb={{ position: [0.1, 0.16, -1.55], radius: 0.16 }}
      orbLook={{ absorb: '#f7f3e3', ior: 1.42, glow: '#fff1d4', fresnel: 0.85 }}
      bloom={0.7}
      exposure={1.18}
      haze={0.55}
      soften={{ amount: 0.6, radius: 3.5, mist: 0.12 }}
    >
      <MossCarpet
        size={[8, 7]}
        position={[0, -0.03, -1.6]}
        displacement={0.035}
        tint="#c9d6a0"
        path={{ start: [0.04, -0.15], end: [0.14, -1.45], width: 0.24 }}
      />
      {/* mossy boulders framing the orb, close left and right */}
      <Fit size={0.78} position={[-0.36, -0.2, -0.56]} rotation={[0, 0.7, 0]}>
        <RockMossBoulder rock="rock10" />
      </Fit>
      <RockMossSet02 position={[0.9, -0.06, -1.25]} rotation={[0, -0.8, 0]} scale={0.18} />
      <RockMossSet02 position={[-1.7, 0, -3.4]} rotation={[0, 0.4, 0]} scale={0.42} />
      <Fit size={0.75} position={[1.05, -0.08, -1.9]} rotation={[0, 2.0, 0]}>
        <RockMossBoulder rock="rock13" />
      </Fit>
      <TreeStump01 position={[1.5, 0, -3.2]} rotation={[0, 0.6, 0]} scale={0.6} />
      <RootCluster01 position={[-0.25, -0.01, -1.15]} rotation={[0, 1.2, 0]} scale={0.25} />
      <FirTrunk position={[1.17, -0.05, -2.2]} rotation={[0, 2.4, 0]} scale={1.1} />
      <FirTrunk position={[-1.48, -0.05, -3.2]} rotation={[0, 0.9, 0]} scale={0.9} />
      <Fern02 position={[0.62, -0.02, -1.05]} rotation={[0, 0.9, 0]} scale={0.6} />
      <Fern02 position={[-0.62, -0.02, -1.55]} rotation={[0, 2.6, 0]} scale={0.5} />
      <Scatter
        items={grass}
        sunColor="#fff0d0"
        render={(p) => <GrassMedium02 lod="lod1" {...p} />}
      />
      {/* flowers along the path's edges */}
      <FlowerHeliophila position={[0.34, -0.01, -0.6]} rotation={[0, 0.3, 0]} scale={0.95} />
      <FlowerHeliophila position={[0.5, -0.01, -0.88]} rotation={[0, 1.8, 0]} scale={0.85} />
      <FlowerHeliophila position={[-0.2, -0.01, -0.85]} rotation={[0, 2.6, 0]} scale={0.8} />
      <FlowerHeliophila position={[0.27, -0.01, -1.3]} rotation={[0, 0.9, 0]} scale={0.7} />
      <FlowerHeliophila position={[-0.12, -0.01, -1.85]} rotation={[0, 2.2, 0]} scale={0.65} />
      {/* painterly layer: shafts from the top-left sun, warm bokeh, floating petals */}
      <SunShafts x={0.27} y={1.0} color="#fff0d8" strength={0.5} haze={0.45} reach={1.6} />
      <SoftGlow x={0.27} y={0.97} radius={0.22} color="#fff3dc" strength={0.6} />
      <SoftGlow x={0.5} y={0.4} radius={0.2} color="#ffe6c0" strength={0.32} />
      {/* the luminous mist behind the orb: the backlit forest dissolving into haze */}
      <SoftGlow x={0.5} y={0.58} radius={0.42} color="#e8eee0" strength={0.3} />
      <Bokeh count={14} color="#ffe7b8" area={[0.55, 0, 1, 0.38]} size={[26, 60]} seed={3} />
      <Petals count={12} color="#fff6e2" area={[0.05, 0.1, 0.95, 0.85]} size={[2, 4]} seed={7} />
    </ScanScene>
  )
}
