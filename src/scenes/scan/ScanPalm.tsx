import { Fit } from './Fit'
import { FirTrunk } from '../../scans/models/FirTrunk'
import { Fern02 } from '../../scans/models/Fern02'

/**
 * A palm built from real Poly Haven scans (Poly Haven has no palm scan, and Fab's Quixel palms need an
 * Epic login): a scanned bark trunk stretched tall and thin, crowned with a ring of scanned fern
 * fronds that arch out and droop, with leaf translucency (SSS) so the sun glows through them.
 */
export function ScanPalm({
  height = 4,
  position,
  yaw = 0,
  fronds = 9,
  spread = 1.5,
}: {
  height?: number
  position: [number, number, number]
  yaw?: number
  fronds?: number
  spread?: number
}) {
  const leaf = { color: [0.55, 0.85, 0.2] as [number, number, number], strength: 1.2, power: 2, ambient: 0.4 }
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <group scale={[2.6, 1, 2.6]}>
        <Fit size={height} tint="#c9a77a">
          <FirTrunk />
        </Fit>
      </group>
      <group position={[0, height * 0.97, 0]}>
        {Array.from({ length: fronds }).map((_, i) => {
          const a = (i / fronds) * Math.PI * 2 + (i % 2) * 0.2
          const up = i % 3 === 0 ? 0.55 : 0.95
          return (
            <group key={i} rotation={[0, a, 0]}>
              <group rotation={[0, 0, -up]}>
                <Fit size={spread * (0.85 + (i % 3) * 0.1)} position={[spread * 0.45, 0, 0]} tint="#b9d08a" sss={leaf}>
                  <Fern02 />
                </Fit>
              </group>
            </group>
          )
        })}
      </group>
    </group>
  )
}
