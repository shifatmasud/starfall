import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { atmosphere, journey, sampleAtmosphere } from './atmosphereState'
import { TIER } from './quality'

/**
 * The sky — WebGL2 / GLSL ES 3.00 only.
 *
 * Four layers, all driven by the one atmosphere sample:
 *
 *  1. `SkyDome`   – a Rayleigh/Mie morning gradient with a real star field and a Milky Way band for
 *                   the chapter above the world, the golden-hour glow at the horizon, a soft fan of
 *                   crepuscular shafts, and (from below the surface) Snell's window.
 *  2. `CloudLayers` – two multi-octave FBM decks painted into the dome with a Henyey-Greenstein
 *                   phase term, so the sun side of every cloud gets a silver lining and the turns
 *                   away from it fall into a cool shade. Soft by construction: no geometry edges.
 *  3. `CloudSea`  – the cloud-top deck seen from above, at y = 46: the sea the star falls toward.
 *  4. `CloudWisps`– soft billboard puffs close to the lens, so the descent passes *through* cloud
 *                   instead of past a backdrop.
 *
 * No sun disc (house rule except for the tight HDR glow the bloom turns into one): the gradient and
 * the glare carry the light.
 */

const GLSL_NOISE = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
/* three octaves: enough for cumulus structure, cheap enough for a phone */
float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.54;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = p * 2.07 + vec2(17.3, 9.1);
    a *= 0.48;
  }
  return v;
}
/* Henyey-Greenstein: the forward-scattering lobe that puts the silver lining on a backlit cloud */
float phaseHG(float cosT, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (12.566371 * pow(1.0 + g2 - 2.0 * g * cosT, 1.5));
}
`

/* ------------------------------------------------------------------ sky */

const skyVertex = /* glsl */ `
out vec3 vDir;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vDir = world.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const skyFragment = /* glsl */ `
in vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uLand;
uniform vec3 uSunColor;
uniform vec3 uHaze;
uniform vec3 uSunDir;
uniform float uSunPower;
uniform float uMist;
uniform float uShaft;
uniform float uWindow;
uniform float uStars;
uniform float uNebula;
uniform float uDeck;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uCloudRim;
uniform float uTime;
layout(location = 0) out vec4 fragColor;
${GLSL_NOISE}

/* One FBM deck on a horizontal plane: the ray is intersected with the deck's altitude, so the
   clouds converge at the horizon with real perspective and the camera can rise through them. */
vec4 cloudDeck(vec3 d, float height, float scale, float coverage, float softness, float seed, float hg) {
  float denom = d.y;
  if (denom < 0.014) return vec4(0.0);
  float t = (height - cameraPosition.y) / denom;
  if (t < 0.0 || t > 30000.0) return vec4(0.0);
  vec2 p = cameraPosition.xz + d.xz * t;
  vec2 q = p * scale + vec2(uTime * 0.9, uTime * 0.6) + seed;

  float n = fbm3(q);
  float detail = fbm3(q * 2.55 + vec2(19.1, 4.7));
  float field = n * 0.76 + detail * 0.30;

  float horizonFade = smoothstep(0.015, 0.26, d.y);
  float dens = smoothstep(coverage, coverage + softness, field) * horizonFade;
  if (dens < 0.003) return vec4(0.0);

  // self-shadow: is the cloud toward the sun thicker than this point?
  vec2 sunStep = normalize(uSunDir.xz + vec2(1e-4)) * (0.055 / max(scale, 0.0001));
  float towardSun = fbm3(q + sunStep);
  float shadow = smoothstep(coverage + 0.01, coverage + 0.40, towardSun);
  float thick = smoothstep(coverage, coverage + 0.42, field);
  vec3 col = mix(uCloudShade * 0.92, uCloudLit, (1.0 - shadow * 0.78) * (0.28 + 0.72 * thick));
  col = mix(col, uCloudLit * 1.05, thick * 0.28);

  // silver lining: the forward-scattering lobe lights the thin edges on the sun's side
  float cosT = dot(d, normalize(uSunDir));
  float ph = phaseHG(cosT, hg) * 12.566371;
  float edge = smoothstep(0.02, 0.28, dens) * (1.0 - smoothstep(0.30, 0.86, dens));
  col += uCloudRim * ph * edge * 0.75 * uSunPower;
  col += uCloudRim * pow(max(cosT, 0.0), 7.0) * dens * 0.16 * uSunPower;

  // aerial perspective: a far deck leans into the horizon haze
  float haze = 1.0 - exp(-t * 0.0011);
  col = mix(col, uHaze, haze * 0.72);

  float alpha = clamp(dens, 0.0, 1.0) * (1.0 - haze * 0.30) * uDeck;
  return vec4(col, alpha);
}

/* The star field: two layers of crisp cells, multi-magnitude, with a faint twinkle. */
vec3 starField(vec3 d) {
  vec2 sph = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
  vec3 acc = vec3(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float k = layer == 0 ? 9.0 : 21.0;
    vec2 g = sph * k;
    vec2 id = floor(g);
    vec2 f = fract(g);
    float r = hash21(id + float(layer) * 41.7);
    float mag = layer == 0 ? smoothstep(0.90, 0.999, r) : smoothstep(0.80, 0.995, r) * 0.55;
    if (mag <= 0.001) continue;
    vec2 pos = vec2(hash21(id + 3.7), hash21(id + 8.1)) * 0.7 + 0.15;
    float dd = length(f - pos);
    float size = layer == 0 ? 0.055 : 0.085;
    float core = smoothstep(size, 0.0, dd);
    float tw = 0.82 + 0.18 * sin(uTime * 1.7 + r * 63.0);
    vec3 tint = mix(vec3(1.0, 0.86, 0.66), vec3(0.78, 0.88, 1.0), hash21(id + 12.3));
    acc += tint * core * mag * tw * (layer == 0 ? 2.4 : 1.2);
  }
  return acc;
}

/* The Milky Way: a dusty band with a faint nebular warm/cool split. */
vec3 milkyWay(vec3 d) {
  vec3 axis = normalize(vec3(0.34, 0.5, -0.79));
  float band = exp(-pow(dot(d, axis) / 0.23, 2.0));
  if (band < 0.004) return vec3(0.0);
  vec2 p = vec2(atan(d.z, d.x) * 3.4, asin(clamp(d.y, -1.0, 1.0)) * 4.6);
  float dust = fbm3(p * 1.7 + 11.0);
  float clumps = fbm3(p * 4.1 + 3.0);
  float v = band * (0.25 + 0.75 * smoothstep(0.25, 0.75, dust * 0.7 + clumps * 0.4));
  vec3 tint = mix(vec3(0.30, 0.36, 0.56), vec3(0.62, 0.52, 0.40), smoothstep(0.3, 0.8, clumps));
  return tint * v * 0.55;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;

  // the atmosphere's gradient: horizon haze → mid sky → zenith
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.19, max(h, 0.0)));
  col = mix(col, uZenith, smoothstep(0.09, 0.55, max(h, 0.0)));
  // below the horizon: the land (or the water's underside)
  col = mix(uLand, col, smoothstep(-0.22, 0.01, h));
  // haze gathers at the horizon and thickens with the weather
  col = mix(col, uHaze, exp(-abs(h) * 10.0) * (0.24 + 0.40 * uMist));

  // ---- the chapter above the world: stars, a dusty galaxy, the planet's limb glow
  if (uStars > 0.003) {
    float veil = smoothstep(-0.06, 0.16, h);
    col = mix(col, uZenith * 0.55, uStars * smoothstep(0.05, 0.8, h) * 0.75);
    col += (starField(d) + milkyWay(d) * uNebula) * uStars * veil;
    // Earth's atmosphere seen edge-on: a bright blue-white arc riding the horizon
    float limb = exp(-pow((h - 0.012) / 0.030, 2.0));
    float outer = exp(-pow((h - 0.02) / 0.14, 2.0));
    col += vec3(0.46, 0.68, 1.0) * limb * uStars * 0.85;
    col += vec3(0.22, 0.40, 0.75) * outer * uStars * 0.30;
    col += uSunColor * pow(max(dot(d, normalize(uSunDir)), 0.0), 12.0) * uStars * 0.35;
  }

  // ---- clouds: two FBM decks under the open sky (the fall passes through the lower one)
  vec4 highDeck = cloudDeck(d, 320.0, 0.0065, 0.56, 0.16, 0.0, 0.62);
  col = col * (1.0 - highDeck.a) + highDeck.rgb * highDeck.a;

  // the sun: a tight HDR glow, never a hard disc — the bloom makes it read as a sun
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sd, 5.0) * 0.10 + pow(sd, 90.0) * 0.42 + pow(sd, 900.0) * 2.4) * uSunPower;

  // crepuscular shafts: a slowly turning fan around the sun, cut by the clouds in front of it
  vec3 t1 = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0)) + vec3(0.0001));
  vec3 t2 = cross(uSunDir, t1);
  vec2 rel = vec2(dot(d, t1), dot(d, t2));
  float r = length(rel);
  float ang = atan(rel.y, rel.x);
  float fan = 0.5 + 0.5 * sin(ang * 11.0 + sin(ang * 2.7) * 1.4 + uTime * 0.03);
  fan = pow(fan, 3.0);
  float reach = smoothstep(0.02, 0.34, r) * (1.0 - smoothstep(0.55, 1.15, r)) * smoothstep(0.0, 0.45, sd);
  col += uSunColor * fan * reach * 0.24 * uShaft;

  // Snell's window: the surface seen from below — a bright, wobbling opening overhead
  float up = max(h, 0.0);
  float wob = 0.02 * sin(d.x * 15.0 + uTime * 0.7) * sin(d.z * 13.0 - uTime * 0.55);
  float win = smoothstep(0.70, 0.92, up + wob);
  col += uSunColor * win * 0.22 * uWindow;
  col += uSunColor * pow(up, 8.0) * 0.14 * uWindow;

  // a breath of grain so the big gradients never band
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 41.0) - 0.5) * 0.004;
  fragColor = vec4(max(col, 0.0), 1.0);
}
`

function SkyDome() {
  const camera = useThree((state) => state.camera)
  const mesh = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => new THREE.SphereGeometry(900, 48, 32), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uZenith: { value: new THREE.Color() },
          uMid: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uLand: { value: new THREE.Color() },
          uSunColor: { value: new THREE.Color() },
          uHaze: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunPower: { value: 1 },
          uMist: { value: 0.5 },
          uShaft: { value: 0.5 },
          uWindow: { value: 0 },
          uStars: { value: 0 },
          uNebula: { value: 0 },
          uDeck: { value: 0 },
          uCloudLit: { value: new THREE.Color() },
          uCloudShade: { value: new THREE.Color() },
          uCloudRim: { value: new THREE.Color() },
          uTime: { value: 0 },
        },
      }),
    [],
  )

  useFrame(() => {
    sampleAtmosphere(journey.u)
    const uniforms = material.uniforms
    uniforms.uZenith.value.copy(atmosphere.zenith)
    uniforms.uMid.value.copy(atmosphere.mid)
    uniforms.uHorizon.value.copy(atmosphere.horizon)
    uniforms.uLand.value.copy(atmosphere.land)
    uniforms.uSunColor.value.copy(atmosphere.sun)
    uniforms.uHaze.value.copy(atmosphere.haze)
    uniforms.uSunDir.value.copy(atmosphere.sunDir)
    uniforms.uSunPower.value = atmosphere.sunPower
    uniforms.uMist.value = atmosphere.mist
    uniforms.uShaft.value = atmosphere.shaft
    uniforms.uWindow.value = atmosphere.window
    uniforms.uStars.value = atmosphere.stars
    uniforms.uNebula.value = atmosphere.nebula
    uniforms.uDeck.value = Math.min(1, Math.max(0, 1 - atmosphere.stars * 1.1)) * (0.35 + 0.65 * atmosphere.sea)
    uniforms.uCloudLit.value.copy(atmosphere.cloudLit)
    uniforms.uCloudShade.value.copy(atmosphere.cloudShade)
    uniforms.uCloudRim.value.copy(atmosphere.cloudRim)
    uniforms.uTime.value = journey.time
    mesh.current?.position.copy(camera.position)
  })

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={-100} />
}

/* ---------------------------------------------------------- cloud layers */

/* ------------------------------------------------------------ cloud sea */

const seaVertex = /* glsl */ `
out vec2 vUv;
out vec3 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const seaFragment = /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uRim;
uniform vec3 uHaze;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uSunPower;
uniform float uSea;
uniform float uSpace;
uniform float uTime;
layout(location = 0) out vec4 fragColor;
${GLSL_NOISE}

void main() {
  if (uSea < 0.01) discard;
  vec2 drift = vec2(uTime * 1.2, uTime * 0.9);
  vec2 p = vWorld.xz * 0.028 + drift;
  float n = fbm3(p);
  float n2 = fbm3(p * 2.6 + 5.0);
  float n3 = vnoise(p * 7.3);
  float field = n * 0.66 + n2 * 0.30 + n3 * 0.10;

  float d = length(vWorld.xz - cameraPosition.xz);
  float near = smoothstep(2.0, 26.0, d);
  float far = 1.0 - smoothstep(420.0, 900.0, d);

  // the tops catch the sun, the troughs hold a cool shade
  float crown = smoothstep(0.30, 0.70, field);
  float belly = smoothstep(0.62, 0.28, field);
  vec3 col = mix(uShade * 0.92, uLit, crown * 0.92 + 0.08);
  col = mix(col, uShade * 1.02, belly * 0.45);
  // the sun side of each cell catches a warm rim
  col += uRim * crown * belly * 0.18 * uSunPower;
  col = mix(col, uHaze, (1.0 - far) * 0.55 + smoothstep(300.0, 900.0, d) * 0.55);
  col += uSunColor * pow(max(dot(reflect(normalize(vWorld - cameraPosition), vec3(0.0, 1.0, 0.0)), normalize(uSunDir)), 0.0), 4.0) * 0.10 * uSunPower;

  float alpha = uSea * near * far * smoothstep(54.0, 92.0, cameraPosition.y);
  // from very high above, the deck is a smooth bright continent of cloud
  alpha = mix(alpha, alpha * 0.98, uSpace);
  if (alpha < 0.004) discard;
  fragColor = vec4(col, alpha);
}
`

function CloudSea() {
  const mesh = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(3000, 3000, 1, 1)
    plane.rotateX(-Math.PI / 2)
    return plane
  }, [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: seaVertex,
        fragmentShader: seaFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uLit: { value: new THREE.Color() },
          uShade: { value: new THREE.Color() },
          uRim: { value: new THREE.Color() },
          uHaze: { value: new THREE.Color() },
          uSunColor: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunPower: { value: 1 },
          uSea: { value: 1 },
          uSpace: { value: 0 },
          uTime: { value: 0 },
        },
      }),
    [],
  )
  useFrame((state) => {
    sampleAtmosphere(journey.u)
    const u = material.uniforms
    u.uLit.value.copy(atmosphere.cloudLit)
    u.uShade.value.copy(atmosphere.cloudShade)
    u.uRim.value.copy(atmosphere.cloudRim)
    u.uHaze.value.copy(atmosphere.haze)
    u.uSunColor.value.copy(atmosphere.sun)
    u.uSunDir.value.copy(atmosphere.sunDir)
    u.uSunPower.value = atmosphere.sunPower
    u.uSea.value = atmosphere.sea
    u.uSpace.value = atmosphere.stars
    u.uTime.value = journey.time
    // the deck is recentred under the lens: the world-space noise keeps it still
    if (mesh.current) mesh.current.position.set(state.camera.position.x, 34, state.camera.position.z)
  })
  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      position={[0, 34, -40]}
      frustumCulled={false}
      renderOrder={-50}
    />
  )
}

/* ------------------------------------------------------------ near wisps */

type Wisp = { x: number; y: number; z: number; size: number; seed: number; base: number; drift: number }

function buildWisps(count: number): Wisp[] {
  const out: Wisp[] = []
  const rand = mulberry(20261124)
  for (let i = 0; i < count; i++) {
    const low = i < count * 0.55
    out.push({
      x: (rand() * 2 - 1) * (low ? 34 : 90),
      y: low ? 12 + rand() * 18 : 40 + rand() * 46,
      z: low ? -8 - rand() * 60 : -40 - rand() * 150,
      size: low ? 4 + rand() * 6 : 7 + rand() * 10,
      seed: rand() * 97,
      base: low ? 1 : 1,
      drift: 0.4 + rand() * 0.8,
    })
  }
  return out.sort((a, b) => b.z - a.z)
}

/** deterministic PRNG so every reload paints the same sky */
function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const wispVertex = /* glsl */ `
in vec3 aCentre;
in vec4 aData;   // size, seed, drift, lift
uniform float uTime;
uniform float uLift;
out vec2 vLocal;
out vec3 vWorld;
out float vDist;
out float vSeed;
void main() {
  vec3 centre = aCentre;
  centre.x += uTime * 0.55 * aData.z;
  centre.y += uLift * aData.w;
  vec4 view = viewMatrix * vec4(centre, 1.0);
  // camera-facing billboard, sized in world units
  view.xy += position.xy * aData.x;
  vWorld = centre;
  vLocal = position.xy;
  vDist = -view.z;
  vSeed = aData.y;
  gl_Position = projectionMatrix * view;
}
`

const wispFragment = /* glsl */ `
in vec2 vLocal;
in vec3 vWorld;
in float vDist;
in float vSeed;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uRim;
uniform vec3 uHaze;
uniform vec3 uSunDir;
uniform float uSunPower;
uniform float uTime;
layout(location = 0) out vec4 fragColor;
${GLSL_NOISE}

void main() {
  // local uv in -0.5..0.5; a radial dome with FBM erosion: no quad edge, no hard sphere
  float r = length(vLocal) * 2.0;
  if (r > 1.0) discard;
  float dome = sqrt(max(0.0, 1.0 - r * r));
  vec2 p = vWorld.xz * 0.16 + vSeed + vec2(uTime * 0.02, uTime * 0.015);
  float n = fbm3(p);
  float n2 = fbm3(p * 2.3 + 4.0);
  float body = dome * 0.85 + (n - 0.5) * 0.55 + (n2 - 0.5) * 0.22;
  float dens = smoothstep(0.16, 0.62, body) * smoothstep(1.05, 0.45, r);
  if (dens < 0.004) discard;

  vec3 nrm = normalize(vec3(vLocal * 2.0, dome));
  float l = max(dot(nrm, normalize(vec3(0.3, 0.75, 0.6))), 0.0);
  vec3 col = mix(uShade, uLit, 0.35 + 0.65 * (0.5 + 0.5 * l));
  float cosT = dot(normalize(vWorld - cameraPosition), normalize(uSunDir));
  col += uRim * (phaseHG(cosT, 0.65) * 6.0) * dens * 0.5 * uSunPower;
  col = mix(col, uHaze, clamp(vDist / 260.0, 0.0, 1.0) * 0.9);

  float near = smoothstep(3.0, 16.0, vDist);
  float alpha = dens * near * 0.55;
  fragColor = vec4(col, alpha);
}
`

function CloudWisps() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const count = TIER === 'low' ? 8 : 14
  const wisps = useMemo(() => buildWisps(count), [count])
  const geometry = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1)
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = base.index
    geo.setAttribute('position', base.attributes.position)
    geo.setAttribute('uv', base.attributes.uv)
    const centre = new Float32Array(wisps.length * 3)
    const data = new Float32Array(wisps.length * 4)
    wisps.forEach((w, i) => {
      centre[i * 3] = w.x
      centre[i * 3 + 1] = w.y
      centre[i * 3 + 2] = w.z
      data[i * 4] = w.size
      data[i * 4 + 1] = w.seed
      data[i * 4 + 2] = w.drift
      data[i * 4 + 3] = 0.6 + (i % 5) * 0.12
    })
    geo.setAttribute('aCentre', new THREE.InstancedBufferAttribute(centre, 3))
    geo.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 4))
    geo.instanceCount = wisps.length
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 40, -40), 400)
    return geo
  }, [wisps])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: wispVertex,
        fragmentShader: wispFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uLit: { value: new THREE.Color() },
          uShade: { value: new THREE.Color() },
          uRim: { value: new THREE.Color() },
          uHaze: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunPower: { value: 1 },
          uTime: { value: 0 },
          uLift: { value: 0 },
        },
      }),
    [],
  )
  useFrame(() => {
    sampleAtmosphere(journey.u)
    const u = material.uniforms
    u.uLit.value.copy(atmosphere.cloudLit)
    u.uShade.value.copy(atmosphere.cloudShade)
    u.uRim.value.copy(atmosphere.cloudRim)
    u.uHaze.value.copy(atmosphere.haze)
    u.uSunDir.value.copy(atmosphere.sunDir)
    u.uSunPower.value = atmosphere.sunPower
    u.uTime.value = journey.time
    // the dive lifts the near wisps out of frame rather than fading them
    const dive = Math.max(0, Math.min(1, (journey.u - 2.4) / 0.8))
    u.uLift.value = dive * dive * 90
    if (mesh.current) mesh.current.visible = journey.u > 0.85 && journey.u < 1.55 && atmosphere.sea > 0.05
  })
  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={-40} />
}

export function SkyCloudsGodrays() {
  return (
    <>
      <SkyDome />
      <CloudSea />
      <CloudWisps />
    </>
  )
}
