import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { applyPainterlySurface } from '../scan/Fit'
import { lakeHeight } from './LakeGround'
import { buildSoftConifer } from './SoftConifer'

/**
 * The lake's conifer: a slender sinuous trunk under three stacked, gently tapered ellipsoid tiers
 * (SoftConifer.ts). Round, feather-edged, smooth-shaded — the reference's painterly tree mass, not
 * a stack of sharp cones — with the trunk still reading between the lower tiers.
 */
function buildLayeredPinePrototype(seed: number): {
  trunkGeo: THREE.BufferGeometry
  foliageGeo: THREE.BufferGeometry
} {
  const trunkGeo = new THREE.CylinderGeometry(0.012, 0.05, 0.62, 10, 6)
  trunkGeo.translate(0, 0.5, 0)
  const tPos = trunkGeo.attributes.position as THREE.BufferAttribute
  const tCols = new Float32Array(tPos.count * 3)
  const cBarkBase = new THREE.Color('#4a433e')
  const cBarkMid = new THREE.Color('#746254')
  const tmp = new THREE.Color()

  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i)
    const y = tPos.getY(i)
    const z = tPos.getZ(i)
    const swayX = Math.sin(y * Math.PI * 1.15 + seed) * 0.015
    const swayZ = Math.cos(y * Math.PI * 0.95 + seed) * 0.012
    tPos.setXYZ(i, x + swayX, y, z + swayZ)

    tmp.copy(cBarkBase).lerp(cBarkMid, THREE.MathUtils.smoothstep(y, 0.0, 0.45))
    tCols[i * 3] = tmp.r
    tCols[i * 3 + 1] = tmp.g
    tCols[i * 3 + 2] = tmp.b
  }
  tPos.needsUpdate = true
  trunkGeo.setAttribute('color', new THREE.BufferAttribute(tCols, 3))
  trunkGeo.computeVertexNormals()

  const foliageGeo = buildSoftConifer({ seed, tiers: 5, perTier: 3, seg: [11, 6], lift: 0.18, width: 0.3 })

  return { trunkGeo, foliageGeo }
}

export type PinePlacement = {
  x: number
  z: number
  height: number
  yaw: number
  lean: number
  tint: string
}

export const LAKE_PINES: PinePlacement[] = [
  // a natural group on the right bank where the shore curves into the bay: varied heights, tight
  // enough to overlap, the way the reference's right-hand pines gather at the water's edge
  { x: 5.4, z: -4.15, height: 3.1, yaw: 0.4, lean: 0.03, tint: '#d3e2cc' },
  { x: 6.9, z: -4.55, height: 2.4, yaw: 1.8, lean: -0.02, tint: '#d6e6cc' },
  { x: 8.5, z: -4.35, height: 3.6, yaw: 2.7, lean: 0.04, tint: '#cfe0cc' },
  { x: 9.9, z: -4.75, height: 2.9, yaw: 1.1, lean: -0.03, tint: '#cadccd' },
  { x: 11.2, z: -5.1, height: 4.3, yaw: 0.9, lean: 0.02, tint: '#c6d8d2' },
]

export function LakePines({
  trees = LAKE_PINES,
  sunDir = [0.48, 0.56, -0.67],
}: {
  trees?: PinePlacement[]
  sunDir?: [number, number, number]
}) {
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const foliageRef = useRef<THREE.InstancedMesh>(null)

  const { trunkGeo, foliageGeo, trunkMat, foliageMat } = useMemo(() => {
    const proto = buildLayeredPinePrototype(42)

    const tMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
    })
    applyPainterlySurface(tMat, {
      soft: 0.8,
      rimColor: '#fff0cc',
      shadowTint: '#485862',
      sunDir,
      brush: 0.7,
    })

    const fMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.84,
      metalness: 0,
    })
    applyPainterlySurface(fMat, {
      soft: 0.98,
      rimColor: '#fff8dc',
      shadowTint: '#4a6a58',
      sunDir,
      brush: 1,
      brushScale: 9,
    })

    return {
      trunkGeo: proto.trunkGeo,
      foliageGeo: proto.foliageGeo,
      trunkMat: tMat,
      foliageMat: fMat,
    }
  }, [sunDir])

  useLayoutEffect(() => {
    const tm = trunkRef.current
    const fm = foliageRef.current
    if (!tm || !fm) return

    const dummy = new THREE.Object3D()
    const col = new THREE.Color()

    trees.forEach((tree, i) => {
      const y = lakeHeight(tree.x, tree.z) - 0.05
      const widthScale = tree.height * (0.56 + (i % 3) * 0.06)
      dummy.position.set(tree.x, y, tree.z)
      dummy.rotation.set(tree.lean, tree.yaw, -tree.lean * 0.7)
      dummy.scale.set(widthScale, tree.height, widthScale)
      dummy.updateMatrix()

      tm.setMatrixAt(i, dummy.matrix)
      fm.setMatrixAt(i, dummy.matrix)

      col.set(tree.tint)
      fm.setColorAt(i, col)
    })

    tm.instanceMatrix.needsUpdate = true
    fm.instanceMatrix.needsUpdate = true
    if (fm.instanceColor) fm.instanceColor.needsUpdate = true
  }, [trees])

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[trunkGeo, trunkMat, trees.length]} />
      <instancedMesh ref={foliageRef} args={[foliageGeo, foliageMat, trees.length]} />
    </group>
  )
}
