import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { atmosphere, journey, sampleAtmosphere } from '../atmosphere/atmosphereState'
import { mulberry32 } from './shared'
import { sampleTerrain } from './Terrain'

/**
 * The sea's cast: palms on the sand spit, crystalline icebergs out on the open water, and the
 * mossy boulders along the shore.
 *
 * Everything is built once as merged, vertex-coloured geometry and animated entirely in the vertex
 * shader, so the whole shoreline costs a handful of draw calls. The shading is the same optical
 * model as the rest of the world (wrap diffuse, sky ambient, exponential aerial perspective), with
 * ice adding a subsurface cyan glow and palms a thin-leaf translucency.
 */

const propVertex = /* glsl */ `
uniform float uTime;
uniform float uSway;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vHeight;
void main() {
  vec3 p = position;
  float w = clamp((p.y - 0.6) * 0.22, 0.0, 1.0);
  float phase = p.x * 0.18 + p.z * 0.14;
  float bend = (sin(uTime * 0.7 + phase) * 0.6 + sin(uTime * 1.27 + phase * 1.7) * 0.28) * w * uSway;
  p.x += bend;
  p.z += bend * 0.55;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vColor = color;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vHeight = p.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const propFragment = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uHaze;
uniform vec3 uSunColor;
uniform float uFog;
uniform float uIce;
uniform float uLeaf;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vHeight;
layout(location = 0) out vec4 fragColor;

void main() {
  vec3 n = normalize(vNormal);
  float ndl = dot(n, normalize(uSun));
  float wrap = clamp((ndl + 0.34) / 1.34, 0.0, 1.0);
  float sky = 0.5 + 0.5 * clamp(n.y, 0.0, 1.0);
  vec3 col = vColor * (vec3(0.50, 0.60, 0.74) * (0.30 + 0.34 * sky) + vec3(1.05, 1.0, 0.88) * wrap * 0.9);

  // thin palm leaflets glow when the sun is behind them
  if (uLeaf > 0.5) {
    vec3 viewDir = normalize(vWorld - cameraPosition);
    float back = pow(max(dot(viewDir, normalize(uSun)), 0.0), 1.6);
    col += vColor * vec3(1.35, 1.22, 0.72) * back * 0.55;
  }

  // ice: caustic facets, a cyan body and a bright refracted rim
  if (uIce > 0.5) {
    float facet = smoothstep(0.0, 1.0, abs(dot(n, normalize(vec3(0.4, 0.7, 0.5)))));
    col *= 0.86 + 0.30 * facet;
    col = mix(col, vec3(0.52, 0.78, 0.88), 0.28 * (1.0 - wrap));
    col += vec3(0.42, 0.78, 0.86) * pow(1.0 - clamp(dot(n, normalize(cameraPosition - vWorld)), 0.0, 1.0), 3.0) * 0.35;
    col += vec3(0.95, 1.0, 1.0) * pow(max(ndl, 0.0), 24.0) * 0.9;
  }

  float dist = length(vWorld - cameraPosition);
  float fog = 1.0 - exp(-max(dist - 30.0, 0.0) * 0.0032 * uFog);
  col = mix(col, uHaze, clamp(fog, 0.0, 0.94));
  fragColor = vec4(col, 1.0);
}
`

/* -------------------------------------------------------------------- merge */

function merge(parts: Array<{ geo: THREE.BufferGeometry; color: THREE.Color }>): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  let offset = 0
  for (const { geo, color } of parts) {
    const pos = geo.getAttribute('position')
    const nrm = geo.getAttribute('normal')
    const own = geo.getAttribute('color')
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
      normals.push(nrm ? nrm.getX(i) : 0, nrm ? nrm.getY(i) : 1, nrm ? nrm.getZ(i) : 0)
      colors.push(own ? own.getX(i) : color.r, own ? own.getY(i) : color.g, own ? own.getZ(i) : color.b)
    }
    const idx = geo.getIndex()
    if (idx) for (let i = 0; i < idx.count; i++) indices.push(offset + idx.getX(i))
    else for (let i = 0; i < pos.count; i++) indices.push(offset + i)
    offset += pos.count
    geo.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  out.setIndex(indices)
  out.computeBoundingSphere()
  return out
}

/* --------------------------------------------------------------------- palms */

function buildPalms(): THREE.BufferGeometry {
  const rnd = mulberry32(0xa71c)
  const trunkParts: Array<{ geo: THREE.BufferGeometry; color: THREE.Color }> = []
  const leafParts: Array<{ geo: THREE.BufferGeometry; color: THREE.Color }> = []
  const spots: Array<[number, number]> = [
    // the desert oasis
    [-19, -96],
    [-24.5, -105],
    [18, -94.5],
    [22.5, -104],
    [-14, -109],
    [13.5, -90],
    [26, -98],
    [-27.5, -92],
    [8, -111],
    // the sea shore
    [-21, -252],
    [20, -253],
    [-31, -256],
    [31, -254],
  ]
  const bark = new THREE.Color('#6b5a44').convertLinearToSRGB()
  const barkDark = new THREE.Color('#4a3d2e').convertLinearToSRGB()
  const leafLit = new THREE.Color('#6d8f3e').convertLinearToSRGB()
  const leafDark = new THREE.Color('#38501f').convertLinearToSRGB()

  for (const [px, pz] of spots) {
    const ground = sampleTerrain(px, pz)
    const height = 7 + rnd() * 4
    const lean = (rnd() - 0.5) * 2.6 - Math.sign(px) * 1.2
    const leanZ = (rnd() - 0.5) * 1.6
    const rings = 9
    const spine: THREE.Vector3[] = []
    for (let i = 0; i < rings; i++) {
      const t = i / (rings - 1)
      spine.push(
        new THREE.Vector3(
          px + lean * t * t + Math.sin(t * 2.1 + px) * 0.35,
          ground + height * t,
          pz + leanZ * t * t + Math.cos(t * 1.7) * 0.3,
        ),
      )
    }
    // trunk: tapered rings, banded bark
    const trunk = new THREE.BufferGeometry()
    const pos: number[] = []
    const idx: number[] = []
    const radial = 9
    for (let r = 0; r < rings; r++) {
      const t = r / (rings - 1)
      const radius = 0.28 * (1 - t * 0.55) + 0.06
      const centre = spine[r]
      const dir = new THREE.Vector3().subVectors(spine[Math.min(rings - 1, r + 1)], spine[Math.max(0, r - 1)]).normalize()
      const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
      const up = new THREE.Vector3().crossVectors(side, dir).normalize()
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * Math.PI * 2
        const p = centre.clone().addScaledVector(side, Math.cos(a) * radius).addScaledVector(up, Math.sin(a) * radius)
        pos.push(p.x, p.y, p.z)
      }
    }
    for (let r = 0; r < rings - 1; r++) {
      for (let j = 0; j < radial; j++) {
        const j2 = (j + 1) % radial
        const a = r * radial + j
        const b = r * radial + j2
        const c = (r + 1) * radial + j2
        const d = (r + 1) * radial + j
        idx.push(a, b, c, a, c, d)
      }
    }
    trunk.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    trunk.setIndex(idx)
    trunk.computeVertexNormals()
    const trunkColor = bark.clone().lerp(barkDark, rnd() * 0.4)
    trunkParts.push({ geo: trunk, color: trunkColor })

    // crown: 9 fronds, each a rachis with leaflets on both sides
    const top = spine[spine.length - 1]
    const fronds = 16
    for (let f = 0; f < fronds; f++) {
      const a = (f / fronds) * Math.PI * 2 + rnd() * 0.5
      const droop = 0.45 + rnd() * 0.55
      const len = 3.2 + rnd() * 1.8
      const dir = new THREE.Vector3(Math.cos(a), 0.55 - droop * 0.5, Math.sin(a)).normalize()
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a))
      const pts: THREE.Vector3[] = []
      for (let k = 0; k <= 5; k++) {
        const t = k / 5
        pts.push(top.clone().addScaledVector(dir, len * t).add(new THREE.Vector3(0, -len * droop * t * t * 0.8, 0)))
      }
      // rachis
      const rachis = new THREE.BufferGeometry()
      const rp: number[] = []
      const ri: number[] = []
      for (let k = 0; k <= 5; k++) {
        const p = pts[k]
        const w = 0.075 * (1 - k / 6)
        rp.push(p.x - side.x * w, p.y, p.z - side.z * w, p.x + side.x * w, p.y, p.z + side.z * w)
        if (k < 5) {
          const i0 = k * 2
          ri.push(i0, i0 + 1, i0 + 3, i0, i0 + 3, i0 + 2)
        }
      }
      rachis.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3))
      rachis.setIndex(ri)
      rachis.computeVertexNormals()
      leafParts.push({ geo: rachis, color: leafDark })

      // leaflets: long thin blades angled back from the rachis
      for (let k = 1; k < 5; k++) {
        const t = k / 5
        const p = pts[k]
        for (const s of [-1, 1]) {
          const leafletLen = (1.55 - t * 0.45) * (0.85 + rnd() * 0.4)
          const forward = dir.clone().multiplyScalar(0.45).add(side.clone().multiplyScalar(s * 0.9)).add(new THREE.Vector3(0, -0.55, 0)).normalize()
          const tip = p.clone().addScaledVector(forward, leafletLen)
          const buildMid = p.clone().addScaledVector(forward, leafletLen * 0.5).add(new THREE.Vector3(0, 0.06, 0))
          const geo = new THREE.BufferGeometry()
          const back = p.clone().addScaledVector(forward, -0.22)
          geo.setAttribute('position', new THREE.Float32BufferAttribute([
            p.x, p.y, p.z,
            buildMid.x, buildMid.y, buildMid.z,
            p.x + side.x * 0.09 + forward.x * 0.18, p.y - 0.03, p.z + side.z * 0.09 + forward.z * 0.18,
            back.x, back.y - 0.02, back.z,
            tip.x, tip.y, tip.z,
            p.x + side.x * 0.09 - forward.x * 0.16, p.y - 0.03, p.z + side.z * 0.09 - forward.z * 0.16,
          ], 3))
          geo.setIndex([0, 1, 2, 0, 2, 3, 2, 1, 4, 2, 4, 5])
          geo.setIndex([0, 1, 2])
          geo.computeVertexNormals()
          leafParts.push({ geo, color: leafLit.clone().lerp(leafDark, rnd() * 0.55) })
        }
      }
    }
  }
  return merge([...trunkParts, ...leafParts])
}

/* ------------------------------------------------------------------ icebergs */

function buildIcebergs(): THREE.BufferGeometry {
  const rnd = mulberry32(0x51e7)
  const parts: Array<{ geo: THREE.BufferGeometry; color: THREE.Color }> = []
  const spots: Array<[number, number, number]> = [
    [-96, -520, 16],
    [68, -575, 22],
    [-40, -690, 30],
    [150, -640, 20],
    [-190, -600, 24],
    [26, -480, 10],
    [128, -540, 12],
    [-130, -720, 18],
  ]
  const iceTop = new THREE.Color('#eef7f8').convertLinearToSRGB()
  const iceSide = new THREE.Color('#bcdde4').convertLinearToSRGB()
  const iceDeep = new THREE.Color('#79a9b8').convertLinearToSRGB()

  for (const [x, z, s] of spots) {
    // an irregular spire: an icosahedron stretched and cut by the waterline
    const geo = new THREE.IcosahedronGeometry(s, 1)
    const pos = geo.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      const py = pos.getY(i)
      const jag = 0.72 + rnd() * 0.55
      pos.setY(i, py > 0 ? py * 1.25 * jag + 0.4 : py * 1.1)
      if (py > 0) {
        pos.setX(i, pos.getX(i) * (0.7 + rnd() * 0.3))
        pos.setZ(i, pos.getZ(i) * (0.7 + rnd() * 0.3))
      }
    }
    geo.computeVertexNormals()
    geo.translate(x, -1.6 + s * 0.55, z)
    const colors = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i) + 1.6
      const c = h > s * 0.7 ? iceTop.clone() : iceSide.clone().lerp(iceDeep, Math.max(0, 1 - h / s) * 0.9)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    parts.push({ geo, color: iceTop })
  }
  const geo = merge(parts)
  // preserve the per-vertex ice colours written above
  return geo
}

/* --------------------------------------------------------------- shore rocks */

function buildShoreRocks(): THREE.BufferGeometry {
  const rnd = mulberry32(0x3ba9)
  const parts: Array<{ geo: THREE.BufferGeometry; color: THREE.Color }> = []
  const spots: Array<[number, number, number]> = [
    [-8.5, -14.5, 1.5],
    [9.5, -15.5, 1.8],
    [-12, -19.5, 2.2],
    [13.5, -18.5, 1.4],
    [-16.5, -91, 1.6],
    [15.5, -93, 2.0],
    [-18, -109, 1.3],
    [17, -107, 1.5],
    [-14.5, -187, 1.6],
    [15, -189, 1.9],
    [-16, -203, 1.4],
    [16.5, -201, 1.2],
    [-24, -251, 1.7],
    [26, -252, 1.4],
  ]
  const rock = new THREE.Color('#5e6157').convertLinearToSRGB()
  const moss = new THREE.Color('#5d7241').convertLinearToSRGB()
  for (const [x, z, s] of spots) {
    const geo = new THREE.IcosahedronGeometry(s, 1)
    geo.scale(1.3, 0.7, 1.1)
    const pos = geo.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, pos.getX(i) * (0.86 + rnd() * 0.3))
      pos.setZ(i, pos.getZ(i) * (0.86 + rnd() * 0.3))
    }
    geo.computeVertexNormals()
    const ground = sampleTerrain(x, z)
    geo.translate(x, ground + s * 0.2, z)
    parts.push({ geo, color: rock.clone().lerp(moss, 0.35 + rnd() * 0.3) })
  }
  return merge(parts)
}

/* ------------------------------------------------------------------ component */

function buildIceSpikes(): THREE.BufferGeometry {
  const rnd = mulberry32(0x1c4d)
  const parts: Array<{ geo: THREE.BufferGeometry; color: THREE.Color }> = []
  const spots: Array<[number, number]> = [
    [-8, -178], [10, -182], [-20, -195], [22, -192], [-12, -211],
    [14, -214], [1, -221], [-26, -205], [28, -203], [-5, -171], [17, -173],
  ]
  const iceCore = new THREE.Color('#cfeaf2').convertLinearToSRGB()
  const iceDeep = new THREE.Color('#7db6cc').convertLinearToSRGB()
  const iceTip = new THREE.Color('#f6fbfd').convertLinearToSRGB()
  for (const [x, z] of spots) {
    const ground = sampleTerrain(x, z)
    const cluster = 3 + Math.floor(rnd() * 4)
    for (let i = 0; i < cluster; i++) {
      const h = 1.4 + rnd() * 2.6
      const r = 0.22 + rnd() * 0.4
      const geo = new THREE.ConeGeometry(r, h, 5 + Math.floor(rnd() * 3), 1)
      geo.translate(x + (rnd() - 0.5) * 2.4, ground + h * 0.42, z + (rnd() - 0.5) * 2.4)
      geo.applyMatrix4(new THREE.Matrix4().makeRotationY(rnd() * 3.14))
      const pos = geo.getAttribute('position')
      const colors = new Float32Array(pos.count * 3)
      for (let k = 0; k < pos.count; k++) {
        const up = Math.max(0, Math.min(1, pos.getY(k) / h))
        const c = iceDeep.clone().lerp(iceCore, up * 1.4).lerp(iceTip, Math.pow(up, 4))
        colors[k * 3] = c.r
        colors[k * 3 + 1] = c.g
        colors[k * 3 + 2] = c.b
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      geo.computeVertexNormals()
      parts.push({ geo, color: iceCore })
    }
  }
  return merge(parts)
}

export function SeaProps() {
  const palms = useMemo(() => buildPalms(), [])
  const icebergs = useMemo(() => buildIcebergs(), [])
  const rocks = useMemo(() => buildShoreRocks(), [])
  const iceSpikes = useMemo(() => buildIceSpikes(), [])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSway: { value: 1 },
      uSun: { value: new THREE.Vector3(0.3, 0.5, -0.8) },
      uHaze: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uFog: { value: 1 },
      uIce: { value: 0 },
      uLeaf: { value: 0 },
    }),
    [],
  )

  const material = (ice: boolean) =>
    new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: propVertex,
      fragmentShader: propFragment,
      uniforms: { ...uniforms, uIce: { value: ice ? 1 : 0 }, uLeaf: { value: 0 } },
      vertexColors: true,
      side: THREE.DoubleSide,
    })

  const palmMaterial = useMemo(() => material(false), [uniforms])
  const iceMaterial = useMemo(() => material(true), [uniforms])
  const rockMaterial = useMemo(() => material(false), [uniforms])

  useFrame(() => {
    sampleAtmosphere(journey.u)
    uniforms.uTime.value = journey.time
    uniforms.uSun.value.copy(atmosphere.sunDir)
    uniforms.uHaze.value.copy(atmosphere.haze)
    uniforms.uSunColor.value.copy(atmosphere.sun)
    uniforms.uFog.value = atmosphere.fog
  })

  return (
    <group name="sea-props">
      <mesh geometry={palms} material={palmMaterial} frustumCulled={false} />
      <mesh geometry={icebergs} material={iceMaterial} frustumCulled={false} />
      <mesh geometry={rocks} material={rockMaterial} frustumCulled={false} />
      <mesh geometry={iceSpikes} material={iceMaterial} frustumCulled={false} />
    </group>
  )
}
