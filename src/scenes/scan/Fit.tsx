import { useLayoutEffect, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { applySSS, type SSS } from './sss'

/**
 * Places a scan by real size: scales its children so the largest side of their bounding box is
 * `size` world units, centres it on x/z and sits its base on y = 0 — scans arrive in their own units
 * (Poly Haven in metres, Smithsonian specimens in millimetres). `tint` multiplies every material's
 * colour (ice from rock, wet from dry); `emissive` adds a glow tint (bioluminescent coral).
 */
export function Fit({
  size,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  tint,
  emissive,
  roughness,
  sss,
  stretch = 1,
  flat,
  children,
}: {
  size: number
  position?: [number, number, number]
  rotation?: [number, number, number]
  tint?: string
  emissive?: [string, number]
  roughness?: number
  /** translucency (leaves, ice): see sss.ts */
  sss?: SSS
  /** extra vertical stretch after fitting (a slab of rock stood up into a berg) */
  stretch?: number
  /** flat shading: the faceted look of cut ice */
  flat?: boolean
  children: ReactNode
}) {
  const outer = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    const g = inner.current
    if (!g) return
    g.scale.setScalar(1)
    g.position.set(0, 0, 0)
    g.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(g)
    const dim = box.getSize(new THREE.Vector3())
    const s = size / Math.max(dim.x, dim.y, dim.z, 1e-6)
    const c = box.getCenter(new THREE.Vector3())
    g.scale.set(s, s * stretch, s)
    g.position.set(-c.x * s, -box.min.y * s * stretch, -c.z * s)
    if (tint || emissive || roughness !== undefined || sss || flat) {
      g.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const mat = (m.material as THREE.MeshStandardMaterial).clone()
        if (tint) mat.color.multiply(new THREE.Color(tint))
        if (emissive) {
          mat.emissive = new THREE.Color(emissive[0])
          mat.emissiveIntensity = emissive[1]
        }
        if (roughness !== undefined) mat.roughness = roughness
        if (sss) applySSS(mat, sss)
        if (flat) {
          mat.flatShading = true
          mat.needsUpdate = true
        }
        m.material = mat
      })
    }
  })
  return (
    <group ref={outer} position={position} rotation={rotation}>
      <group ref={inner}>{children}</group>
    </group>
  )
}
