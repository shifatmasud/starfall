import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Open water: a wide plane that mirrors the photographed sky (the scene's HDRI environment) through
 * a metal-like, slightly rough surface tinted by the water's colour, darker underfoot and brighter
 * toward the horizon by Fresnel. It covers the photo's own ground from `near` outward, or, with a
 * small `far`, lies as a pool centred `at` (x, z).
 */
export function WaterPlane({ color, near = 0, far = 4000, at = [0, 0], y = 0.01, roughness = 0.1 }: { color: string; near?: number; far?: number; at?: [number, number]; y?: number; roughness?: number }) {
  const geo = useMemo(() => {
    const g = far < 100 ? new THREE.CircleGeometry(far, 64) : new THREE.RingGeometry(near, far, 128, 8)
    g.rotateX(-Math.PI / 2)
    return g
  }, [near, far])
  return (
    <mesh geometry={geo} position={[at[0], y, at[1]]} scale={far < 100 ? [1.6, 1, 1] : [1, 1, 1]} renderOrder={-40}>
      <meshStandardMaterial color={color} metalness={0.92} roughness={roughness} envMapIntensity={1.1} />
    </mesh>
  )
}
