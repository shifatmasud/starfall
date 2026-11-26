/**
 * Where things sit on screen, as a function of the viewport's shape.
 *
 * The scene is authored for a range of aspect ratios rather than one canvas: on a tall phone the
 * planet's limb is a broad dome under the star, and on a wide desktop it is a low arc that hugs the
 * bottom edge and drops away to the right. Positions are interpolated between those two compositions
 * so nothing ever falls off the edge or crowds the middle.
 *
 * Coordinates are in the planet shader's space: y runs -1 (bottom) to 1 (top) and x is scaled by
 * the aspect so circles stay circles. The star's x is in the same aspect-scaled space.
 */

export type Layout = {
  aspect: number
  /** 0 for a tall portrait frame, 1 for a wide landscape one */
  t: number
  earth: { cx: number; cy: number; r: number }
  star: { x: number; y: number }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export function computeLayout(width: number, height: number): Layout {
  const aspect = width / Math.max(1, height)
  // 0.56 ≈ a 9:16 phone, 1.78 ≈ a 16:9 desktop
  const t = clamp01((aspect - 0.56) / (1.78 - 0.56))

  // the planet: a huge circle; on wide frames its limb sweeps from mid-left down to the lower right, as in the panel
  const r = lerp(2.25, 5.2, t)
  const crest = lerp(-0.42, 0.925, t)
  const cx = lerp(-0.12, -2.95, t)
  const cy = crest - r

  return {
    aspect,
    t,
    earth: { cx, cy, r },
    star: { x: lerp(0.30, 0.80, t), y: lerp(0.74, 0.80, t) },
  }
}
