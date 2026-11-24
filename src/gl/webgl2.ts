/**
 * ORB-Journey renders on WebGL2 only.
 *
 * The context is created explicitly as `webgl2` (never `webgl`, never
 * WebGPU/TSL), so a missing WebGL2 implementation fails loudly instead of
 * silently falling back to WebGL1 or a Node/WebGPU path that CI's SwiftShader
 * Chromium cannot run.
 *
 * Shaders in this project are authored in GLSL ES 3.00 and must start with
 * `#version 300 es` (see `GLSL3`), with `in`/`out` instead of
 * `attribute`/`varying` and `texture()` instead of `texture2D()`.
 */

export const GLSL3 = '#version 300 es' as const

export type WebGL2ContextOptions = {
  antialias?: boolean
  alpha?: boolean
  powerPreference?: WebGLPowerPreference
}

/** Creates the single WebGL2 context the whole scene draws into. */
export function createWebGL2Context(
  canvas: HTMLCanvasElement,
  options: WebGL2ContextOptions = {},
): WebGL2RenderingContext {
  const context = canvas.getContext('webgl2', {
    alpha: options.alpha ?? false,
    antialias: options.antialias ?? true,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: options.powerPreference ?? 'high-performance',
    // Software rasterizers (CI's SwiftShader) are a "major performance caveat";
    // requiring a fast GPU here would refuse to start in visual QA.
    failIfMajorPerformanceCaveat: false,
  }) as WebGL2RenderingContext | null

  if (!context) {
    throw new Error('ORB-Journey requires WebGL2, but this browser/GPU could not provide a webgl2 context.')
  }
  return context
}

export type RendererInfo = {
  webgl2: boolean
  version: string
  shadingLanguageVersion: string
  vendor: string
  renderer: string
}

/** Snapshot of the live GL implementation, surfaced for visual-QA logs. */
export function describeRenderer(renderer: {
  capabilities: { isWebGL2: boolean }
  getContext: () => WebGLRenderingContext
}): RendererInfo {
  const gl = renderer.getContext()
  const read = (name: number) => {
    const value = gl.getParameter(name)
    return typeof value === 'string' ? value : String(value ?? '')
  }
  return {
    webgl2: renderer.capabilities.isWebGL2,
    version: read(gl.VERSION),
    shadingLanguageVersion: read(gl.SHADING_LANGUAGE_VERSION),
    vendor: read(gl.VENDOR),
    renderer: read(gl.RENDERER),
  }
}
