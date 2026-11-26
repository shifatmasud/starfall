import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'

/**
 * Ground from real elevation data only. The mesh is displaced from a heightmap that
 * scripts/build-terrain.py cuts out of AWS Open Data terrain tiles (SRTM / NED / GMTED) for a real
 * place, and keeps that place's own proportions unless `relief` says otherwise.
 *
 * The light is baked into vertex colours the painterly way: two values per material (lit, shade),
 * a wrapped soft terminator toward the sun, snow where the slope can hold it above `snowLine`, and
 * the air of the distance (`haze`) laid over it all, thicker toward the base.
 */

type Field = { data: Float32Array; w: number; h: number }
const cache = new Map<string, Promise<Field>>()

function loadField(url: string): Promise<Field> {
  let p = cache.get(url)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return reject(new Error('2d context'))
        ctx.drawImage(image, 0, 0)
        const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        const data = new Float32Array(canvas.width * canvas.height)
        for (let i = 0, j = 0; i < px.length; i += 4, j++) data[j] = px[i] / 255
        resolve({ data, w: canvas.width, h: canvas.height })
      }
      image.onerror = reject
      image.src = url
    })
    cache.set(url, p)
  }
  return p
}

export type TerrainPalette = {
  lit: string
  shade: string
  /** snow (or sand crest, or ice) above the snow line */
  snowLit?: string
  snowShade?: string
  /** 0..1 of the relief where snow starts, and how much the slope sheds it */
  snowLine?: number
  /** the air colour the distance fades into */
  air: string
}

export function Terrain({
  dem,
  size,
  relief,
  position = [0, 0, 0],
  yaw = 0,
  sun,
  palette,
  haze = 0.3,
  segments = [192, 64],
  edge = 0.1,
  floor = 0,
  flipX = false,
  basins = [],
}: {
  dem: string
  /** world width (x) and depth (z) of the crop */
  size: [number, number]
  /** world height of the crop's full relief */
  relief: number
  position?: [number, number, number]
  yaw?: number
  /** world direction toward the sun */
  sun: [number, number, number]
  palette: TerrainPalette
  haze?: number
  segments?: [number, number]
  /** fraction of each side over which the crop falls away to its floor, so no border shows */
  edge?: number
  /** height (0..1 of relief) cut away as the base: the crop's lowland sinks under water or ground */
  floor?: number
  flipX?: boolean
  /** world [x, z, radius] hollows pressed down to the floor (a pool's basin, a clearing), eased at their rims */
  basins?: [number, number, number][]
}) {
  const [field, setField] = useState<Field | null>(null)
  useEffect(() => {
    let live = true
    loadField(dem).then((f) => live && setField(f))
    return () => {
      live = false
    }
  }, [dem])

  const geometry = useMemo(() => {
    if (!field) return null
    const { data, w, h } = field
    const sample = (u: number, v: number) => {
      const fx = Math.min(w - 1, Math.max(0, (flipX ? 1 - u : u) * (w - 1)))
      const fy = Math.min(h - 1, Math.max(0, v * (h - 1)))
      const ix = Math.floor(fx), iy = Math.floor(fy)
      const tx = fx - ix, ty = fy - iy
      const i1 = Math.min(w - 1, ix + 1), j1 = Math.min(h - 1, iy + 1)
      return (data[iy * w + ix] * (1 - tx) + data[iy * w + i1] * tx) * (1 - ty) + (data[j1 * w + ix] * (1 - tx) + data[j1 * w + i1] * tx) * ty
    }
    const [nx, nz] = segments
    const verts = (nx + 1) * (nz + 1)
    const pos = new Float32Array(verts * 3)
    const hts = new Float32Array(verts)
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const k = j * (nx + 1) + i
        const ex = Math.min(i, nx - i) / nx
        const ey = Math.min(j, nz - j) / nz
        const fall = Math.min(1, Math.min(ex, ey) / edge)
        const hv = Math.max(0, (sample(i / nx, j / nz) - floor) / (1 - floor)) * fall * fall * (3 - 2 * fall)
        const lx = (i / nx - 0.5) * size[0], lz = (j / nz - 0.5) * size[1]
        // basins are given in world space: undo the mesh's own placement and yaw
        let keep = 1
        for (const [bx, bz, br] of basins) {
          const dx = bx - position[0], dz = bz - position[2]
          const cx = dx * Math.cos(yaw) - dz * Math.sin(yaw), cz = dx * Math.sin(yaw) + dz * Math.cos(yaw)
          const t = Math.min(1, Math.max(0, (Math.hypot(lx - cx, lz - cz) - br) / br))
          keep = Math.min(keep, t * t * (3 - 2 * t))
        }
        hts[k] = hv * keep
        pos[k * 3] = (i / nx - 0.5) * size[0]
        pos[k * 3 + 1] = hts[k] * relief - 0.02 * relief
        pos[k * 3 + 2] = (j / nz - 0.5) * size[1]
      }
    }
    const index: number[] = []
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1
        index.push(a, c, b, b, c, d)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setIndex(index)
    geo.rotateY(yaw)
    geo.computeVertexNormals()

    const nrm = geo.getAttribute('normal') as THREE.BufferAttribute
    const L = new THREE.Vector3(...sun).normalize()
    const N = new THREE.Vector3()
    const lit = new THREE.Color(palette.lit), shade = new THREE.Color(palette.shade)
    const sLit = new THREE.Color(palette.snowLit ?? palette.lit), sShade = new THREE.Color(palette.snowShade ?? palette.shade)
    const air = new THREE.Color(palette.air)
    const snowLine = palette.snowLine ?? 2
    const a = new THREE.Color(), b = new THREE.Color(), c = new THREE.Color()
    const colors = new Float32Array(verts * 3)
    for (let k = 0; k < verts; k++) {
      N.fromBufferAttribute(nrm, k)
      const hold = THREE.MathUtils.smoothstep(N.y, 0.35, 0.75)
      const snow = THREE.MathUtils.smoothstep(hts[k], snowLine - 0.08, snowLine + 0.08) * (0.45 + 0.55 * hold)
      a.copy(lit).lerp(sLit, snow)
      b.copy(shade).lerp(sShade, snow)
      const ndl = THREE.MathUtils.smoothstep(N.dot(L) * 0.5 + 0.5, 0.4, 0.8)
      c.copy(b).lerp(a, ndl)
      c.lerp(air, Math.min(0.9, haze * (0.6 + 0.8 * (1 - hts[k]))))
      colors[k * 3] = c.r
      colors[k * 3 + 1] = c.g
      colors[k * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeBoundingSphere()
    return geo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, size[0], size[1], relief, yaw, sun[0], sun[1], sun[2], palette, haze, segments[0], segments[1], edge, floor, flipX, JSON.stringify(basins), position[0], position[2]])

  const material = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), [])
  useEffect(() => () => material.dispose(), [material])
  if (!geometry) return null
  return <mesh geometry={geometry} material={material} position={position} frustumCulled={false} />
}
