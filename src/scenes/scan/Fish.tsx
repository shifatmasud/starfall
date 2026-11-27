import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * A school of small fish for the underwater panels: silhouettes, not models. Each fish is a lens-shaped
 * body and a forked tail, seen from the side or slightly above, drawn darker than the water and fading
 * with distance the way anything does underwater. At the panel's scale the silhouette is all the eye
 * can resolve, and it is what makes the water read as inhabited.
 */

export function FishSchool({
  count = 22,
  center = [0, 0, -7],
  spread = [3.2, 1.6, 2.4],
  size = 0.09,
  color = '#123f57',
  seed = 3,
}: {
  count?: number
  center?: [number, number, number]
  spread?: [number, number, number]
  size?: number
  color?: string
  seed?: number
}) {
  const geo = useMemo(() => {
    const pos: number[] = []
    const col: number[] = []
    let s = seed * 7919
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    const push = (a: number[], b: number[], c: number[], k: number) => {
      pos.push(...a, ...b, ...c)
      col.push(k, k, k, k, k, k, k, k, k)
    }
    for (let i = 0; i < count; i++) {
      const cx = center[0] + (rnd() * 2 - 1) * spread[0]
      const cy = center[1] + (rnd() * 2 - 1) * spread[1]
      const cz = center[2] + (rnd() * 2 - 1) * spread[2]
      const L = size * (0.6 + rnd() * 1.1)
      const yaw = rnd() * Math.PI * 2
      const pitch = (rnd() - 0.5) * 0.5
      const dir = new THREE.Vector3(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch))
      const up = new THREE.Vector3(0, 1, 0)
      const side = new THREE.Vector3().crossVectors(dir, up).normalize()
      const up2 = new THREE.Vector3().crossVectors(side, dir).normalize()
      const p = (f: number, s2: number, u: number) =>
        [
          cx + dir.x * f * L + side.x * s2 * L + up2.x * u * L,
          cy + dir.y * f * L + side.y * s2 * L + up2.y * u * L,
          cz + dir.z * f * L + side.z * s2 * L + up2.z * u * L,
        ] as number[]
      const shade = 0.55 + rnd() * 0.45
      // body: nose, two flanks, tail root — a flat lens
      push(p(0.55, 0, 0), p(-0.15, 0.18, 0), p(-0.2, 0, 0), shade)
      push(p(0.55, 0, 0), p(-0.2, 0, 0), p(-0.15, -0.18, 0), shade)
      // tail
      push(p(-0.2, 0, 0), p(-0.15, 0.26, -0.22), p(-0.42, 0, 0), shade)
      push(p(-0.2, 0, 0), p(-0.42, 0, 0), p(-0.15, 0.26, 0.22), shade)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }, [count, center[0], center[1], center[2], spread[0], spread[1], spread[2], size, seed])

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        color: new THREE.Color(color),
        roughness: 0.7,
        side: THREE.DoubleSide,
      }),
    [color],
  )
  return <mesh geometry={geo} material={mat} frustumCulled={false} />
}
