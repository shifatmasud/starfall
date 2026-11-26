import { ScanScene } from './scan/ScanScene'
import { Fit } from './scan/Fit'
import { WaterPlane } from './scan/WaterPlane'
import { QuiverTree01 } from '../scans/models/QuiverTree01'
import { NamaqualandBoulder02 } from '../scans/models/NamaqualandBoulder02'
import { SandRocksSmall01 } from '../scans/models/SandRocksSmall01'

/**
 * Scene 5 — Desert. The orb soars with a warm streak over desert rock and sparse trees.
 *
 * World: Poly Haven `goegap` (a photographed Namaqualand desert, red sand and koppies under a clear
 * sky), ground-projected. Props, all scans: quiver trees (the desert tree of that same landscape,
 * standing where the reference has palms), granite boulders and sandstone rocks for the ruins'
 * massing, around an oasis pool that mirrors the photographed sky.
 */

export function Scene5Desert() {
  return (
    <ScanScene
      hdri="/scans/hdri/goegap.webp"
      ground={{ height: 1.8, radius: 70 }}
      envIntensity={1.3}
      bgIntensity={1.0}
      sun={{ from: [-5, 7, -2], color: '#ffe6c2', intensity: 2.4 }}
      fill={{ sky: '#cfe0f5', ground: '#a0704a', intensity: 0.5 }}
      camera={{ position: [0, 1.2, 0], target: [0, 0.8, -5], fov: 55 }}
      orb={{ position: [-0.4, 1.15, -3.0], radius: 0.22 }}
      look={{ light: [-0.6, 0.7], tint: '#fff8ee', rim: '#fff4e2', haloColor: '#ffe2b8', halo: 0.45, bend: 2.0, gain: 1.45 }}
      streak={{ dir: [1, -0.25], len: 0.9, width: 0.05, color: '#ffd9a0', strength: 1.0 }}
      clear="#d9b48a"
      poster={{ portrait: '/poster/scene5-portrait.webp', landscape: '/poster/scene5-landscape.webp' }}
      bloom={0.6}
      exposure={1.2}
      haze={0.4}
      soften={{ amount: 0.3, radius: 3, mist: 0.18 }}
    >
      <WaterPlane color="#6fc8c4" far={2.6} at={[-0.8, -5.4]} y={0.015} roughness={0.12} />
      <Fit size={3.2} position={[2.6, 0, -6.5]} rotation={[0, 0.4, 0]}>
        <QuiverTree01 />
      </Fit>
      <Fit size={2.4} position={[3.8, 0, -8.0]} rotation={[0, 2.0, 0]}>
        <QuiverTree01 />
      </Fit>
      <Fit size={2.8} position={[-3.4, 0, -7.5]} rotation={[0, 1.1, 0]}>
        <QuiverTree01 />
      </Fit>
      <Fit size={2.2} position={[-1.8, 0, -5.5]} rotation={[0, 0.3, 0]}>
        <NamaqualandBoulder02 />
      </Fit>
      <Fit size={1.3} position={[2.9, 0, -4.2]} rotation={[0, 1.4, 0]}>
        <NamaqualandBoulder02 />
      </Fit>
      <Fit size={0.9} position={[-0.9, 0, -1.9]} rotation={[0, 0.2, 0]}>
        <SandRocksSmall01 />
      </Fit>
      <Fit size={0.7} position={[0.9, 0, -1.6]} rotation={[0, 2.6, 0]}>
        <SandRocksSmall01 />
      </Fit>
    </ScanScene>
  )
}
