/*
One boulder out of the gltfjsx component for public/scans/models/rock_moss_set_02.glb
(Poly Haven rock_moss_set_02, photogrammetry, CC0): the same compressed scan RockMossSet02 loads,
so it costs no extra download. Pick the rock by name; it sits at the origin, base on y = 0.
*/

import * as THREE from 'three'
import type { ThreeElements } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import type { GLTF } from 'three-stdlib'

export type MossRock = 'rock07' | 'rock08' | 'rock09' | 'rock10' | 'rock11' | 'rock12' | 'rock13'

type GLTFResult = GLTF & {
  nodes: Record<`rock_moss_set_02_${MossRock}`, THREE.Mesh>
  materials: { rock_moss_set_02: THREE.MeshStandardMaterial }
}

export function RockMossBoulder({ rock = 'rock10', ...props }: ThreeElements['group'] & { rock?: MossRock }) {
  const { nodes, materials } = useGLTF('/scans/models/rock_moss_set_02.glb') as unknown as GLTFResult
  const node = nodes[`rock_moss_set_02_${rock}`]
  return (
    <group {...props} dispose={null}>
      <mesh geometry={node.geometry} material={materials.rock_moss_set_02} />
    </group>
  )
}

useGLTF.preload('/scans/models/rock_moss_set_02.glb')
