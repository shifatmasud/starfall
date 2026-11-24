/**
 * Device tier + DPR ceiling — the same decision `shade-device-lab` and
 * `surface-tension/src/services/settings.ts` make, cut down to what this scene uses.
 *
 * `pickTier` reads the real GPU string once (a throwaway WebGL2 context released with
 * `WEBGL_lose_context`), then `capDpr` holds the drawing buffer inside both a tier cap and a
 * total-pixel budget — an ultrawide at dpr 1.5 costs 2–4× the fill of a laptop for the same picture.
 *
 * `?q=low|high` forces a tier for QA, `?q=mid` pins the middle one.
 */

const query = new URLSearchParams(location.search)

export type Tier = 'high' | 'mid' | 'low'

function probeRenderer(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null
    if (!gl) return 'none'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : gl.getParameter(gl.RENDERER)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return String(name ?? '')
  } catch {
    return ''
  }
}

export const GPU = probeRenderer()

const coarse = matchMedia('(pointer: coarse)').matches
const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
const lowPower = /Mali-4|Adreno \(TM\) [2-4]\d\d|PowerVR|SwiftShader|llvmpipe/i.test(GPU)
const weakIntel = /Intel/i.test(GPU) && /(UHD|HD) Graphics (6\d\d|5\d\d|[2-5]\d\d)\b/i.test(GPU)
const fewCores = (navigator.hardwareConcurrency || 8) <= 4

function pickTier(): Tier {
  const forced = query.get('q')
  if (forced === 'low' || forced === 'high' || forced === 'mid') return forced
  if (mobile || (innerWidth <= 812 && coarse)) return 'low'
  if (lowPower) return 'low'
  if (weakIntel && fewCores) return 'low'
  return (navigator.hardwareConcurrency || 4) >= 8 ? 'high' : 'mid'
}

export const TIER: Tier = pickTier()
export const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches

/** Total render pixels are capped, not just the ratio (surface-tension §2.5). */
const MAX_RENDER_PIXELS = 3.7e6

export function capDpr(width = innerWidth, height = innerHeight): number {
  // the phone canvas holds the shade-device-lab budget (≤ ~330 k px): 412×915 at 1.0 is 377 k,
  // which is the closest integer step; anything above that costs fill with no visible gain at 6":  
  const tierCap = TIER === 'low' ? 1.0 : 1.2
  const byPixels = Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, width * height))
  return Math.max(0.6, Math.min(window.devicePixelRatio || 1, tierCap, byPixels))
}

/** Sample counts and loop counts follow the tier — geometry never does. */
export const cloudLobes = TIER === 'low' ? 96 : 132
export const rainCount = TIER === 'low' ? 320 : 560
export const snowCount = TIER === 'low' ? 220 : 380
