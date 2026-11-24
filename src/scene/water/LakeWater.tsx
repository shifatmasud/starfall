import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import {
  CAUSTICS_GLSL,
  UW_GLSL,
  createCausticUniforms,
  createMediumUniforms,
  type CausticUniforms,
} from './caustics'
import { TRAIL_GLSL, WaterTrailFBO } from './WaterTrailFBO'
import { journey } from '../atmosphere/atmosphereState'

/**
 * LakeWater — the surface of the lake.
 *
 * Three proven pieces, reused rather than re-derived:
 *  1. `shade-verse/src/water/oceanShader.ts` (REUSE_AUDIT §4.2): Gerstner waves
 *     are evaluated **per vertex** and handed to the fragment shader as a
 *     gradient + Jacobian. Their measurement is the reason: the per-pixel trig
 *     of 13 wave trains was ~95 % of the sea's cost on a phone. A calm lake
 *     needs four trains, but the discipline is the same — the fragment shader
 *     never runs a wave iteration.
 *  2. `shade-verse`'s exact unpolarised Fresnel (n = 1.333) and Beer-Lambert
 *     refraction: `td = refract(-v, n, 1/1.333)`, `path = depth / max(|td.y|,
 *     0.12)`, per-channel absorption so red dies first.
 *  3. `shade-verse`'s Snell window from below, with its two hard-won fixes kept
 *     verbatim: the critical-angle rim uses a **partly smoothed normal plus a
 *     `fwidth`-wide ramp** (one pixel of ripple slope otherwise arches into a
 *     stepped "dome" on an Adreno 506), and outside the window the underside is
 *     **opaque** (otherwise the unrefracted world ghosts through as flat
 *     shapes).
 *
 * The interactive part is `WaterTrailFBO` (surface-tension's ping-pong
 * heightfield): its slope is added to the analytic gradient, so a hover or a
 * touch-scrub bends the real reflection and refraction, not a decal.
 *
 * The waterline contract (`WL_GLSL`) lives here too because the lake surface is
 * the object the line is solved against; `AirWaterSplit` drives the solver.
 */

/* ------------------------------------------------------------------------ *
 * The waterline contract — one shared GLSL function for every material that
 * must agree on where air ends (shade-verse §4.3, reused exactly).
 * ------------------------------------------------------------------------ */

export const WL_N = 25

export const WL_GLSL = /* glsl */ `
uniform vec4 uWL;            // x = time, y = reach (m), z = meniscus amp, w = 1 while the lens straddles
uniform vec4 uWLq[7];        // 25 column heights in NDC y, packed
uniform float uSplitMerge;   // 0..1: how much of the cut is applied (eased by the split blend)

float wlAt(int i) {
  vec4 v = uWLq[i / 4];
  int c = i - (i / 4) * 4;
  return c == 0 ? v.x : (c == 1 ? v.y : (c == 2 ? v.z : v.w));
}
/* Catmull-Rom through the 25 solved columns (shade-verse lens.ts, unchanged).
   A cubic, not a straight lerp: a 25-column line drawn linearly shows its
   corners on a 1440 px frame. */
float wlY(float x) {
  float f = clamp(x * 12.0 + 12.0, 0.0, 23.999);
  int i = int(f);
  float t = f - float(i);
  float p0 = wlAt(max(i - 1, 0)), p1 = wlAt(i), p2 = wlAt(i + 1), p3 = wlAt(min(i + 2, 24));
  return p1 + 0.5 * t * (p2 - p0 + t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + t * (3.0 * (p1 - p2) + p3 - p0)));
}
/* Screen derivative of the line, so every ramp at the seam is at least one
   pixel wide however steeply it crosses (the brief's zero-flicker constraint). */
float wlWidth(float x) { return max(fwidth(x) * 12.0, 0.0008); }
`

export type WaterlineUniforms = {
  uWL: { value: THREE.Vector4 }
  uWLq: { value: THREE.Vector4[] }
  uSplitMerge: { value: number }
  uUnder: { value: number }
}

export function createWaterlineUniforms(): WaterlineUniforms {
  return {
    uWL: { value: new THREE.Vector4(0, 0, 0, 0) },
    uWLq: { value: Array.from({ length: 7 }, () => new THREE.Vector4()) },
    uSplitMerge: { value: 0 },
    uUnder: { value: 0 },
  }
}

/* ------------------------------------------------------------------------ *
 * The lake as data: one table drives the GPU and the CPU, so the waterline
 * solver can never disagree with the drawn surface (REUSE_AUDIT §4.3).
 * ------------------------------------------------------------------------ */

export type WaveTrain = { len: number; amp: number; dir: [number, number] }

/** Four calm lake trains: a 16 m swell down to 2.9 m ripples, amps in metres. */
const TRAINS: WaveTrain[] = [
  { len: 16.0, amp: 0.042, dir: [0.94, 0.34] },
  { len: 9.0, amp: 0.026, dir: [0.62, 0.78] },
  { len: 5.2, amp: 0.014, dir: [-0.35, 0.94] },
  { len: 2.9, amp: 0.0075, dir: [0.87, -0.49] },
]

/** Gerstner steepness share (sum of Q·k·A stays well under 1: no loops). */
export const GERSTNER_Q = 0.62

const GST = 9.81
const OMEGA = (len: number) => Math.sqrt((GST * 2 * Math.PI) / len) * 0.72 // slowed a touch: a lake, not open sea

type Wave = { k: number; amp: number; dir: THREE.Vector2; omega: number }

const WAVES: Wave[] = TRAINS.map((train) => {
  const dir = new THREE.Vector2(train.dir[0], train.dir[1]).normalize()
  return { k: (2 * Math.PI) / train.len, amp: train.amp, dir, omega: OMEGA(train.len) }
})

export type LakeConfig = {
  /** still-water height (world y) */
  level?: number
  /** lake centre on the ground plane */
  center?: [number, number]
  /** edge length of the drawn sheet in metres */
  size?: number
  /** vertex resolution of the sheet (kept modest: 150² ≈ 45 k triangles) */
  detail?: number
  /** world-y of the bottom. Defaults to a soft radial basin. */
  bedAt?: (x: number, z: number) => number
  /** deepest point of the default basin */
  depth?: number
  /** radius of the default basin */
  basinRadius?: number
  /** 0 = glass, 1 = the shipped calm swell */
  swell?: number
  /** edge length of the bed-depth texture's square (defaults to the sheet's size) */
  bedSize?: number
  /** camera height above the surface where the split view ends (m) */
  splitOut?: number
}

export type Lake = {
  config: Required<Omit<LakeConfig, 'bedAt'>> & { bedAt: (x: number, z: number) => number }
  /** surface height at an *undisplaced* world point */
  heightAt: (x: number, z: number, time: number) => number
  /** surface height accounting for the Gerstner push (the solver uses this) */
  surfaceAt: (x: number, z: number, time: number) => number
  /** vertical distance from the surface down to the bed (>= 0) */
  bedDepth: (x: number, z: number) => number
  /** camera height above the surface at which the split view is fully open */
  splitOut: number
}

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function createLake(config: LakeConfig = {}): Lake {
  const level = config.level ?? 0
  const center: [number, number] = config.center ?? [0, 0]
  const size = config.size ?? 180
  const detail = config.detail ?? 200
  const depth = config.depth ?? 7.5
  const basinRadius = config.basinRadius ?? 52
  const swell = config.swell ?? 1
  const splitOut = config.splitOut ?? 0.9
  const bedSize = config.bedSize ?? size
  const bedAt =
    config.bedAt ??
    ((x: number, z: number) => {
      // a soft bowl: deepest at the centre, rising to the bank at basinRadius
      const r = Math.hypot(x - center[0], z - center[1]) / basinRadius
      const bank = sm(0.10, 1.0, r)
      return level - (0.18 + depth * (1 - bank))
    })

  const heightAt = (x: number, z: number, time: number) => {
    let h = 0
    for (const w of WAVES) {
      const a = (x * w.dir.x + z * w.dir.y) * w.k + time * w.omega
      h += Math.sin(a) * w.amp * swell
    }
    return level + h
  }

  const surfaceAt = (x: number, z: number, time: number) => {
    // invert the horizontal Gerstner push by fixed-point iteration (shade-verse
    // waterline.ts does the same against its mesh): the drawn surface sits at
    // x = x0 - Σ Q·A·dir·cos, so the height *at* world (x, z) is h(x0).
    let px = x
    let pz = z
    for (let i = 0; i < 3; i++) {
      let dx = 0
      let dz = 0
      for (const w of WAVES) {
        const a = (px * w.dir.x + pz * w.dir.y) * w.k + time * w.omega
        const f = Math.cos(a) * w.amp * GERSTNER_Q * swell
        dx -= w.dir.x * f
        dz -= w.dir.y * f
      }
      px = x - dx
      pz = z - dz
    }
    return heightAt(px, pz, time)
  }

  return {
    config: { level, center, size, detail, depth, basinRadius, swell, splitOut, bedAt, bedSize },
    heightAt,
    surfaceAt,
    bedDepth: (x, z) => Math.max(0, level - bedAt(x, z)),
    splitOut,
  }
}

/** The same table as GLSL, generated once so CPU and GPU cannot drift. */
const WAVE_GLSL = /* glsl */ `
#define GQ ${GERSTNER_Q.toFixed(4)}
/* height + Gerstner push + gradient + Jacobian from one pass over the trains.
   *sp* is the local vertex spacing (m): a train shorter than ~2 cells is faded
   out (Nyquist), the same guard shade-verse uses so a coarse grid cannot make
   waves "swim" between frames. */
void waveField(vec2 p, float t, float sp, out float h, out vec2 d, out vec2 g, out float jac) {
  h = 0.0; d = vec2(0.0); g = vec2(0.0); jac = 0.0;
${WAVES.map((w) => {
  const k = w.k.toFixed(6)
  const dx = w.dir.x.toFixed(5)
  const dz = w.dir.y.toFixed(5)
  const amp = (w.amp * 1).toFixed(6)
  return `  { float k = ${k}; vec2 dir = vec2(${dx}, ${dz}); float a = dot(p, dir) * k + t * ${w.omega.toFixed(5)};
    float fade = smoothstep(0.9 * 3.14159265 / k, 0.45 * 3.14159265 / k, sp);
    float sa = sin(a), ca = cos(a);
    h += sa * ${amp} * fade; d -= dir * ca * ${amp} * GQ * fade;
    g += dir * ca * ${amp} * k; jac += sa * ${amp} * k * GQ; }`
}).join('\n')}
}
`

/* ------------------------------------------------------------------------ *
 * Shaders
 * ------------------------------------------------------------------------ */

const VERT = /* glsl */ `
uniform float uTime;
uniform float uSpacing;
uniform float uSwell;
uniform float uLevel;

out vec3 vWorld;
out vec2 vGrad;
out float vJac;
out float vWave;
out vec2 vNdc;

${WAVE_GLSL}

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float h; vec2 d; vec2 g; float jac;
  waveField(wp.xz, uTime, uSpacing, h, d, g, jac);
  h *= uSwell; d *= uSwell;
  wp.xz += d;
  wp.y += uLevel + h;
  vWorld = wp.xyz;
  vGrad = g * uSwell;
  vJac = jac * uSwell;
  vWave = h;
  vec4 clip = projectionMatrix * viewMatrix * wp;
  vNdc = clip.xy / max(clip.w, 1e-4);
  gl_Position = clip;
}
`

const FRAG = /* glsl */ `
precision highp float;
in vec3 vWorld;
in vec2 vGrad;
in float vJac;
in float vWave;
in vec2 vNdc;

uniform vec3 uCamPos;
uniform float uTime;

uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyZenith;
uniform vec3 uSunColor;
uniform vec3 uShoreColor;
uniform vec3 uFoamColor;

uniform vec4 uOrb;          // xyz = orb world position, w = glow strength
uniform vec3 uOrbColor;

uniform sampler2D uBedTex;
uniform vec4 uBedBox;       // xy = centre, z = extent, w = max depth (m)
uniform float uMicro;       // 1 = wind patches from the tile (0 on the low tier)
uniform float uDbg;         // QA only: 1 shows the water column depth, 2 the bed texture
uniform float uUnder;       // 1 while the lens is below the surface
uniform float uUnderBlend;  // 0..1 eased dive blend (Snell window opening)

layout(location = 0) out vec4 fragColor;

${CAUSTICS_GLSL}
${UW_GLSL}
${WL_GLSL}
${TRAIL_GLSL}

float bedDepthAt(vec2 xz) {
  vec2 uv = (xz - uBedBox.xy) / uBedBox.z + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return uBedBox.w;
  return texture(uBedTex, uv).r * uBedBox.w;
}

/* Sky the lake reflects: a horizon band, a zenith, and the shore silhouette
   that sits just above the waterline (REFERENCES §17: the line is sharper on
   the sunny side, and what you see across it at grazing angles is land, not
   sky). No sun disc anywhere (house rule), the gradient carries the light. */
vec3 skyColor(vec3 r) {
  float e = clamp(r.y, -1.0, 1.0);
  vec3 sky = mix(uSkyHorizon * 1.18, uSkyZenith, pow(clamp(e, 0.0, 1.0), 0.42));
  // the far bank darkens the reflected horizon, but as a *gradient*: a hard
  // band there turns every 1-degree ripple into a cellular net (the tile's own
  // edges), which is the one thing a calm lake must never look like
  return sky * mix(0.78, 1.0, smoothstep(-0.03, 0.13, e));
}

void main() {
  vec3 view = normalize(uCamPos - vWorld);
  /* Optional micro-structure (off by default): the caustic tile read blurred as
     a wind map. It is *cellular*, though, and a 1-degree ripple is enough to
     turn its cell edges into a net across a calm surface, so the lake relies on
     the Gerstner trains and the crest sheen instead. Kept as a knob for a
     choppier body of water; uMicro = 0 costs nothing and skips three fetches. */
  vec2 microUV = vWorld.xz * 0.05 + vec2(0.004, 0.0022) * uTime;
  const float MICRO_LOD = 3.0;      // a blurred mip: gentle patches, not the tile's hard lines
  float m0 = textureLod(uCausTex, microUV, MICRO_LOD).r;
  float mx = textureLod(uCausTex, microUV + vec2(0.02, 0.0), MICRO_LOD).r;
  float mz = textureLod(uCausTex, microUV + vec2(0.0, 0.02), MICRO_LOD).r;
  vec2 slope = vGrad * 1.2 + trailSlope(vWorld.xz) + vec2(mx - m0, mz - m0) * 0.03 * uMicro;
  vec3 n = normalize(vec3(-slope.x, 1.0 - vJac, -slope.y));

  /* ---- the split cut -------------------------------------------------- *
   * While the lens straddles the surface, the drawn sheet is clipped to the
   * solved line: above it there is no water in that reach (shade-verse §4.3).
   * The discard is on this fragment's own NDC, so the cut can never drift off
   * the tint that uses the same wlY(). */
  if (uWL.w > 0.5 && vNdc.y > wlY(vNdc.x)) discard;

  float lux = max(dot(n, normalize(uSunDir)), 0.0);
  float ci = clamp(dot(n, view), 0.0, 1.0);

  /* ---- from below: Snell's window ------------------------------------ */
  if (uUnder > 0.5) {
    vec3 dn = -n;                                  // normals point down toward the lens
    vec3 tr = refract(-view, dn, 1.3310);
    vec3 tg = refract(-view, dn, 1.3330);
    vec3 tb = refract(-view, dn, 1.3375);
    float ciC = clamp(dot(normalize(mix(vec3(0.0, -1.0, 0.0), dn, 0.55)), view), 0.0, 1.0);
    float s2c = 1.7778 * (1.0 - ciC * ciC);
    // fwidth-wide ramp on a partly smoothed normal: the fix for the "arched,
    // stepped dome" a 1-pixel ripple slope used to print on the rim (Nov 18)
    float wc = max(0.24, 3.0 * fwidth(s2c));
    float crit = smoothstep(0.87 - wc, 0.87 + wc, s2c);

    vec3 under = mix(uDeep * 0.72, uShallow, 0.30 + 0.44 * pow(max(dot(-dn, view), 0.0), 2.0));
    float shimmer = causticDapple(vWorld.xz);
    under *= 1.0 + (shimmer - 0.45) * 0.16 * uUnderBlend;

    vec3 win = vec3(skyColor(tr).r, skyColor(tg).g, skyColor(tb).b);
    // the shoreline ring seen up through the window: dark silhouette squeezed
    // toward the rim, exactly where total internal reflection takes over
    win = mix(uShoreColor * 1.05, win, smoothstep(0.02, 0.34, normalize(tg).y));
    win += uSunColor * (pow(max(dot(normalize(tg), normalize(uSunDir)), 0.0), 180.0) * 2.2
                      + pow(max(dot(normalize(tg), normalize(uSunDir)), 0.0), 10.0) * 0.16);

    vec3 col = mix(mix(win, under, 0.16 + 0.50 * smoothstep(0.55 - wc, 1.10 + wc, s2c)), under * 0.88, crit);
    // soft bright meniscus at the critical rim (the white rim in real split shots)
    col += vec3(0.82, 0.94, 1.0) * exp(-pow((s2c - 0.9) / 0.075, 2.0)) * 0.16;
    float a = mix(0.62, 0.94, crit);               // opaque outside: no ghosted world
    a = mix(a, 1.0, smoothstep(0.55, 0.95, uUnderBlend));
    fragColor = vec4(uwSrgb(uwMedium(col, 2.0 + 3.0 * uUnderBlend)), a);
    return;
  }

  /* ---- from above: reflection + beer-lambert body --------------------- */
  vec3 r = reflect(-view, n);
  vec3 refl = skyColor(r);
  // horizon glare: real water at a grazing angle is a bright silver sheet, and
  // a lake at dawn is exactly that under the far bank
  refl += uSkyHorizon * 0.16 * pow(1.0 - clamp(r.y, 0.0, 1.0), 6.0);
  // and a second, wider glare so the near half of a low view is silver too
  refl += uSkyHorizon * 0.05 * pow(1.0 - clamp(ci, 0.0, 1.0), 2.0);
  // the far shore's tree line: the band just above the waterline reflects land, not sky
  float treeBand = smoothstep(-0.01, 0.16, r.y);
  refl = mix(uShoreColor * 0.9, refl, treeBand);
  refl *= mix(0.66, 1.0, smoothstep(0.02, 0.26, r.y));
  float fres = 1.0;
  {
    // exact unpolarised Fresnel, n_air 1.0 / n_water 1.333 (not Schlick)
    float s2 = 1.0 - ci * ci;
    s2 *= 1.0 / 1.7778;
    if (s2 < 1.0) {
      float ct = sqrt(1.0 - s2);
      float rs = (1.0 * ci - 1.333 * ct) / (1.0 * ci + 1.333 * ct);
      float rp = (1.0 * ct - 1.333 * ci) / (1.0 * ct + 1.333 * ci);
      fres = 0.5 * (rs * rs + rp * rp);
    }
  }
  // sun glitter: Blinn-Phong on the wave normal, a low-sun "golden road"
  float sunSpec = pow(max(dot(r, normalize(uSunDir)), 0.0), 220.0) * 3.4
                + pow(max(dot(r, normalize(uSunDir)), 0.0), 16.0) * 0.07;
  refl += uSunColor * sunSpec;

  // the orb's own reflection: its mirror image in the surface, smeared by the
  // wave normals into a vertical streak (analytic — no probe render)
  vec3 mirrorOrb = vec3(uOrb.x, 2.0 * uLevel - uOrb.y, uOrb.z);
  vec3 toOrb = mirrorOrb - vWorld;
  float dOrb = length(toOrb);
  vec3 orbDir = toOrb / max(dOrb, 1e-4);
  float orbSpec = pow(max(dot(r, orbDir), 0.0), 140.0) * 1.5 + pow(max(dot(r, orbDir), 0.0), 12.0) * 0.14;
  refl += uOrbColor * orbSpec * uOrb.w;

  // refraction: the bed seen through the bent ray (shade-verse's fixed-point
  // march; two steps are enough at lake depths)
  vec3 td = refract(-view, n, 1.0 / 1.333);
  float sy = max(abs(td.y), 0.10);
  float surfaceDepth = max(uLevel - vWorld.y, 0.0);
  float d0 = max(bedDepthAt(vWorld.xz) - surfaceDepth, 0.0) / sy;
  float t1 = d0;
  vec2 h0 = vWorld.xz + td.xz * t1;
  t1 = max(uLevel - (uLevel - bedDepthAt(h0)) - surfaceDepth, 0.0) / sy;
  vec2 hx = vWorld.xz + td.xz * t1;
  float bedDepth = bedDepthAt(hx);
  float depth = max(surfaceDepth + bedDepth, 0.0);

  // bed: pale sand shallow, dark weed deep, with soft ripple marks
  float mott = texture(uCausTex, hx * 0.11).g * 0.6 + texture(uCausTex, hx * 0.031).b * 0.4;
  vec3 sand = vec3(0.62, 0.58, 0.46);
  vec3 weed = vec3(0.16, 0.22, 0.16);
  vec3 alb = mix(weed, sand, smoothstep(1.2, 6.5, bedDepth)) * (0.86 + 0.20 * mott);
  vec3 causC = causticsRGB(hx) * exp(-bedDepth * 0.5) * (0.55 + 0.45 * max(uSunDir.y, 0.0));
  vec3 bedL = alb * (0.55 + 0.55 * clamp(uSunDir.y, 0.0, 1.0)) + causC * 0.62;

  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 9.0, depth));
  vec3 seen = uwMedium(bedL, t1 + depth * 0.55);
  float bedA = 1.0 - smoothstep(0.9, 3.4, depth);   // only the shallow band shows the bed
  vec3 waterCol = mix(body, seen, bedA);

  // the orb's glow reaching into the water under it
  float dOrb2 = dot(uOrb.xz - vWorld.xz, uOrb.xz - vWorld.xz);
  waterCol += uOrbColor * exp(-dOrb2 * 0.045) * 0.22 * uOrb.w;

  /* Schlick on top of the exact unpolarised Fresnel: the physical term alone
     makes a low camera read the water as a dark sheet (it is 0.27 at 13 deg,
     and the eye expects a lake to be a mirror), so the artist's reflectance is
     the exact term pushed toward 1 at grazing. */
  float schlick = pow(1.0 - clamp(ci, 0.0, 1.0), 5.0);
  float fr = clamp(fres * 0.30 + schlick * 0.92 + 0.04, 0.0, 0.95);
  vec3 col = mix(waterCol, refl, fr);
  if (uDbg > 3.5 && uDbg < 4.5) { fragColor = vec4(uwSrgb(refl), 1.0); return; }
  if (uDbg > 4.5 && uDbg < 5.5) { fragColor = vec4(vec3(fr), 1.0); return; }
  if (uDbg > 5.5 && uDbg < 6.5) { fragColor = vec4(vec3(ci), 1.0); return; }

  // a soft sheen along the crests: the swell has to read even where the
  // reflection is weak (a 3 cm lake wave is only ~1 degree of slope)
  float crest = smoothstep(0.25, 0.95, vWave * 7.5);
  col += uSunColor * crest * 0.09 * (1.0 - fr);

  // thin bright shoreline: shallow water over sand catches the sky, no foam
  float shore = 1.0 - smoothstep(0.0, 0.55, depth);
  col = mix(col, mix(col, vec3(0.74, 0.76, 0.68), 0.5), shore * 0.35);

  // aerial haze into the horizon (the far sheet must dissolve, not end)
  float dist = length(uCamPos - vWorld);
  col = mix(col, uSkyHorizon, smoothstep(55.0, 190.0, dist) * 0.72);

  /* The split's near half keeps a little more contrast: the eye is metres from
     the water there, and a flat far-field tint would read as fog on a window. */
  float nearW = 1.0 - smoothstep(0.0, 12.0, dist);
  col = mix(col, col * 1.06, nearW * uWL.w);

  if (uDbg > 2.5) { fragColor = vec4(1.0, 0.0, 1.0, 1.0); return; }
  if (uDbg > 0.5) {
    fragColor = vec4(uDbg > 1.5 ? vec3(bedDepthAt(vWorld.xz) / 12.0) : vec3(depth / 12.0), 1.0);
    return;
  }

  fragColor = vec4(uwSrgb(col), 1.0);
}
`

/* ------------------------------------------------------------------------ *
 * The core (renderer-agnostic, used by the component and by the QA harness)
 * ------------------------------------------------------------------------ */

export type LakeWaterHandles = {
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  uniforms: Record<string, THREE.IUniform>
  caustics: CausticUniforms
  update: (time: number, camera: THREE.Camera) => void
  dispose: () => void
}

function bedTexture(lake: Lake, resolution = 200) {
  const size = lake.config.bedSize
  const center = lake.config.center
  const maxDepth = Math.max(1, lake.config.depth * 1.6)
  const data = new Uint8Array(resolution * resolution * 4)
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const x = center[0] + ((i + 0.5) / resolution - 0.5) * size
      const z = center[1] + ((j + 0.5) / resolution - 0.5) * size
      const depth = Math.min(maxDepth, Math.max(0, lake.config.level - lake.config.bedAt(x, z)))
      const o = (j * resolution + i) * 4
      const v = Math.round((depth / maxDepth) * 255)
      data[o] = v
      data[o + 1] = v
      data[o + 2] = v
      data[o + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return { tex, maxDepth }
}

export function createLakeWater(
  lake: Lake,
  options: {
    waterline?: WaterlineUniforms
    trail?: WaterTrailFBO | null
    caustics?: CausticUniforms
    orb?: THREE.Vector3
    palette?: LakePalette
    sunDir?: THREE.Vector3
  } = {},
): LakeWaterHandles {
  const waterline = options.waterline ?? createWaterlineUniforms()
  const caustics = options.caustics ?? createCausticUniforms()
  const medium = createMediumUniforms(lake.config.level)
  const { tex: bedTex, maxDepth } = bedTexture(lake)

  const geometry = new THREE.PlaneGeometry(lake.config.size, lake.config.size, lake.config.detail, lake.config.detail)
  geometry.rotateX(-Math.PI / 2)

  const spacing = lake.config.size / lake.config.detail
  const trail = options.trail ?? null

  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uSpacing: { value: spacing },
    uSwell: { value: lake.config.swell },
    uCamPos: { value: new THREE.Vector3() },
    uDeep: { value: paletteColor(options.palette?.deep, '#0f3740') },
    uShallow: { value: paletteColor(options.palette?.shallow, '#2f6a66') },
    uSkyHorizon: { value: paletteColor(options.palette?.skyHorizon, '#d9b98f') },
    uSkyZenith: { value: paletteColor(options.palette?.skyZenith, '#7f93b4') },
    uSunColor: { value: paletteColor(options.palette?.sun, '#ffe3b0') },
    uShoreColor: { value: paletteColor(options.palette?.shore, '#2a3a33') },
    uFoamColor: { value: new THREE.Color('#e8efe6') },
    uOrb: { value: new THREE.Vector4(0, 3, 0, 1) },
    uOrbColor: { value: new THREE.Color('#ffcf8a') },
    uBedTex: { value: bedTex },
    uBedBox: { value: new THREE.Vector4(lake.config.center[0], lake.config.center[1], lake.config.bedSize, maxDepth) },
    uUnderBlend: { value: 0 },
    uMicro: { value: 0 },
    uDbg: { value: 0 },
    // shared with the split pass and the kelp
    uLevel: medium.uLevel,
    uUwAbs: medium.uUwAbs,
    uUwScatter: medium.uUwScatter,
    uSunDir: medium.uSunDir,
    uUwBeam: medium.uUwBeam,
    uCaus: caustics.uCaus,
    uCausTint: caustics.uCausTint,
    uCausTex: caustics.uCausTex,
    uTrail: { value: trail ? trail.texture : null },
    uTrailBox: { value: trail ? trail.box : new THREE.Vector4(0, 0, 1, 1) },
    uTrailGain: { value: trail ? trail.gain : 0 },
    uWL: waterline.uWL,
    uWLq: waterline.uWLq,
    uSplitMerge: waterline.uSplitMerge,
    uUnder: waterline.uUnder,
  }

  if (options.sunDir) (uniforms.uSunDir.value as THREE.Vector3).copy(options.sunDir).normalize()

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    fog: false,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'LakeWater'
  mesh.frustumCulled = false
  mesh.renderOrder = 10
  mesh.position.set(lake.config.center[0], 0, lake.config.center[1])
  mesh.castShadow = false
  mesh.receiveShadow = false

  const update = (time: number, camera: THREE.Camera) => {
    uniforms.uTime.value = time
    uniforms.uCamPos.value.copy(camera.position)
    if (trail) {
      uniforms.uTrail.value = trail.texture
      ;(uniforms.uTrailBox.value as THREE.Vector4).copy(trail.box)
    }
    if (options.orb) (uniforms.uOrb.value as THREE.Vector4).set(options.orb.x, options.orb.y, options.orb.z, 1)
    // dive blend drives the Snell window opening and the deeper medium tint
    uniforms.uUnderBlend.value = waterline.uUnder.value
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
    bedTex.dispose()
  }

  return { mesh, material, uniforms, caustics, update, dispose }
}

/* ------------------------------------------------------------------------ *
 * React wrapper: owns the pointer raycast, the trail field and the orb splash
 * ------------------------------------------------------------------------ */

export type LakePalette = Partial<{
  deep: string | THREE.Color
  shallow: string | THREE.Color
  skyHorizon: string | THREE.Color
  skyZenith: string | THREE.Color
  sun: string | THREE.Color
  shore: string | THREE.Color
}>

/**
 * A palette entry is either a hex string or a live `THREE.Color`. The app's
 * atmosphere hands over its own colour objects, which it rewrites in place every
 * frame; keeping the reference (never the value) is what lets the lake's sky
 * reflection follow the sky instead of freezing at mount time.
 */
function paletteColor(source: string | THREE.Color | undefined, fallback: string): THREE.Color {
  return source instanceof THREE.Color ? source : new THREE.Color(source ?? fallback)
}

export type LakeWaterProps = {
  lake: Lake
  waterline: WaterlineUniforms
  trail: WaterTrailFBO | null
  caustics?: CausticUniforms
  /** live orb transform; the lake splashes it in and bobs it while it floats */
  orbRef?: RefObject<THREE.Object3D | null>
  /** radius of the orb in world units (drives the float footprint) */
  orbRadius?: number
  palette?: LakePalette
  sunDir?: THREE.Vector3
}

export function LakeWater({
  lake,
  waterline,
  trail,
  caustics,
  orbRef,
  orbRadius = 0.62,
  palette,
  sunDir,
}: LakeWaterProps) {
  const camera = useThree((state) => state.camera)
  const handles = useMemo(
    () => createLakeWater(lake, { waterline, trail, caustics, palette, sunDir }),
    [lake, waterline, trail, caustics, palette, sunDir],
  )
  const orbPos = useMemo(() => new THREE.Vector3(), [])
  const wasOrbAbove = useRef(true)
  const lastOrb = useRef(new THREE.Vector3())
  const bobAt = useRef(0)
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -lake.config.level), [lake])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const lastPointer = useRef(0)
  const wakeAt = useRef(0)

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    handles.update(t, camera)
    // no water in the frame while the star is still above the weather
    handles.mesh.visible = journey.u > 1.15

    // --- pointer: hover and touch-scrub both paint the same world-space wake
    if (trail) {
      const pointer = state.pointer
      ray.setFromCamera(pointer, camera)
      if (ray.ray.intersectPlane(plane, hit) && trail.inside(hit.x, hit.z)) {
        // only paint while the pointer is actually over the lake; a stroke that
        // leaves the water releases, so the next entry starts a fresh ring
        trail.stroke(hit.x, hit.z, 0.34 + 0.25 * orbRadius, 0.008)
        lastPointer.current = t
      } else if (t - lastPointer.current > 0.12) {
        trail.release()
      }
      trail.update(delta)
    }

    // --- the orb: splash on entry, a slow bob while it floats
    const orb = orbRef?.current
    if (orb) {
      orb.getWorldPosition(orbPos)
      const surface = lake.surfaceAt(orbPos.x, orbPos.z, t)
      const floatsAt = surface + orbRadius * 0.46
      const above = orbPos.y > surface + orbRadius * 0.55
      if (wasOrbAbove.current && !above && trail) {
        // landing: the crater is proportional to how hard it arrives
        const speed = Math.min(6, Math.abs(orbPos.y - lastOrb.current.y) / Math.max(delta, 1 / 120))
        trail.splash(orbPos.x, orbPos.z, orbRadius * 1.6, -(0.02 + Math.min(0.09, speed * 0.012)))
        bobAt.current = t
      }
      wasOrbAbove.current = orbPos.y > surface + orbRadius * 0.2
      if (!above && Math.abs(orbPos.y - floatsAt) < orbRadius * 0.9 && trail && t - bobAt.current > 0.42) {
        // floating: a footprint that breathes with the swell (a still body
        // leaves calm water; a bobbing one sends out rings — shade-verse's rule)
        const bob = Math.sin(t * 1.7) * 0.006
        trail.splash(orbPos.x, orbPos.z, orbRadius * 1.15, -0.006 - bob * 0.4)
        bobAt.current = t
      }
      // the star's downwash: whenever it flies low over any water, the surface under its path answers
      if (trail) {
        const above = orbPos.y - surface
        if (above < 3.6 && above > -1.0 && t - wakeAt.current > 0.07) {
          wakeAt.current = t
          const k = 1 - THREE.MathUtils.smoothstep(above, 0.0, 3.6)
          trail.splash(orbPos.x, orbPos.z, 1.0 + orbRadius * 1.4, -0.0009 - 0.0022 * k)
        }
      }
      lastOrb.current.copy(orbPos)
      ;(handles.uniforms.uOrb.value as THREE.Vector4).set(orbPos.x, orbPos.y, orbPos.z, 1)
    }

  })

  return <primitive object={handles.mesh} />
}
