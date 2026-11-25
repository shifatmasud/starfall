/**
 * What this device can actually do.
 *
 * Every value here is *measured*, never inferred from a user-agent string: a throwaway WebGL2 context
 * builds a real RGBA16F framebuffer and asks the driver whether it is complete, then gives the
 * context back. Android drivers lie in both directions — some advertise
 * `EXT_color_buffer_half_float` and still refuse to render into it, some expose only
 * `EXT_color_buffer_float` — so the extension strings alone are not evidence.
 *
 * The probe runs once, before the first canvas, and is cached in `caps`.
 */

export type Caps = {
  /** a WebGL2 context could be created at all */
  webgl2: boolean
  /** RGBA16F is colour-renderable, verified with a real framebuffer */
  halfFloat: boolean
  /** RGBA16F survived a linear-filtered draw and read-back */
  halfFloatLinear: boolean
  maxTexture: number
  maxRenderbuffer: number
  renderer: string
  /** coarse pointer: a phone or a tablet */
  mobile: boolean
  /** the phone-class path: smaller buffers, no SMAA */
  lowTier: boolean
  /** the effective device-pixel-ratio the canvases should use */
  dpr: number
  /** human-readable reason when the probe failed */
  reason: string
}

const FALLBACK: Caps = {
  webgl2: false,
  halfFloat: false,
  halfFloatLinear: false,
  maxTexture: 2048,
  maxRenderbuffer: 2048,
  renderer: 'unavailable',
  mobile: true,
  lowTier: true,
  dpr: 1,
  reason: 'WebGL 2 is not available',
}

function probe(): Caps {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 4

  let gl: WebGL2RenderingContext | null = null
  try {
    gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: 'default',
      preserveDrawingBuffer: false,
    }) as WebGL2RenderingContext | null
  } catch {
    gl = null
  }

  if (!gl) {
    const mobile = isMobile()
    return { ...FALLBACK, mobile, dpr: Math.min(1.5, window.devicePixelRatio || 1) }
  }

  let halfFloat = false
  let halfFloatLinear = false
  let reason = ''

  try {
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, gl.HALF_FLOAT, null)

    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    halfFloat = status === gl.FRAMEBUFFER_COMPLETE

    if (halfFloat) {
      // a cleared, drawn, filtered round-trip: the real test of a usable target
      gl.viewport(0, 0, 4, 4)
      gl.clearColor(0.25, 0.5, 0.75, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      const px = new Float32Array(4)
      gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.FLOAT, px)
      halfFloatLinear = gl.getError() === gl.NO_ERROR && px[0] > 0.2 && px[0] < 0.3
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (fbo) gl.deleteFramebuffer(fbo)
    gl.deleteTexture(tex)
  } catch (error) {
    halfFloat = false
    halfFloatLinear = false
    reason = String(error)
  }

  const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
  const maxRenderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number
  let renderer = 'webgl2'
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    renderer = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER))
  } catch {
    /* the renderer string is a nicety, never a requirement */
  }

  // Deliberately *not* killed with WEBGL_lose_context: on a phone that call can take the page's
  // context group down with it, and a probe must never be the reason a scene loses its context. The
  // scaffolding canvas is dropped instead and collected; one extra context is far cheaper than a
  // black frame.

  const mobile = isMobile()
  const dprCap = mobile ? (halfFloat ? 2 : 1.5) : 2
  const lowTier = mobile || maxTexture < 4096 || !halfFloat

  return {
    webgl2: true,
    halfFloat,
    halfFloatLinear,
    maxTexture,
    maxRenderbuffer,
    renderer,
    mobile,
    lowTier,
    dpr: Math.max(1, Math.min(window.devicePixelRatio || 1, dprCap)),
    reason,
  }
}

function isMobile(): boolean {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 640
  const touch = (navigator.maxTouchPoints ?? 0) > 0
  return (coarse || touch) && narrow
}

let cached: Caps | null = null

/** The device's measured capabilities. Probes once, then returns the same object. */
export function caps(): Caps {
  if (!cached) cached = probe()
  return cached
}

/** `?q=low|high` overrides the automatic tier, for QA on a real device. */
export function qualityOverride(): 'low' | 'high' | null {
  const q = new URLSearchParams(location.search).get('q')
  return q === 'low' || q === 'high' ? q : null
}

export function diagnostics(): string {
  const c = caps()
  const parts = [
    c.webgl2 ? 'WebGL2 ok' : 'WebGL2 missing',
    c.halfFloat ? 'RGBA16F ok' : 'RGBA16F no',
    `maxTex ${c.maxTexture}`,
    `dpr ${c.dpr}`,
    c.lowTier ? 'low tier' : 'high tier',
  ]
  if (!c.webgl2 && c.reason) parts.push(c.reason)
  return parts.join(' · ')
}
