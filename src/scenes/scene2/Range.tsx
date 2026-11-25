import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { CAM_Z } from '../layout'

/**
 * The range on the right — real ground, not a drawing.
 *
 * The mesh is a heightfield displaced from a scanned elevation model: AWS Open Data's terrain tiles
 * (terrarium PNG, SRTM/GMTED under the Alps), cropped around the Matterhorn and Monte Rosa massif and
 * baked to a 8 KB grayscale heightmap by `scripts/build-dem.py`. Every peak, every shoulder and every
 * valley in the silhouette is a place that exists; nothing here is noise. The vertical scale carries
 * the usual cartographic exaggeration (the same reason a photograph of the Alps from a plane reads as
 * more dramatic than the map), and the shading is baked into vertex colours at build time: snow above
 * the real snow line and on ground shallow enough to hold it, rock below, the low sun from the upper
 * left on the faces that catch it, and the air of the horizon mixing in with distance.
 */

/** where the heightmap came from, and what its 0 and 255 mean in metres */
const DEM = '/tex/dem/alps-h.webp'
const DEM_SMALL = '/tex/dem/alps-h-small.webp'
const ELEV_LO = 1592.5
const ELEV_HI = 4352.3

type Field = { data: Float32Array; w: number; h: number }

/** Load a heightmap into memory as 0..1 heights. */
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
  /** far and near depth of the patch */
  zFar: number
  zNear: number
  /** the frame span it covers, measured at its near edge */
  u0: number
  u1: number
  /** world height of the lowest and highest ground */
  baseY: number
  topY: number
  /** 0..1 — how much of the range is lost in the air */
  haze: number
  /** metres above sea level where snow starts lying */
  snowLine: number
  /** lift it, mirror it, or shrink it for a second, farther ridge */
  flip?: boolean
  /** the share of the span over which the massif rises out of the cloud at its left end, and the
   *  share of the depth over which its near edge sinks back into it */
  riseIn?: number
  sinkIn?: number
  rows?: number
  columns?: number
  small?: boolean
}

export function Range({ aspect, zFar, zNear, u0, u1, baseY, topY, haze, snowLine, flip = false, riseIn = 0, sinkIn = 0, rows = 96, columns = 300, small = false }: Props) {
  const field = useHeightField(small ? DEM_SMALL : DEM)

  const geometry = useMemo(() => {
    if (!field) return null
    const { data, w, h } = field

    // the patch in world space: its near edge is placed by the frame, and it recedes to zFar
    const nearHalf = Math.tan((40 / 2) * (Math.PI / 180)) * (CAM_Z - zNear)
    const x0 = (u0 - 0.5) * 2 * nearHalf * aspect
    const x1 = (u1 - 0.5) * 2 * nearHalf * aspect

    const sample = (u: number, v: number) => {
      const fx = Math.min(w - 1, Math.max(0, u * (w - 1)))
      const fy = Math.min(h - 1, Math.max(0, v * (h - 1)))
      const ix = Math.floor(fx)
      const iy = Math.floor(fy)
      const tx = fx - ix
      const ty = fy - iy
      const i00 = data[iy * w + ix]
      const i10 = data[iy * w + Math.min(w - 1, ix + 1)]
      const i01 = data[Math.min(h - 1, iy + 1) * w + ix]
      const i11 = data[Math.min(h - 1, iy + 1) * w + Math.min(w - 1, ix + 1)]
      return (i00 * (1 - tx) + i10 * tx) * (1 - ty) + (i01 * (1 - tx) + i11 * tx) * ty
    }

    const nx = columns
    const nz = rows
    const verts = (nx + 1) * (nz + 1)
    const positions = new Float32Array(verts * 3)
    const colors = new Float32Array(verts * 3)
    const heights = new Float32Array(verts)
    const index: number[] = []

    for (let j = 0; j <= nz; j++) {
      const wj = j / nz                          // 0 at the near edge, 1 at the far edge
      const z = zNear + (zFar - zNear) * wj
      for (let i = 0; i <= nx; i++) {
        const u = i / nx
        // sample the scan the way it was taken: the near edge of the patch is the bottom of the crop
        let height = sample(flip ? 1 - u : u, 1 - wj)
        // it rises out of the cloud on the left and sinks back into it toward the camera, so no
        // edge of the mesh can ever show against the sky
        if (riseIn > 0) height *= Math.min(1, Math.max(0, u / riseIn)) ** 0.65
        if (sinkIn > 0) height *= Math.min(1, Math.max(0, wj / sinkIn)) ** 0.7
        const k = j * (nx + 1) + i
        positions[k * 3] = x0 + (x1 - x0) * u
        positions[k * 3 + 1] = baseY + (topY - baseY) * height
        positions[k * 3 + 2] = z
        heights[k] = height
      }
    }

    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i
        const b = a + 1
        const c = a + (nx + 1)
        const d = c + 1
        index.push(a, c, b, b, c, d)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setIndex(index)
    geo.computeVertexNormals()

    const normals = geo.getAttribute('normal') as THREE.BufferAttribute
    const rock = new THREE.Color('#5e6478')
    const rockLit = new THREE.Color('#9aa2b6')
    const snow = new THREE.Color('#f6f9ff')
    const snowBlue = new THREE.Color('#c9d7ef')
    const air = new THREE.Color('#cbd9ec')
    const c = new THREE.Color()

    for (let j = 0; j <= nz; j++) {
      const wj = j / nz
      for (let i = 0; i <= nx; i++) {
        const k = j * (nx + 1) + i
        const elev = ELEV_LO + (ELEV_HI - ELEV_LO) * heights[k]
        const nY = normals.getY(k)
        const nX = normals.getX(k)
        const nZ = normals.getZ(k)

        // rock with a pale, cold face where it is lit, darker in the gullies
        const grain = 0.55 + 0.45 * Math.sin(heights[k] * 190.0 + i * 0.7) * Math.sin(j * 0.9 + 2.0)
        c.copy(rock).lerp(rockLit, Math.min(1, Math.max(0, grain)))
        // snow: above the real snow line, and only where it is shallow enough to lie
        const altitude = (elev - snowLine + 700) / 420
        const slope = Math.min(1, Math.max(0, (nY - 0.14) / 0.34))
        const cover = Math.min(1, Math.max(0, altitude)) * (0.55 + 0.45 * slope)
        c.lerp(elev > snowLine ? snow : snowBlue, Math.min(1, cover * 1.25))
        // the sun from the upper left, baked
        const ndl = Math.max(0, nX * -0.46 + nY * 0.56 + nZ * 0.69)
        c.multiplyScalar(0.72 + 0.56 * Math.pow(ndl, 0.9))
        c.lerp(air, Math.min(0.9, haze * (0.55 + 0.75 * (1 - wj))))

        colors[k * 3] = c.r
        colors[k * 3 + 1] = c.g
        colors[k * 3 + 2] = c.b
      }
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeBoundingSphere()
    return geo
  }, [field, aspect, zFar, zNear, u0, u1, baseY, topY, haze, snowLine, flip, riseIn, sinkIn, rows, columns])

  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, transparent: false }),
    [],
  )

  if (!geometry) return null
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}
