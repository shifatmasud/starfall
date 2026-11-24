import * as THREE from 'three'

/**
 * The cursor trail — a 1:1 port of `surface-tension/src/gl/systems/ScreenPaint.ts`
 * (the handbook's ch.14 layer, itself decoded from the Lusion reference).
 *
 * The pointer becomes an 8-bit velocity + weight field that keeps moving and fading by itself:
 *   R,G  velocity x/y biased around 0.5 (rest = 0.5)      fade ×0.975 / frame
 *   B    weight 1 — the long tail                          fade ×0.95  / frame
 *   A    weight 2 — the short bright head                  fade ×0.8   / frame
 *
 * Four RGBA8 targets: prev/curr at 1/4 render size (ping-pong), low/lowBlur at 1/8 (the blurred
 * push field). Per frame: swap → paint (reads prev + last frame's blurred low) → copy curr→low →
 * blur(8) in place, then one 4-tap B-spline pass reconstructs a 2× display field, which the
 * composite smears and silvers (`PostFX.tsx`).
 *
 * The noise, the capsule brush, the leaky brush velocity, the curl, the dissipations and the
 * exact clear are the reference's numbers, so the look matches it frame for frame.
 */

const FS_VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const PLAIN_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D u_tex;
layout(location = 0) out vec4 fragColor;
void main(){ fragColor = texture(u_tex, vUv); }
`

/* Gradient noise with an analytic derivative — the reference's field, verbatim. */
const PAINT_NOISE = /* glsl */ `
vec2 pn_hash(vec2 p){
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy) * 2.0 - 1.0;
}
vec3 noised(in vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u  = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  vec2 ga = pn_hash(i), gb = pn_hash(i + vec2(1.0, 0.0)), gc = pn_hash(i + vec2(0.0, 1.0)), gd = pn_hash(i + vec2(1.0, 1.0));
  float va = dot(ga, f), vb = dot(gb, f - vec2(1.0, 0.0)), vc = dot(gc, f - vec2(0.0, 1.0)), vd = dot(gd, f - vec2(1.0, 1.0));
  float v = va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * (va - vb - vc + vd);
  vec2 d = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd)
         + du * (u.yx * (va - vb - vc + vd) + vec2(vb, vc) - va);
  return vec3(v, d);
}
`

const PAINT_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D u_prevPaintTexture;
uniform sampler2D u_lowPaintTexture;
uniform vec2 u_paintTexelSize;
uniform vec4 u_drawFrom;   // x, y (paint px), radius (paint px), weight
uniform vec4 u_drawTo;
uniform vec2 u_vel;        // smoothed brush velocity (paint px per frame)
uniform float u_pushStrength;
uniform float u_curlScale;
uniform float u_curlStrength;
uniform vec3 u_dissipations;
layout(location = 0) out vec4 fragColor;

${PAINT_NOISE}

vec2 capsule(vec2 p, vec2 a, vec2 b){
  vec2 ap = p - a, ab = b - a;
  float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return vec2(length(ap - ab * t), t);
}

void main(){
  vec2 seg = capsule(gl_FragCoord.xy, u_drawFrom.xy, u_drawTo.xy);
  vec2 rw = mix(u_drawFrom.zw, u_drawTo.zw, seg.y);
  float brush = 1.0 - smoothstep(-0.01, rw.x, seg.x);

  // the push: read the blurred 1/8 copy, flip its velocity → sample upstream
  vec4 low = texture(u_lowPaintTexture, vUv);
  vec2 upstream = (0.5 - low.xy) * u_pushStrength;

  // gradient-noise derivative bends the advection so the wake curls
  vec3 n0 = noised(gl_FragCoord.xy * u_curlScale * (1.0 - low.xy));
  vec2 n1 = noised(gl_FragCoord.xy * u_curlScale * (2.0 - low.xy * (0.5 + n0.x) + n0.yz * 0.1)).yz;
  upstream += n1 * (low.z + low.w) * u_curlStrength;

  vec4 data = texture(u_prevPaintTexture, vUv + upstream * u_paintTexelSize);
  data.xy -= 0.5;

  vec4 change = (u_dissipations.xxyz - 1.0) * data;
  change += vec4(u_vel * brush, rw.yy * brush);
  // 8-bit floor: every weight step is at least ~1/255 so the trail always reaches exactly 0 or 1
  change.zw = sign(change.zw) * max(vec2(0.004), abs(change.zw));
  data += change;
  data.xy += 0.5;
  fragColor = clamp(data, 0.0, 1.0);
}
`

const FILL_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 fragColor;
void main(){ fragColor = vec4(0.5, 0.5, 0.0, 0.0); }
`

const BLUR_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D u_texture;
uniform vec2 u_delta;
layout(location = 0) out vec4 fragColor;
void main(){
  vec4 c = texture(u_texture, vUv) * 0.1633;
  vec2 d = u_delta;
  c += (texture(u_texture, vUv - d) + texture(u_texture, vUv + d)) * 0.1531;  d += u_delta;
  c += (texture(u_texture, vUv - d) + texture(u_texture, vUv + d)) * 0.12245; d += u_delta;
  c += (texture(u_texture, vUv - d) + texture(u_texture, vUv + d)) * 0.0918;  d += u_delta;
  c += (texture(u_texture, vUv - d) + texture(u_texture, vUv + d)) * 0.051;
  fragColor = c;
}
`

/** 4-tap cubic B-spline reconstruction into a 2× half-float display field. */
const DISP_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D u_tex;
uniform vec2 u_tx;
layout(location = 0) out vec4 fragColor;
void main(){
  vec2 p = vUv / u_tx - 0.5, f = fract(p); p -= f;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0, w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0, w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3, h0 = (w1 / g0 - 0.5 + p) * u_tx, h1 = (w3 / g1 + 1.5 + p) * u_tx;
  fragColor = g0.y * (g0.x * texture(u_tex, h0) + g1.x * texture(u_tex, vec2(h1.x, h0.y)))
            + g1.y * (g0.x * texture(u_tex, vec2(h0.x, h1.y)) + g1.x * texture(u_tex, h1));
}
`

const target = (w: number, h: number, float = false) =>
  new THREE.WebGLRenderTarget(w, h, {
    type: float ? THREE.HalfFloatType : THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  })

export class FluidTrail {
  readonly pushStrength = 25
  readonly velocityDissipation = 0.975
  readonly weight1Dissipation = 0.95
  readonly weight2Dissipation = 0.8
  readonly curlScale = 0.02
  readonly curlStrength = 3
  readonly accelerationDissipation = 0.8
  readonly radiusDistanceRange = 100
  maxRadius = 40

  /** pushed by the app each frame; `awake` counts frames since the last paint */
  awake = 0
  live = false

  private renderer: THREE.WebGLRenderer
  private prev: THREE.WebGLRenderTarget
  private curr: THREE.WebGLRenderTarget
  private low: THREE.WebGLRenderTarget
  private lowBlur: THREE.WebGLRenderTarget
  private disp: THREE.WebGLRenderTarget
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private quad: THREE.Mesh
  private paintMat: THREE.ShaderMaterial
  private fillMat: THREE.ShaderMaterial
  private blurMat: THREE.ShaderMaterial
  private dispMat: THREE.ShaderMaterial
  private copyMat: THREE.ShaderMaterial

  private from = new THREE.Vector4()
  private to = new THREE.Vector4()
  private vel = new THREE.Vector2()
  private pending = new THREE.Vector2()
  private prevPx = new THREE.Vector2(-1, -1)
  private px = new THREE.Vector2(-1, -1)
  private moved = false
  private started = false
  private width = 1
  private height = 1

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer
    this.prev = target(1, 1)
    this.curr = target(1, 1)
    this.low = target(1, 1)
    this.lowBlur = target(1, 1)
    this.disp = target(2, 2, true)

    this.paintMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FS_VERT,
      fragmentShader: PAINT_FRAG,
      uniforms: {
        u_prevPaintTexture: { value: null },
        u_lowPaintTexture: { value: null },
        u_paintTexelSize: { value: new THREE.Vector2() },
        u_drawFrom: { value: this.from },
        u_drawTo: { value: this.to },
        u_vel: { value: this.vel },
        u_pushStrength: { value: 25 },
        u_curlScale: { value: 0.02 },
        u_curlStrength: { value: 3 },
        u_dissipations: { value: new THREE.Vector3() },
      },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    })
    this.fillMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FS_VERT,
      fragmentShader: FILL_FRAG,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    })
    this.blurMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FS_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: { u_texture: { value: null }, u_delta: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    })
    this.dispMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FS_VERT,
      fragmentShader: DISP_FRAG,
      uniforms: { u_tex: { value: null }, u_tx: { value: new THREE.Vector2(1, 1) } },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    })
    this.copyMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FS_VERT,
      fragmentShader: PLAIN_FRAG,
      uniforms: { u_tex: { value: null } },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    })

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.fillMat)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
    this.resize(window.innerWidth, window.innerHeight)
  }

  get texture(): THREE.Texture {
    return this.disp.texture
  }

  /** the display field's texel size (the composite reads this field) */
  get texelSize(): THREE.Vector2 {
    return new THREE.Vector2(1 / Math.max(1, this.disp.width), 1 / Math.max(1, this.disp.height))
  }

  private draw(material: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget) {
    const gl = this.renderer
    const previous = gl.getRenderTarget()
    this.quad.material = material
    gl.setRenderTarget(to)
    gl.render(this.scene, this.camera)
    gl.setRenderTarget(previous)
  }

  resize(cssWidth: number, cssHeight: number) {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1) || 1
    let w = cssWidth * dpr
    let h = cssHeight * dpr
    const MAX = 2560 * 1440
    if (w * h > MAX) {
      const a = w / h
      h = Math.sqrt(MAX / a)
      w = Math.ceil(h * a)
      h = Math.ceil(h)
    }
    const pw = Math.max(1, Math.floor(w) >> 2)
    const ph = Math.max(1, Math.floor(h) >> 2)
    const lw = Math.max(1, Math.floor(w) >> 3)
    const lh = Math.max(1, Math.floor(h) >> 3)
    this.width = cssWidth
    this.height = cssHeight
    this.maxRadius = Math.max(40, cssWidth / 20)
    if (pw === this.curr.width && ph === this.curr.height) return

    const old = this.curr
    const had = old.width > 1
    this.prev = target(pw, ph)
    this.curr = target(pw, ph)
    this.low = target(lw, lh)
    this.lowBlur = target(lw, lh)
    this.disp.setSize(pw * 2, ph * 2)
    for (const t of [this.prev, this.curr, this.low, this.lowBlur]) this.draw(this.fillMat, t)
    this.paintMat.uniforms.u_paintTexelSize.value.set(1 / pw, 1 / ph)
    if (had) {
      // a resize never wipes the trail: the old field is resampled in
      this.copyMat.uniforms.u_tex.value = old.texture
      this.draw(this.copyMat, this.curr)
      this.draw(this.copyMat, this.prev)
    }
    if (old.width > 1) old.dispose()
    this.refine()
  }

  private blurInPlace(radius: number) {
    const u = this.blurMat.uniforms
    const k = 0.25
    u.u_texture.value = this.low.texture
    u.u_delta.value.set((radius / this.low.width) * k, 0)
    this.draw(this.blurMat, this.lowBlur)
    u.u_texture.value = this.lowBlur.texture
    u.u_delta.value.set(0, (radius / this.low.height) * k)
    this.draw(this.blurMat, this.low)
  }

  private refine() {
    this.dispMat.uniforms.u_tex.value = this.curr.texture
    this.dispMat.uniforms.u_tx.value.set(1 / this.curr.width, 1 / this.curr.height)
    this.draw(this.dispMat, this.disp)
  }

  /** The pointer in CSS pixels (clientX/clientY); call whenever it moves. */
  pointer(x: number, y: number) {
    this.pending.set(x, y)
    this.moved = true
  }

  /** The hand left: the next touch starts a fresh stroke. */
  release() {
    this.px.set(-1, -1)
    this.prevPx.set(-1, -1)
    this.started = false
  }

  clear() {
    for (const t of [this.prev, this.curr, this.low, this.lowBlur]) this.draw(this.fillMat, t)
    this.refine()
    this.vel.set(0, 0)
    this.px.set(-1, -1)
    this.prevPx.set(-1, -1)
    this.started = false
    this.live = false
    this.awake = 0
  }

  /** One frame of the reference's update(), in full. */
  update(dt: number) {
    const u = this.paintMat.uniforms
    const pw = this.curr.width
    const ph = this.curr.height

    // 1) ping-pong first
    const swap = this.prev
    this.prev = this.curr
    this.curr = swap
    u.u_prevPaintTexture.value = this.prev.texture

    // 2) pointer → paint px
    const wasMoved = this.moved
    this.moved = false
    if (wasMoved) {
      this.prevPx.copy(this.px)
      this.px.copy(this.pending)
    }

    // 3) radius from speed: fit(distance, 0..100, 0..maxRadius)
    let radius = 0
    if (this.px.x >= 0) {
      const d = Math.hypot(this.px.x - this.prevPx.x, this.px.y - this.prevPx.y)
      radius = (this.maxRadius * Math.min(1, d / this.radiusDistanceRange))
    }
    if (!wasMoved) radius = 0
    radius = (radius / this.height) * ph

    // 4) the brush is a segment, in paint px, y up
    this.from.copy(this.to)
    const mx = (this.px.x / this.width) * 2 - 1
    const my = 1 - (this.px.y / this.height) * 2
    this.to.set(((mx + 1) * pw) / 2, ((my + 1) * ph) / 2, radius, 1)
    if (!this.started) {
      this.from.copy(this.to)
      this.started = true
    }

    // 5) leaky-integrated brush velocity + live tuning → uniforms
    const step = new THREE.Vector2(this.to.x - this.from.x, this.to.y - this.from.y).multiplyScalar(dt * 0.8)
    this.vel.multiplyScalar(this.accelerationDissipation).add(step)
    const f = Math.min(3, Math.max(0.2, dt * 60))
    u.u_pushStrength.value = this.pushStrength
    u.u_curlScale.value = this.curlScale
    u.u_curlStrength.value = this.curlStrength
    u.u_dissipations.value.set(
      Math.pow(this.velocityDissipation, f),
      Math.pow(this.weight1Dissipation, f),
      Math.pow(this.weight2Dissipation, f),
    )

    // 6) three GPU calls: paint → copy to low → blur(8) in place
    u.u_lowPaintTexture.value = this.low.texture
    this.draw(this.paintMat, this.curr)
    this.copyMat.uniforms.u_tex.value = this.curr.texture
    this.draw(this.copyMat, this.low)
    this.blurInPlace(8)
    this.refine()

    this.awake = radius > 0 ? 0 : this.awake + 1
    this.live = this.awake < 90 && (radius > 0 || this.awake < 90)
  }

  dispose() {
    for (const t of [this.prev, this.curr, this.low, this.lowBlur, this.disp]) t.dispose()
    this.paintMat.dispose()
    this.fillMat.dispose()
    this.blurMat.dispose()
    this.dispMat.dispose()
    this.copyMat.dispose()
  }
}
