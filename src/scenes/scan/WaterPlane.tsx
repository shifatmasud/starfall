import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { A_WATER, F0_WATER, IOR_WATER, JERLOV, coxMunkMss, kd, rrs, waterIOPs, waveSet } from '../../physics/optics'

/**
 * Physically-based open water (replaces the old metal-like mirror).
 *
 *  waves        32 plane waves sampled from a JONSWAP spectrum (Hasselmann 1973) for a real wind speed U
 *               and fetch, ω² = g·k dispersion; normals are analytic and band-limited by pixel footprint
 *  reflection   exact unpolarised Fresnel for n = 1.333 (physics/optics.ts), mirroring the photographed
 *               sky (the scene HDRI); sun glint from a Blinn lobe whose width is the Cox–Munk (1954) slope variance
 *  body colour  Gordon et al. (1975) irradiance reflectance R = 0.33·bb/(a+bb) from Pope & Fry (1997) pure-water
 *               absorption plus a Morel–Maritorena (2001) chlorophyll model (Jerlov water types), seen through
 *               Maritorena et al. (1994) shallow-water mixing with a sand bottom: R(d) = R∞ + (Rb−R∞)·e^(−2·Kd·d)
 *  caustics     the focusing of the bottom light by the wave curvature (Laplacian of the height field)
 *  SSS          sunlight forward-scattered through thin wave crests: Henyey–Greenstein with Petzold's g = 0.924,
 *               Beer–Lambert transmittance with the real absorption spectrum, so crests glow turquoise
 *
 * No screen-space reflection: the water mirrors the sky only (not the scans on it) — stated in the report.
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
uniform float uTime, uMpu, uMss, uLift, uDepth, uPool, uPoolR, uF0, uIor, uAmpSum;
uniform vec2 uPoolC;
uniform vec3 uA, uBb, uB, uRinf, uKd, uBottom, uSunDir, uSunCol, uAWater;
const float PI = 3.14159265;
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
float hg(float c, float g){ return (1.0 - g*g) / (4.0*PI*pow(1.0 + g*g - 2.0*g*c, 1.5)); }
void main(){
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 p = vW.xz * uMpu;
  float pix = dist * uMpu * 0.0035;                    // metres per pixel at this distance
  float h = 0.0; vec2 g = vec2(0.0); float lap = 0.0;
  for (int i = 0; i < ${N_WAVES}; i++){
    vec4 w = uWaves[i];
    float fade = 1.0 - smoothstep(0.35, 1.1, w.x * pix);  // wavelength under ~6 px averages away
    float ph = w.x * dot(uDirs[i], p) - w.y * uTime + w.w;
    float s = sin(ph), c = cos(ph);
    h += w.z * c * fade;
    g += -w.z * w.x * s * uDirs[i] * fade;
    lap += -w.z * w.x * w.x * c * fade;
  }
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  N = normalize(mix(N, vec3(0.,1.,0.), clamp(dist * 0.012, 0.0, 0.85)));
  float cv = clamp(dot(N, V), 0.02, 1.0);
  float F = fresnel(cv, uIor);
  // reflection of the photographed sky
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  // the water also mirrors the bright horizon band through the finer ripples the footprint averages away
  vec3 Rh = normalize(vec3(R.x, 0.12 + 0.25 * R.y, R.z));
  vec3 refl = mix(sky(R, 1.0), sky(Rh, 2.0), 0.65);
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
    float r = length((vW.xz - uPoolC) / vec2(1.6, 1.0)) / uPoolR;
    depth = max(uDepth * (1.0 - r*r), 0.04);
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
  vec3 col = F * refl + (1.0 - F) * (body + sss) + uSunCol * glint * 4.0;
  outColor = vec4(col, 1.0);
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
}: WaterProps) {
  const scene = useThree((s) => s.scene)
  const pool = far < 100
  const geo = useMemo(() => {
    const g = pool ? new THREE.CircleGeometry(far, 64) : new THREE.RingGeometry(near, far, 128, 8)
    g.rotateX(-Math.PI / 2)
    return g
  }, [near, far, pool])
  const mat = useMemo(() => {
    const waves = waveSet(wind, fetch, N_WAVES, windDeg)
    const iop = waterIOPs(chl)
    const sd = new THREE.Vector3(...sunFrom).normalize()
    const v3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2])
    const col = new THREE.Color(sunColor)
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uEnv: { value: null }, uEnvRot: { value: new THREE.Matrix3() }, uHasEnv: { value: 0 }, uFallback: { value: new THREE.Color('#9fc2e8') },
        uWaves: { value: waves.map((w) => new THREE.Vector4(w.k, w.w, w.a, w.ph)) },
        uDirs: { value: waves.map((w) => new THREE.Vector2(w.dx, w.dz)) },
        uTime: { value: 0 }, uMpu: { value: metersPerUnit }, uMss: { value: coxMunkMss(wind) }, uLift: { value: lift },
        uDepth: { value: depth }, uPool: { value: pool ? 1 : 0 }, uPoolR: { value: far }, uPoolC: { value: new THREE.Vector2(at[0], at[1]) },
        uF0: { value: F0_WATER }, uIor: { value: IOR_WATER },
        uAmpSum: { value: Math.sqrt(waves.reduce((s, w) => s + 0.5 * w.a * w.a, 0)) * 2 },
        uA: { value: v3(iop.a) }, uB: { value: v3(iop.b) }, uBb: { value: v3(iop.bb) }, uRinf: { value: v3(rrs(chl)) }, uKd: { value: v3(kd(chl)) },
        uBottom: { value: v3(bottom) }, uSunDir: { value: sd }, uSunCol: { value: new THREE.Vector3(col.r, col.g, col.b) },
        uAWater: { value: v3(A_WATER) },
      },
    })
  }, [wind, fetch, chl, metersPerUnit, depth, bottom, sunFrom, sunColor, lift, pool, far, at, windDeg])
  useFrame((s) => {
    const u = mat.uniforms
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
  return <mesh geometry={geo} material={mat} position={[at[0], y, at[1]]} scale={pool ? [1.6, 1, 1] : [1, 1, 1]} renderOrder={-40} frustumCulled={false} />
}
