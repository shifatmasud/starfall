/**
 * Wildflowers of the meadow, the wetland edge and the woodland floor.
 *
 * Every species is modelled in local metres (base at the origin, +Y up), merged
 * into one vertex-coloured geometry and then instanced. Seven instanced draws
 * cover ~600 plants; each species keeps its own material so the buttercup alone
 * carries a specular sheen and the fern alone reads translucent.
 *
 * The geometry follows REFERENCES.md §A–B: daisy rays overlap and vary, the
 * foxtail-style lavender spike is interrupted, clover heads are spheres ageing
 * from the bottom, iris is three falls + three standards with a small signal,
 * cattail leaves lean 10–20° off vertical, and the fern is pinnae only.
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import {
  Geo,
  PALETTE,
  color,
  createPlantMaterial,
  mulberry32,
  type Tier,
  type WorldUniforms,
} from './shared'
import { LAKE_LEVEL, sampleTerrain, slopeAt } from './Terrain'
import { alongContour, dryLand, forestFloor, marshLand, scatter, shoreLand, type Box, type KeepFn } from './planting'

const S = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const P = (key: keyof typeof PALETTE) => color(PALETTE[key])
const UP = new THREE.Vector3(0, 1, 0)

/* ------------------------------- daisy ---------------------------------- */

function buildDaisy(): THREE.BufferGeometry {
  const g = new Geo()
  const H = 0.44
  const stemCol = P('grassMid')

  const stem = [S(0, 0, 0), S(0.006, H * 0.42, 0.004), S(0.014, H * 0.8, 0.012), S(0.02, H, 0.02)]
  g.ribbon({
    points: stem,
    widths: [0.0021, 0.0018, 0.0015, 0.0012],
    sides: stem.map(() => S(1, 0, 0)),
    colors: [stemCol, stemCol, stemCol, stemCol],
    sway: (t) => Math.pow(t, 1.6),
  })

  // basal rosette: three spoon leaves, dark green
  g.windFor(0.06, 0)
  const leafCols = [P('grassMid'), P('meadowShade')]
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.6
    const d = S(Math.cos(a), 0.35, Math.sin(a))
    g.ribbon({
      points: [S(0, 0.02, 0), S(d.x * 0.05, 0.05, d.z * 0.05), S(d.x * 0.1, 0.035, d.z * 0.1)],
      widths: [0.006, 0.009, 0.002],
      sides: [S(-Math.sin(a), 0, Math.cos(a)), S(-Math.sin(a), 0, Math.cos(a)), S(-Math.sin(a), 0, Math.cos(a))],
      colors: [leafCols[1], leafCols[0], leafCols[0]],
    })
  }

  // head frame: daisies tip towards the light, so the normal is mostly up
  const n = S(0.26, 0.9, 0.3).normalize()
  const right = S(1, 0, 0).projectOnPlane(n).normalize()
  const up = new THREE.Vector3().crossVectors(n, right).normalize()
  const centre = S(0.02, H, 0.02)
  const lit = P('daisyRayLit')
  const shade = P('daisyRayShade')
  const discCols = [P('daisyDisc'), P('daisyDiscDeep')]

  g.windFor(1, 0)
  const RAYS = 13
  for (let i = 0; i < RAYS; i++) {
    const a = (i / RAYS) * Math.PI * 2 + (i % 3) * 0.06
    const dir = new THREE.Vector3().addScaledVector(right, Math.cos(a)).addScaledVector(up, Math.sin(a)).normalize()
    const perp = new THREE.Vector3().crossVectors(n, dir).normalize()
    const len = 0.021 + ((i * 7) % 5) * 0.0012
    const wIn = 0.0028
    const wOut = 0.0048 + ((i * 3) % 4) * 0.0004
    const inner = centre.clone().addScaledVector(dir, 0.005)
    const outer = centre.clone().addScaledVector(dir, len).addScaledVector(n, -0.0015)
    // one white for lit rays, one for shaded — never a third value
    const c = i % 4 === 1 ? shade : lit
    g.quad(
      inner.clone().addScaledVector(perp, wIn),
      inner.clone().addScaledVector(perp, -wIn),
      outer.clone().addScaledVector(perp, -wOut),
      outer.clone().addScaledVector(perp, wOut),
      c,
      c,
      c,
      c,
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      n,
    )
  }

  // disc: a shallow dome, four flat tones
  const R = 0.0086
  const SEG = 12
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2
    const a1 = ((i + 1) / SEG) * Math.PI * 2
    const p0 = centre.clone().addScaledVector(n, 0.0022)
    const p1 = centre
      .clone()
      .addScaledVector(right, Math.cos(a0) * R)
      .addScaledVector(up, Math.sin(a0) * R)
      .addScaledVector(n, 0.0008)
    const p2 = centre
      .clone()
      .addScaledVector(right, Math.cos(a1) * R)
      .addScaledVector(up, Math.sin(a1) * R)
      .addScaledVector(n, 0.0008)
    const c = discCols[i % 3 === 0 ? 1 : 0]
    g.tri(p0, p1, p2, discCols[0], c, c, [0.5, 0.5], [0, 0], [1, 0], n)
  }
  return g.build()
}

/* ----------------------------- buttercup -------------------------------- */

function buildButtercup(): THREE.BufferGeometry {
  const g = new Geo()
  const H = 0.34
  const stemCol = P('grassMid')
  const stem = [S(0, 0, 0), S(-0.004, H * 0.5, 0.003), S(-0.01, H, 0.006)]
  g.ribbon({
    points: stem,
    widths: [0.0019, 0.0016, 0.0012],
    sides: stem.map(() => S(1, 0, 0)),
    colors: [stemCol, stemCol, stemCol],
    sway: (t) => Math.pow(t, 1.5),
  })

  // one kidney leaf low on the stem
  g.windFor(0.15, 0)
  g.ribbon({
    points: [S(0, 0.04, 0), S(0.05, 0.07, 0.02), S(0.09, 0.06, 0.04)],
    widths: [0.008, 0.017, 0.004],
    sides: [S(0, 1, 0), S(0, 1, 0), S(0, 1, 0)],
    colors: [P('grassMid'), P('grassLit'), P('grassLit')],
  })

  const n = S(0.15, 0.96, 0.24).normalize()
  const right = S(1, 0, 0).projectOnPlane(n).normalize()
  const up = new THREE.Vector3().crossVectors(n, right).normalize()
  const centre = S(-0.01, H, 0.006)
  const lit = P('butterLit')
  const shade = P('butterShade')

  g.windFor(1, 0)
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * Math.PI * 2 - 0.4
    const a1 = a0 + Math.PI / 5
    const dirA = new THREE.Vector3().addScaledVector(right, Math.cos(a0)).addScaledVector(up, Math.sin(a0))
    const dirB = new THREE.Vector3().addScaledVector(right, Math.cos(a1)).addScaledVector(up, Math.sin(a1))
    const mid = dirA.clone().add(dirB).normalize()
    const R = 0.0125
    const p0 = centre.clone().addScaledVector(mid, 0.002)
    const p1 = centre.clone().addScaledVector(dirA, R).addScaledVector(n, 0.004)
    const p2 = centre.clone().addScaledVector(dirB, R).addScaledVector(n, 0.004)
    const p3 = centre.clone().addScaledVector(mid, R * 1.08).addScaledVector(n, 0.001)
    // glossy cup: bright rim, deep base
    g.quad(p0, p1, p3, p2, shade, lit, lit, lit, [0, 0], [1, 0], [1, 1], [0, 1], n)
  }
  // centre boss
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2
    const a1 = ((i + 1) / 6) * Math.PI * 2
    g.tri(
      centre.clone().addScaledVector(n, 0.002),
      centre.clone().addScaledVector(right, Math.cos(a0) * 0.0035).addScaledVector(up, Math.sin(a0) * 0.0035),
      centre.clone().addScaledVector(right, Math.cos(a1) * 0.0035).addScaledVector(up, Math.sin(a1) * 0.0035),
      shade,
      P('butterLit'),
      P('butterLit'),
      [0.5, 0.5],
      [0, 0],
      [1, 0],
      n,
    )
  }
  return g.build()
}

/* ------------------------------ lavender -------------------------------- */

function buildLavender(): THREE.BufferGeometry {
  const g = new Geo()
  const greys = [P('lavenderLeaf'), P('grassMid')]

  // woody base + grey foliage tuft
  g.windFor(0.12, 0)
  g.tube({
    points: [S(0, 0, 0), S(0.01, 0.08, 0.004), S(0.02, 0.16, 0.01)],
    radii: [0.012, 0.008, 0.005],
    radial: 5,
    colorAt: () => greys[1],
  })
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const d = S(Math.cos(a), 0, Math.sin(a))
    g.ribbon({
      points: [S(0.02, 0.16, 0.01), S(0.02 + d.x * 0.07, 0.21, 0.01 + d.z * 0.07), S(0.02 + d.x * 0.11, 0.19, 0.01 + d.z * 0.11)],
      widths: [0.004, 0.005, 0.001],
      sides: [S(-d.z, 0, d.x), S(-d.z, 0, d.x), S(-d.z, 0, d.x)],
      colors: [greys[1], greys[0], greys[0]],
      sway: (t) => 0.25 + t * 0.5,
    })
  }

  // five leaning spikes with interrupted verticillasters
  const lit = P('lavenderLit')
  const shade = P('lavenderShade')
  for (let s = 0; s < 5; s++) {
    const a = (s / 5) * Math.PI * 2 + 0.4
    const lean = 0.05 + (s % 3) * 0.02
    const baseX = 0.02 + Math.cos(a) * 0.03
    const baseZ = 0.01 + Math.sin(a) * 0.03
    const topX = baseX + Math.cos(a) * lean
    const topZ = baseZ + Math.sin(a) * lean
    const topY = 0.46 + (s % 2) * 0.04
    g.windFor(0.85, 0)
    g.ribbon({
      points: [S(baseX, 0.16, baseZ), S((baseX + topX) / 2, topY * 0.6, (baseZ + topZ) / 2), S(topX, topY, topZ)],
      widths: [0.0022, 0.0018, 0.0012],
      sides: [S(1, 0, 0), S(1, 0, 0), S(1, 0, 0)],
      colors: [greys[1], greys[1], shade],
    })
    for (let k = 0; k < 5; k++) {
      const t = 0.3 + k * 0.16
      const y = 0.16 + (topY - 0.16) * t
      const cx = baseX + (topX - baseX) * t
      const cz = baseZ + (topZ - baseZ) * t
      const spin = k * 0.7
      for (let j = 0; j < 4; j++) {
        const va = (j / 4) * Math.PI * 2 + spin
        const d = S(Math.cos(va), 0.35, Math.sin(va))
        const perp = S(-Math.sin(va), 0.1, Math.cos(va))
        const r0 = 0.0025
        const r1 = 0.0085
        const w = 0.0035
        g.quad(
          S(cx + d.x * r0 + perp.x * w, y + d.y * r0, cz + d.z * r0 + perp.z * w),
          S(cx + d.x * r0 - perp.x * w, y + d.y * r0, cz + d.z * r0 - perp.z * w),
          S(cx + d.x * r1 - perp.x * w * 0.4, y + d.y * r1 + 0.004, cz + d.z * r1 - perp.z * w * 0.4),
          S(cx + d.x * r1 + perp.x * w * 0.4, y + d.y * r1 + 0.004, cz + d.z * r1 + perp.z * w * 0.4),
          shade,
          shade,
          lit,
          lit,
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          S(d.x, 0.3, d.z).normalize(),
        )
      }
    }
  }
  return g.build()
}

/* -------------------------------- clover --------------------------------- */

function buildClover(): THREE.BufferGeometry {
  const g = new Geo()
  const leaf = P('cloverLeaf')
  const crescent = P('cloverCrescent')
  const headCol = P('cloverHead')
  const aged = P('cloverAged')

  const leaflet = (cx: number, cy: number, cz: number, a: number, r: number, withCrescent: boolean) => {
    const d = S(Math.cos(a), 0.15, Math.sin(a))
    const perp = S(-Math.sin(a), 0, Math.cos(a))
    const p0 = S(cx, cy, cz)
    const p1 = S(cx + d.x * r + perp.x * r * 0.75, cy + d.y * r, cz + d.z * r + perp.z * r * 0.75)
    const p2 = S(cx + d.x * r * 1.4, cy + d.y * r, cz + d.z * r * 1.4)
    const p3 = S(cx + d.x * r - perp.x * r * 0.75, cy + d.y * r, cz + d.z * r - perp.z * r * 0.75)
    g.quad(p0, p1, p2, p3, leaf, leaf, leaf, leaf, [0, 0], [1, 0], [1, 1], [0, 1], UP)
    if (withCrescent) {
      const q0 = S(cx + d.x * r * 0.5 - perp.x * r * 0.3, cy + d.y * r * 0.5 + 0.001, cz + d.z * r * 0.5 - perp.z * r * 0.3)
      const q1 = S(cx + d.x * r * 0.5 + perp.x * r * 0.3, cy + d.y * r * 0.5 + 0.001, cz + d.z * r * 0.5 + perp.z * r * 0.3)
      const q2 = S(cx + d.x * r * 0.85 + perp.x * r * 0.22, cy + d.y * r * 0.85 + 0.001, cz + d.z * r * 0.85 + perp.z * r * 0.22)
      const q3 = S(cx + d.x * r * 0.85 - perp.x * r * 0.22, cy + d.y * r * 0.85 + 0.001, cz + d.z * r * 0.85 - perp.z * r * 0.22)
      g.quad(q0, q1, q2, q3, crescent, crescent, crescent, crescent, [0, 0], [1, 0], [1, 1], [0, 1], UP)
    }
  }

  // six triples on short stalks
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3
    const r = 0.03 + (i % 3) * 0.022
    const cx = Math.cos(a) * r
    const cz = Math.sin(a) * r
    const cy = 0.05 + (i % 4) * 0.016
    g.windFor(0.25 + (i % 3) * 0.1, 0)
    g.ribbon({
      points: [S(cx * 0.3, 0.005, cz * 0.3), S(cx * 0.7, cy * 0.6, cz * 0.7), S(cx, cy, cz)],
      widths: [0.0016, 0.0014, 0.001],
      sides: [S(-Math.sin(a), 0, Math.cos(a)), S(-Math.sin(a), 0, Math.cos(a)), S(-Math.sin(a), 0, Math.cos(a))],
      colors: [leaf, leaf, leaf],
    })
    for (let k = 0; k < 3; k++) {
      leaflet(cx, cy, cz, a + (k / 3) * Math.PI * 2, 0.021, k !== 1)
    }
  }

  // two heads: spheres of tiny florets, one ageing from the bottom
  for (let h = 0; h < 2; h++) {
    const cx = h === 0 ? 0.045 : -0.03
    const cz = h === 0 ? 0.02 : 0.04
    const cy = h === 0 ? 0.13 : 0.115
    g.windFor(0.55, 0)
    g.ribbon({
      points: [S(cx * 0.4, 0.005, cz * 0.4), S(cx, cy, cz)],
      widths: [0.0014, 0.0011],
      sides: [S(1, 0, 0), S(1, 0, 0)],
      colors: [leaf, leaf],
    })
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2
      const a1 = ((i + 1) / 6) * Math.PI * 2
      const y0 = cy + 0.006
      const y1 = cy + 0.016
      const r = 0.012
      g.tri(
        S(cx, y1, cz),
        S(cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r),
        S(cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r),
        headCol,
        h === 1 ? aged : headCol,
        h === 1 ? aged : headCol,
        [0.5, 1],
        [0, 0],
        [1, 0],
        UP,
      )
    }
    // bottom cap so the head reads as a sphere, not a cone from below
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * Math.PI * 2
      const a1 = ((i + 1) / 5) * Math.PI * 2
      const r = 0.012
      g.tri(
        S(cx, cy - 0.002, cz),
        S(cx + Math.cos(a1) * r, cy + 0.006, cz + Math.sin(a1) * r),
        S(cx + Math.cos(a0) * r, cy + 0.006, cz + Math.sin(a0) * r),
        headCol,
        h === 1 ? aged : headCol,
        h === 1 ? aged : headCol,
        [0.5, 0],
        [0, 1],
        [1, 1],
        new THREE.Vector3(0, -1, 0),
      )
    }
  }
  return g.build()
}

/* --------------------------------- iris ---------------------------------- */

function buildIris(): THREE.BufferGeometry {
  const g = new Geo()
  const leafCol = P('irisLeaf')
  const leafDark = P('grassMid')

  // sword-leaf fan: flat, so the plant nearly disappears edge-on
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const d = S(Math.cos(a), 0, Math.sin(a))
    const h = 0.62 + (i % 3) * 0.12
    const bend = 0.16 + (i % 2) * 0.08
    g.windFor(0.7, 0)
    g.ribbon({
      points: [
        S(0, 0.02, 0),
        S(d.x * 0.06, h * 0.45, d.z * 0.06),
        S(d.x * bend, h * 0.85, d.z * bend),
        S(d.x * bend * 1.7, h * 0.78, d.z * bend * 1.7),
      ],
      widths: [0.009, 0.013, 0.01, 0.002],
      sides: [S(-d.z, 0, d.x), S(-d.z, 0, d.x), S(-d.z, 0, d.x), S(-d.z, 0, d.x)],
      colors: [leafDark, leafCol, leafCol, leafCol],
    })
  }

  // one stem, three falls and three standards
  const lit = P('irisLit')
  const shade = P('irisShade')
  const stemTop = S(0.01, 0.84, 0.01)
  g.windFor(0.95, 0)
  g.ribbon({
    points: [S(0, 0.02, 0), S(0.004, 0.45, 0.004), stemTop],
    widths: [0.004, 0.0032, 0.0024],
    sides: [S(1, 0, 0), S(1, 0, 0), S(1, 0, 0)],
    colors: [leafDark, leafCol, leafCol],
  })

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5
    const d = S(Math.cos(a), 0, Math.sin(a))
    const perp = S(-Math.sin(a), 0, Math.cos(a))
    // fall: hangs out and down
    const tip = stemTop.clone().addScaledVector(d, 0.055).add(S(0, -0.055, 0))
    g.quad(
      stemTop.clone().addScaledVector(perp, 0.004),
      stemTop.clone().addScaledVector(perp, -0.004),
      tip.clone().addScaledVector(perp, -0.017),
      tip.clone().addScaledVector(perp, 0.017),
      shade,
      shade,
      lit,
      lit,
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      S(d.x, 0.35, d.z).normalize(),
    )
    // the yellow signal is a small patch at the throat
    g.quad(
      stemTop.clone().addScaledVector(d, 0.008).addScaledVector(perp, 0.003),
      stemTop.clone().addScaledVector(d, 0.008).addScaledVector(perp, -0.003),
      stemTop.clone().addScaledVector(d, 0.019).addScaledVector(perp, -0.004),
      stemTop.clone().addScaledVector(d, 0.019).addScaledVector(perp, 0.004),
      P('irisSignal'),
      P('irisSignal'),
      P('irisSignal'),
      P('irisSignal'),
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      S(d.x, 0.5, d.z).normalize(),
    )
    // standard: stands up
    const top = stemTop.clone().addScaledVector(d, 0.026).add(S(0, 0.05, 0))
    g.quad(
      stemTop.clone().addScaledVector(perp, 0.004),
      stemTop.clone().addScaledVector(perp, -0.004),
      top.clone().addScaledVector(perp, -0.011),
      top.clone().addScaledVector(perp, 0.011),
      lit,
      lit,
      lit,
      lit,
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      S(d.x * 0.5, 0.8, d.z * 0.5).normalize(),
    )
  }
  return g.build()
}

/* -------------------------------- cattail -------------------------------- */

function buildCattail(): THREE.BufferGeometry {
  const g = new Geo()
  const leafCol = P('cattailLeaf')
  const leafDark = P('grassMid')
  const H = 1.9

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.2
    const d = S(Math.cos(a), 0, Math.sin(a))
    const lean = 0.18 + (i % 3) * 0.09
    const h = H * (0.72 + (i % 3) * 0.09)
    g.windFor(0.62, 0)
    g.ribbon({
      points: [
        S(0, 0, 0),
        S(d.x * lean * 0.25, h * 0.32, d.z * lean * 0.25),
        S(d.x * lean * 0.8, h * 0.66, d.z * lean * 0.8),
        S(d.x * lean * 1.35, h * 0.9, d.z * lean * 1.35),
        S(d.x * lean * 2.0, h, d.z * lean * 2.0),
      ],
      widths: [0.008, 0.014, 0.016, 0.012, 0.002],
      sides: [S(-d.z, 0, d.x), S(-d.z, 0, d.x), S(-d.z, 0, d.x), S(-d.z, 0, d.x), S(-d.z, 0, d.x)],
      colors: [leafDark, leafCol, leafCol, leafCol, leafCol],
    })
  }

  // the sausage: one matte capsule, lit on its left edge
  g.windFor(1, 0)
  const stemBase = S(0.02, 0, 0.01)
  const spikeBottom = S(0.05, 1.42, 0.02)
  g.ribbon({
    points: [stemBase, S(0.035, 0.9, 0.015), spikeBottom],
    widths: [0.005, 0.0045, 0.004],
    sides: [S(1, 0, 0), S(1, 0, 0), S(1, 0, 0)],
    colors: [leafDark, leafDark, leafCol],
  })
  const spikeTop = S(0.058, 1.72, 0.023)
  g.tube({
    points: [spikeBottom, S(0.054, 1.55, 0.021), spikeTop],
    radii: [0.021, 0.0215, 0.019],
    radial: 8,
    colorAt: (_r, around) => (around > 0.55 && around < 0.85 ? P('cattailSpikeLit') : P('cattailSpike')),
    sway: (t) => 0.9 + t * 0.1,
  })
  return g.build()
}

/* --------------------------------- fern ---------------------------------- */

function buildFern(): THREE.BufferGeometry {
  const g = new Geo()
  const lit = P('fernLit')
  const mid = P('fernMid')
  const shade = P('fernShade')
  const stem = P('fernStem')

  for (let f = 0; f < 3; f++) {
    const a = (f / 3) * Math.PI * 2 + 0.4
    const d = S(Math.cos(a), 0, Math.sin(a))
    const perp = S(-Math.sin(a), 0, Math.cos(a))
    const L = 0.68 + f * 0.06
    const spine: THREE.Vector3[] = []
    for (let i = 0; i <= 6; i++) {
      const t = i / 6
      const radius = L * (0.16 + 0.84 * t)
      const y = 0.06 + L * (0.72 * t - 0.34 * t * t)
      spine.push(S(d.x * radius, y, d.z * radius))
    }
    g.windFor(1, 0)
    g.ribbon({
      points: spine,
      widths: spine.map((_, i) => 0.004 * (1 - i / 7)),
      sides: spine.map(() => perp),
      colors: spine.map(() => stem),
      sway: (t) => Math.pow(t, 0.8),
    })
    // pinnae ladder: never model pinnules, one tapered quad each
    for (let i = 1; i <= 11; i++) {
      const t = i / 12
      const idx = Math.min(spine.length - 1, Math.round(t * 6))
      const base = spine[idx]
      const len = L * 0.26 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.03
      for (const sideSign of [-1, 1]) {
        const dir = perp.clone().multiplyScalar(sideSign)
        const tip = base
          .clone()
          .addScaledVector(dir, len)
          .addScaledVector(d, len * 0.45)
          .add(S(0, -len * 0.28, 0))
        g.quad(
          base.clone().addScaledVector(d, 0.008),
          base.clone().addScaledVector(d, -0.008),
          tip.clone().addScaledVector(d, -0.002),
          tip.clone().addScaledVector(d, 0.002),
          mid,
          mid,
          lit,
          lit,
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          S(0, 1, 0),
        )
      }
    }
  }
  // a couple of short, dark fronds at the base
  for (let i = 0; i < 2; i++) {
    const a = 1.1 + i * 2.2
    const d = S(Math.cos(a), 0, Math.sin(a))
    g.windFor(0.4, 0)
    g.ribbon({
      points: [S(0, 0.04, 0), S(d.x * 0.09, 0.16, d.z * 0.09), S(d.x * 0.2, 0.13, d.z * 0.2)],
      widths: [0.006, 0.012, 0.002],
      sides: [S(-d.z, 0, d.x), S(-d.z, 0, d.x), S(-d.z, 0, d.x)],
      colors: [shade, mid, shade],
    })
  }
  return g.build()
}

/* ------------------------------ placement -------------------------------- */

type Place = { x: number; z: number; y: number; yaw: number; scale: number; phase: number; tint: number }

const toPlace = (s: { x: number; z: number; y: number }, rnd: () => number): Place => ({
  x: s.x,
  z: s.z,
  y: s.y,
  yaw: rnd() * Math.PI * 2,
  scale: 1,
  phase: rnd(),
  tint: rnd(),
})

/** The far bank, the banks either side of the pool, the near meadow, the wood. */
const FAR_BANK: Box[] = [{ x: [-46, 46], z: [-22, -6], weight: 3 }]
const NEAR_MEADOW: Box[] = [{ x: [-52, 52], z: [12, 60], weight: 3 }]
const BANKS: Box[] = [
  { x: [11, 46], z: [-20, 16], weight: 1.2 },
  { x: [-46, -11], z: [-20, 16], weight: 1.2 },
]
const WOODLAND: Box[] = [
  { x: [18, 54], z: [18, 64], weight: 1 },
  { x: [-54, -18], z: [18, 64], weight: 1 },
  { x: [-60, 60], z: [18, 56], weight: 1 },
]
const LAKE_MARGIN: Box[] = [{ x: [-40, 40], z: [-20, 10], weight: 1 }]

/** Reeds pinned just off the lens, at the frame's lower corners. */
const FOREGROUND_REEDS: Array<[number, number]> = [
  [-5.4, 8.5],
  [-4.2, 11.0],
  [-3.0, 7.0],
  [5.0, 9.5],
  [6.2, 6.2],
  [3.6, 11.5],
  [-6.8, 5.0],
  [7.4, 3.4],
]

/** A drift: real meadow flowers arrive in colonies, not a uniform sprinkle. */
function drift(
  rnd: () => number,
  count: number,
  centres: Box[],
  radius: number,
  keep: KeepFn,
): Place[] {
  const seeds = scatter(rnd, count, centres, keep)
  const out: Place[] = []
  for (const seed of seeds) {
    const n = 3 + Math.floor(rnd() * 4)
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2
      const r = Math.pow(rnd(), 0.65) * radius
      const x = seed.x + Math.cos(a) * r
      const z = seed.z + Math.sin(a) * r
      const y = sampleTerrain(x, z)
      const slope = slopeAt(x, z)
      if (!keep(x, z, y, slope)) continue
      out.push(toPlace({ x, z, y }, rnd))
    }
  }
  return out
}

/* ------------------------------- component ------------------------------- */

type Species = {
  geometry: THREE.BufferGeometry
  material: THREE.ShaderMaterial
  mesh: THREE.InstancedMesh
}

function instance(
  geometry: THREE.BufferGeometry,
  material: THREE.ShaderMaterial,
  places: Place[],
  scaleRange: [number, number],
): Species {
  const mesh = new THREE.InstancedMesh(geometry, material, places.length)
  const matrix = new THREE.Matrix4()
  const quat = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const varr = new Float32Array(places.length * 2)
  places.forEach((p, i) => {
    pos.set(p.x, p.y, p.z)
    quat.setFromAxisAngle(UP, p.yaw)
    const s = scaleRange[0] + (scaleRange[1] - scaleRange[0]) * ((p.tint * 7.31 + p.phase * 3.7) % 1)
    scl.setScalar(p.scale * s)
    matrix.compose(pos, quat, scl)
    mesh.setMatrixAt(i, matrix)
    varr[i * 2] = p.phase * Math.PI * 2
    varr[i * 2 + 1] = p.tint
  })
  mesh.instanceMatrix.needsUpdate = true
  geometry.setAttribute('aVar', new THREE.InstancedBufferAttribute(varr, 2))
  mesh.frustumCulled = false
  mesh.castShadow = false
  return { geometry, material, mesh }
}

export function Wildflowers({ uniforms, tier }: { uniforms: WorldUniforms; tier: Tier }) {
  const species = useMemo(() => {
    const rnd = mulberry32(0x2f7c31)
    const high = tier !== 'low'
    const list: Species[] = []

    const add = (
      geometry: THREE.BufferGeometry,
      material: THREE.ShaderMaterial,
      places: Place[],
      scale: [number, number],
    ) => {
      if (places.length === 0) {
        geometry.dispose()
        material.dispose()
        return
      }
      list.push(instance(geometry, material, places, scale))
    }

    // Oxeye daisy — the white drifts the eye reads first from the bank
    add(
      buildDaisy(),
      createPlantMaterial({ uniforms, swayAmount: 0.4 }),
      drift(rnd, high ? 30 : 13, [...FAR_BANK, ...NEAR_MEADOW, ...BANKS, { x: [9, 26], z: [-8, 13], weight: 2 }, { x: [-26, -9], z: [-8, 13], weight: 2 }], 2.6, dryLand),
      [0.85, 1.2],
    )

    // Meadow buttercup — tight, glossy colonies in the long grass
    add(
      buildButtercup(),
      createPlantMaterial({ uniforms, gloss: 0.85, swayAmount: 0.38 }),
      drift(rnd, high ? 24 : 11, [...FAR_BANK, ...NEAR_MEADOW, { x: [8, 24], z: [-6, 14], weight: 1.5 }, { x: [-24, -8], z: [-6, 14], weight: 1.5 }], 2.0, dryLand),
      [0.8, 1.15],
    )

    // Wild lavender — the grey-violet mass on the banks either side
    add(
      buildLavender(),
      createPlantMaterial({ uniforms, swayAmount: 0.3, translucency: 0.15 }),
      scatter(rnd, high ? 80 : 36, BANKS, dryLand, { sightline: 3 }).map((s) => toPlace(s, rnd)),
      [0.85, 1.25],
    )

    // White clover — ground cover right where the far shore meets the grass
    add(
      buildClover(),
      createPlantMaterial({ uniforms, swayAmount: 0.22, translucency: 0.2 }),
      scatter(rnd, high ? 60 : 26, [{ x: [-46, 46], z: [-34, -26], weight: 2 }, ...NEAR_MEADOW], dryLand).map((s) =>
        toPlace(s, rnd),
      ),
      [0.8, 1.15],
    )

    // Blue flag iris — the wetland marker along the water's edge
    add(
      buildIris(),
      createPlantMaterial({ uniforms, swayAmount: 0.32, translucency: 0.3 }),
      alongContour(rnd, high ? 110 : 48, LAKE_MARGIN, [0.18, 1.8], shoreLand).map((s) => toPlace(s, rnd)),
      [0.85, 1.15],
    )

    // Cattails — vertical rhythm right at the margin, half in the water.
    // A handful are pinned in front of the lens so the waterline has a
    // foreground edge instead of a bare cut across the frame.
    const cattailSpots = alongContour(rnd, high ? 150 : 60, LAKE_MARGIN, [-0.6, 0.55], marshLand)
    for (const [fx, fz] of FOREGROUND_REEDS) {
      const y = sampleTerrain(fx, fz)
      if (y < LAKE_LEVEL - 0.8) continue
      cattailSpots.push({ x: fx, z: fz, y })
    }
    add(
      buildCattail(),
      createPlantMaterial({ uniforms, swayAmount: 0.26, translucency: 0.24 }),
      cattailSpots.map((s) => toPlace(s, rnd)),
      [0.95, 1.35],
    )

    // Lady fern — the near-camera repoussoir on the woodland floor
    add(
      buildFern(),
      createPlantMaterial({ uniforms, swayAmount: 0.24, translucency: 0.45 }),
      scatter(rnd, high ? 44 : 20, WOODLAND, forestFloor, { sightline: 2 }).map((s) => toPlace(s, rnd)),
      [0.85, 1.35],
    )

    return list
  }, [tier, uniforms])

  useEffect(
    () => () => {
      for (const s of species) {
        s.geometry.dispose()
        s.material.dispose()
        s.mesh.dispose()
      }
    },
    [species],
  )

  return (
    <>
      {species.map((s, i) => (
        <primitive key={i} object={s.mesh} />
      ))}
    </>
  )
}
