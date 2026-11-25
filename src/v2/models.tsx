import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Real scans, not invented geometry.
 *
 * Poly Haven's CC0 models (photogrammetry, decimated with gltf-transform and texture-capped at
 * 1024) loaded once and cloned into each chapter: a fir for the forest, a broadleaf island tree for
 * the meadow, a boulder for rock, a grass clump for the ground plane.
 */

export const MODEL_URLS = {
  fir: '/models/opt/fir.glb',
  broadleaf: '/models/opt/broadleaf.glb',
  boulder: '/models/opt/boulder.glb',
  grass: '/models/opt/grass.glb',
} as const

export type ModelKey = keyof typeof MODEL_URLS
export type Models = Record<ModelKey, THREE.Group>

const KEYS = Object.keys(MODEL_URLS) as ModelKey[]

export function useModels(): Models {
  const loaded = useLoader(GLTFLoader, KEYS.map((key) => MODEL_URLS[key])) as unknown as { scene: THREE.Group }[]
  const models = {} as Models
  KEYS.forEach((key, index) => {
    const scene = loaded[index].scene
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
        const material = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]
        const list = Array.isArray(material) ? material : [material]
        for (const entry of list) {
          if (!entry) continue
          entry.side = THREE.DoubleSide
          if (entry.map) entry.map.colorSpace = THREE.SRGBColorSpace
          // Scan foliage ships as alpha-blended cards (GLTF "BLEND"). Blended cards shade against
          // themselves and read as black sticks, which is what the fir twigs and the grass clump were
          // doing. Cut-out alpha keeps the scan's own image and gives back the canopy.
          if (entry.transparent || entry.alphaTest > 0) {
            entry.transparent = false
            entry.alphaTest = 0.42
            entry.depthWrite = true
          }
        }
      }
    })
    models[key] = scene
  })
  return models
}

/** A clone of a loaded model, scaled to a target height. Clones share geometry and materials. */
export function instance(model: THREE.Object3D, targetHeight: number): THREE.Group {
  const wrapper = new THREE.Group()
  const clone = model.clone(true)
  const box = new THREE.Box3().setFromObject(clone)
  const size = new THREE.Vector3()
  box.getSize(size)
  if (size.y > 0.0001) clone.scale.multiplyScalar(targetHeight / size.y)
  // sit it on the ground rather than at its own pivot
  const grounded = new THREE.Box3().setFromObject(clone)
  clone.position.y -= grounded.min.y
  wrapper.add(clone)
  return wrapper
}
