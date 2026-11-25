/**
 * A scanned height field, kept so terrain in the scene is real ground rather than a sine wave.
 *
 * The source is a landscape height map from motionforgepictures.com (CC0, no login): "Rugged
 * Terrain with Rivers", 4096 x 4096, downsized to 1024 and stored as raw 8-bit samples in
 * public/art/height/rugged_rivers.bin. Raw rather than PNG so it decodes in one fetch with no
 * image pipeline between the file and the geometry.
 *
 * Everything here is a sampler: nothing is invented, values only ever come from the scan.
 */

const SIZE = 1024
let field: Uint8Array | null = null
let loading: Promise<void> | null = null

/**
 * Loads the field once; safe to call from anywhere and from several places at the same time.
 * The scan is a 1024 greyscale PNG (105KB) decoded through the browser's own image pipeline rather
 * than a megabyte of raw samples, so it stays small enough to version with the source.
 */
export function loadHeightField(url = '/art/height/rugged_rivers_1024.png'): Promise<void> {
  if (field) return Promise.resolve()
  if (!loading) {
    loading = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`height field ${res.status}`)
        return res.blob()
      })
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        const canvas = document.createElement('canvas')
        canvas.width = SIZE
        canvas.height = SIZE
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('no 2d context for height field')
        ctx.drawImage(bitmap, 0, 0, SIZE, SIZE)
        const pixels = ctx.getImageData(0, 0, SIZE, SIZE).data
        const bytes = new Uint8Array(SIZE * SIZE)
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = pixels[i * 4]
        field = bytes
      })
      .catch((err) => {
        // the scene still builds: callers fall back to their own shapes when there is no field
        console.warn('[heightfield]', err)
        loading = null
      })
  }
  return loading
}

export function hasHeightField(): boolean {
  return field !== null
}

/** Bilinear sample, u and v in 0..1, returned in 0..1. */
export function sampleHeightField(u: number, v: number): number {
  if (!field) return 0
  const fx = Math.min(SIZE - 1.001, Math.max(0, u) * (SIZE - 1))
  const fy = Math.min(SIZE - 1.001, Math.max(0, v) * (SIZE - 1))
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const at = (x: number, y: number) => field![y * SIZE + x] / 255
  const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx
  const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx
  return top * (1 - ty) + bottom * ty
}

/**
 * A ridge profile around a ring: angle in radians, t the height up the ring's wall (0 at the base,
 * 1 at the crest). Returns 0..1. Rivers become valleys because their samples are low.
 */
export function ridgeFromField(angle: number, t: number, scale = 1): number {
  const u = (angle / (Math.PI * 2)) * scale + 0.5
  return sampleHeightField(u - Math.floor(u), 0.5 - t * 0.5)
}
