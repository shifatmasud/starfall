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
  pine: '/models/opt2/pine_sapling_small.glb',
  leafTree: '/models/opt2/island_tree_02.glb',
  deadTrunk: '/models/opt2/dead_tree_trunk_02.glb',
  fern: '/models/opt2/fern_02.glb',
  moss: '/models/opt2/moss_01.glb',
  daisy: '/models/opt2/flower_ursinia.glb',
  rock: '/models/opt2/rock_07.glb',
  cliff: '/models/opt2/coastal_cliff_02.glb',
  ridge: '/models/opt2/mountainside.glb',
  boulder: '/models/opt/boulder.glb',
  grass: '/models/opt2/grass_medium_02.glb',
  // Megascans tufted grass: the scanned clump with its own B-O cut-out, so the meadow floor is a
  // scan rather than a Poly Haven strip
  grassGreen: '/models/ms2/tufted_grass_tdcnfcdr/tufted_grass_tdcnfcdr.gltf',
  // real Megascan grass plants, not one repeated clump: a clump scan for the near band, wild grass
  // for the middle distance, so the floor has two silhouettes instead of one
  grassClump: '/models/ms2/grass_clumps_rbdoo/grass_clumps_rbdoo.gltf',
  wildGrass: '/models/ms2/wild_grass_vlkhcbxia/wild_grass_vlkhcbxia.gltf',
  // Megascans: a whole spruce trunk with its branches, and the forest boulder. The trunk is the
  // column a wood is built from; the Poly Haven sapling stretched to 30 m was what read as a
  // mangrove, because a sapling's flared base at that scale is a mangrove's flared base.
  spruce: '/models/ms/nordic_forest_tree_trunk_spruce_large/Nordic_Forest_Tree_Trunk_Spruce_Large_xeticd0ga_Low.gltf',
  msBoulder: '/models/ms/forest_boulder/Forest_Boulder_wgosajs_Low.gltf',
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
            // leaf cards are thin, and at 150 m a mipmapped alpha test punches holes through the
            // canopy until it reads as white speckle. Alpha-to-coverage keeps the silhouette.
            entry.alphaToCoverage = true
          }
        }
      }
    })
    // the tufted grass scan carries a very bright green albedo; against the forest floor it reads as
    // neon and it was the brightest thing in every frame. Tinted down once, at load, so every clump
    // agrees and the near grass stops competing with the pearl.
    if (key === 'grassGreen') {
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh) return
        const list = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]
        for (const entry of list) if (entry?.color) entry.color.multiplyScalar(0.68)
      })
    }
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
