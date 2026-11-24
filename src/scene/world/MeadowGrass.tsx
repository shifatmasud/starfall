/**
 * Meadow Fescue and Tall Foxtail as curved instanced blades.
 *
 * A blade is a five-segment ribbon bent by a cubic arc in the vertex shader:
 * a travelling gust field (world space), a slow per-plant breath, a fast tip
 * flutter, and a gaussian push away from the orb. The fragment adds thin-leaf
 * backlit translucency so the field glows when the sun is behind it.
 *
 * Density is a band along the walk: the camera never leaves the corridor, so
 * that is where the thousand-odd tufts go, with a thinner field beyond for the
 * wide shots.
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import {
  GLSL_LIGHT,
  GLSL_WIND,
  PALETTE,
  color,
  mulberry32,
  range,
  type Tier,
  type WorldUniforms,
} from './shared'
import { sampleTerrain } from './Terrain'
import { dryLand, scatter, type Box } from './planting'

const SEGMENTS = 4

/* ----------------------------- base geometry ----------------------------- */

function bladeBase(): THREE.InstancedBufferGeometry {
  const position: number[] = []
  const uv: number[] = []
  const index: number[] = []
  for (let s = 0; s <= SEGMENTS; s++) {
    const t = s / SEGMENTS
    position.push(-0.5, t, 0, 0.5, t, 0)
    uv.push(t, -1, t, 1)
  }
  for (let s = 0; s < SEGMENTS; s++) {
    const a = s * 2
    index.push(a, a + 1, a + 3, a, a + 3, a + 2)
  }
  const geo = new THREE.InstancedBufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(index)
  return geo
}

/** A foxtail: thin stem + a blunt bottle-brush head of 26 soft bristles. */
function foxtailBase(): THREE.InstancedBufferGeometry {
  const position: number[] = []
  const uv: number[] = []
  const aW: number[] = []
  const aPart: number[] = []
  const index: number[] = []

  const vert = (x: number, y: number, z: number, w: number, part: number) => {
    position.push(x, y, z)
    uv.push((x + z) * 2, y)
    aW.push(w)
    aPart.push(part)
    return position.length / 3 - 1
  }

  // stem: four points, leaning slightly
  const stem: Array<[number, number, number]> = [
    [0, 0, 0],
    [0.008, 0.26, 0.004],
    [0.016, 0.5, 0.012],
    [0.02, 0.74, 0.02],
  ]
  const stemW = [0.006, 0.005, 0.0045, 0.004]
  for (let i = 0; i < stem.length - 1; i++) {
    const a = stem[i]
    const b = stem[i + 1]
    const wa = stemW[i]
    const wb = stemW[i + 1]
    const wa2 = (i + 1) / (stem.length - 1)
    const i0 = vert(a[0] - wa, a[1], a[2], Math.pow(i / (stem.length - 1), 2), 0)
    const i1 = vert(a[0] + wa, a[1], a[2], Math.pow(i / (stem.length - 1), 2), 0)
    const i2 = vert(b[0] + wb, b[1], b[2], Math.pow(wa2, 2), 0)
    const i3 = vert(b[0] - wb, b[1], b[2], Math.pow(wa2, 2), 0)
    index.push(i0, i1, i2, i0, i2, i3)
  }

  // head: bristles radiating from a blunt cylinder
  const COUNT = 26
  for (let i = 0; i < COUNT; i++) {
    const u = i / (COUNT - 1)
    const y = 0.715 + 0.265 * u
    const radius = 0.031 * Math.sqrt(Math.sin(Math.PI * (0.06 + 0.9 * u)))
    const ang = i * 2.399963
    const dx = Math.cos(ang)
    const dz = Math.sin(ang)
    const px = 0.018
    const pz = 0.018
    const baseR = radius * 0.28
    const tipR = radius
    const half = 0.0038
    // perpendicular in the horizontal plane
    const sx = -dz * half
    const sz = dx * half
    const i0 = vert(px + dx * baseR - sx, y, pz + dz * baseR - sz, 0.88, 1)
    const i1 = vert(px + dx * baseR + sx, y, pz + dz * baseR + sz, 0.88, 1)
    const i2 = vert(px + dx * tipR + sx * 0.3, y + 0.014, pz + dz * tipR + sz * 0.3, 0.95, 1)
    const i3 = vert(px + dx * tipR - sx * 0.3, y + 0.014, pz + dz * tipR - sz * 0.3, 0.95, 1)
    index.push(i0, i1, i2, i0, i2, i3)
  }

  const geo = new THREE.InstancedBufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setAttribute('aW', new THREE.Float32BufferAttribute(aW, 1))
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(aPart, 1))
  geo.setIndex(index)
  return geo
}

/* ------------------------------ planting -------------------------------- */

type Clump = { x: number; z: number; y: number; radius: number; height: number }

/** Where the grass has to be: the ground the lens actually looks at. */
const MEADOW_REGIONS: Box[] = [
  // the lake's far rim — the green the star hangs over
  { x: [-44, 44], z: [-22, -8], weight: 3.6 },
  // the meadow the lens crosses, with the wildflower foreground
  { x: [-52, 52], z: [10, 64], weight: 4.0 },
  // banks left and right of the lake
  { x: [10, 52], z: [-20, 14], weight: 1.4 },
  { x: [-52, -10], z: [-20, 14], weight: 1.4 },
  // inland, past the meadow
  { x: [-90, 90], z: [62, 110], weight: 1.2 },
]

function plantClumps(rnd: () => number, count: number, height: [number, number]): Clump[] {
  return scatter(rnd, count, MEADOW_REGIONS, dryLand, { sightline: 2.2 }).map((s) => ({
    x: s.x,
    z: s.z,
    y: s.y,
    radius: range(rnd, 0.06, 0.18),
    height: range(rnd, height[0], height[1]),
  }))
}

type BuiltGrass = { blades: THREE.InstancedBufferGeometry; heads: THREE.InstancedBufferGeometry }

function buildGrass(tier: Tier): BuiltGrass {
  const rnd = mulberry32(0x51f3a7)
  const high = tier !== 'low'

  const clumps = plantClumps(rnd, high ? 2500 : 900, [0.8, 1.5])

  const roots: number[] = []
  const data: number[] = []
  const tint: number[] = []
  let blades = 0

  for (const clump of clumps) {
    // tall tufts get more blades; that is what makes a meadow read as grass
    const n = 10 + Math.floor(rnd() * 5)
    for (let b = 0; b < n; b++) {
      const ang = rnd() * Math.PI * 2
      const r = rnd() * clump.radius
      const x = clump.x + Math.cos(ang) * r
      const z = clump.z + Math.sin(ang) * r
      const y = sampleTerrain(x, z) - 0.035
      const h = clump.height * range(rnd, 0.62, 1.12)
      const w = range(rnd, 0.035, 0.065) * (0.7 + h * 0.5)
      roots.push(x, y, z)
      data.push(ang + range(rnd, -0.7, 0.7), h, w, rnd() * Math.PI * 2)
      // taller blades catch more light, but keep every blade inside two values
      tint.push(Math.min(1, 0.2 + h * 0.55 + range(rnd, -0.18, 0.22)), range(rnd, 0.1, 0.42))
      blades++
    }
  }

  const bladeGeo = bladeBase()
  bladeGeo.setAttribute('aRoot', new THREE.InstancedBufferAttribute(new Float32Array(roots), 3))
  bladeGeo.setAttribute('aData', new THREE.InstancedBufferAttribute(new Float32Array(data), 4))
  bladeGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(tint), 2))
  bladeGeo.instanceCount = blades
  bladeGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -25), 220)

  const heads = plantClumps(rnd, high ? 250 : 110, [0.95, 1.45])
  const hRoots: number[] = []
  const hData: number[] = []
  for (const h of heads) {
    const x = h.x + range(rnd, -0.2, 0.2)
    const z = h.z + range(rnd, -0.2, 0.2)
    hRoots.push(x, sampleTerrain(x, z) - 0.03, z)
    hData.push(rnd() * Math.PI * 2, h.height, range(rnd, 0.85, 1.2), rnd() * Math.PI * 2)
  }
  const headGeo = foxtailBase()
  headGeo.setAttribute('aRoot', new THREE.InstancedBufferAttribute(new Float32Array(hRoots), 3))
  headGeo.setAttribute('aData', new THREE.InstancedBufferAttribute(new Float32Array(hData), 4))
  headGeo.instanceCount = heads.length
  headGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -25), 220)

  return { blades: bladeGeo, heads: headGeo }
}

/* ------------------------------ materials -------------------------------- */

function createBladeMaterial(uniforms: WorldUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      ...uniforms,
      uGrassShade: { value: color(PALETTE.grassShade) },
      uGrassMid: { value: color(PALETTE.grassMid) },
      uGrassLit: { value: color(PALETTE.grassLit) },
      uGrassRim: { value: color(PALETTE.grassRim) },
    },
    vertexShader: /* glsl */ `
      ${GLSL_WIND}
      uniform vec3 uGrassShade;
      uniform vec3 uGrassMid;
      uniform vec3 uGrassLit;

      attribute vec3 aRoot;
      attribute vec4 aData;   // yaw, height, width, phase
      attribute vec2 aTint;   // colour mix, natural lean

      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vBase;
      varying float vT;

      void main() {
        float t = uv.x;
        float side = uv.y;
        float h = aData.y;
        float w = aData.z;
        float phase = aData.w;

        vec2 bend = vec2(cos(aData.x + 1.2), sin(aData.x + 1.2)) * aTint.y;
        bend += gustField(aRoot.xz) * 0.5;
        bend += vec2(cos(phase), sin(phase)) * breath(phase) * 0.2;
        bend += orbPush(aRoot, 5.0) * 2.0;

        vec3 p = aRoot;
        p.y += h * (t - 0.28 * t * t * t);
        p.xz += bend * h * t * t * 0.55;
        p.xz += vec2(sin(phase * 3.1), cos(phase * 2.7)) * flutter(phase) * 0.013 * h * t * t;

        vec3 sideAxis = vec3(cos(aData.x), 0.0, -sin(aData.x));
        p += sideAxis * (side * 0.5) * w * (1.0 - 0.86 * t);

        vec3 tangent = normalize(vec3(bend.x * 1.15 * t * h, h, bend.y * 1.15 * t * h));
        vec3 nrm = normalize(cross(sideAxis, tangent));

        vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
        vNormal = nrm;
        vT = t;

        float mixc = clamp(aTint.x * 0.82 + (t - 0.55) * 0.1, 0.0, 1.0);
        vec3 base = mix(uGrassShade, uGrassMid, smoothstep(0.0, 0.55, mixc));
        base = mix(base, uGrassLit, smoothstep(0.48, 0.95, mixc));
        vBase = base * mix(0.78, 1.05, t);

        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_LIGHT}
      uniform vec3 uGrassRim;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vBase;
      varying float vT;

      layout(location = 0) out vec4 fragColor;

      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 col = toonStep(vBase, n);

        // backlit thin leaf: warm light through the blade, strongest at the tip
        vec3 viewDir = normalize(vWorld - cameraPosition);
        float back = pow(max(dot(viewDir, uSun), 0.0), 1.5);
        col += uGrassRim * back * (0.1 + 0.4 * vT) * 0.42;

        col *= mix(0.84, 1.0, smoothstep(0.0, 0.22, vT));

        col += orbGlow(vWorld, vBase) * (0.4 + 0.6 * vT);
        float dist = length(vWorld - cameraPosition);
        col = applyHaze(col, dist, 120.0, 340.0);
        fragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  })
}

function createFoxtailMaterial(uniforms: WorldUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      ...uniforms,
      uGrassShade: { value: color(PALETTE.grassShade) },
      uGrassMid: { value: color(PALETTE.grassMid) },
      uGrassLit: { value: color(PALETTE.grassLit) },
      uGrassRim: { value: color(PALETTE.grassRim) },
      uHead: { value: color('#8E9463') },
      uHeadFlush: { value: color('#6E5F72') },
    },
    vertexShader: /* glsl */ `
      ${GLSL_WIND}
      uniform vec3 uGrassShade;
      uniform vec3 uGrassMid;
      uniform vec3 uGrassLit;

      attribute vec3 aRoot;
      attribute vec4 aData;   // yaw, height, width, phase
      attribute float aW;
      attribute float aPart;

      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vBase;
      varying float vT;
      varying float vPart;

      void main() {
        float s = aData.y;
        vec3 local = position * vec3(s * aData.z, s, s * aData.z);
        float c = cos(aData.x);
        float sn = sin(aData.x);
        local.xz = mat2(c, -sn, sn, c) * local.xz;

        vec2 bend = gustField(aRoot.xz) * 0.55
                  + vec2(cos(aData.w), sin(aData.w)) * breath(aData.w) * 0.3
                  + orbPush(aRoot, 3.6) * 1.15;
        local.xz += bend * aW * aW * s * 0.5;

        vec3 p = aRoot + local;
        vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
        vNormal = normalize(vec3(-bend.x * 0.6, 1.0, -bend.y * 0.6));
        vT = clamp(local.y / max(s, 0.001), 0.0, 1.0);
        vPart = aPart;

        vec3 stem = mix(uGrassShade, uGrassMid, 0.75);
        vec3 base = mix(stem, mix(uGrassMid, uGrassLit, 0.65), aPart);
        vBase = base * mix(0.84, 1.06, vT);

        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_LIGHT}
      uniform vec3 uGrassRim;
      uniform vec3 uHead;
      uniform vec3 uHeadFlush;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vBase;
      varying float vT;
      varying float vPart;

      layout(location = 0) out vec4 fragColor;

      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 base = mix(vBase, uHead, vPart * 0.55);
        // the purple flush always sits on the shaded side of a real foxtail
        float shadowSide = 1.0 - smoothstep(0.3, 0.7, dot(n, uSun) * 0.5 + 0.5);
        base = mix(base, uHeadFlush, vPart * shadowSide * 0.55);

        vec3 col = toonStep(base, n);
        vec3 viewDir = normalize(vWorld - cameraPosition);
        float back = pow(max(dot(viewDir, uSun), 0.0), 1.6);
        col += uGrassRim * back * vT * 0.4;

        float dist = length(vWorld - cameraPosition);
        col = applyHaze(col, dist, 120.0, 340.0);
        fragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  })
}

/* --------------------------- grass tuft cards ---------------------------- */

/**
 * Mid-distance grass: a crossed pair of painted tuft cards per instance. Blades
 * alone always thin out into single pixels past ~15 m; the cards carry the mass
 * of the field while the real blades keep the near ground three-dimensional.
 */
function tuftBase(): THREE.InstancedBufferGeometry {
  const position: number[] = []
  const uv: number[] = []
  const index: number[] = []
  const quad = (ax: number, az: number) => {
    const i0 = position.length / 3
    position.push(-0.5 * ax, 0, -0.5 * az, 0.5 * ax, 0, 0.5 * az, 0.5 * ax, 1, 0.5 * az, -0.5 * ax, 1, -0.5 * az)
    uv.push(0, 0, 1, 0, 1, 1, 0, 1)
    index.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3)
  }
  quad(1, 0)
  quad(0, 1)
  const geo = new THREE.InstancedBufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(index)
  return geo
}

function buildTufts(tier: Tier, material: THREE.Material): THREE.InstancedMesh {
  const rnd = mulberry32(0x8c31d2)
  const high = tier !== 'low'
  const spots = scatter(rnd, high ? 13000 : 4200, MEADOW_REGIONS, dryLand, { sightline: 1.0 })
  const geo = tuftBase()
  const mesh = new THREE.InstancedMesh(geo, material, spots.length)
  const matrix = new THREE.Matrix4()
  const quat = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const varr = new Float32Array(spots.length * 2)
  spots.forEach((spot, i) => {
    pos.set(spot.x, spot.y - 0.04, spot.z)
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2)
    const h = range(rnd, 0.7, 1.35)
    scl.set(range(rnd, 0.8, 1.35), h, 1)
    matrix.compose(pos, quat, scl)
    mesh.setMatrixAt(i, matrix)
    varr[i * 2] = rnd() * Math.PI * 2
    varr[i * 2 + 1] = rnd()
  })
  mesh.instanceMatrix.needsUpdate = true
  geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(varr, 2))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -22), 240)
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  return mesh
}

function createTuftMaterial(uniforms: WorldUniforms, texture: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      ...uniforms,
      uTuft: { value: texture },
      uGrassShade: { value: color(PALETTE.grassShade) },
      uGrassMid: { value: color(PALETTE.grassMid) },
      uGrassLit: { value: color(PALETTE.grassLit) },
      uGrassRim: { value: color(PALETTE.grassRim) },
    },
    vertexShader: /* glsl */ `
      ${GLSL_WIND}
      uniform vec3 uGrassShade;
      uniform vec3 uGrassMid;
      uniform vec3 uGrassLit;
      uniform vec3 uGrassRim;
      attribute vec2 aVar;
      varying vec3 vWorld;
      varying vec2 vUv;
      varying vec3 vBase;

      void main() {
        float sway = uv.y * uv.y;
        vec4 instanced = instanceMatrix * vec4(position, 1.0);
        vec2 gust = gustField(instanced.xz);
        float b = breath(aVar.x);
        vec2 bend = gust * 0.5 + vec2(cos(aVar.x), sin(aVar.x)) * b * 0.25
                  + orbPush(instanced.xyz, 3.4) * 1.1;
        vec3 world = instanced.xyz;
        world.xz += bend * sway * 0.42 * length(instanceMatrix[0].xyz);
        vWorld = world;
        vUv = uv;
        vec3 base = mix(uGrassMid, uGrassLit, 0.35 + aVar.y * 0.65);
        base = mix(base, uGrassRim, uv.y * 0.18);
        vBase = base;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_LIGHT}
      uniform sampler2D uTuft;
      uniform vec3 uGrassRim;
      varying vec3 vWorld;
      varying vec2 vUv;
      varying vec3 vBase;

      layout(location = 0) out vec4 fragColor;

      void main() {
        vec4 texel = texture(uTuft, vUv);
        // never show the quad's own edge: fade the card out at its rim
        float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(0.0, 0.08, vUv.y);
        float dist = length(vWorld - cameraPosition);
        // far tufts give up their thin blades first, so the field melts into the ground instead of sparkling
        float far = smoothstep(26.0, 75.0, dist);
        float cut = mix(0.42, 0.78, far);
        if (texel.a * edge < cut) discard;

        vec3 col = texel.rgb * vBase * 1.34;
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (dot(n, cameraPosition - vWorld) < 0.0) n = -n;
        // a tuft is a mass of blades, not a card: light it mostly as the ground it grows from
        n = normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.55));
        col = toonStep(col, n);

        vec3 viewDir = normalize(vWorld - cameraPosition);
        float back = pow(max(dot(viewDir, uSun), 0.0), 1.4);
        col += uGrassRim * back * vUv.y * 0.34;
        // the tips catch the low sun
        col *= mix(0.92, 1.12, smoothstep(0.2, 1.0, vUv.y));
        col = applyHaze(col, dist, 90.0, 320.0);
        fragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  })
}

/* ------------------------------- component -------------------------------- */

export function MeadowGrass({ uniforms, tier }: { uniforms: WorldUniforms; tier: Tier }) {
  const built = useMemo(() => buildGrass(tier), [tier])
  const texture = useMemo(() => {
    const tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/flora/grass-tuft.png`)
    tex.colorSpace = THREE.NoColorSpace
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    // no mip chain: an averaged alpha survives an alpha test and turns the card
    // into a dark rectangle at distance
    tex.generateMipmaps = false
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    return tex
  }, [])
  const bladeMaterial = useMemo(() => createBladeMaterial(uniforms), [uniforms])
  const headMaterial = useMemo(() => createFoxtailMaterial(uniforms), [uniforms])
  const tuftMaterial = useMemo(() => createTuftMaterial(uniforms, texture), [uniforms, texture])
  const tufts = useMemo(() => buildTufts(tier, tuftMaterial), [tier, tuftMaterial])

  useEffect(
    () => () => {
      built.blades.dispose()
      built.heads.dispose()
      tufts.geometry.dispose()
      tufts.dispose()
      bladeMaterial.dispose()
      headMaterial.dispose()
      tuftMaterial.dispose()
      texture.dispose()
    },
    [built, tufts, bladeMaterial, headMaterial, tuftMaterial, texture],
  )

  return (
    <>
      <primitive object={tufts} />
      <mesh geometry={built.blades} material={bladeMaterial} frustumCulled={false} renderOrder={2} />
      <mesh geometry={built.heads} material={headMaterial} frustumCulled={false} renderOrder={2} />
    </>
  )
}
