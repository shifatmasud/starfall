import { useMemo } from 'react'
import * as THREE from 'three'
import { hash, vnoise } from '../../scans/scatter'
import { applyPainterlySurface } from './Fit'

/**
 * The oasis floor: the sand the pool sits in, the banks around it, and the dune field behind.
 *
 * It exists so that every prop in scene 5 can be placed on the actual ground (`oasisHeight`) instead
 * of at y = 0 on a surface that has been carved down for the pool — which is how the background palms
 * came to hang in the air. The pool is a bowl whose water line wanders with the dune noise, so the
 * shoreline is irregular and the water can be feathered out over the shallow sand instead of ending in
 * a hard circle.
 *
 * Dunes are ridged FBM (the crest of a real dune is a sharp line, not a sine): |noise| folded and
 * sharpened, a big slow set plus a finer set, so crests stack the way wind-driven sand actually does.
 * Colour: pale warm sand on the lit crest, cooler shadowed slip faces, a wet, darker band along the
 * water line, and a dry crust where the water has receded.
 */

export const POOL = { x: -0.4, z: -6.1, r0: 2.7, r1: 3.95, depth: 2.35 }

const dist = (x: number, z: number) => Math.hypot(x - POOL.x, z - POOL.z)

/** shoreline radius as a function of the angle seen from the pool centre — irregular, not a circle */
export function poolEdge(a: number) {
  return POOL.r1 * (1 + 0.13 * Math.sin(a * 3 + 1.1) + 0.08 * Math.sin(a * 5 - 0.4) + 0.05 * Math.sin(a * 9 + 2.2))
}

function dunes(x: number, z: number) {
  const n =
    0.55 * vnoise(x * 0.062 + 11.3, z * 0.062) +
    0.30 * vnoise(x * 0.16 + 5.1, z * 0.16) +
    0.15 * vnoise(x * 0.42, z * 0.42)
  return Math.pow(1 - Math.abs(n * 2 - 1), 1.9)
}

export function oasisHeight(x: number, z: number) {
  const d = dist(x, z)
  const a = Math.atan2(z - POOL.z, x - POOL.x)
  const edge = poolEdge(a)
  // the bowl: flat under the water, a rim that rises over the bank
  const k = 1 - THREE.MathUtils.smoothstep(d, edge * 0.45, edge)
  const far = THREE.MathUtils.smoothstep(-z, 8, 20) // the dune field starts behind the oasis
  const crest = dunes(x, z) * (0.32 + 0.85 * far)
  const ripple = 0.012 * Math.sin(x * 3.1 + z * 1.7) * Math.cos(z * 2.3) * THREE.MathUtils.smoothstep(d, edge, edge + 2)
  return 0.06 + crest * (0.35 + 0.65 * THREE.MathUtils.smoothstep(d, edge * 0.8, edge * 2.4)) + ripple - POOL.depth * k
}

const SAND_LIT = new THREE.Color('#ffd9a0')
const SAND_MID = new THREE.Color('#deb27a')
const SAND_SHADE = new THREE.Color('#a06d44')
const SAND_WET = new THREE.Color('#6d523a')

export function OasisGround({ position = [0, 0, 0] }: { position?: [number, number, number] }) {
  const geo = useMemo(() => {
    const W = 44, D = 30, NX = 190, NZ = 130
    const g = new THREE.PlaneGeometry(W, D, NX, NZ)
    g.rotateX(-Math.PI / 2)
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const colors = new Float32Array(p.count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + position[0]
      const z = p.getZ(i) - 10 + position[2] // the strip runs from z = +5 to -25
      p.setY(i, oasisHeight(x, z) - position[1])
      const d = dist(x, z)
      const a = Math.atan2(z - POOL.z, x - POOL.x)
      const edge = poolEdge(a)
      const wet = 1 - THREE.MathUtils.smoothstep(d, edge * 0.92, edge * 1.16) // 1 in the water, 0 up the bank
      const crest = THREE.MathUtils.clamp(0.4 + 0.9 * (oasisHeight(x, z) - 0.1), 0, 1)
      c.copy(SAND_SHADE).lerp(SAND_MID, 0.35 + 0.5 * vnoise(x * 0.6, z * 0.6))
      c.lerp(SAND_LIT, 0.25 + 0.7 * crest)
      // the slope's own light, baked the painterly way: the sunward face is lit, the lee falls into shade
      const e = 0.35
      const nx = -(oasisHeight(x + e, z) - oasisHeight(x - e, z)) / (2 * e)
      const nz = -(oasisHeight(x, z + e) - oasisHeight(x, z - e)) / (2 * e)
      const nl = (nx * -0.55 + 1 * 0.42 + nz * -0.72) / Math.sqrt(nx * nx + 1 + nz * nz)
      const ndl = THREE.MathUtils.smoothstep(nl * 0.5 + 0.5, 0.38, 0.82)
      c.lerp(SAND_SHADE, (1 - ndl) * 0.55)
      c.lerp(SAND_LIT, ndl * 0.35)
      c.lerp(SAND_WET, wet * 0.7)
      c.multiplyScalar(0.94 + 0.12 * hash(Math.floor(x * 4), Math.floor(z * 4)))
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }, [position[0], position[1], position[2]])
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 })
    // the sand is a painted mass: wrapped light, a warm shadow fill, a sunlit rim on the crests
    applyPainterlySurface(m, { soft: 0.7, rimColor: '#ffe8c6', shadowTint: '#b08a68', sunDir: [-0.55, 0.42, -0.72] })
    return m
  }, [])
  return <mesh geometry={geo} material={mat} position={[position[0], position[1], -10 + position[2]]} frustumCulled={false} />
}
