import * as THREE from 'three'

/**
 * WaterTrailFBO — the interactive layer of the lake.
 *
 * Reused algorithm, not reinvented: `surface-tension/src/gl/systems/RippleSim.ts`
 * (REUSE_AUDIT §2.4). A ping-pong half-float heightfield, `R = height`,
 * `G = velocity`, integrated on a **fixed 60 Hz clock** (at most three catch-up
 * ticks a frame, so a phone at 20 fps and a laptop at 60 see the same rings),
 * with a swept capsule written along the pointer path each tick — a continuous
 * wake, never a row of beads. The wave-speed coupling `k` is divided by four
 * each time the resolution halves, so a ring travels the same distance in
 * metres on every tier; the trailing surface is the same size on a phone.
 *
 * What ORB-Journey adds on top:
 *  - the field is anchored to **world space** (a fixed square of the lake),
 *    not to the cursor in viewport space: a ring stays where it was made while
 *    the camera cranes over it, which is what a lake does;
 *  - `splash()` for the orb: a landing digs a crater (negative amount) that
 *    rebounds into a ring train, and a floating orb feeds tiny bob impulses —
 *    the same displacement trick shade-verse uses for a swimming body, minus
 *    the body;
 *  - `slope()` is exported as GLSL so the surface, the kelp and the bed all
 *    read the *same* normals (the house rule: one value, one owner).
 */

export type WaterTrailOptions = {
  /** centre of the square of lake the field covers, world x/z */
  center?: [number, number]
  /** edge length of that square in metres */
  extent?: number
  /** sim resolution; 256 on a phone tier, 512 otherwise */
  resolution?: number
  /** 0..1 scale for prefers-reduced-motion */
  strength?: number
}

const TICK = 1 / 60
const MAX_CATCHUP = 3
const IDLE_TICKS = 8 * 60

/** GLSL side of the field: `uTrail`, `uTrailBox` and the sampler contract. */
export const TRAIL_GLSL = /* glsl */ `
uniform sampler2D uTrail;
uniform vec4 uTrailBox;      // xy = centre (world x/z), z = extent (m), w = texel (m)
uniform float uTrailGain;

vec2 trailUV(vec2 xz) { return (xz - uTrailBox.xy) / uTrailBox.z + 0.5; }
/* the field is zero outside its square (and eased to zero inside the border, so
   a wave never reflects off an edge the eye cannot see) */
float trailMask(vec2 uv) {
  vec2 q = min(uv, 1.0 - uv);
  return smoothstep(0.0, 0.055, min(q.x, q.y));
}
float trailHeight(vec2 xz) {
  vec2 uv = trailUV(xz);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(uTrail, uv).r * trailMask(uv);
}
/* Slope in metres per metre, reconstructed by the sim itself: the field stores its own gradient in
   B (d/dx) and A (d/dz), so the surface reads a *continuous* gradient instead of differencing a
   bilinear height (which is what printed the texel steps). */
vec2 trailSlope(vec2 xz) {
  vec2 uv = trailUV(xz);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec2(0.0);
  float m = trailMask(uv);
  if (m <= 0.0) return vec2(0.0);
  vec2 g = texture(uTrail, uv).ba;
  return vec2(g.x, g.y) * m * uTrailGain;
}
`

const SIM_VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/**
 * One 60 Hz step, verbatim in structure from RippleSim — plus the exact-clear
 * trap from surface-tension's ScreenPaint (REUSE_AUDIT §2.3(a)) avoided by
 * writing the field explicitly instead of clearing a premultiplied additively
 * blended target.
 */
const SIM_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;

uniform sampler2D u_prev;
uniform vec2 u_texel;
uniform vec4 u_from;             // xy uv, z radius (uv), w strength
uniform vec4 u_to;               // xy uv, z radius (uv), w strength
uniform vec4 u_drops[4];         // xy uv, z radius (uv), w amount
uniform float u_damping;
uniform float u_k;
uniform float u_hdecay;
uniform float u_worldTexel;

layout(location = 0) out vec4 fragColor;

vec2 capsule(vec2 p, vec2 a, vec2 b) {
  vec2 ap = p - a, ab = b - a;
  float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
  return vec2(length(ap - ab * t), t);
}

void main() {
  vec4 c = texture(u_prev, vUv);
  float h = c.r, v = c.g;
  float n = texture(u_prev, vUv + vec2(0.0, u_texel.y)).r;
  float s = texture(u_prev, vUv - vec2(0.0, u_texel.y)).r;
  float e = texture(u_prev, vUv + vec2(u_texel.x, 0.0)).r;
  float w = texture(u_prev, vUv - vec2(u_texel.x, 0.0)).r;
  float ne = texture(u_prev, vUv + vec2(u_texel.x, u_texel.y)).r;
  float nw = texture(u_prev, vUv + vec2(-u_texel.x, u_texel.y)).r;
  float se = texture(u_prev, vUv + vec2(u_texel.x, -u_texel.y)).r;
  float sw = texture(u_prev, vUv + vec2(-u_texel.x, -u_texel.y)).r;

  // isotropic 9-point Laplacian: a 5-point stencil sends waves faster along the axes than the
  // diagonals, which is exactly what turned a ring into an octagon
  float lap = (4.0 * (n + s + e + w) + (ne + nw + se + sw) - 20.0 * h) / 6.0;
  v += lap * u_k;
  v *= u_damping;
  h += v;
  h *= u_hdecay;
  h = clamp(h, -0.22, 0.22);

  // pointer stroke: swept capsule from last tick's point to this one
  vec2 cap = capsule(vUv, u_from.xy, u_to.xy);
  float r = mix(u_from.z, u_to.z, cap.y);
  if (r > 0.0) {
    float k = 1.0 - smoothstep(0.0, r, cap.x);
    h -= k * k * (3.0 - 2.0 * k) * mix(u_from.w, u_to.w, cap.y);
  }
  // impacts (orb landing, splash, bob): a soft gaussian, negative digs a crater
  for (int i = 0; i < 4; i++) {
    vec4 d = u_drops[i];
    if (d.w != 0.0) { float dd = length(vUv - d.xy) / max(d.z, 1e-4); h -= d.w * exp(-dd * dd * 3.0); }
  }
  // sponge border: waves die before the edge, nothing reflects back
  float sb = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float edge = smoothstep(0.0, 0.05, sb);

  // the field carries its own gradient (metres of height per metre of water), written once here
  float dx = (e - w) / (2.0 * u_worldTexel);
  float dz = (n - s) / (2.0 * u_worldTexel);
  fragColor = vec4(h * edge, v * edge, dx * edge, dz * edge);
}
`

type Drop = { u: number; v: number; r: number; amount: number }

export class WaterTrailFBO {
  readonly resolution: number
  readonly extent: number
  readonly center: THREE.Vector2
  readonly box: THREE.Vector4
  /** slope multiplier read by every material's `trailSlope()` */
  readonly gain = 1.15

  private renderer: THREE.WebGLRenderer
  private targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  private current = 0
  private simScene = new THREE.Scene()
  private simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private material: THREE.ShaderMaterial
  private quad: THREE.Mesh
  private accumulator = 0
  private idle = 0
  private lastU = -1
  private lastV = -1
  private lastRadius = 0
  private pendingFrom: Drop | null = null
  private drops: Drop[] = []
  private strength: number
  private halfFloat: boolean
  /** ticks actually run, for the `?debug` overlay / QA */
  ticks = 0
  lastStroke = 0

  constructor(renderer: THREE.WebGLRenderer, options: WaterTrailOptions = {}) {
    this.renderer = renderer
    this.extent = options.extent ?? 64
    this.center = new THREE.Vector2(options.center?.[0] ?? 0, options.center?.[1] ?? 0)
    this.strength = options.strength ?? 1

    const gl = renderer.getContext() as WebGL2RenderingContext
    // Rendering *into* a float target is an extension in WebGL2; without it the
    // field has nowhere to live, so fall back to 8-bit and keep the trail subtle
    // rather than black-screen the beat.
    this.halfFloat = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float')
    this.resolution = options.resolution ?? (this.halfFloat ? 256 : 128)

    const makeTarget = () =>
      new THREE.WebGLRenderTarget(this.resolution, this.resolution, {
        type: this.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      })
    this.targets = [makeTarget(), makeTarget()]

    this.box = new THREE.Vector4(this.center.x, this.center.y, this.extent, this.extent / this.resolution)

    // equal world wave speed at any resolution: k scales with (dx)^2 (RippleSim)
    // the 9-point Laplacian is ~3.3x the 5-point one at a unit impulse: keep the same wave speed
    const k = Math.pow(1 / (this.resolution / 512), 2) * 0.32
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SIM_VERT,
      fragmentShader: SIM_FRAG,
      uniforms: {
        u_prev: { value: null },
        u_texel: { value: new THREE.Vector2(1 / this.resolution, 1 / this.resolution) },
        u_from: { value: new THREE.Vector4() },
        u_to: { value: new THREE.Vector4() },
        u_drops: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
        u_damping: { value: 0.988 },
        u_k: { value: k },
        u_hdecay: { value: 0.995 },
        u_worldTexel: { value: this.extent / this.resolution },
      },
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.quad.frustumCulled = false
    this.simScene.add(this.quad)
    this.clear()
  }

  get texture(): THREE.Texture {
    return this.targets[this.current].texture
  }

  /** world x/z -> field uv */
  toUv(x: number, z: number, out = new THREE.Vector2()): THREE.Vector2 {
    return out.set((x - this.center.x) / this.extent + 0.5, (z - this.center.y) / this.extent + 0.5)
  }

  inside(x: number, z: number): boolean {
    const u = (x - this.center.x) / this.extent + 0.5
    const v = (z - this.center.y) / this.extent + 0.5
    return u > 0.015 && u < 0.985 && v > 0.015 && v < 0.985
  }

  /** A pointer stroke, in world space; radius in metres, depth in metres. */
  stroke(x: number, z: number, radiusM = 0.35, amount = 0.012) {
    if (!this.inside(x, z)) {
      this.lastU = -1
      return
    }
    const uv = this.toUv(x, z)
    const r = Math.max(radiusM / this.extent, 0.004)
    const a = amount * this.strength
    if (this.lastU < 0) {
      // a hand landing on the water starts a ring of its own
      this.pendingFrom = null
      this.strokeTo = null
      this.drops.push({ u: uv.x, v: uv.y, r: r * 1.6, amount: a * 2.4 })
    } else {
      // a moving hand leaves a swept wake (one capsule per 60 Hz tick)
      this.pendingFrom = { u: this.lastU, v: this.lastV, r: this.lastRadius, amount: this.lastStroke }
      this.strokeTo = { u: uv.x, v: uv.y, r, amount: a }
    }
    this.lastU = uv.x
    this.lastV = uv.y
    this.lastRadius = r
    this.lastStroke = a
    this.idle = 0
  }

  private strokeTo: Drop | null = null

  /** Lift the pointer: the next stroke starts a fresh ring, not a long line. */
  release() {
    this.lastU = -1
    this.strokeTo = null
    this.pendingFrom = null
  }

  /** A single impact in world space. Negative `amount` digs, positive jets. */
  splash(x: number, z: number, radiusM = 0.5, amount = -0.06) {
    if (!this.inside(x, z)) return
    const uv = this.toUv(x, z)
    this.drops.push({ u: uv.x, v: uv.y, r: Math.max(radiusM / this.extent, 0.006), amount: amount * this.strength })
    this.idle = 0
  }

  clear() {
    const previous = this.renderer.getRenderTarget()
    for (const target of this.targets) {
      this.renderer.setRenderTarget(target)
      this.renderer.setClearColor(0x000000, 1)
      this.renderer.clear(true, false, false)
    }
    this.renderer.setRenderTarget(previous)
    this.renderer.setClearColor(0x000000, 0)
    this.idle = IDLE_TICKS
    this.lastU = -1
  }

  private tick() {
    const u = this.material.uniforms
    const previous = this.targets[this.current]
    const next = this.targets[this.current ^ 1]
    this.current ^= 1

    u.u_prev.value = previous.texture

    const from = this.pendingFrom
    const to = this.strokeTo
    if (from && to) {
      u.u_from.value.set(from.u, from.v, from.r, from.amount)
      u.u_to.value.set(to.u, to.v, to.r, to.amount)
    } else {
      u.u_from.value.set(0, 0, 0, 0)
      u.u_to.value.set(0, 0, 0, 0)
    }
    this.pendingFrom = null
    this.strokeTo = null

    for (let i = 0; i < 4; i++) {
      const d = this.drops[i]
      const vec = u.u_drops.value[i] as THREE.Vector4
      if (d) vec.set(d.u, d.v, d.r, d.amount)
      else vec.set(0, 0, 1, 0)
    }
    this.drops.splice(0, 4)

    const renderer = this.renderer
    const target = renderer.getRenderTarget()
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.setRenderTarget(next)
    renderer.render(this.simScene, this.simCamera)
    renderer.setRenderTarget(target)
    renderer.autoClear = autoClear
    this.ticks++
  }

  /**
   * Advance the field. Call once per frame with the frame delta; returns true
   * when the field changed this frame (so callers can skip the water's extra
   * samples when it is asleep).
   */
  update(dt: number): boolean {
    const busy = this.drops.length > 0 || this.strokeTo !== null
    if (busy) this.idle = 0
    else if (this.idle >= IDLE_TICKS) return false // asleep: zero passes until the next touch

    this.accumulator = Math.min(this.accumulator + Math.min(dt, 0.1), TICK * (MAX_CATCHUP + 1))
    const steps = Math.min(MAX_CATCHUP, Math.floor(this.accumulator / TICK + 1e-4))
    if (steps <= 0) {
      this.idle += 1
      return false
    }
    for (let i = 0; i < steps; i++) {
      this.accumulator -= TICK
      this.tick()
    }
    this.idle = busy ? 0 : this.idle + steps
    return true
  }

  dispose() {
    this.targets.forEach((target) => target.dispose())
    this.material.dispose()
    this.quad.geometry.dispose()
  }
}
