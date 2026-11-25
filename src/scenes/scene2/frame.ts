import { CAM_Z } from '../layout'

/**
 * The framing helper for scene 2.
 *
 * Everything in the cloud scene is placed by where it has to *appear*, because the picture — not the
 * world — is the deliverable: a bank of cumulus is "the third of the frame left of centre, from 0.62
 * down", not "x = −3.1". These convert a point in frame coordinates (u across, v down, both 0..1) at a
 * given depth into world space for the scene's camera, so the composition survives every aspect ratio.
 */

const HALF_FOV = Math.tan((40 / 2) * (Math.PI / 180))

/** half the visible height, in world units, at depth `z` */
export function halfHeightAt(z: number): number {
  return HALF_FOV * Math.max(0.1, CAM_Z - z)
}

/** a frame point at a depth → world position */
export function at(u: number, v: number, z: number, aspect: number): [number, number, number] {
  const hh = halfHeightAt(z)
  return [(u - 0.5) * 2 * hh * aspect, (0.5 - v) * 2 * hh, z]
}

/** a frame size at a depth → world size (width, height) */
export function sizeAt(du: number, dv: number, z: number, aspect: number): [number, number] {
  const hh = halfHeightAt(z)
  return [du * 2 * hh * aspect, dv * 2 * hh]
}

/** where the sun sits in the frame, as the sky, the mountains and the clouds all agree */
export const SUN_UV = { u: 0.465, v: 0.165 }

/** the direction from the scene toward that sun, for the lights (upper left, slightly in front) */
export const SUN_DIR: [number, number, number] = [-0.42, 0.52, 0.74]
