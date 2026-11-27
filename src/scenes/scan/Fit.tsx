import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { applyOcclusion, applySSS, type SSS } from './sss'

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
  /** hemisphere sky occlusion, 0..1 (solid bodies: crevices and under-hangs fall into shade) */
  occlude,
  strip,
  clipBelow,
  soft = 0,
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
  /** sky occlusion strength for solid bodies (ice, rock) */
  occlude?: number
  /** drop the scan's diffuse map and replace it with this flat colour (ice cut from a rock's massing) */
  strip?: string
  /** cut the scan off below this height above its own base (a museum plinth buried in the sand) */
  clipBelow?: number
  /** painterly softening, 0..1: half-strength normal detail, softer roughness, a gentle self-glow */
  soft?: number
  /** extra vertical stretch after fitting (a slab of rock stood up into a berg) */
  stretch?: number
  /** flat shading: the faceted look of cut ice */
  flat?: boolean
  children: ReactNode
}) {
  const outer = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (clipBelow === undefined) return
    gl.localClippingEnabled = true
    const start = performance.now()
    let id = 0
    const tick = () => {
      const g = outer.current
      let meshes = 0
      if (g) {
        g.updateWorldMatrix(true, true)
        const base = new THREE.Vector3()
        g.getWorldPosition(base)
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(base.y + clipBelow))
        g.traverse((o) => {
          const m = o as THREE.Mesh
          if (!m.isMesh) return
          meshes++
          const mat = m.material as THREE.Material
          if (mat.clippingPlanes?.length !== 1) {
            mat.clippingPlanes = [plane]
            mat.needsUpdate = true
          }
        })
      }
      // the glTF arrives after the effect runs: keep watching for it, then leave the cut in place
      if (meshes === 0 && performance.now() - start < 30000) id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [clipBelow, gl])

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
    if (tint || emissive || roughness !== undefined || sss || flat || occlude || strip || soft > 0) {
      g.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const mat = (m.material as THREE.MeshStandardMaterial).clone()
        if (strip) {
          mat.map = null
          mat.color = new THREE.Color(strip)
          mat.needsUpdate = true
        }
        if (soft > 0) {
          // the dreamy pass: the scan keeps its shape and its colour, but its high-frequency detail is
          // eased back so it reads as painted light rather than photographed gravel
          if (mat.normalScale) mat.normalScale.set(soft * 0.45, soft * 0.45)
          mat.roughness = Math.min(1, (mat.roughness ?? 1) * (1 + 0.1 * soft))
          mat.metalness = 0
          mat.emissive = mat.color.clone().multiplyScalar(0.16 * soft)
          mat.emissiveIntensity = 1
        }
        if (tint) mat.color.multiply(new THREE.Color(tint))
        if (emissive) {
          mat.emissive = new THREE.Color(emissive[0])
          mat.emissiveIntensity = emissive[1]
        }
        if (roughness !== undefined) mat.roughness = roughness
        if (sss) applySSS(mat, sss)
        if (occlude) applyOcclusion(mat, occlude)
        if (flat) {
          mat.flatShading = true
          mat.needsUpdate = true
        }
        if (clipBelow !== undefined) {
          gl.localClippingEnabled = true
          const base = new THREE.Vector3()
          ;(outer.current as THREE.Object3D).getWorldPosition(base)
          mat.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -(base.y + clipBelow))]
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
