import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { DatePalmModel } from '../../scans/models/DatePalmModel'
import { RoyalPalmModel } from '../../scans/models/RoyalPalmModel'
import { CoconutPalmModel } from '../../scans/models/CoconutPalmModel'
import { applyPainterlySurface } from './Fit'

/**
 * Palms from vinish.dev's free model library (CC BY 4.0, credited in each generated component and in
 * README): "Date Palm", "Royal Palm" and "Coconut Palm", real botanical meshes with separated trunk,
 * crown and fruit meshes. Downloaded as glTF, compressed with gltf-transform (meshopt geometry, WebP
 * textures at 1k) and converted with gltfjsx.
 *
 * Each is measured when it arrives (a Suspense boundary means the group is empty on the first frame):
 * the model is scaled so its own height becomes `height` and its foot sits on y = 0, centred on x/z.
 * Because the whole tree is scaled by one factor, the crown-to-trunk proportion stays the model's own —
 * the thing that went wrong when trunk and crown were fitted separately.
 */

const Models = [DatePalmModel, RoyalPalmModel, CoconutPalmModel]

function boxOf(g: THREE.Object3D) {
  g.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(g)
  return b.max.y - b.min.y > 1e-4 ? b : null
}

function whenLoaded(ref: React.RefObject<THREE.Group | null>, fn: (g: THREE.Group) => void, tries = 600) {
  let n = 0
  let id = 0
  const tick = () => {
    const g = ref.current
    if (g && g.children.length && boxOf(g)) {
      fn(g)
      return
    }
    if (++n < tries) id = requestAnimationFrame(tick)
  }
  id = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(id)
}

export function PalmModel({
  height = 4,
  position = [0, 0, 0],
  yaw = 0,
  variant = 0,
}: {
  height?: number
  position?: [number, number, number]
  yaw?: number
  variant?: number
}) {
  const inner = useRef<THREE.Group>(null)
  const Model = Models[variant % Models.length]

  useLayoutEffect(() => {
    const stop = whenLoaded(inner, (g) => {
      const b = boxOf(g)!
      const s = height / (b.max.y - b.min.y)
      g.scale.setScalar(s)
      const b2 = boxOf(g)!
      const c = b2.getCenter(new THREE.Vector3())
      g.position.set(-c.x, -b2.min.y, -c.z)
      // the palms are authored for daylight; keep their own albedo, only soften the shading a touch
      g.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const mat = (m.material as THREE.MeshStandardMaterial).clone()
        // painterly easing (see Fit's `soft`): the frond's own vein detail stays, its bite goes
        if (mat.normalScale) mat.normalScale.set(0.3, 0.3)
        mat.roughness = Math.min(1, (mat.roughness ?? 1) * 1.08)
        mat.metalness = 0
        mat.emissive = mat.color.clone().multiplyScalar(0.1)
        mat.emissiveIntensity = 1
        mat.side = THREE.DoubleSide
        applyPainterlySurface(mat, { soft: 0.9, rimColor: '#ffeccc', shadowTint: '#7c8a5c', sunDir: [-0.55, 0.42, -0.72] })
        m.material = mat
      })
    })
    return stop
  }, [height])

  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <group ref={inner}>
        <Model />
      </group>
    </group>
  )
}
