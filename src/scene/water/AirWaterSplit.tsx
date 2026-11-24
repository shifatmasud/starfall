import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { CAUSTICS_GLSL, UW_GLSL, createCausticUniforms, createMediumUniforms, type CausticUniforms } from './caustics'
import { WL_GLSL, WL_N, createWaterlineUniforms, type Lake, type WaterlineUniforms } from './LakeWater'

/**
 * AirWaterSplit — the seam.
 *
 * The solver is `shade-verse/src/water/waterline.ts` (REUSE_AUDIT §4.3), kept
 * contract-for-contract: the line *is* the top edge of the water as the lens
 * sees it, solved per screen column against the exact surface the mesh draws
 * (same Gerstner trains, same horizontal push, inverted by fixed-point
 * iteration). 25 columns, a depth ladder from 1.2 m out to the far crests,
 * every column re-solved every frame — the one thing that must not be
 * optimised is the half-frame column cache, because last frame's NDC heights
 * belong to last frame's camera and a pan makes the spline swim (their
 * measurement: 0.021 NDC mean error).
 *
 * The line is drawn by two screen-space passes, because ORB-Journey has no
 * post-processing chain (the lake lives inside another stream's Canvas):
 *
 *  1. **absorption** — a multiply pass: below the line the frame loses the
 *     water's absorbed colour `exp(-abs·path)` and a fixed 1.2 stops, above it
 *     nothing. The mask is `fwidth`-wide in NDC, so at any resolution the edge
 *     is at least one pixel and never flickers.
 *  2. **additive** — the meniscus band itself: a bright white-cyan core on the
 *     line with a faint glow above and a darker compressed band below (the
 *     dome-port look in `REFERENCES.md` §17), plus the god-rays (shade-verse's
 *     `uwRays`: march the view ray in metres, ask the caustic field where the
 *     sunlight came through, window both ends so no band prints).
 *
 * Both passes cut on the same `wlY()` the lake clips with, so the tint can
 * never drift off the cut.
 */

const NEAR = 1.2
const FAR = 120
const WL_EPS = 0.02 // the line sits 2 cm above the analytic surface

/** depths: 6 inside 6 m (mesh-exact), then every 20 % out to FAR */
const DEPTHS: number[] = (() => {
  const out: number[] = []
  for (let d = NEAR; d < FAR; d *= d < 6 ? 1.35 : 1.2) out.push(d)
  out.push(FAR)
  return out
})()

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Meniscus ripple in metres at a world point (the mesh carries no sub-metre waves). */
function meniscus(x: number, z: number, t: number, amp: number) {
  return (
    amp *
    (0.02 * Math.sin(x * 5.1 + z * 3.6 + t * 1.3) +
      0.01 * Math.sin(x * 9.8 - z * 6.2 - t * 2.1) +
      0.004 * Math.sin(x * 12.0 + z * 8.0 + t * 3.7))
  )
}

export class WaterlineSolver {
  readonly uniforms: WaterlineUniforms
  private lake: Lake
  private column = new Float32Array(WL_N).fill(-3)

  constructor(lake: Lake, waterline: WaterlineUniforms = createWaterlineUniforms()) {
    this.lake = lake
    this.uniforms = waterline
  }

  /** 0 = air, 1 = split, 2 = under */
  get mode(): 0 | 1 | 2 {
    return this.uniforms.uUnder.value > 0.5 ? 2 : this.uniforms.uWL.value.w > 0.5 ? 1 : 0
  }

  update(camera: THREE.PerspectiveCamera, time: number) {
    const { level, splitOut } = this.lake.config
    const dy = camera.position.y - level

    // under: ease in over the first 12 cm so the Snell window opens instead of snapping
    const under = 1 - smooth(-0.12, 0.0, Math.max(dy, -0.12))
    this.uniforms.uUnder.value = dy < 0 ? Math.max(under, 0.0) : 0

    const split = dy >= 0 && dy < splitOut
    const wl = this.uniforms.uWL.value
    wl.w = split ? 1 : 0
    wl.x = time
    if (!split) return

    const cam = camera.position
    // reach shrinks to the lens plane as the camera rises over the surface, so
    // the line slides off the bottom of the frame instead of popping
    const reach = FAR * Math.pow(NEAR / FAR, smooth(0.18 * splitOut, splitOut, dy))
    const rAmp = 1 - 0.8 * smooth(0.0, 0.45 * splitOut, dy)
    wl.y = reach
    wl.z = rAmp

    // basis (shade-verse updateWaterline)
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
    const ty = Math.tan((camera.fov * Math.PI) / 360)
    const tx = ty * camera.aspect

    // depth ladder cut at this frame's reach
    let count = 0
    while (count < DEPTHS.length && DEPTHS[count] <= reach * 1.0001) count++

    for (let k = 0; k < WL_N; k++) {
      const nx = -1 + (k * 2) / (WL_N - 1)
      const fx = forward.x + nx * tx * right.x
      const fy = forward.y + nx * tx * right.y
      const fz = forward.z + nx * tx * right.z
      let best = -3
      let ny = 0
      for (let j = 0; j < count; j++) {
        const d = DEPTHS[j]
        const uy = d * ty * up.y
        if (Math.abs(uy) < 1e-5) continue
        // two warm-started iterations: the point at view depth d under ndc
        // (nx, ny) must sit on the surface, solved for ny
        for (let it = 0; it < 2; it++) {
          const px = cam.x + d * (fx + ny * ty * up.x)
          const pz = cam.z + d * (fz + ny * ty * up.z)
          const h = this.lake.surfaceAt(px, pz, time) + WL_EPS + meniscus(px, pz, time, rAmp)
          ny = Math.max(-3, Math.min(3, (h - cam.y - d * fy) / uy))
        }
        if (ny > best) best = ny
      }
      this.column[k] = best
    }

    // pack 25 columns into 7 vec4 (28 slots; the tail keeps its last value)
    const q = this.uniforms.uWLq.value
    for (let k = 0; k < WL_N; k++) {
      const v = q[k >> 2]
      const c = k & 3
      if (c === 0) v.x = this.column[k]
      else if (c === 1) v.y = this.column[k]
      else if (c === 2) v.z = this.column[k]
      else v.w = this.column[k]
    }
  }
}

/* ------------------------------------------------------------------------ *
 * Screen-space passes
 * ------------------------------------------------------------------------ */

const QUAD_VERT = /* glsl */ `
out vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const SHARED = /* glsl */ `
in vec2 vNdc;
uniform vec2 uRes;         // drawing buffer size in pixels (the seam is measured in px)
uniform vec3 uCamPos;
uniform float uTime;
uniform float uUnder;      // 1 while the lens is under (eased over the last 12 cm)

layout(location = 0) out vec4 fragColor;

${CAUSTICS_GLSL}
${UW_GLSL}
${WL_GLSL}

float pxNdc() { return 2.0 / max(uRes.y, 1.0); }
`

const SEAM_FRAG = /* glsl */ `
precision highp float;
${SHARED}
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform vec2 uTanHalf;      // x = tan(fov/2) * aspect, y = tan(fov/2)

/* The view ray straight from the camera basis. No matrix inversion: at the far
   plane a perspective unprojection divides by a homogeneous w of 0, and one inf
   in a pass like this poisons the blend. */
vec3 rayDir() {
  return normalize(uCamFwd + vNdc.x * uTanHalf.x * uCamRight + vNdc.y * uTanHalf.y * uCamUp);
}

/* shade-verse uwRays: march the view ray in metres and ask how much sun reaches
   each sample through the moving surface (causticFocus). Windows at both ends so
   a hard first or last sample cannot print a straight band. */
vec3 uwRays(vec3 ro, vec3 rd, float L, float jit) {
  vec3 sun = normalize(uSunDir);
  vec3 r = refract(-sun, vec3(0.0, 1.0, 0.0), 0.7502);
  if (rd.y > 0.001) L = min(L, (uLevel - ro.y) / rd.y);
  L = clamp(L, 0.0, 26.0);
  float dt = L / 6.0, acc = 0.0;
  for (int i = 0; i < 6; i++) {
    float f0 = (float(i) + jit) / 6.0;
    vec3 p = ro + rd * ((float(i) + jit) * dt);
    float dp = uLevel - p.y;
    float win = smoothstep(0.0, 0.18, f0) * (1.0 - smoothstep(0.82, 1.0, f0));
    if (dp > 0.0) {
      vec3 s = p - r * (dp / max(-r.y, 0.05));
      acc += causticFocus(s.xz) * exp(-dp * 0.055 - length(p - ro) * 0.028) * smoothstep(0.0, 1.2, dp) * win;
    }
  }
  acc *= 1.3;
  float ph = 0.5 + 0.8 * pow(max(dot(rd, -r), 0.0), 5.0);
  return vec3(0.62, 0.93, 1.0) * acc * dt * ph * 0.05 * uUwBeam;
}

void main() {
  float px = pxNdc();
  float splitOn = uWL.w > 0.5 ? 1.0 : 0.0;
  float wd = vNdc.y - (splitOn > 0.5 ? wlY(vNdc.x) : 1e4);
  float splitMask = splitOn * (1.0 - smoothstep(-px, px, wd));
  float underMask = smoothstep(0.15, 0.85, uUnder);
  float mask = max(splitMask, underMask) * uSplitMerge;

  /* The seam only ever *adds* light: the meniscus and the shafts. The tint of
     the underwater half is not applied here because the lake surface renders
     its own medium (Beer-Lambert refraction in LakeWater) — multiplying the
     half again would cancel the very reflection that makes a split shot read,
     and this pass can then never darken a frame by accident. */
  vec3 col = vec3(0.0);
  if (mask > 0.01) {
    vec3 rd = rayDir();
    // two decorrelated gradients: the march offset must not print as hatching
    float jit = 0.5 * (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))
                     + fract(52.9829189 * fract(dot(gl_FragCoord.xy + vec2(17.0, 31.0), vec2(0.06711056, 0.00583715)))));
    col += uwRays(uCamPos, rd, 14.0, jit) * mask;
  }
  if (splitOn > 0.5) {
    // the meniscus: a bright core on the line with a faint glow just above it
    // (the white band of a dome-port split, REFERENCES §17)
    float core = exp(-pow(wd / (3.2 * px), 2.0));
    float glow = exp(-pow((wd - 5.5 * px) / (4.0 * px), 2.0)) * 0.35;
    col += vec3(0.90, 0.98, 1.0) * (core * 0.65 + glow) * uSplitMerge * (0.35 + 0.65 * underMask);
  }

  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  fragColor = vec4(clamp(col, 0.0, 4.0), 1.0);
}
`

export type SplitOverlay = {
  mesh: THREE.Mesh
  uniforms: Record<string, THREE.IUniform>
  update: (camera: THREE.PerspectiveCamera, time: number) => void
  dispose: () => void
}

export function createSplitOverlay(
  lake: Lake,
  waterline: WaterlineUniforms,
  caustics: CausticUniforms = createCausticUniforms(),
): SplitOverlay {
  const quad = new THREE.PlaneGeometry(2, 2)
  const uniforms: Record<string, THREE.IUniform> = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uCamPos: { value: new THREE.Vector3() },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
    uTanHalf: { value: new THREE.Vector2(0.36, 0.36) },
    uTime: { value: 0 },
    ...createMediumUniforms(lake.config.level),
    uCaus: caustics.uCaus,
    uCausTint: caustics.uCausTint,
    uCausTex: caustics.uCausTex,
    uWL: waterline.uWL,
    uWLq: waterline.uWLq,
    uSplitMerge: waterline.uSplitMerge,
    uUnder: waterline.uUnder,
  }

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: QUAD_VERT,
    fragmentShader: SEAM_FRAG,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const mesh = new THREE.Mesh(quad, material)
  mesh.name = 'AirWaterSeam'
  mesh.frustumCulled = false
  mesh.renderOrder = 900
  mesh.visible = false

  const update = (camera: THREE.PerspectiveCamera, time: number) => {
    camera.updateMatrixWorld()
    ;(uniforms.uCamPos.value as THREE.Vector3).copy(camera.position)
    const e = camera.matrixWorld.elements
    ;(uniforms.uCamRight.value as THREE.Vector3).set(e[0], e[1], e[2]).normalize()
    ;(uniforms.uCamUp.value as THREE.Vector3).set(e[4], e[5], e[6]).normalize()
    ;(uniforms.uCamFwd.value as THREE.Vector3).set(-e[8], -e[9], -e[10]).normalize()
    const th = Math.tan((camera.fov * Math.PI) / 360)
    ;(uniforms.uTanHalf.value as THREE.Vector2).set(th * camera.aspect, th)
    uniforms.uTime.value = time

    const mode = waterline.uUnder.value > 0.5 ? 2 : waterline.uWL.value.w > 0.5 ? 1 : 0
    waterline.uSplitMerge.value = mode === 0 ? 0 : 1
    mesh.visible = mode !== 0
  }

  const dispose = () => {
    quad.dispose()
    material.dispose()
  }

  return { mesh, uniforms, update, dispose }
}

export type AirWaterSplitProps = {
  lake: Lake
  solver: WaterlineSolver
  caustics?: CausticUniforms
  sunDir?: THREE.Vector3
}

export function AirWaterSplit({ lake, solver, caustics, sunDir }: AirWaterSplitProps) {
  const camera = useThree((state) => state.camera as THREE.PerspectiveCamera)
  const size = useThree((state) => state.size)
  const overlay = useMemo(() => createSplitOverlay(lake, solver.uniforms, caustics), [lake, solver, caustics])
  useEffect(() => {
    if (!sunDir) return
    ;(overlay.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir).normalize()
  }, [overlay, sunDir])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    solver.update(camera, t)
    overlay.update(camera, t)
    ;(overlay.uniforms.uRes.value as THREE.Vector2).set(
      size.width * state.viewport.dpr,
      size.height * state.viewport.dpr,
    )
  })

  return <primitive object={overlay.mesh} />
}
