import { useMemo } from 'react'
import * as THREE from 'three'
import { hash, vnoise } from '../../scans/scatter'
import { applyPainterlySurface } from './Fit'

/**
 * Scene 4's foreground: the pasture bank that runs from the lower left up and across the frame, its
 * shore line receding to the right, exactly the composition of the reference panel — not a disc.
 *
 * The surface is a height field: a plane tilted toward the viewer (the bank rises as it comes forward),
 * a shore line that wanders across the frame, low rolling undulation, and a few swells where the meadow
 * folds over rocks. Colour is baked per vertex — deep green in the hollows, warm yellow-green on the
 * sunlit crowns, a paler dry band along the water — so the meadow separates into light and shade the
 * way the panel's does before any grass is scattered on it.
 */

export const SHORE_LINE = (x: number) => -3.55 - 0.62 * x + 0.32 * Math.sin(x * 0.55 + 1.1)

export function bankHeight(x: number, z: number) {
  const shore = SHORE_LINE(x)
  const d = z - shore // how far in front of the water line this point is (positive = on land)
  const rise = 0.075 * d
  const roll = 0.055 * Math.sin(x * 0.85 + 0.6) * Math.cos(z * 0.55 - 0.4) + 0.03 * Math.sin(x * 2.1 + z * 1.7)
  const noise = (vnoise(x * 1.6, z * 1.6) - 0.5) * 0.06
  const bury = -0.28 * Math.max(0, -d) // beyond the water line the bank sinks under the lake
  const h = 0.025 + rise + (roll + noise) * Math.min(1, Math.max(0, d) * 1.6) + bury
  // the meadow meets the water, it does not dip under it: no puddles of lake showing through the grass
  return d > 0 ? Math.max(h, 0.045) : h
}

const DEEP = new THREE.Color('#3f5c22')
const MID = new THREE.Color('#5c7f2c')
const LIT = new THREE.Color('#8ba842')
const DRY = new THREE.Color('#a8a457')

export function Bank({ position = [0, 0, 0] }: { position?: [number, number, number] }) {
  const geo = useMemo(() => {
    const W = 34, D = 20, NX = 150, NZ = 90
    const g = new THREE.PlaneGeometry(W, D, NX, NZ)
    g.rotateX(-Math.PI / 2)
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const colors = new Float32Array(p.count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + position[0]
      const z = p.getZ(i) - 7.2 + position[2]
      p.setY(i, bankHeight(x, z) - position[1])
      // sun on the crests, deep shade in the hollows, a dry pale band at the water
      const shore = SHORE_LINE(x)
      const wet = THREE.MathUtils.smoothstep(z - shore, -0.55, 0.15) // 0 in the water band, 1 inland
      const lit = THREE.MathUtils.clamp(0.35 + 0.65 * vnoise(x * 0.55 + 2.3, z * 0.55), 0, 1)
      const clump = vnoise(x * 2.4, z * 2.4)
      c.copy(DEEP).lerp(MID, 0.55 + 0.45 * clump).lerp(LIT, 0.3 + 0.6 * lit)
      c.lerp(DRY, (1 - wet) * 0.55 + 0.18 * vnoise(x * 3.1, z * 3.1))
      c.multiplyScalar(0.9 + 0.16 * hash(Math.floor(x * 3), Math.floor(z * 3)))
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }, [position[0], position[1], position[2]])
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 })
    applyPainterlySurface(m, { soft: 0.6, rimColor: '#fff6e0', shadowTint: '#5c7a4e', sunDir: [0.5, 0.55, -0.65], ripple: 0.35 })
    return m
  }, [])
  return <mesh geometry={geo} material={mat} position={[position[0], position[1], -7.2 + position[2]]} frustumCulled={false} />
}
