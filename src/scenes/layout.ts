import * as THREE from 'three'

/**
 * One composition, in screen units.
 *
 * `y` runs -1 (bottom) to 1 (top); `x` runs -aspect to +aspect, so a circle stays a circle at any
 * viewport. Values are interpolated between a phone frame and a wide desktop frame rather than
 * re-composed per breakpoint: the plate is the same picture at every size, framed tighter as the
 * viewport narrows.
 */

export type Layout = {
  aspect: number
  /** 1 at phone aspect, 0 at 1.5 and wider */
  mobile: number
  halfW: number
  orb: { x: number; y: number; r: number }
  star: { x: number; y: number }
  earth: { cx: number; cy: number; r: number }
  /** scene 2: the morning sun in screen uv (0..1 of the frame, y down) */
  sun: { x: number; y: number }
  /** scene 2: the orb diving through the cloud sea, in the same units as `orb` */
  dive: { x: number; y: number; r: number }
}

export function layoutFor(width: number, height: number): Layout {
  const aspect = Math.max(0.3, width / Math.max(1, height))
  const t = THREE.MathUtils.clamp((aspect - 0.5) / 1.0, 0, 1)
  const lerp = THREE.MathUtils.lerp

  // the planet: a huge circle whose crest sits just under the middle of the frame
  const r = lerp(2.25, 5.0, t)
  const crest = lerp(-0.42, 0.08, t)
  const cx = lerp(-0.12, -1.6, t)

  return {
    aspect,
    mobile: 1 - t,
    halfW: aspect,
    orb: {
      x: 0,
      y: lerp(0.30, 0.182, t),
      r: lerp(0.132, 0.214, t),
    },
    star: { x: lerp(0.30, 0.914, t), y: lerp(0.74, 0.818, t) },
    earth: { cx, cy: crest - r, r },
    sun: { x: lerp(0.50, 0.48, t), y: lerp(0.17, 0.20, t) },
    dive: {
      x: lerp(-0.06, 0.26, t),
      y: lerp(0.02, -0.06, t),
      r: lerp(0.088, 0.098, t),
    },
  }
}

/** camera distance that puts the z = 0 plane exactly on the -1..1 height window */
export const CAM_Z = 1 / Math.tan((40 / 2) * (Math.PI / 180))
