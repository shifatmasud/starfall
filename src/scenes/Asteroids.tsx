import * as THREE from 'three'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Layout } from './layout'
import { CAM_Z } from './layout'
import { MoonRock01 } from '../components/rock/MoonRock01'
import { MoonRock03 } from '../components/rock/MoonRock03'
import { MoonRock05 } from '../components/rock/MoonRock05'

/**
 * The drift of rock around the star.
 *
 * Real scans, not procedural spheres: Poly Haven's CC0 *moon rock* set, converted with
 * `gltfjsx --transform` (512 px webp, Draco), 66–103 KB each, instanced seven times with different
 * sizes, depths and spins. They are the only lit geometry in the frame, which is what gives the
 * painted sky its sense of real distance.
 *
 * `w` is each scan's largest dimension in its own units, so every stone is placed by the diameter it
 * should read at on screen.
 */

type Kind = 1 | 3 | 5

const MODELS: Record<Kind, { w: number; component: typeof MoonRock01 }> = {
  1: { w: 0.212, component: MoonRock01 },
  3: { w: 0.112, component: MoonRock03 },
  5: { w: 0.081, component: MoonRock05 },
}

type Stone = {
  sx: number
  sy: number
  /** on-screen radius, in half-heights */
  size: number
  z: number
  kind: Kind
  spin: number
  tilt: [number, number, number]
}

const STONES: Stone[] = [
  { sx: 0.221, sy: 0.42, size: 0.058, z: -0.55, kind: 3, spin: 0.06, tilt: [0.4, 1.1, 0.2] },
  { sx: 0.273, sy: 0.487, size: 0.026, z: 0.05, kind: 5, spin: -0.09, tilt: [1.2, 0.3, -0.4] },
  { sx: 0.733, sy: 0.525, size: 0.034, z: -0.85, kind: 3, spin: 0.05, tilt: [-0.3, 2.2, 0.6] },
  { sx: 0.878, sy: 0.619, size: 0.074, z: -0.25, kind: 1, spin: -0.04, tilt: [0.2, -0.6, 0.9] },
  { sx: 0.952, sy: 0.745, size: 0.105, z: 0.0, kind: 5, spin: 0.03, tilt: [0.7, 0.2, -0.5] },
  { sx: 0.838, sy: 0.8, size: 0.04, z: 0.35, kind: 3, spin: 0.08, tilt: [-1.1, 0.9, 0.3] },
  { sx: 0.044, sy: 0.652, size: 0.04, z: -0.4, kind: 1, spin: -0.06, tilt: [0.9, -1.7, 0.4] },
]

function Stone({ stone, layout }: { stone: Stone; layout: Layout }) {
  const group = useRef<THREE.Group>(null)
  const model = MODELS[stone.kind]
  const Model = model.component

  const halfH = (CAM_Z - stone.z) / CAM_Z
  const halfW = halfH * layout.aspect
  const x = stone.sx * 2 * halfW - halfW
  const y = halfH - stone.sy * 2 * halfH
  const scale = ((2 * stone.size * halfH * (layout.mobile ? 0.85 : 1)) / model.w) * 1.0

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * stone.spin
  })

  return (
    <group
      ref={group}
      position={[x, y, stone.z]}
      rotation={stone.tilt}
      scale={[scale, scale, scale]}
    >
      <Model />
    </group>
  )
}

export function Asteroids({ layout }: { layout: Layout }) {
  return (
    <group>
      {STONES.map((stone, i) => (
        <Stone key={i} stone={stone} layout={layout} />
      ))}
    </group>
  )
}
