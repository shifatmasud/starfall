/**
 * Measured / physical optical constants used by the water, ice, cloud, sky and foliage shaders.
 * All spectral quantities are given at three representative wavelengths (R 650 nm, G 550 nm, B 450 nm).
 * Values are tabulated figures from the cited sources, rounded to the precision the sources give;
 * where a source gives a range, the mid value is used and noted.
 */

/** Index of refraction of sea/fresh water at 589 nm, 20 °C (Hale & Querry 1973; Daimon & Masumura 2007: 1.333). */
export const IOR_WATER = 1.333
export const IOR_AIR = 1.0003
/** Normal-incidence Fresnel reflectance F0 = ((n1-n2)/(n1+n2))^2 = 0.0200 for air→water. */
export const F0_WATER = Math.pow((IOR_WATER - IOR_AIR) / (IOR_WATER + IOR_AIR), 2)
/** Index of refraction of ice Ih (Warren & Brandt 2008): 1.31. */
export const IOR_ICE = 1.31

export type RGB = [number, number, number]

/**
 * Absorption coefficient of pure water, 1/m. Pope & Fry (1997, Appl. Opt. 36, 8710), 650/550/450 nm:
 * 0.340 / 0.0638 / 0.0092 (Smith & Baker 1981 give 0.35 / 0.064 / 0.0092 — agree within 3 %).
 */
export const A_WATER: RGB = [0.34, 0.0638, 0.0092]
/** Scattering coefficient of pure water, 1/m (Morel 1974: b ≈ 0.0058 (λ/400nm)^-4.32 → 650/550/450 nm). */
export const B_WATER: RGB = [0.0011, 0.0019, 0.0035]

/**
 * Jerlov water types by chlorophyll-a concentration (mg/m³) — Morel & Maritorena (2001, JGR 106, 7163)
 * bio-optical model: particulate scattering b_p(550) = 0.30·Chl^0.62 (Morel 1988), backscatter ratio
 * ≈ 0.012 (Mie, marine particles), phytoplankton absorption a_ph(λ) = A(λ)·Chl^0.65 with
 * A(440)=0.04, A(550)=0.0087, A(650)=0.0085 m⁻¹ (Bricaud et al. 1998 mean spectra).
 * Chl ≈ 0.03 Jerlov I (clearest ocean), ≈ 0.3 Jerlov II/III, ≈ 3 coastal 1–5 (Jerlov 1976).
 */
export const JERLOV = { I: 0.03, II: 0.1, III: 0.3, C1: 1.0, C3: 3.0 } as const
const A_PH: RGB = [0.0085, 0.0087, 0.04]
export function waterIOPs(chl: number) {
  const bp550 = 0.3 * Math.pow(chl, 0.62)
  const bpS: RGB = [Math.pow(550 / 650, 1), 1, Math.pow(550 / 450, 1)]
  const a: RGB = [0, 1, 2].map((i) => A_WATER[i] + A_PH[i] * Math.pow(chl, 0.65)) as RGB
  const b: RGB = [0, 1, 2].map((i) => B_WATER[i] + bp550 * bpS[i]) as RGB
  const bb: RGB = [0, 1, 2].map((i) => 0.5 * B_WATER[i] + 0.012 * bp550 * bpS[i]) as RGB
  return { a, b, bb }
}
/** Diffuse attenuation Kd ≈ a + b_b·(≈ 1/cosθ_sun-refracted ≈ 1.2) → light left at depth z: exp(-Kd z). */
export function kd(chl: number): RGB {
  const { a, bb } = waterIOPs(chl)
  return [0, 1, 2].map((i) => (a[i] + 1.2 * bb[i]) * 1.2) as RGB
}
/** Subsurface irradiance reflectance R = 0.33·b_b/a (Gordon et al. 1975), capped with the b_b/(a+b_b) form. */
export function rrs(chl: number): RGB {
  const { a, bb } = waterIOPs(chl)
  return [0, 1, 2].map((i) => 0.33 * (bb[i] / (a[i] + bb[i]))) as RGB
}

/** Cox & Munk (1954) mean-square slope of a wind-roughened sea: σ² = 0.003 + 0.00512·U (U in m/s at 12.5 m). */
export const coxMunkMss = (U: number) => 0.003 + 0.00512 * U

/** JONSWAP spectrum (Hasselmann et al. 1973): fetch-limited α and ω_p, γ = 3.3, σ = 0.07/0.09. */
export const G = 9.81
export function jonswap(U: number, fetch: number) {
  const alpha = 0.076 * Math.pow((G * fetch) / (U * U), -0.22)
  const wp = 22 * Math.pow((G * G) / (U * fetch), 1 / 3)
  const S = (w: number) => {
    const sigma = w <= wp ? 0.07 : 0.09
    const r = Math.exp(-Math.pow(w - wp, 2) / (2 * sigma * sigma * wp * wp))
    return alpha * G * G * Math.pow(w, -5) * Math.exp(-1.25 * Math.pow(wp / w, 4)) * Math.pow(3.3, r)
  }
  return { alpha, wp, S }
}
/** N plane waves sampled from the JONSWAP spectrum: a_i = sqrt(2 S(ω_i) Δω_i), k = ω²/g (deep-water dispersion). */
export function waveSet(U: number, fetch: number, n: number, windDeg = 0, spreadDeg = 80) {
  const { wp, S } = jonswap(U, fetch)
  const w0 = 0.7 * wp
  const w1 = 6 * wp
  const out: { k: number; w: number; a: number; dx: number; dz: number; ph: number }[] = []
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < n; i++) {
    const wa = w0 * Math.pow(w1 / w0, i / n)
    const wb = w0 * Math.pow(w1 / w0, (i + 1) / n)
    const w = Math.sqrt(wa * wb)
    const a = Math.sqrt(2 * S(w) * (wb - wa))
    // cos²-type directional spreading (Mitsuyasu): sample angles within ±spread
    const th = ((windDeg + (rnd() * 2 - 1) * spreadDeg * Math.pow(rnd(), 0.5)) * Math.PI) / 180
    out.push({ k: (w * w) / G, w, a, dx: Math.cos(th), dz: Math.sin(th), ph: rnd() * 6.2831853 })
  }
  return out
}

/** Sky scattering at sea level (Bruneton & Neyret 2008; Nishita 1993): Rayleigh β_R 1/m for 680/550/440 nm, Mie β = 21e-6, g = 0.76. */
export const BETA_RAYLEIGH: RGB = [5.8e-6, 13.5e-6, 33.1e-6]
export const BETA_MIE = 21e-6
export const MIE_G_AEROSOL = 0.76
export const H_RAYLEIGH = 8000
export const H_MIE = 1200

/**
 * Cumulus cloud droplets. Extinction σ = 3·LWC/(2·ρ_w·r_eff): LWC 0.3 g/m³, r_eff 10 µm → 0.045 1/m
 * (Rogers & Yau 1989; Hess et al. 1998 OPAC "cumulus continental": LWC 0.1–0.5 g/m³). Single-scattering albedo
 * ≈ 0.99999 in the visible (Bohren & Huffman 1983). Mie asymmetry g ≈ 0.85 for droplets (Hess 1998), with a weak
 * back lobe −0.3 for the dual-lobe Henyey-Greenstein phase (Hillaire 2015 / Wrenninge 2013 multiple-scattering octaves).
 */
export const CLOUD = { sigmaE: 0.045, albedo: 0.99999, g: 0.85, gBack: -0.3, lobeMix: 0.8 }

/**
 * Ice (glacier / iceberg). Absorption of pure ice Ih at 650/550/450 nm (Warren & Brandt 2008, JGR 113, D14220):
 * ≈ 0.11 / 0.0035 / 0.0004 1/m for the visible-band minima; bubbly glacier ice scattering coefficient 1–5 1/m
 * (Bohren & Barkstrom 1974; Dadic et al. 2013) — 2.0 used with g ≈ 0.89. Red is absorbed first, so thick ice is blue.
 */
export const A_ICE: RGB = [0.11, 0.0035, 0.0004]
export const B_ICE = 2.0

/**
 * Green-leaf spectral transmittance for foliage SSS (Gates et al. 1965; Jacquemoud & Baret 1990 PROSPECT,
 * mean broadleaf, N≈1.6, chl 40 µg/cm²): ≈ 0.04 (650nm) / 0.13 (550nm) / 0.03 (450nm).
 */
export const LEAF_TRANSMITTANCE: RGB = [0.04, 0.13, 0.03]
