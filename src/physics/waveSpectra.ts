import { G } from './optics'

/**
 * Real measured wave spectra, used to drive the water shader.
 *
 * No synthetic spectrum here: every frequency, every band amplitude and every band direction below
 * was measured by a US National Data Buoy Center (NOAA NDBC) waverider buoy and published by NDBC
 * as open, public-domain data. NDBC separates the wave record into 47 frequency bands and publishes,
 * for each 30-minute record:
 *
 *   swden  spectral wave density S(f) in m²/Hz  → band amplitude a_i = sqrt(2·S_i·Δf_i)
 *   swdir  mean wave direction per band (alpha1, degrees true, the direction the waves come FROM)
 *
 * Files (station wYEAR.txt.gz under https://www.ndbc.noaa.gov/data/historical/swden/ and .../swdir/):
 *
 *   lake  45007  Lake Michigan, 42.67 N 87.03 W, 2025-11-21 00:40 UTC
 *         S(f) and alpha1: https://www.ndbc.noaa.gov/data/historical/swden/45007w2025.txt.gz
 *                          https://www.ndbc.noaa.gov/data/historical/swdir/45007d2025.txt.gz
 *         a fresh 4 s lake wind sea, Hs = 0.69 m — the ripple field of a small inland lake
 *   pool  45007  same buoy, 2025-07-13 16:40 UTC — a near-calm evening, Hs = 0.18 m, Tp 3.1 s
 *   sea   46035  Bering Sea, 57.0 N 177.7 W, 2025-09-28 13:10 UTC — Hs = 3.99 m, Tp 10 s, a wind sea
 *         with the swell still in it (band directions swing from 50° to 198°, the real bimodality)
 *
 * The shader works on a miniature set (a lake a few hundred metres across, a pool a few metres), so
 * the *frequency axis* of each measured spectrum is transposed by one scale factor per scene: the
 * whole spectrum is stretched until its measured peak wavelength lands on the scene's ripple scale
 * (`peakWave`). Relative frequencies, relative band energies, relative band directions and the width
 * of the distribution are kept exactly as measured. Amplitude is then set to the scene's own
 * significant wave height (`hs`). The notes at each use site record the factor.
 *
 * Directional spreading inside a band: the buoy publishes one mean direction per band, so each band
 * is split into three components spread across the band's own width by the Mitsuyasu (1975)
 * cos^2s(Δθ/2) spreading law, s = 11.5·(f/fp)^-2.5 above the peak and 11.5·(f/fp)^5 below it — the
 * standard relation for a wind-sea spectrum of this shape. Variance is preserved in the split
 * (weights 0.25 / 0.5 / 0.25), and each component gets a ±3.5 % frequency jitter so no two
 * components can lock into a common period. Phases are not published by a buoy; they are drawn from
 * a fixed hash per component, which is what makes the sum non-repeating rather than a corrugation.
 */

export type Band = [f: number, a: number, dir: number]

export type MeasuredSpectrum = {
  id: 'lake' | 'pool' | 'sea'
  station: string
  place: string
  /** UTC time of the record */
  time: string
  /** measured significant wave height, m */
  hs: number
  bands: Band[]
}

export const NDBC_LAKE: MeasuredSpectrum = {
  id: 'lake',
  station: 'NDBC 45007',
  place: 'Lake Michigan (42.67 N 87.03 W)',
  time: '2025-11-21T00:40Z',
  hs: 0.685,
  bands: [
    [0.2, 0.0141, 213], [0.21, 0.02, 203], [0.22, 0.0374, 201], [0.23, 0.0529, 207],
    [0.24, 0.0787, 202], [0.25, 0.1149, 199], [0.26, 0.0872, 205], [0.27, 0.0583, 214],
    [0.28, 0.0721, 215], [0.29, 0.049, 236], [0.3, 0.0566, 217], [0.31, 0.0374, 205],
    [0.32, 0.0283, 234], [0.33, 0.0346, 221], [0.34, 0.0374, 223], [0.35, 0.0387, 214],
    [0.365, 0.0265, 214], [0.385, 0.0283, 226], [0.405, 0.04, 235], [0.425, 0.0346, 232],
    [0.445, 0.0283, 205], [0.465, 0.02, 216], [0.485, 0.0283, 228],
  ],
}

export const NDBC_POOL: MeasuredSpectrum = {
  id: 'pool',
  station: 'NDBC 45007',
  place: 'Lake Michigan (42.67 N 87.03 W)',
  time: '2025-07-13T16:40Z',
  hs: 0.184,
  bands: [
    [0.28, 0.0141, 294], [0.29, 0.0141, 276], [0.3, 0.0245, 284], [0.31, 0.02, 285],
    [0.32, 0.0316, 284], [0.33, 0.02, 287], [0.34, 0.0141, 296], [0.35, 0.0224, 290],
    [0.365, 0.0187, 293], [0.385, 0.02, 290],
  ],
}

export const NDBC_SEA: MeasuredSpectrum = {
  id: 'sea',
  station: 'NDBC 46035',
  place: 'Bering Sea (57.0 N 177.7 W)',
  time: '2025-09-28T13:10Z',
  hs: 3.988,
  bands: [
    [0.0625, 0.0265, 50], [0.0675, 0.0812, 178], [0.0725, 0.114, 197], [0.0775, 0.1217, 177],
    [0.0825, 0.1619, 137], [0.0875, 0.2631, 127], [0.0925, 0.3609, 127], [0.1, 0.8057, 132],
    [0.11, 0.5963, 143], [0.12, 0.394, 132], [0.13, 0.3447, 127], [0.14, 0.3586, 125],
    [0.15, 0.2186, 121], [0.16, 0.2131, 122], [0.17, 0.1619, 127], [0.18, 0.1562, 144],
    [0.19, 0.1944, 123], [0.2, 0.18, 109], [0.21, 0.1442, 138], [0.22, 0.1319, 102],
    [0.23, 0.0849, 120], [0.24, 0.1086, 127], [0.25, 0.099, 129], [0.26, 0.0583, 108],
    [0.27, 0.06, 108], [0.28, 0.0678, 151], [0.29, 0.0616, 131], [0.3, 0.0583, 115],
    [0.31, 0.0424, 138], [0.32, 0.0447, 124], [0.33, 0.04, 142], [0.34, 0.0346, 148],
    [0.35, 0.0418, 151], [0.365, 0.0592, 138], [0.385, 0.049, 160], [0.405, 0.04, 171],
    [0.425, 0.04, 184], [0.445, 0.0346, 149], [0.465, 0.0346, 198], [0.485, 0.02, 168],
  ],
}

export const SPECTRA = { lake: NDBC_LAKE, pool: NDBC_POOL, sea: NDBC_SEA } as const

export type WaveComponent = {
  /** wavenumber, 1/m */
  k: number
  /** angular frequency, rad/s (deep-water dispersion) */
  w: number
  /** amplitude, m */
  a: number
  /** unit direction the wave travels toward, in the water's xz plane */
  dx: number
  dz: number
  /** phase offset, rad */
  ph: number
}

export type WaveScale = {
  /** peak wavelength of the transposed spectrum, m */
  peakWave: number
  /** significant wave height in the scene, m (4·sigma of the surface) */
  hs: number
  /** scene bearing, degrees, that the spectrum's mean direction is turned to */
  bearing: number
  /** how far each band's energy is spread across its Mitsuyasu width (1 = the model's own spread) */
  spread?: number
  /** components per band (default 3) and how many bands carry the energy (default 10) */
  sub?: number
  bands?: number
  /** seed for the phase hashes */
  seed?: number
}

/** deterministic hash → 0..1 */
function hash(n: number) {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Build the shader's components from a measured spectrum.
 *
 * f_scene = f_measured · sqrt( (g / 2π·peakWave) / f_peak² )  — one scale factor, so the measured
 * band ratios, energies and directions survive intact; the peak wavelength is what moves.
 */
export function waveField(spec: MeasuredSpectrum, scale: WaveScale): WaveComponent[] {
  const fp = spec.bands.reduce((best, b) => (b[1] > best[1] ? b : best), spec.bands[0]!)[0]
  const fScene = Math.sqrt(G / (2 * Math.PI * scale.peakWave))
  const fs = fScene / fp
  const ampScale = scale.hs / spec.hs
  const sub = scale.sub ?? 3
  const nBands = scale.bands ?? 10
  const seed = scale.seed ?? 1
  // energy-dominant bands first, but keep the spectrum's own order for phase continuity
  const order = spec.bands.map((b, i) => ({ b, i })).sort((p, q) => q.b[1] - p.b[1])
  const keep = new Set(order.slice(0, nBands).map((o) => o.i))
  const meanDir = spec.bands.reduce((s, b) => s + b[2] * b[1], 0) / spec.bands.reduce((s, b) => s + b[1], 0)
  const out: WaveComponent[] = []
  let n = 0
  spec.bands.forEach((band, bi) => {
    if (!keep.has(bi)) return
    const [f, a, dir] = band
    const r = f / fp
    // Mitsuyasu (1975) spreading: s = 11.5·r^-2.5 above the peak, 11.5·r^5 below
    const s = 11.5 * Math.pow(r, r >= 1 ? -2.5 : 5)
    const sig = Math.sqrt(2 / (s + 2)) * (scale.spread ?? 1) // rad, std of cos^2s(Δθ/2)
    for (let j = 0; j < sub; j++) {
      const dth = (j - (sub - 1) / 2) * sig
      const wgt = j === (sub - 1) / 2 ? 0.5 : 0.25
      const fj = f * fs * (1 + (hash(seed + n * 3.7) - 0.5) * 0.07)
      const k = (2 * Math.PI * fj) * (2 * Math.PI * fj) / G // deep-water dispersion k = ω²/g
      const th = ((scale.bearing + (dir - meanDir)) * Math.PI) / 180 + dth
      out.push({
        k,
        w: Math.sqrt(G * k),
        a: a * ampScale * Math.sqrt(wgt),
        dx: Math.cos(th),
        dz: Math.sin(th),
        ph: hash(seed * 7.1 + n * 1.618) * Math.PI * 2,
      })
      n++
    }
  })
  // renormalise so the sum's standard deviation is exactly hs/4
  const varSum = out.reduce((acc, c) => acc + 0.5 * c.a * c.a, 0)
  const target = (scale.hs / 4) ** 2
  const g = varSum > 0 ? Math.sqrt(target / varSum) : 1
  out.forEach((c) => (c.a *= g))
  return out
}
