import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * A date palm (Phoenix dactylifera), built as geometry rather than scanned: the reference's palms are
 * slender, slightly leaning trunks carrying a crown of long pinnate fronds that arch up out of the
 * heart and then droop back down, their leaflets splaying off the rachis.
 *
 * Trunk  a tapered tube along a gently curved spine (the lean grows as t^1.7, as a real palm leans
 *        toward the light), radius shrinking to 55 % at the crown, cross-section slightly ridged.
 *        Colour is baked per vertex: the broad leaf-scar rings of a date palm, darker in the groove
 *        and pale warm grey-brown on the ridge, with the old dead-frond skirt darkening the base.
 * Crown  16 fronds on a hemisphere of pitches. Each frond is a rachis curve (rises, then droops under
 *        its own weight) carrying 13 pairs of leaflets, longest mid-frond, each leaflet a tapered
 *        blade folded up at the base and swept back toward the tip. Vertex colours run from a deep
 *        green at the heart to a sun-bleached yellow-green at the tips, the way the reference's
 *        crowns are lit.
 *
 * All of it is one merged BufferGeometry per palm, so a whole crown is a single draw.
 */

type PalmOptions = {
  height: number
  lean: number
  fronds: number
  seed: number
  frondLength: number
  crownSpread: number
}

export function buildPalm({ height, lean, fronds, seed, frondLength, crownSpread }: PalmOptions) {
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const ringCol = new THREE.Color()
  let rnd = seed * 9301 + 49297
  const rand = () => {
    rnd = (rnd * 9301 + 49297) % 233280
    return rnd / 233280
  }

  const pushTri = (a: number[], b: number[], c: number[], ca: THREE.Color, cb: THREE.Color, cc: THREE.Color) => {
    const base = pos.length / 3
    pos.push(...a, ...b, ...c)
    col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b)
    idx.push(base, base + 1, base + 2)
  }

  // ── trunk ──────────────────────────────────────────────────────────────────────────────────
  const RINGS = 16
  const SIDES = 10
  const r0 = height * 0.042
  const spine: THREE.Vector3[] = []
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS
    spine.push(new THREE.Vector3(lean * height * Math.pow(t, 1.7), height * t, 0))
  }
  const ringVerts: THREE.Vector3[][] = []
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS
    const r = r0 * (1 - 0.45 * t) * (1 + 0.35 * Math.exp(-t * 22)) // a slight root flare
    const p = spine[i]!
    const arr: THREE.Vector3[] = []
    for (let j = 0; j < SIDES; j++) {
      const a = (j / SIDES) * Math.PI * 2
      const ridge = 1 + 0.05 * Math.cos(a * 5 + t * 2) // the leaf-scar ridges
      arr.push(new THREE.Vector3(p.x + Math.cos(a) * r * ridge, p.y, p.z + Math.sin(a) * r * ridge * 0.94))
    }
    ringVerts.push(arr)
  }
  const bark = new THREE.Color('#a08a6d')
  const barkDark = new THREE.Color('#6b5844')
  for (let i = 0; i < RINGS; i++) {
    const t = i / RINGS
    // leaf-scar rings every second band, the old skirt darker at the foot
    const band = 1 - 0.16 * (0.5 + 0.5 * Math.cos(t * RINGS * Math.PI * 0.9))
    const foot = 0.55 + 0.45 * Math.min(1, t * 3.2)
    ringCol.copy(bark).lerp(barkDark, 1 - band).multiplyScalar(foot * (0.92 + 0.12 * rand()))
    const next = ringCol.clone().multiplyScalar(0.94)
    for (let j = 0; j < SIDES; j++) {
      const k = (j + 1) % SIDES
      pushTri(
        ringVerts[i]![j]!.toArray(), ringVerts[i]![k]!.toArray(), ringVerts[i + 1]![j]!.toArray(),
        ringCol, ringCol, next,
      )
      pushTri(
        ringVerts[i]![k]!.toArray(), ringVerts[i + 1]![k]!.toArray(), ringVerts[i + 1]![j]!.toArray(),
        ringCol, next, next,
      )
    }
  }

  // ── crown: fronds on a hemisphere of pitches, each a rachis with leaflet pairs ─────────────
  const heart = new THREE.Vector3(lean * height, height * 0.97, 0)
  const leafDark = new THREE.Color('#4a5c26')
  const leafMid = new THREE.Color('#6f8440')
  const leafTip = new THREE.Color('#9fae5c')
  const segs = 11
  for (let f = 0; f < fronds; f++) {
    const az = (f / fronds) * Math.PI * 2 + rand() * 0.22
    // pitch: the young fronds stand up out of the heart, the old ones arch and hang
    const up = 1.0 - 1.45 * Math.pow((f + rand() * 0.5) / fronds, 0.9)
    const L = frondLength * (0.8 + 0.3 * rand())
    const droop = 0.55 + 0.45 * rand()
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= segs; i++) {
      const u = i / segs
      const horiz = crownSpread * L * (0.32 * u + 0.68 * u * u)
      const y = L * (up * u * 0.5 - droop * u * u * 0.9)
      pts.push(new THREE.Vector3(heart.x + Math.cos(az) * horiz, heart.y + y, heart.z + Math.sin(az) * horiz))
    }
    const across = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az))
    // leaflets: narrow blades, swept back from the rachis, longest mid-frond, with clear gaps between them
    for (let i = 1; i < segs; i++) {
      const u = i / segs
      const p = pts[i]!
      const dir = pts[i + 1]!.clone().sub(pts[i - 1]!).normalize()
      const ll = L * 0.3 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.02)), 0.55)
      const cBase = leafDark.clone().lerp(leafMid, 0.3 + 0.4 * u)
      const cTip = leafMid.clone().lerp(leafTip, 0.4 + 0.6 * u)
      for (const sgn of [1, -1]) {
        // sweep the blade out and back, then let it hang
        const out = across.clone().multiplyScalar(sgn)
        const tip = p.clone().addScaledVector(out, ll).addScaledVector(dir, -ll * 0.5)
        tip.y -= ll * 0.5
        const wv = 0.055 * ll
        const a = p.clone().addScaledVector(dir, -wv)
        const b = p.clone().addScaledVector(dir, wv)
        pushTri(a.toArray(), b.toArray(), tip.toArray(), cBase, cBase, cTip)
        // the folded underside, so a blade is a blade from both sides
        pushTri(b.toArray(), p.clone().addScaledVector(dir, wv * 0.2).addScaledVector(out, ll * 0.2).toArray(), tip.toArray(), cBase, cBase, cTip)
      }
    }
    // the rachis: a thin blade of its own, tapering to the tip
    for (let i = 0; i < segs; i++) {
      const a = pts[i]!, b = pts[i + 1]!
      const w = L * 0.012 * (1 - i / segs) + 0.003
      const ca = leafDark.clone().multiplyScalar(0.9)
      const cb = leafTip.clone()
      pushTri(
        a.clone().addScaledVector(across, -w).toArray(), a.clone().addScaledVector(across, w).toArray(), b.toArray(),
        ca, ca, cb,
      )
      pushTri(
        a.clone().addScaledVector(across, w).toArray(), b.clone().addScaledVector(across, w).toArray(), b.toArray(), ca, cb, cb,
      )
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

export function PalmTree({
  height = 3.5,
  lean = 0.055,
  yaw = 0,
  position = [0, 0, 0],
  fronds = 17,
  seed = 1,
}: {
  height?: number
  /** sideways lean as a fraction of the height */
  lean?: number
  yaw?: number
  position?: [number, number, number]
  fronds?: number
  seed?: number
}) {
  const geo = useMemo(
    () => buildPalm({ height, lean, fronds, seed, frondLength: height * 1.05, crownSpread: 1.05 }),
    [height, lean, fronds, seed],
  )
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.86,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [],
  )
  return <mesh geometry={geo} material={mat} position={position} rotation={[0, yaw, 0]} castShadow={false} />
}
