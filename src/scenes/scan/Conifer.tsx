import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * A spruce/fir for the lake's slopes: a bare trunk with tiers of drooping cone skirts, the silhouette
 * that closes the right bank of the reference panel. Built as geometry with baked vertex colour —
 * a dark blue-green core, lighter rims where the tiers catch the sun — and drawn as one mesh per tree
 * group. Small trees stand in for the far treeline, where only the silhouette matters.
 */

export function buildConifer(height: number, seed = 1) {
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  let s = seed * 7919
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  const push = (a: number[], b: number[], c: number[], ca: THREE.Color, cb: THREE.Color, cc: THREE.Color) => {
    const base = pos.length / 3
    pos.push(...a, ...b, ...c)
    col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b)
    idx.push(base, base + 1, base + 2)
  }
  const dark = new THREE.Color('#2b4530')
  const mid = new THREE.Color('#41613a')
  const lit = new THREE.Color('#6d8d4c')
  const bark = new THREE.Color('#4a3a2c')
  const trunkR = height * 0.018
  const SIDES = 8
  // trunk
  for (let j = 0; j < SIDES; j++) {
    const a0 = (j / SIDES) * Math.PI * 2, a1 = ((j + 1) / SIDES) * Math.PI * 2
    const p0 = [Math.cos(a0) * trunkR, 0, Math.sin(a0) * trunkR]
    const p1 = [Math.cos(a1) * trunkR, 0, Math.sin(a1) * trunkR]
    const q0 = [Math.cos(a0) * trunkR * 0.5, height * 0.8, Math.sin(a0) * trunkR * 0.5]
    const q1 = [Math.cos(a1) * trunkR * 0.5, height * 0.8, Math.sin(a1) * trunkR * 0.5]
    push(p0, p1, q0, bark, bark, bark)
    push(p1, q1, q0, bark, bark, bark)
  }
  // tiers of skirts
  const tiers = 6
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1)
    const yBase = height * (0.16 + 0.72 * t)
    const rad = height * (0.30 * (1 - t) + 0.03) * (0.9 + 0.2 * rand())
    const hgt = height * (0.20 - 0.03 * i)
    const cBase = dark.clone().lerp(mid, 0.25 + 0.5 * t)
    const cRim = mid.clone().lerp(lit, 0.35 + 0.5 * t)
    for (let j = 0; j < SIDES; j++) {
      const a0 = (j / SIDES) * Math.PI * 2 + i * 0.4
      const a1 = ((j + 1) / SIDES) * Math.PI * 2 + i * 0.4
      const am = (a0 + a1) / 2
      const droop = 0.55 + 0.25 * rand()
      const o0 = [Math.cos(a0) * rad, yBase - hgt * 0.25 * rand(), Math.sin(a0) * rad]
      const o1 = [Math.cos(a1) * rad, yBase - hgt * 0.25 * rand(), Math.sin(a1) * rad]
      const apex = [Math.cos(am) * rad * 0.12, yBase + hgt, Math.sin(am) * rad * 0.12]
      const skirtMid = [Math.cos(am) * rad, yBase - hgt * 0.25 * droop, Math.sin(am) * rad]
      push(apex, o0, skirtMid, cRim, cBase, cBase)
      push(apex, skirtMid, o1, cRim, cBase, cBase)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

const cache = new Map<string, THREE.BufferGeometry>()

function Conifer({ x, y, z, h, seed, material }: { x: number; y: number; z: number; h: number; seed: number; material: THREE.Material }) {
  const key = `${h.toFixed(2)}:${seed}`
  const geo = useMemo(() => {
    let g = cache.get(key)
    if (!g) {
      g = buildConifer(h, seed)
      cache.set(key, g)
    }
    return g
  }, [key, h, seed])
  return <mesh geometry={geo} material={material} position={[x, y, z]} />
}

export function Conifers({
  trees,
  position = [0, 0, 0],
  yaw = 0,
}: {
  /** x, y, z, height, seed */
  trees: [number, number, number, number, number][]
  position?: [number, number, number]
  yaw?: number
}) {
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }),
    [],
  )
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {trees.map(([x, y, z, h, seed], i) => (
        <Conifer key={i} x={x} y={y} z={z} h={h} seed={seed} material={mat} />
      ))}
    </group>
  )
}
