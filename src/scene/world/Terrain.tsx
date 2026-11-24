/**
 * The landform: a meadow shelf that runs to a wooded pool, with the forest
 * climbing the far bank and the valley walls.
 *
 * This is laid against the app's world column: **ground y = 0, water line y = -1.6**. The lens
 * descends from space, crosses the meadow's edge at the pool, and dives under the surface, so the
 * pool sits directly in front of the walk at z ≈ +11 … −26 and the meadow and forest fill
 * everything around it.
 *
 * Two things here matter more than the shading:
 *  1. `heightAt()` is the only description of the ground. The render mesh is its
 *     sampled grid, and `sampleTerrain()` reads the *same* grid back through the
 *     same triangulation, so every root, stem and trunk is planted on the exact
 *     surface the GPU draws — no floating, no sinking, no z-fighting.
 *  2. `LAKE_LEVEL` is exported. `WaterBeat` must be mounted with
 *     `lake={{ level: LAKE_LEVEL, center: [0, 0] }}` so surface and shore agree.
 *
 * Shading is optical, not cel: a multi-octave albedo (meadow turf, dry patches, forest litter,
 * sand at the shore, silt under the water), a normal perturbed by the micro-relief so the hills are
 * never a flat wash, wrap-diffuse sunlight with a cool sky ambient, and an exponential aerial
 * perspective that takes the far ridge into the morning haze.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { GLSL_LIGHT, PALETTE, color, type WorldUniforms } from './shared'

/** Water surface height — the column's -1.6 m line. */
export const LAKE_LEVEL = -1.6

export const TERRAIN_BOUNDS = { minX: -300, maxX: 300, minZ: -560, maxZ: 160 } as const
const STEP = 3.8

const X0 = TERRAIN_BOUNDS.minX
const Z0 = TERRAIN_BOUNDS.minZ
const NX = Math.round((TERRAIN_BOUNDS.maxX - X0) / STEP)
const NZ = Math.round((TERRAIN_BOUNDS.maxZ - Z0) / STEP)

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * The landform in metres — the story's whole map, in one function.
 *
 *   · the meadow behind the lens (+z), rising away from the water;
 *   · the lake in the middle of it, z = +14 … −24, a lens-shaped basin 6.4 m deep;
 *   · a low sand spit at z ≈ −26 … −42, the palms' footing between the lake and the sea;
 *   · the open sea beyond z = −30, falling to a 10–12 m floor that becomes the deepest bed;
 *   · the forested valley walls on both sides, holding the composition at every chapter.
 *
 * `+z` is behind the lens, `−z` runs forward through the pool, the spit and out to sea.
 */
export function heightAt(x: number, z: number): number {
  const ax = Math.abs(x)

  // ---- the meadow valley: behind the lens (+z), rising inland and to the sides
  let y = 0.3 + 1.25 * smoothstep(20, 84, z)
  y += 0.0022 * x * x
  y += 13 * smoothstep(54, 150, ax)
  y += 6.5 * smoothstep(78, 150, z) * (0.6 + 0.4 * Math.sin(x * 0.02 + 1.2))

  // the lake: a compact lens in the middle of the meadow, z = +8 … −20
  const halfW = 8 + 11 * (1 - smoothstep(-42, -10, z)) + 1.8 * Math.sin(z * 0.26 + 0.7) + 0.9 * Math.sin(z * 0.7 + 2.1)
  const lateral = 1 - smoothstep(halfW, halfW + 10, ax)
  const shoreWobble = 0.7 * Math.sin(x * 0.21 + 1.1) + 0.4 * Math.sin(x * 0.5 + 0.3)
  const nearEdge = 1 - smoothstep(-10.5 + shoreWobble, -5.5 + shoreWobble * 1.5, z)
  const farEdge = smoothstep(-47 + shoreWobble, -40 + shoreWobble * 1.3, z)
  const pool = nearEdge * farEdge * lateral
  const lakebed = LAKE_LEVEL - 6.6 * smoothstep(0.1, 0.86, pool)
  y = y * (1 - pool) + lakebed * pool

  // ---- the desert: warm dunes from z −34 to −110, with a turquoise oasis at z −75
  const desertW = smoothstep(-60, -74, z) * (1 - smoothstep(-146, -160, z))
  const dune =
    1.35 +
    2.1 * Math.sin(x * 0.055 + z * 0.042 + 1.3) * Math.sin(z * 0.03 + 0.4) +
    1.1 * Math.sin(x * 0.13 + 2.1) +
    0.5 * Math.sin(x * 0.31 - z * 0.22)
  const od = Math.hypot(x, z + 108)
  const oasis = 1 - smoothstep(13, 24, od)
  const desertY = dune * (1 - oasis) + (LAKE_LEVEL - 4.4 * smoothstep(0.15, 0.9, 1 - smoothstep(0, 19, od))) * oasis

  // ---- Iceland: mossy volcanic ground from z −112 to −190, a still pond at z −150
  const iceW = smoothstep(-156, -170, z) * (1 - smoothstep(-244, -258, z))
  const rugged =
    0.9 +
    1.5 * Math.sin(x * 0.085 + 1.1) * Math.sin(z * 0.06) +
    0.8 * Math.sin(x * 0.23 - z * 0.17) +
    0.45 * Math.sin(x * 0.5 + z * 0.4)
  const pd = Math.hypot(x, z + 205)
  const pond = 1 - smoothstep(13, 21, pd)
  const iceY = rugged * (1 - pond) + (LAKE_LEVEL - 4.8 * smoothstep(0.15, 0.9, 1 - smoothstep(0, 18, pd))) * pond

  // ---- the sea: past the Icelandic shelf the ground falls away
  const seaW = smoothstep(-256, -282, z) * (1 - smoothstep(180, 260, ax))
  const seabed = LAKE_LEVEL - 9.4 - 3.0 * smoothstep(-300, -500, z)

  y = y * (1 - desertW) + desertY * desertW
  y = y * (1 - iceW) + iceY * iceW
  y = y * (1 - seaW) + seabed * seaW
  y += seaW * (0.55 * Math.sin(x * 0.09 + 2.0) * Math.sin(z * 0.07 + 0.6) + 0.3 * Math.sin(x * 0.21 - z * 0.13))

  // ---- dry rolls, only where the ground is dry meadow
  const dry = smoothstep(-0.2, 1.6, y) * (1 - desertW) * (1 - iceW)
  y +=
    dry *
    (0.45 * Math.sin(z * 0.07 + 0.8) * Math.sin(x * 0.05 + 1.7) +
      0.2 * Math.sin(x * 0.15 + z * 0.1 + 2.1) +
      0.08 * Math.sin(x * 0.36 - z * 0.27 + 0.4))
  return y
}

/* ------------------------- baked grid + exact sampler ------------------------ */

type Grid = { h: Float32Array; nx: number; nz: number }

let grid: Grid | null = null

function ensureGrid(): Grid {
  if (grid) return grid
  const h = new Float32Array((NX + 1) * (NZ + 1))
  for (let j = 0; j <= NZ; j++) {
    const z = Z0 + j * STEP
    for (let i = 0; i <= NX; i++) {
      h[j * (NX + 1) + i] = heightAt(X0 + i * STEP, z)
    }
  }
  grid = { h, nx: NX, nz: NZ }
  return grid
}

/** The drawn surface, sampled through the mesh's own triangulation. */
export function sampleTerrain(x: number, z: number): number {
  const g = ensureGrid()
  const fx = (x - X0) / STEP
  const fz = (z - Z0) / STEP
  const i = Math.min(g.nx - 1, Math.max(0, Math.floor(fx)))
  const j = Math.min(g.nz - 1, Math.max(0, Math.floor(fz)))
  const u = clamp01(fx - i)
  const v = clamp01(fz - j)
  const row = g.nx + 1
  const ha = g.h[j * row + i]
  const hb = g.h[j * row + i + 1]
  const hc = g.h[(j + 1) * row + i + 1]
  const hd = g.h[(j + 1) * row + i]
  // the mesh splits each cell on the a–c diagonal
  return v <= u ? ha + (hb - ha) * u + (hc - hb) * v : ha + (hc - hd) * u + (hd - ha) * v
}

export function terrainNormal(x: number, z: number, eps = STEP): THREE.Vector3 {
  const n = new THREE.Vector3(
    sampleTerrain(x - eps, z) - sampleTerrain(x + eps, z),
    2 * eps,
    sampleTerrain(x, z - eps) - sampleTerrain(x, z + eps),
  )
  return n.normalize()
}

/** 0 = flat, 1 = a cliff. Used to keep plants off the valley's steep faces. */
export function slopeAt(x: number, z: number): number {
  return 1 - terrainNormal(x, z).y
}

export function isUnderWater(x: number, z: number, margin = 0): boolean {
  return sampleTerrain(x, z) < LAKE_LEVEL + margin
}

/** How far above the water line a spot is (negative = submerged). */
export function waterDepthAt(x: number, z: number): number {
  return LAKE_LEVEL - sampleTerrain(x, z)
}

/* ------------------------------- geometry -------------------------------- */

function buildTerrainGeometry(): THREE.BufferGeometry {
  const g = ensureGrid()
  const row = g.nx + 1
  const positions = new Float32Array((g.nx + 1) * (g.nz + 1) * 3)
  const normals = new Float32Array((g.nx + 1) * (g.nz + 1) * 3)
  const uvs = new Float32Array((g.nx + 1) * (g.nz + 1) * 2)

  for (let j = 0; j <= g.nz; j++) {
    for (let i = 0; i <= g.nx; i++) {
      const k = j * row + i
      const x = X0 + i * STEP
      const z = Z0 + j * STEP
      positions[k * 3] = x
      positions[k * 3 + 1] = g.h[k]
      positions[k * 3 + 2] = z
      const hl = g.h[j * row + Math.max(0, i - 1)]
      const hr = g.h[j * row + Math.min(g.nx, i + 1)]
      const hd = g.h[Math.max(0, j - 1) * row + i]
      const hu = g.h[Math.min(g.nz, j + 1) * row + i]
      const n = new THREE.Vector3(hl - hr, 2 * STEP, hd - hu).normalize()
      normals[k * 3] = n.x
      normals[k * 3 + 1] = n.y
      normals[k * 3 + 2] = n.z
      uvs[k * 2] = x
      uvs[k * 2 + 1] = z
    }
  }

  const index: number[] = []
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      const a = j * row + i
      const b = a + 1
      const c = a + row + 1
      const d = a + row
      // counter-clockwise seen from above, so the face normal points +Y
      index.push(a, c, b, a, d, c)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(index)
  geo.computeBoundingSphere()
  return geo
}

/* ------------------------------- material -------------------------------- */

function createTerrainMaterial(uniforms: WorldUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      ...uniforms,
      uMeadowLit: { value: color(PALETTE.grassLit) },
      uMeadowMid: { value: color(PALETTE.meadowMid) },
      uMeadowShade: { value: color(PALETTE.grassShade) },
      uLitterLit: { value: color(PALETTE.litterLit) },
      uLitterMid: { value: color(PALETTE.litterMid) },
      uLitterShade: { value: color(PALETTE.litterShade) },
      uSand: { value: color('#c7b78c') },
      uBedShallow: { value: color(PALETTE.bedShallow) },
      uBedDeep: { value: color(PALETTE.bedDeep) },
      uLakeLevel: { value: LAKE_LEVEL },
      uSunColor: { value: new THREE.Color('#fff2d6') },
      uSkyTint: { value: new THREE.Color('#b9cfe0') },
      uGold: { value: new THREE.Color('#ffb347') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_LIGHT}
      uniform vec3 uMeadowLit;
      uniform vec3 uMeadowMid;
      uniform vec3 uMeadowShade;
      uniform vec3 uLitterLit;
      uniform vec3 uLitterMid;
      uniform vec3 uLitterShade;
      uniform vec3 uSand;
      uniform vec3 uBedShallow;
      uniform vec3 uBedDeep;
      uniform vec3 uSunColor;
      uniform vec3 uSkyTint;
      uniform vec3 uGold;
      uniform float uLakeLevel;

      varying vec3 vWorld;
      varying vec3 vNormal;

      layout(location = 0) out vec4 fragColor;

      float hash21(vec2 p) {
        return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.53;
        for (int i = 0; i < 3; i++) {
          v += a * vnoise(p);
          p = p * 2.03 + vec2(11.7, 5.3);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 p = vWorld;
        float slope = 1.0 - n.y;

        // ---- albedo: four scales, no banding ----------------------------------
        float broad = fbm(p.xz * 0.0075);                 // 100 m country
        float field = fbm(p.xz * 0.045 + 7.1);            // 20 m field patches
        float turf = fbm(p.xz * 0.36 + 3.3);              // 3 m clumps
        float grain = vnoise(p.xz * 2.4);                 // blades and stones

        float tone = clamp(broad * 0.5 + field * 0.34 + turf * 0.16, 0.0, 1.0);
        vec3 meadow = mix(uMeadowShade, uMeadowMid, smoothstep(0.26, 0.54, tone));
        meadow = mix(meadow, uMeadowLit, smoothstep(0.50, 0.76, tone));
        // sun-cured strands, sparse and warm — the accent that keeps a field from reading flat
        float dry = smoothstep(0.66, 0.9, fbm(p.xz * 0.12 + vec2(11.3, 4.7)));
        meadow = mix(meadow, uMeadowLit * vec3(1.22, 1.06, 0.62), dry * 0.5);
        // the grass mass: a fine tonal break-up so the ground under the blades is never a wash
        meadow *= 0.84 + 0.34 * grain;
        meadow *= 0.93 + 0.14 * turf;

        // rich forest loam: dark, warm, and mossy where the light gets through
        vec3 litter = mix(uLitterMid, uLitterLit, smoothstep(0.30, 0.68, tone));
        litter *= 0.78 + 0.38 * grain;
        vec3 moss = uMeadowMid * vec3(0.86, 1.06, 0.70);
        litter = mix(litter, moss, smoothstep(0.42, 0.82, fbm(p.xz * 0.09 + 4.0)) * 0.55);
        litter = mix(litter, uLitterShade, smoothstep(0.3, 0.9, slope) * 0.6);

        // the wooded sides, and the grove the star falls through
        float forest = max(smoothstep(26.0, 70.0, abs(p.x)), smoothstep(18.0, 54.0, p.z) * smoothstep(8.0, 26.0, abs(p.x)));
        vec3 ground = mix(meadow, litter, smoothstep(0.24, 0.70, forest + (field - 0.5) * 0.45));

        // ---- sand: the lake's rim, the spit, and everything under the water
        float shore = 1.0 - smoothstep(0.05, 1.15, abs(p.y - uLakeLevel));
        float spitSand =
          smoothstep(-48.0, -38.0, p.z) * (1.0 - smoothstep(-31.0, -26.0, p.z)) *
          smoothstep(7.0, 14.0, abs(p.x)) * (1.0 - smoothstep(40.0, 56.0, abs(p.x)));
        float beach = max(shore, spitSand);
        vec3 sandCol = uSand * (0.88 + 0.24 * grain) * (0.96 + 0.06 * turf);
        ground = mix(ground, sandCol, clamp(beach, 0.0, 1.0) * 0.92);

        // ---- the desert: warm dunes with wind ripples and shadowed lee faces
        float desertZone = smoothstep(-60.0, -74.0, p.z) * (1.0 - smoothstep(-146.0, -160.0, p.z));
        vec3 duneSand = vec3(0.80, 0.64, 0.41) * (0.90 + 0.20 * grain);
        float ripple = sin(p.x * 0.85 + sin(p.z * 0.35) * 2.4) * 0.5 + 0.5;
        duneSand *= 0.90 + 0.22 * ripple;
        duneSand = mix(duneSand, vec3(0.56, 0.43, 0.28), smoothstep(0.30, 0.85, slope) * 0.55);
        duneSand = mix(duneSand, vec3(0.68, 0.55, 0.36), smoothstep(0.55, 0.9, fbm(p.xz * 0.03 + 5.0)) * 0.35);
        ground = mix(ground, duneSand, desertZone * 0.97);

        float snowM0 = smoothstep(0.42, 0.10, slope) * smoothstep(0.30, 0.75, n.y) * smoothstep(0.38, 0.72, fbm(p.xz * 0.045 + 3.0));
        // ---- the ice land: snowfields, translucent blue ice, and frost crusts
        float iceZone = smoothstep(-156.0, -170.0, p.z) * (1.0 - smoothstep(-244.0, -258.0, p.z));
        vec3 snowField = vec3(0.90, 0.94, 0.96) * (0.94 + 0.10 * grain);
        // blue ice shows where the snow has blown clear and in the hollows between drifts
        float icePatch = smoothstep(0.42, 0.72, fbm(p.xz * 0.055 + 9.0)) * (1.0 - smoothstep(0.35, 0.8, snowM0));
        vec3 blueIce = vec3(0.46, 0.66, 0.76) * (0.85 + 0.25 * grain);
        vec3 iceGround = mix(snowField, blueIce, clamp(icePatch, 0.0, 1.0) * 0.72);
        // drifted snow lies on flat ground; the windward faces keep a crust
        iceGround = mix(iceGround, vec3(0.80, 0.86, 0.90), smoothstep(0.30, 0.85, slope) * 0.55);
        iceGround *= 0.96 + 0.10 * smoothstep(0.5, 1.0, n.y);
        ground = mix(ground, iceGround, iceZone * 0.98);

        float under = 1.0 - smoothstep(uLakeLevel - 0.05, uLakeLevel + 0.05, p.y);
        // rippled sea bed: two crossed wave trains + silt mottling, the way shallow sand settles
        float ripples = sin(p.x * 1.35 + sin(p.z * 0.42) * 2.2) * sin(p.z * 1.06 + sin(p.x * 0.31) * 1.8);
        vec3 bed = mix(uBedShallow, uBedDeep, smoothstep(uLakeLevel - 0.4, uLakeLevel - 5.5, p.y));
        bed *= 0.86 + 0.26 * field + 0.12 * ripples;
        bed = mix(bed, uSand * 0.72, smoothstep(-6.0, -2.0, p.y) * 0.35);
        ground = mix(ground, bed, under);

        // ---- micro-relief: the hills get a surface, not a flat wash ----------
        float e = 0.85;
        float h0 = vnoise(p.xz * 1.1) * 0.6 + vnoise(p.xz * 3.1) * 0.4;
        float hx = vnoise((p.xz + vec2(e, 0.0)) * 1.1) * 0.6 + vnoise((p.xz + vec2(e, 0.0)) * 3.1) * 0.4;
        float hz = vnoise((p.xz + vec2(0.0, e)) * 1.1) * 0.6 + vnoise((p.xz + vec2(0.0, e)) * 3.1) * 0.4;
        float relief = mix(0.10, 0.30, smoothstep(0.55, 0.95, forest)) * (1.0 - under * 0.4);
        // sand ripples on the sea floor get a real normal, so the caustics have something to lie on
        relief += under * 0.35;
        n = normalize(n + vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * relief);

        // ---- light: wrap-diffuse sun, cool sky ambient, one warm local light --
        float ndl = dot(n, normalize(uSun));
        float wrap = clamp((ndl + 0.32) / 1.32, 0.0, 1.0);
        float sunUp = clamp(uSun.y, 0.0, 1.0);
        float sky = 0.5 + 0.5 * clamp(n.y, 0.0, 1.0);

        vec3 col = ground * (uSkyTint * (0.40 + 0.48 * sky) + uSunColor * wrap * (0.52 + 0.62 * sunUp));
        // a touch of bounce off the bright meadow into the shaded slopes
        col += ground * uMeadowLit * 0.06 * (1.0 - wrap) * sky;
        // the forest floor keeps a dappled canopy light
        float dapple = 0.9 + 0.10 * vnoise(p.xz * 1.4 + vec2(3.1, 7.4)) + 0.05 * vnoise(p.xz * 4.2);
        col *= mix(1.0, dapple, smoothstep(0.2, 0.8, forest) * (1.0 - under));
        // wet sand and silt catch a sheen at the waterline
        col *= mix(1.0, 0.86 + 0.24 * sky, shore * 0.4);

        // ---- the fallen star's own light: warm gold, strongest right under it
        float od = length(p - uOrb);
        col += uGold * exp(-od * od * 0.045) * 0.16 * (0.6 + 0.4 * max(dot(n, normalize(uOrb - p)), 0.0));

        // ---- aerial perspective: exponential, denser low over the ground -----
        float dist = length(p - cameraPosition);
        float heightFade = exp(-max(cameraPosition.y - 1.0, 0.0) * 0.012);
        float fog = 1.0 - exp(-dist * 0.0032 * uFog * (0.55 + 0.45 * heightFade));
        col = mix(col, uHaze, fog * 0.94);

        fragColor = vec4(col, 1.0);
      }
    `,
  })
}

/* ------------------------------- component -------------------------------- */

export function Terrain({ uniforms }: { uniforms: WorldUniforms }) {
  const geometry = useMemo(() => buildTerrainGeometry(), [])
  const material = useMemo(() => createTerrainMaterial(uniforms), [uniforms])

  return <mesh geometry={geometry} material={material} receiveShadow={false} castShadow={false} />
}
