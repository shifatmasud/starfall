import { useMemo } from 'react'
import * as THREE from 'three'
import { vnoise } from '../../scans/scatter'

/**
 * The sea floor of the dive panel: sand and reef rubble running away into the blue, lit from above and
 * fading with the water's own fog. Without it the reef props stand in open water like specimens on a
 * shelf; with it the eye reads depth and the light shafts have something to land on.
 */
export function SeaFloor({
  y = -3.8,
  color = '#3d5a63',
  size = 90,
  position = [0, 0, 0],
}: {
  y?: number
  color?: string
  size?: number
  position?: [number, number, number]
}) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(size, size, 60, 60)
    g.rotateX(-Math.PI / 2)
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const colors = new Float32Array(p.count * 3)
    const base = new THREE.Color(color)
    const lit = base.clone().multiplyScalar(1.55)
    const c = new THREE.Color()
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const z = p.getZ(i)
      const h = (vnoise(x * 0.22, z * 0.22) - 0.5) * 0.9 + (vnoise(x * 0.7, z * 0.7) - 0.5) * 0.25
      p.setY(i, h)
      const t = THREE.MathUtils.clamp(0.35 + 0.65 * vnoise(x * 0.5 + 3.1, z * 0.5), 0, 1)
      c.copy(base).lerp(lit, t)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }, [color, size])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), [])
  return <mesh geometry={geo} material={mat} position={[position[0], y, position[2]]} frustumCulled={false} />
}
