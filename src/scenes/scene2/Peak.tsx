import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { at } from './frame'

/**
 * The lone summit standing out of the cloud sea, mid-distance on the right of panel 2.
 *
 * Real ground only: the mesh is displaced from a square crop of the Matterhorn itself (AWS Open Data
 * terrain tiles, SRTM-derived, zoom 13, ~13 m per pixel; `python3 scripts/build-dem.py peak`), kept at
 * its true proportions (4.2 km across, 2,015 m of relief, no exaggeration). Only its top third clears
 * the clouds, as in the panel. The shading is baked and deliberately soft: snow everywhere the slope
 * can hold it, darker rock on the steep faces, the low golden sun grazing the faces turned to it, a
 * cool lilac shade on the others, and the air of the distance laid over all of it.
 */

const DEM = '/tex/dem/matterhorn-h.webp'
/** the crop's real span and relief, metres (printed by build-dem.py peak) */
const SPAN_M = 4160
const RELIEF_M = 4354 - 2339

type Field = { data: Float32Array; w: number; h: number }

function useHeightField(url: string): Field | null {
  const [field, setField] = useState<Field | null>(null)
  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = url
    image.onload = () => {
      if (cancelled) return
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(image, 0, 0)
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const data = new Float32Array(canvas.width * canvas.height)
      for (let i = 0, j = 0; i < px.length; i += 4, j++) data[j] = px[i] / 255
      setField({ data, w: canvas.width, h: canvas.height })
    }
    return () => {
      cancelled = true
    }
  }, [url])
  return field
}

type Props = {
  aspect: number
  /** where the summit lands in the frame (u across, v down) and at what depth */
  u: number
  v: number
  z: number
  /** world width of the crop */
  size: number
  /** turn about the vertical axis, radians: which face looks at us */
  yaw?: number
  /** screen-space direction toward the sun, for the baked light (x right, y up, z toward camera) */
  sun?: [number, number, number]
  haze?: number
  segments?: number
}

export function Peak({ aspect, u, v, z, size, yaw = 0, sun = [-0.62, 0.42, -0.66], haze = 0.24, segments = 160 }: Props) {
  const field = useHeightField(DEM)

  const geometry = useMemo(() => {
    if (!field) return null
    const { data, w, h } = field
    const sample = (x: number, y: number) => {
      const fx = Math.min(w - 1, Math.max(0, x * (w - 1)))
      const fy = Math.min(h - 1, Math.max(0, y * (h - 1)))
      const ix = Math.floor(fx)
      const iy = Math.floor(fy)
      const tx = fx - ix
      const ty = fy - iy
      const i1 = Math.min(w - 1, ix + 1)
      const j1 = Math.min(h - 1, iy + 1)
      return (data[iy * w + ix] * (1 - tx) + data[iy * w + i1] * tx) * (1 - ty) + (data[j1 * w + ix] * (1 - tx) + data[j1 * w + i1] * tx) * ty
    }

    const height = size * (RELIEF_M / SPAN_M)
    const n = segments
    const verts = (n + 1) * (n + 1)
    const pos = new Float32Array(verts * 3)
    const hts = new Float32Array(verts)
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const k = j * (n + 1) + i
        const hv = sample(i / n, j / n)
        // the crop's square edge falls away to nothing, so no border can ever show
        const ex = Math.min(i, n - i) / n
        const ey = Math.min(j, n - j) / n
        const edge = Math.min(1, Math.min(ex, ey) / 0.12)
        hts[k] = hv * edge
        pos[k * 3] = (i / n - 0.5) * size
        pos[k * 3 + 1] = (hts[k] - 1) * height
        pos[k * 3 + 2] = (j / n - 0.5) * size
      }
    }
    const index: number[] = []
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i
        const b = a + 1
        const c = a + n + 1
        const d = c + 1
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
    const snowLit = new THREE.Color('#fff1dc')
    const snowShade = new THREE.Color('#8f99c0')
    const rockLit = new THREE.Color('#c9a98f')
    const rockShade = new THREE.Color('#4f5679')
    const air = new THREE.Color('#cdd6ea')
    const lit = new THREE.Color()
    const shade = new THREE.Color()
    const c = new THREE.Color()
    const colors = new Float32Array(verts * 3)
    for (let k = 0; k < verts; k++) {
      N.fromBufferAttribute(nrm, k)
      // snow holds wherever the slope lets it and thins on the steep faces near the top
      const slope = THREE.MathUtils.smoothstep(N.y, 0.32, 0.7)
      const snow = Math.min(1, 0.35 + slope * 0.8)
      lit.copy(rockLit).lerp(snowLit, snow)
      shade.copy(rockShade).lerp(snowShade, snow)
      // a wrapped, soft light: a painter's two values, not a hard terminator
      const ndl = THREE.MathUtils.smoothstep(N.dot(L) * 0.5 + 0.5, 0.42, 0.78)
      c.copy(shade).lerp(lit, ndl)
      // the air of the distance, thicker toward the base where the cloud breathes on it
      c.lerp(air, Math.min(0.85, haze * (0.7 + 0.6 * (1 - hts[k]))))
      colors[k * 3] = c.r
      colors[k * 3 + 1] = c.g
      colors[k * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeBoundingSphere()
    return geo
  }, [field, size, yaw, sun[0], sun[1], sun[2], haze, segments])

  const material = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), [])
  useEffect(() => () => material.dispose(), [material])

  if (!geometry) return null
  const [x, y] = at(u, v, z, aspect)
  return <mesh geometry={geometry} material={material} position={[x, y, z]} frustumCulled={false} />
}
