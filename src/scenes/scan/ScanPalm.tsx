import { Fit } from './Fit'
import { QuixelPalmTrunk } from '../../scans/models/QuixelPalmTrunk'
import { QuixelPalmLeavesA } from '../../scans/models/QuixelPalmLeavesA'
import { QuixelPalmLeavesB } from '../../scans/models/QuixelPalmLeavesB'
import { QuixelPalmLeavesC } from '../../scans/models/QuixelPalmLeavesC'

/**
 * A palm from Quixel Megascans (free on Fab, downloaded as glTF/FBX): the scanned "Palm Tree Trunk" with
 * the scanned "Tropical Palm" leaf crowns (three variations, drooping arched fronds as photographed)
 * seated on top. The crowns use the scan's own alpha-masked leaf cards, and leaf translucency (SSS) so
 * the sun glows through the fronds. Heights vary per palm; extra crowns at other yaws/tilts thicken the head.
 */
const Crowns = [QuixelPalmLeavesA, QuixelPalmLeavesB, QuixelPalmLeavesC]

export function ScanPalm({
  height = 4,
  position,
  yaw = 0,
  variant = 0,
  crown = 1,
}: {
  height?: number
  position: [number, number, number]
  yaw?: number
  variant?: number
  /** crown width as a multiple of the palm height */
  crown?: number
}) {
  const leaf = { color: [0.62, 0.7, 0.3] as [number, number, number], strength: 0.9, power: 2, ambient: 0.3 }
  const Crown = Crowns[variant % 3]
  const Crown2 = Crowns[(variant + 1) % 3]
  const w = height * crown * 1.05
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <group scale={[0.62, 1, 0.62]}>
        <Fit size={height} tint="#f0dcc0" emissive={['#6a4e36', 0.35]}>
          <QuixelPalmTrunk />
        </Fit>
      </group>
      <group position={[0, height * 0.9, 0]}>
        <Fit size={w} sss={leaf} tint="#9cae6a">
          <Crown />
        </Fit>
        <group rotation={[0.12, 2.1, 0.1]} position={[0, w * 0.05, 0]}>
          <Fit size={w * 0.85} sss={leaf} tint="#8aa060">
            <Crown2 />
          </Fit>
        </group>
      </group>
    </group>
  )
}
