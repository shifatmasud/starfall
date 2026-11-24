/**
 * The journey's spine: where the star is, chapter by chapter, in world metres.
 *
 * The star leads and the camera trails behind it — a third-person chase, not a crane over a set.
 * Every station is a point on one continuous Catmull-Rom curve, so the star glides forward into
 * depth (−z) through all eight biomes with no teleport and no straight vertical drop:
 *
 *   01 above the starry sky   y 185, z −5
 *   02 the clouds             y  78, z −25
 *   03 the forest             y 6.4, z  +6
 *   04 the lake in the meadow y 3.0, z −26
 *   05 the desert oasis       y 2.8, z −75
 *   06 the Icelandic pond     y 2.6, z −150
 *   07 the open sea           y 2.2, z −222
 *   08 the deep floor         y −7.2, z −330
 *
 * The camera's distance behind each station is keyed too (`TRAIL`), so the star is a far light in
 * the cosmos, a companion in the forest and a close subject over the water — always dead centre.
 */
import * as THREE from 'three'

export type Station = {
  orb: [number, number, number]
  /** metres behind the star the lens trails */
  trail: number
  /** metres above the star the lens rides */
  lift: number
  fov: number
  /** camera bank through the curve, degrees */
  roll: number
  /** pointer parallax gain */
  par: number
}

export const STATIONS: Station[] = [
  { orb: [0, 158, 60], trail: 30, lift: 11, fov: 38, roll: 0, par: 0.55 },
  { orb: [0, 108, 40], trail: 26, lift: 7, fov: 43, roll: -1.2, par: 0.8 },
  { orb: [0, 6.2, 30], trail: 15, lift: 2.6, fov: 47, roll: 1.4, par: 1.15 },
  { orb: [0, 3.2, -24], trail: 17, lift: 2.0, fov: 49, roll: -0.9, par: 1.2 },
  { orb: [0, 3.0, -108], trail: 15, lift: 1.8, fov: 50, roll: 1.1, par: 1.2 },
  { orb: [0, 2.8, -205], trail: 15, lift: 1.6, fov: 50, roll: -1.0, par: 1.2 },
  { orb: [0, 2.4, -300], trail: 15, lift: 2.2, fov: 50, roll: 1.2, par: 1.25 },
  { orb: [0, -8.4, -420], trail: 13, lift: 2.4, fov: 55, roll: -0.6, par: 1.1 },
]

export const ORB_CURVE = new THREE.CatmullRomCurve3(
  STATIONS.map((s) => new THREE.Vector3(...s.orb)),
  false,
  'centripetal',
  0.5,
)

export const LAST = STATIONS.length - 1

const _p = new THREE.Vector3()
const _t = new THREE.Vector3()

/** The star's position at `p` (0..1). */
export function orbAt(p: number, out: THREE.Vector3 = _p): THREE.Vector3 {
  return ORB_CURVE.getPoint(Math.min(0.9999, Math.max(0, p)), out)
}

/** Unit tangent (the direction of travel) at `p`. */
export function tangentAt(p: number, out: THREE.Vector3 = _t): THREE.Vector3 {
  return ORB_CURVE.getTangent(Math.min(0.9999, Math.max(0, p)), out).normalize()
}

/** Interpolated station numbers (trail, lift, fov, roll, par) at `u` in station units. */
export function stationAt(u: number) {
  const clamped = Math.max(0, Math.min(LAST, u))
  const i = Math.min(LAST - 1, Math.floor(clamped))
  const f = clamped - i
  const a = STATIONS[i]
  const b = STATIONS[i + 1]
  const mix = (x: number, y: number) => x + (y - x) * f
  return {
    trail: mix(a.trail, b.trail),
    lift: mix(a.lift, b.lift),
    fov: mix(a.fov, b.fov),
    roll: (mix(a.roll, b.roll) * Math.PI) / 180,
    par: mix(a.par, b.par),
  }
}
