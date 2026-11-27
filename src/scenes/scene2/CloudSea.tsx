import { Cloud, Clouds } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Layout } from '../layout'
import { at, sizeAt } from './frame'
import { caps } from '../../gl/capabilities'
import { useFrame } from '@react-three/fiber'
import { cloudLightMaterial } from './CloudLightMaterial'

/**
 * The sea of cumulus — `@react-three/drei`'s `<Clouds>` / `<Cloud>`, the PMNDRS R3F example, with no
 * changes to its material at all: instanced billboards of one soft puff, depth-sorted every frame,
 * lit by the scene's own light.
 *
 * The cloud is built out of tone instead. A billboard always faces the camera, so a directional light
 * lands on every puff identically and a single-colour cloud can only ever be flat — which is what
 * makes naive drei clouds look like cotton wool. A cumulus, though, is three things stacked: a violet
 * hollow underneath, a cool grey body, and a cream crown where the sun lands. So every billow here is
 * three `<Cloud>` clusters in those three colours, each tucked inside the one below it. Stacked with
 * neighbours, the tones read as one rounded mass with shade in it.
 *
 * The layout is what makes it a *sea*: five depths of bands, from the hazy far line on the horizon to
 * the two foreground banks that fill the bottom corners, each placed by where it lands in the picture
 * (`frame.ts`) so the composition holds from a phone to a wide screen.
 */

const PUFF = '/tex/cloud-puff.webp'
const PUFF_SM = '/tex/cloud-puff-sm.webp'

type Band = {
  key: string
  layer: 'back' | 'front'
  u0: number
  u1: number
  v0: number
  v1: number
  z: number
  billows: number
  /** puffs in the body, and in each of the two other tones */
  body: number
  /** body height as a share of the band, and puff diameter as a share of that */
  height: number
  puff: number
  /** the three tones: hollow, body, crown */
  low: string
  mid: string
  high: string
  opacity: number
  seed: number
  fade: number
}

/** the plate's cloud sea, back to front */
const BANDS: Band[] = [
  // the far line under the horizon, lit gold where the low sun lies on it
  { key: 'far', layer: 'back', u0: -0.25, u1: 1.25, v0: 0.300, v1: 0.385, z: -40, billows: 15, body: 12, height: 0.9, puff: 0.34, low: '#5a6d93', mid: '#f1e5dc', high: '#fff7e6', opacity: 0.70, seed: 11, fade: 4 },
  { key: 'far-2', layer: 'back', u0: 0.30, u1: 1.25, v0: 0.345, v1: 0.450, z: -30, billows: 9, body: 14, height: 0.85, puff: 0.34, low: '#52658b', mid: '#f4e9d8', high: '#fff2e0', opacity: 0.80, seed: 19, fade: 4 },

  // the towering bank on the left, near enough that it rises over the horizon into the sky: sunlit cream, as on panel 2
  { key: 'tower', layer: 'back', u0: -0.30, u1: 0.24, v0: -0.200, v1: 0.540, z: -16, billows: 5, body: 20, height: 1.0, puff: 0.42, low: '#6b7d9c', mid: '#faf1e0', high: '#fffaee', opacity: 0.93, seed: 29, fade: 4 },
  { key: 'wisp', layer: 'back', u0: 0.12, u1: 0.42, v0: 0.010, v1: 0.130, z: -26, billows: 3, body: 10, height: 0.8, puff: 0.32, low: '#586a89', mid: '#f7eddb', high: '#fff6e8', opacity: 0.32, seed: 31, fade: 4 },

  // the middle distance, where the sun pours in
  { key: 'mid-1', layer: 'back', u0: 0.05, u1: 0.62, v0: 0.330, v1: 0.500, z: -22, billows: 6, body: 16, height: 0.78, puff: 0.34, low: '#53668d', mid: '#f7eddb', high: '#fff8e9', opacity: 0.86, seed: 37, fade: 4 },
  { key: 'mid-2', layer: 'back', u0: 0.55, u1: 1.25, v0: 0.400, v1: 0.560, z: -19, billows: 6, body: 16, height: 0.78, puff: 0.34, low: '#4d6087', mid: '#f3eadc', high: '#fffaf0', opacity: 0.88, seed: 41, fade: 4 },
  { key: 'mid-3', layer: 'back', u0: -0.15, u1: 0.70, v0: 0.480, v1: 0.700, z: -13, billows: 6, body: 18, height: 0.80, puff: 0.36, low: '#525a8a', mid: '#8a96b8', high: '#cfd1df', opacity: 0.92, seed: 53, fade: 4 },

  // the shadowed trough under the orb and the bright banks that close the bottom corners
  { key: 'near-1', layer: 'front', u0: -0.30, u1: 0.55, v0: 0.640, v1: 0.860, z: -5.2, billows: 5, body: 22, height: 0.82, puff: 0.36, low: '#4c5482', mid: '#8490b4', high: '#cdd0de', opacity: 0.93, seed: 67, fade: 4 },
  { key: 'near-2', layer: 'front', u0: 0.66, u1: 1.30, v0: 0.560, v1: 0.800, z: -5.0, billows: 4, body: 22, height: 0.86, puff: 0.38, low: '#55668b', mid: '#f7eddd', high: '#fffaf0', opacity: 0.94, seed: 71, fade: 4 },
  { key: 'front-1', layer: 'front', u0: -0.40, u1: 0.28, v0: 0.800, v1: 1.150, z: -3.6, billows: 3, body: 26, height: 0.90, puff: 0.40, low: '#586a8f', mid: '#f9efde', high: '#fffaf0', opacity: 0.96, seed: 83, fade: 3 },
  { key: 'front-2', layer: 'front', u0: 0.62, u1: 1.40, v0: 0.740, v1: 1.150, z: -3.4, billows: 3, body: 26, height: 0.92, puff: 0.40, low: '#586a8f', mid: '#f9efde', high: '#fffaf0', opacity: 0.96, seed: 97, fade: 3 },
  { key: 'front-3', layer: 'front', u0: 0.18, u1: 0.78, v0: 0.860, v1: 1.200, z: -3.0, billows: 3, body: 24, height: 0.92, puff: 0.40, low: '#4a5180', mid: '#8590b0', high: '#cacbd9', opacity: 0.95, seed: 101, fade: 3 },
]

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

type Billow = {
  key: string
  center: [number, number, number]
  bounds: [number, number, number]
  volume: number
  body: number
  low: string
  mid: string
  high: string
  opacity: number
  seed: number
  fade: number
}

function billowsOf(band: Band, aspect: number, small: boolean): Billow[] {
  const out: Billow[] = []
  const span = band.u1 - band.u0
  const depthSpan = band.v1 - band.v0
  const scale = small ? 0.4 : 1

  for (let i = 0; i < band.billows; i++) {
    const h1 = hash(band.seed + i * 3.17)
    const h2 = hash(band.seed * 1.7 + i * 7.31)
    const h3 = hash(band.seed * 2.3 + i * 11.7)
    const h4 = hash(band.seed * 3.9 + i * 17.3)

    const u = band.u0 + span * ((i + 0.5 + (h1 - 0.5) * 0.8) / band.billows)
    const v = band.v0 + depthSpan * (0.30 + 0.55 * h2)
    const du = (span / band.billows) * (1.45 + 0.85 * h3)
    const dv = depthSpan * (0.55 + 0.45 * h4) * band.height

    const [cx, cy, cz] = at(u, v, band.z, aspect)
    const [bw, bh] = sizeAt(du, dv, band.z, aspect)

    out.push({
      key: `${band.key}-${i}`,
      center: [cx, cy, cz],
      bounds: [bw * 0.5, bh * 0.32, bw * 0.07],
      volume: bh * band.puff,
      body: Math.max(6, Math.round(band.body * 1.5 * scale)),
      low: band.low,
      mid: band.mid,
      high: band.high,
      opacity: band.opacity,
      seed: band.seed + i * 29,
      fade: band.fade,
    })
  }
  return out
}

export function CloudSea({
  layout,
  layer,
  renderOrder,
  sss = 0.5,
  reach = 0.5,
  soft = 0.6,
}: {
  layout: Layout
  layer: 'back' | 'front'
  renderOrder: number
  /** light through the cloud (subsurface scattering) */
  sss?: number
  reach?: number
  soft?: number
}) {
  const aspect = layout.aspect
  // one light-through-cloud material per layer, fixed for the provider's life (drei subclasses it)
  const light = useMemo(
    () =>
      cloudLightMaterial({
        sun: new THREE.Vector2(layout.sun.x, layout.sun.y),
        sunColor: new THREE.Color('#ffd9a6'),
        sss,
        reach,
        soft,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(() => {
    light.uniforms.uSun.value.set(layout.sun.x, layout.sun.y)
    light.uniforms.uSss.value = sss
    light.uniforms.uReach.value = reach
    light.uniforms.uSoft.value = soft
  }, [light, layout.sun.x, layout.sun.y, sss, reach, soft])
  useFrame((state) => {
    state.gl.getDrawingBufferSize(light.uniforms.uRes.value)
  })
  const device = useMemo(() => caps(), [])
  const small = device.lowTier

  const billows = useMemo(
    () => BANDS.filter((band) => band.layer === layer).flatMap((band) => billowsOf(band, aspect, small)),
    [aspect, small, layer],
  )

  const limit = useMemo(() => billows.reduce((total, b) => total + b.body * 3, 0) + 12, [billows])

  // drei puts every puff of one provider into a single instanced mesh, so a whole layer shares one
  // place in the transparent order. The comet's tail is drawn between the two providers.
  const group = useRef<THREE.Group>(null)
  useEffect(() => {
    const mesh = group.current?.children.find((child) => (child as THREE.InstancedMesh).isInstancedMesh) as
      | THREE.InstancedMesh
      | undefined
    if (mesh) mesh.renderOrder = renderOrder
  }, [renderOrder, billows])

  return (
    <Suspense fallback={null}>
      <Clouds ref={group} material={light.Material} texture={small ? PUFF_SM : PUFF} limit={limit} frustumCulled={false}>
        {billows.map((b) => {
          const [bx, by, bz] = b.bounds
          const n = b.body
          return (
            <group key={b.key}>
              {/* the hollow under the billow */}
              <Cloud
                seed={b.seed}
                segments={Math.max(2, Math.round(n * 0.7))}
                position={[b.center[0], b.center[1] - by * 0.55, b.center[2] - 0.02]}
                bounds={[bx * 0.9, by * 0.6, bz * 0.8]}
                volume={b.volume * 0.96}
                smallestVolume={0.62}
                concentrate="inside"
                color={b.low}
                opacity={b.opacity * 0.9}
                fade={b.fade}
              />
              {/* its body */}
              <Cloud
                seed={b.seed + 3}
                segments={n}
                position={b.center}
                bounds={[bx, by, bz]}
                volume={b.volume}
                smallestVolume={0.55}
                concentrate="inside"
                color={b.mid}
                opacity={b.opacity}
                fade={b.fade}
              />
              {/* the crown, where the sun lands */}
              <Cloud
                seed={b.seed + 7}
                segments={Math.max(2, Math.round(n * 0.65))}
                position={[b.center[0] + bx * 0.05, b.center[1] + by * 0.52, b.center[2] + 0.03]}
                bounds={[bx * 0.78, by * 0.42, bz * 0.9]}
                volume={b.volume * 0.64}
                smallestVolume={0.48}
                concentrate="outside"
                color={b.high}
                opacity={b.opacity}
                fade={b.fade}
              />
            </group>
          )
        })}
      </Clouds>
    </Suspense>
  )
}
