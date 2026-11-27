import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { A_WATER, F0_WATER, IOR_WATER, JERLOV, coxMunkMss, kd, rrs, waterIOPs } from '../../physics/optics'
import { SPECTRA, waveField } from '../../physics/waveSpectra'

/**
 * Physically-based open water (replaces the old metal-like mirror).
 *
 *  waves        32 Gerstner components built from a MEASURED buoy spectrum (physics/waveSpectra.ts):
 *               real NDBC band frequencies, band energies and per-band mean directions, split across
 *               the band's own Mitsuyasu spreading, transposed to the scene's ripple scale by one
 *               frequency factor and set to the scene's significant wave height. Domain-warped, with
 *               two octaves of capillary noise gradient standing in for the sub-pixel spectral tail,
 *               so the surface has no repeating stripe or grid; ω² = g·k dispersion, band-limited by
 *               pixel footprint
 *  reflection   exact unpolarised Fresnel for n = 1.333 (physics/optics.ts), mirroring the photographed
 *               sky (the scene HDRI); sun glint from a Blinn lobe whose width is the Cox–Munk (1954) slope variance
 *  body colour  Gordon et al. (1975) irradiance reflectance R = 0.33·bb/(a+bb) from Pope & Fry (1997) pure-water
 *               absorption plus a Morel–Maritorena (2001) chlorophyll model (Jerlov water types), seen through
 *               Maritorena et al. (1994) shallow-water mixing with a sand bottom: R(d) = R∞ + (Rb−R∞)·e^(−2·Kd·d)
 *  caustics     the focusing of the bottom light by the wave curvature (Laplacian of the height field)
 *  SSS          sunlight forward-scattered through thin wave crests: Henyey–Greenstein with Petzold's g = 0.924,
 *               Beer–Lambert transmittance with the real absorption spectrum, so crests glow turquoise
 *
 * Scans: a planar reflection pass (mirrored camera, scans only) and a refraction pass (submerged parts of the scans, shifted
 * by the wave normal, Beer–Lambert absorbed) feed the shader; the photographed sky is still mirrored analytically.
 */
export type WaterProps = {
  /** wind speed, m/s (real: 3 = light breeze, 5 = gentle, 8 = fresh) */
  wind?: number
  /** fetch, m */
  fetch?: number
  /** chlorophyll mg/m³ (JERLOV.I clearest … C3 coastal) */
  chl?: number
  /** how many metres one scene unit stands for (the scenes are miniature) */
  metersPerUnit?: number
  /** pool depth at its centre, m (open water uses `depth` everywhere) */
  depth?: number
  /** sand albedo (measured dry quartz sand ≈ 0.35, wet ≈ 0.2: Twomey et al. 1986) */
  bottom?: [number, number, number]
  sunFrom?: [number, number, number]
  sunColor?: string
  /** painterly exposure lift on the physically computed body colour (1 = none) */
  lift?: number
  near?: number
  far?: number
  at?: [number, number]
  y?: number
  windDeg?: number
  /** mirror the scans on the water (planar reflection pass, scans only) */
  reflect?: boolean
  /** refract the submerged part of the scans through the waves (distorted, absorbed) */
  refract?: boolean
  /** shallow shore: width (scene units) over which depth grows from 5 cm to `depth` outward from `near` */
  shore?: number
  /** sun-glitter strength (stochastic Cox–Munk facets) */
  sparkle?: number
  /** which measured NDBC spectrum drives the waves (see physics/waveSpectra.ts) */
  spectrum?: keyof typeof SPECTRA
  /** peak wavelength of the transposed spectrum, m — the scene's ripple scale */
  peakWave?: number
  /** significant wave height in the scene, m */
  hs?: number
  /** scene bearing the measured mean direction is turned to, degrees */
  bearing?: number
  /** capillary detail (gradient noise) strength */
  detail?: number
  /** how far each measured band is spread across its Mitsuyasu width (1 = the model's own) */
  spread?: number
  /** how many measured bands carry the energy (default 10) */
  bands?: number
  /** Gerstner steepness, 0 = pure sine swell, 1 = sharp crests */
  steep?: number
  /** how fast the normals flatten with distance (per scene unit) */
  flat?: number
  /** width of a pool as a fraction of its depth-ellipse (x scale; 1 = round) */
  poolStretch?: number
  /** fade the surface to transparent where it runs shallow (a natural shoreline instead of a cut edge) */
  feather?: number
  /** the water's own body tint (a lagoon's teal, an arctic sea's cerulean), multiplied into what is under the surface */
  tint?: [number, number, number]
  /** blend of the reflected sky toward a clear-sky gradient (0 keeps the photographed horizon) */
  skyBright?: number
  /** brightness of the reflected sky, painterly */
  reflGain?: number
}

const VERT = /* glsl */ `
out vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position,1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`

const N_WAVES = 32
const FRAG = /* glsl */ `
precision highp float;
in vec3 vW;
layout(location=0) out vec4 outColor;
uniform sampler2D uEnv; uniform mat3 uEnvRot; uniform float uHasEnv; uniform vec3 uFallback;
uniform vec4 uWaves[${N_WAVES}];   // k, omega, amplitude, phase
uniform vec2 uDirs[${N_WAVES}];
uniform float uTime, uMpu, uMss, uLift, uDepth, uPool, uPoolR, uF0, uIor, uAmpSum, uQ, uDetail, uFlat, uPoolStretch, uFeather;
uniform vec2 uPoolC;
uniform sampler2D uRefl, uRefr; uniform mat4 uReflVP, uMainVP; uniform float uUseRefl, uUseRefr, uShore, uNear, uSparkle, uSkyBright, uReflGain, uRefrDepth;
uniform vec2 uAt; uniform float uEncode;
uniform vec3 uA, uBb, uB, uRinf, uKd, uBottom, uSunDir, uSunCol, uAWater, uTint;
const float PI = 3.14159265;
// colour pipeline: everything below is computed in LINEAR light. The HDRI is an sRGB texture (decoded by the
// sampler), the reflection/refraction targets are linear data buffers, the sun colour arrives linear (THREE.Color),
// authored display-space constants go through srgbToLinear, and the result is encoded once to sRGB (uEncode = 1) for the frame
// buffer, which the post chain reads as display values; the reflection/refraction data targets stay linear (uEncode = 0).
vec3 srgbToLinear(vec3 c){ c = max(c, 0.0); return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
vec3 linearToSrgb(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
vec3 sky(vec3 d, float lod){
  if (uHasEnv < 0.5) return uFallback * (0.6 + 0.6 * clamp(d.y,0.,1.));
  d = uEnvRot * d;
  vec2 uv = vec2(atan(d.z, d.x) / (2.0*PI) + 0.5, asin(clamp(d.y,-1.,1.)) / PI + 0.5);
  return textureLod(uEnv, uv, lod).rgb;
}
float fresnel(float c, float n){           // exact unpolarised Fresnel, air -> water
  float s2 = (1.0 - c*c) / (n*n);
  float ct = sqrt(max(1.0 - s2, 0.0));
  float rs = (c - n*ct) / (c + n*ct);
  float rp = (n*c - ct) / (n*c + ct);
  return 0.5 * (rs*rs + rp*rp);
}
vec2 hash22(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(.1031,.1030,.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
float h21(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(.1031,.1030,.0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// value noise with its analytic gradient: (value, d/dx, d/dy) — the capillary detail of the surface
vec3 vnd(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f), du = 6.0*f*(1.0-f);
  float a = h21(i), b = h21(i+vec2(1,0)), c = h21(i+vec2(0,1)), d = h21(i+vec2(1,1));
  float k1 = b-a, k2 = c-a, k4 = a-b-c+d;
  float v = a + k1*u.x + k2*u.y + k4*u.x*u.y;
  return vec3(v, vec2(k1 + k4*u.y, k2 + k4*u.x) * du);
}
float hg(float c, float g){ return (1.0 - g*g) / (4.0*PI*pow(1.0 + g*g - 2.0*g*c, 1.5)); }
void main(){
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 p = vW.xz * uMpu;
  float pix = dist * uMpu * 0.0035;                    // metres per pixel at this distance
  // domain warp: a slow, drifting distortion of the sampling point, so the measured phases never line
  // up into a corrugation however the components happen to fall
  vec3 wq = vnd(p * 0.13 + vec2(uTime * 0.012, 0.0));
  vec3 wr = vnd(p * 0.13 + vec2(5.2, uTime * 0.010) + wq.yz * 0.12);
  vec2 pw = p + wr.yz * 0.9;
  float h = 0.0; vec2 grad = vec2(0.0); float vert = 0.0; float lap = 0.0;
  for (int i = 0; i < ${N_WAVES}; i++){
    vec4 w = uWaves[i];
    if (w.z <= 0.0) continue;
    float fade = 1.0 - smoothstep(0.6, 2.0, w.x * pix);  // wavelength under ~3 px averages away
    float ph = w.x * dot(uDirs[i], pw) - w.y * uTime + w.w;
    float s = sin(ph), c = cos(ph);
    h += w.z * s * fade;
    grad += w.z * w.x * c * fade * uDirs[i];           // ∂h/∂x, ∂h/∂z
    vert += w.z * w.x * s * fade;                      // Σ a·k·sin φ : the Gerstner crest compression
    lap += w.z * w.x * w.x * s * fade;                 // ∇²h, for the caustics
  }
  // capillary detail: two octaves of the noise gradient, the sub-grid tail of the measured spectrum
  vec3 d1 = vnd(pw * 2.3 + vec2(uTime * 0.05, -uTime * 0.04));
  vec3 d2 = vnd(pw * 7.1 - vec2(uTime * 0.12, uTime * 0.08));
  grad += (vec2(d1.y, d1.z) * 0.75 + vec2(d2.y, d2.z) * 0.45) * uDetail;
  vec3 N = normalize(vec3(-grad.x, 1.0 - uQ * vert, -grad.y));
  N = normalize(mix(N, vec3(0.,1.,0.), clamp(dist * uFlat, 0.0, 0.85)));
  float cv = clamp(dot(N, V), 0.02, 1.0);
  float F = fresnel(cv, uIor);
  // reflection of the photographed sky
  vec3 R = reflect(-V, N); R.y = max(abs(R.y), 0.2);   // the sampled sky stays above the horizon haze band
  // the water also mirrors the bright horizon band through the finer ripples the footprint averages away
  vec3 Rh = normalize(vec3(R.x, 0.12 + 0.25 * R.y, R.z));
  vec3 refl = mix(sky(R, 1.0), sky(Rh, 2.0), 0.65);
  // clear-sky gradient (Rayleigh-blue zenith, pale horizon): lifts a dark photographed horizon band
  vec3 clearSky = srgbToLinear(mix(vec3(0.62,0.78,1.0), vec3(0.28,0.56,0.9), pow(clamp(R.y,0.,1.), 0.5))) * uReflGain;
  refl = mix(refl, clearSky, uSkyBright) * uReflGain;
  vec4 clipM = uMainVP * vec4(vW, 1.0);
  vec2 suv = clipM.xy / clipM.w * 0.5 + 0.5;
  if (uUseRefl > 0.5){
    // planar reflection of the scans, distorted by the wave normal, softened with distance (mip lod)
    vec4 rc = uReflVP * vec4(vW, 1.0);
    vec2 ruv = rc.xy / rc.w * 0.5 + 0.5 + N.xz * 0.06 / (1.0 + dist * 0.15);
    float inb = step(0.0, ruv.x) * step(ruv.x, 1.0) * step(0.0, ruv.y) * step(ruv.y, 1.0) * step(0.0, rc.w);
    vec4 rr = textureLod(uRefl, clamp(ruv, 0.001, 0.999), 1.0 + clamp(dist * 0.12, 0.0, 3.0));
    refl = mix(refl, rr.rgb * uReflGain, clamp(rr.a * 1.25, 0.0, 1.0) * inb);
  }
  // sun glint: Blinn lobe with Cox–Munk slope variance
  vec3 Hh = normalize(uSunDir + V);
  float expo = 2.0 / max(uMss * 0.5, 1e-3) - 2.0;
  float glint = pow(max(dot(N, Hh), 0.0), expo) * (expo + 2.0) / (8.0*PI) * F * max(uSunDir.y, 0.0);
  // water-leaving radiance: irradiance reflectance (Gordon) lit by sky + sun
  vec3 skyAvg = sky(vec3(0.,1.,0.), 7.0) * 0.6 + sky(normalize(vec3(uSunDir.x, 0.5, uSunDir.z)), 7.0) * 0.4;
  float cs = max(uSunDir.y, 0.15);
  vec3 Ed = skyAvg + uSunCol * 3.2 * cs;            // direct:diffuse of a clear sky (Gregg & Carder 1990 ~ 3-5)
  float depth = uDepth;
  if (uPool > 0.5){
    float r = length((vW.xz - uPoolC) / vec2(uPoolStretch, 1.0)) / uPoolR;
    depth = max(uDepth * (1.0 - r*r), 0.02);
    // the bowl the water sits in: the surface dissolves over the shallow sand at the shore
    depth = max(depth, 0.0);
  }
  if (uShore > 0.0){
    float rr0 = length(vW.xz - uAt);
    depth = max(uDepth * smoothstep(uNear, uNear + uShore, rr0), 0.05);
  }
  float caust = 1.0 / clamp(1.0 + 0.08 * depth * lap, 0.6, 1.8);
  vec3 K = uKd;
  vec3 Rz = uRinf + (uBottom * 0.8 - uRinf) * exp(-2.0 * K * depth);   // Maritorena 1994
  float bottomW = exp(-2.0 * K.g * depth);
  Rz *= mix(vec3(1.0), vec3(caust), bottomW);
  vec3 body = Rz * Ed * 0.54 * uLift;                   // (t/n)^2 ~ 0.54 : radiance leaving through the surface
  // SSS through thin crests: forward scattering by particles, Beer–Lambert with real absorption
  float crest = clamp(h / uAmpSum * 1.6 + 0.35, 0.0, 1.2);
  float thick = crest * uAmpSum * 2.0 + 0.05;           // metres of water the light crosses
  float ph = min(hg(clamp(dot(V, -uSunDir * vec3(1.,-1.,1.)), -1., 1.), 0.924) * 0.35 + 0.25 * hg(0.0, 0.0), 3.0);
  vec3 T = exp(-(uA + uB) * thick * 1.3);
  vec3 sss = uSunCol * ph * (1.0 - exp(-uB * thick * 1.5)) * T * crest * crest * (1.0 - F) * 3.0;
  // pure-water turquoise transmittance of the crest (Pope & Fry) lifts the body on the lit side
  sss += uSunCol * exp(-uAWater * thick * 3.0) * 0.12 * crest * crest * max(dot(N, uSunDir), 0.0) * (1.0 - F);
  vec3 under = (body + sss) * uTint;
  if (uUseRefr > 0.5){
    vec2 quv = clamp(suv + N.xz * 0.045, 0.002, 0.998);       // Snell: the ray bends toward the normal, shifting the submerged image
    vec4 rf = texture(uRefr, quv);
    vec3 Tr = exp(-uKd * uRefrDepth * 2.0);                  // Beer–Lambert through the submerged part
    vec3 sub = rf.rgb * Tr + body * 0.45 * (1.0 - Tr) + srgbToLinear(vec3(0.0, 0.03, 0.05)) * rf.a;
    under = mix(under, sub, clamp(rf.a, 0.0, 1.0) * 0.9);
  }
  // sun glitter: stochastic Cox–Munk facets (each sparkle is one wave facet mirroring the sun)
  float glit = 0.0;
  if (uSparkle > 0.0){
    float sl = sqrt(uMss);
    for (int o = 0; o < 2; o++){
      float cell = (o == 0 ? 0.045 : 0.11) * (1.0 + dist * uMpu * 0.02);
      vec2 id = floor(p / cell);
      vec2 hr = hash22(id + float(o) * 17.0);
      vec2 sp = (hr - 0.5) * sl * 4.0;
      vec3 Nf = normalize(N + vec3(-sp.x, 0.0, -sp.y));
      float d = dot(Nf, Hh);
      float tw = 0.6 + 0.4 * sin(uTime * (2.0 + 5.0 * hr.x) + hr.y * 40.0);
      glit += smoothstep(0.99985, 0.99999, d) * tw;
    }
    glit *= F * 14.0 * uSparkle * smoothstep(0.0, 0.15, uSunDir.y);
  }
  vec3 col = F * refl + (1.0 - F) * under + uSunCol * (glint * 4.0 + glit);
  // the body's own tint carries into the reflection, so a lagoon stays teal and an arctic sea cerulean at any angle
  col = mix(col, col * uTint, 0.45);
  float alpha = mix(1.0, smoothstep(0.0, 0.45, depth), uFeather);
  outColor = vec4(uEncode > 0.5 ? linearToSrgb(col) : col, alpha);   // sRGB in the frame (the post chain reads it as display values), linear in the data targets
}`

export function WaterPlane({
  wind = 5,
  fetch = 20000,
  chl = JERLOV.II,
  metersPerUnit = 1,
  depth = 30,
  bottom = [0.36, 0.3, 0.2],
  sunFrom = [3, 6, -3],
  sunColor = '#fff4e0',
  lift = 2.2,
  near = 0,
  far = 4000,
  at = [0, 0],
  y = 0.01,
  windDeg = 25,
  spectrum = 'lake',
  peakWave = 1.4,
  hs = 0.05,
  bearing = 210,
  detail = 0.05,
  spread = 1,
  bands = 10,
  steep = 0.7,
  flat = 0.012,
  poolStretch = 1.6,
  feather = 0,
  tint = [1, 1, 1],
  reflect = true,
  refract = true,
  shore = 0,
  sparkle = 1,
  skyBright = 0.35,
  reflGain = 1,
}: WaterProps) {
  const gl = useThree((st) => st.gl)
  const scene = useThree((s) => s.scene)
  const pool = far < 100
  const geo = useMemo(() => {
    const g = pool ? new THREE.CircleGeometry(far, 64) : new THREE.RingGeometry(near, far, 128, 8)
    g.rotateX(-Math.PI / 2)
    return g
  }, [near, far, pool])
  const mat = useMemo(() => {
    const measured = waveField(SPECTRA[spectrum], { peakWave, hs, bearing, bands, seed: 3, spread })
    // the shader declares a fixed array size, so the field is padded with zero-amplitude entries
    const waves = measured.slice()
    while (waves.length < N_WAVES) waves.push({ k: 1, w: 1, a: 0, dx: 1, dz: 0, ph: 0 })
    const iop = waterIOPs(chl)
    const sd = new THREE.Vector3(...sunFrom).normalize()
    const v3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2])
    const col = new THREE.Color(sunColor)
    return new THREE.ShaderMaterial({
      transparent: feather > 0,
      depthWrite: true,
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uEnv: { value: null }, uEnvRot: { value: new THREE.Matrix3() }, uHasEnv: { value: 0 }, uFallback: { value: new THREE.Color('#9fc2e8') },
        uWaves: { value: waves.map((w) => new THREE.Vector4(w.k, w.w, w.a, w.ph)) },
        uDirs: { value: waves.map((w) => new THREE.Vector2(w.dx, w.dz)) },
        uTime: { value: 0 }, uMpu: { value: metersPerUnit }, uMss: { value: coxMunkMss(wind) }, uLift: { value: lift },
        uQ: { value: steep }, uDetail: { value: detail }, uFlat: { value: flat },
        uDepth: { value: depth }, uPool: { value: pool ? 1 : 0 }, uPoolR: { value: far }, uPoolC: { value: new THREE.Vector2(at[0], at[1]) },
        uPoolStretch: { value: poolStretch }, uFeather: { value: feather }, uTint: { value: new THREE.Vector3(...tint) },
        uF0: { value: F0_WATER }, uIor: { value: IOR_WATER },
        uAmpSum: { value: Math.sqrt(waves.reduce((s, w) => s + 0.5 * w.a * w.a, 0)) * 2 },
        uA: { value: v3(iop.a) }, uB: { value: v3(iop.b) }, uBb: { value: v3(iop.bb) }, uRinf: { value: v3(rrs(chl)) }, uKd: { value: v3(kd(chl)) },
        uBottom: { value: v3(bottom) }, uSunDir: { value: sd }, uSunCol: { value: new THREE.Vector3(col.r, col.g, col.b) },
        uAWater: { value: v3(A_WATER) },
        uRefl: { value: null }, uRefr: { value: null }, uReflVP: { value: new THREE.Matrix4() }, uMainVP: { value: new THREE.Matrix4() },
        uUseRefl: { value: 0 }, uUseRefr: { value: 0 }, uShore: { value: shore }, uNear: { value: near }, uAt: { value: new THREE.Vector2(at[0], at[1]) },
        uEncode: { value: 1 }, uSparkle: { value: sparkle }, uSkyBright: { value: skyBright }, uReflGain: { value: reflGain }, uRefrDepth: { value: 0.5 },
      },
    })
  }, [wind, fetch, chl, metersPerUnit, depth, bottom, sunFrom, sunColor, lift, pool, far, at, windDeg, shore, near, sparkle, skyBright, reflGain, spectrum, peakWave, hs, bearing, detail, spread, bands, steep, flat, poolStretch, feather, tint[0], tint[1], tint[2]])
  // planar reflection + refraction targets (scans only: the photographed sky is mirrored analytically in the shader)
  const rt = useMemo(() => {
    const mk = () => {
      const t = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter })
      t.texture.colorSpace = THREE.LinearSRGBColorSpace
      return t
    }
    return { refl: mk(), refr: mk(), cam: new THREE.PerspectiveCamera(), n: 0, key: '', clearC: new THREE.Color() }
  }, [])
  const meshRef = useRef<THREE.Mesh>(null)
  useEffect(() => () => { rt.refl.dispose(); rt.refr.dispose() }, [rt])
  useFrame((st) => {
    if (!reflect && !refract) return
    const cam = st.camera as THREE.PerspectiveCamera
    const w = Math.max(2, Math.round(gl.domElement.width * 0.5))
    const h = Math.max(2, Math.round(gl.domElement.height * 0.5))
    const key = `${w}x${h}`
    rt.n++
    if (key !== rt.key) { rt.key = key; rt.refl.setSize(w, h); rt.refr.setSize(w, h); rt.n = 0 }
    else if (rt.n > 12 && rt.n % 20 !== 0) return
    // Everything the mirror should see stays: the ground and the far range (vertex-coloured MeshBasicMaterial),
    // the sky dome, the scanned props. Hidden are only the water itself and the screen-space effects (the
    // additive ribbons and the glass orb draw in screen uv, so in a mirrored camera they would land wrong).
    const hidden: THREE.Object3D[] = []
    st.scene.traverse((o) => {
      if (!o.visible) return
      const mm = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      if (!mm) return
      const screenFx = !Array.isArray(mm) && mm.depthTest === false
      if (o === meshRef.current || screenFx) { o.visible = false; hidden.push(o) }
    })
    const bg = st.scene.background, prev = gl.getRenderTarget(), prevPlanes = gl.clippingPlanes
    gl.getClearColor(rt.clearC); const prevA = gl.getClearAlpha()
    st.scene.background = null
    mat.uniforms.uEncode.value = 0
    gl.setClearColor(0x000000, 0)
    const wy = y
    if (reflect) {
      const rc = rt.cam
      rc.fov = cam.fov; rc.aspect = cam.aspect; rc.near = cam.near; rc.far = Math.min(cam.far, 400)
      const fwd = cam.getWorldDirection(new THREE.Vector3())
      rc.position.set(cam.position.x, 2 * wy - cam.position.y, cam.position.z)
      rc.up.set(0, 1, 0)
      rc.lookAt(rc.position.x + fwd.x, rc.position.y - fwd.y, rc.position.z + fwd.z)
      rc.updateProjectionMatrix(); rc.updateMatrixWorld()
      mat.uniforms.uReflVP.value.multiplyMatrices(rc.projectionMatrix, rc.matrixWorldInverse)
      gl.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -wy)]
      gl.setRenderTarget(rt.refl); gl.clear()
      gl.render(st.scene, rc)
      mat.uniforms.uRefl.value = rt.refl.texture; mat.uniforms.uUseRefl.value = 1
    }
    if (refract) {
      gl.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), wy)]
      gl.setRenderTarget(rt.refr); gl.clear()
      gl.render(st.scene, cam)
      mat.uniforms.uRefr.value = rt.refr.texture; mat.uniforms.uUseRefr.value = 1
    }
    gl.clippingPlanes = prevPlanes
    mat.uniforms.uEncode.value = 1
    gl.setRenderTarget(prev); gl.setClearColor(rt.clearC, prevA)
    st.scene.background = bg
    hidden.forEach((o) => (o.visible = true))
  }, -15)
  useFrame((s) => {
    const u = mat.uniforms
    u.uMainVP.value.multiplyMatrices(s.camera.projectionMatrix, s.camera.matrixWorldInverse)
    u.uTime.value = s.clock.elapsedTime + 3
    const env = scene.environment as THREE.Texture | null
    if (env && !(env as THREE.Texture & { isCubeTexture?: boolean }).isCubeTexture) {
      u.uEnv.value = env
      u.uHasEnv.value = 1
      u.uEnvRot.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(scene.environmentRotation))
      const k = scene.environmentIntensity ?? 1
      u.uFallback.value.setScalar(k)
    }
  })
  return <mesh ref={meshRef} geometry={geo} material={mat} position={[at[0], y, at[1]]} scale={pool ? [poolStretch, 1, 1] : [1, 1, 1]} renderOrder={-40} frustumCulled={false} />
}
