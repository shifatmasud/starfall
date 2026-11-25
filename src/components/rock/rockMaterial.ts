import * as THREE from 'three'

/**
 * The scanned-rock material.
 *
 * The geometry and its maps come from the CC0 Poly Haven *moon rock* scans (converted with
 * `gltfjsx --transform`, 512 px webp, Draco-geometry, 66–103 KB each). Three's own standard
 * material would write linear-light values into the scene buffer while every hand-written shader
 * here authors display-referred values — so the scan is lit by this small shader instead: the
 * scanned base colour and normal map, one key light, the sky's cold fill and the Earth's blue bounce.
 */

const VERT = /* glsl */ `
out vec3 vN;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const FRAG = /* glsl */ `
precision highp float;
in vec3 vN;
in vec3 vWorld;
in vec2 vUv;
uniform sampler2D uMap;
uniform sampler2D uNormal;
uniform sampler2D uRough;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform float uBounce;
uniform float uGain;
uniform float uHasMap;
uniform float uHasNormal;
uniform float uHasRough;
layout(location = 0) out vec4 fragColor;

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);

  // cotangent frame from screen derivatives — the scan carries no tangents
  vec3 dp1 = dFdx(vWorld);
  vec3 dp2 = dFdy(vWorld);
  vec2 duv1 = dFdx(vUv);
  vec2 duv2 = dFdy(vUv);
  vec3 dp2perp = cross(dp2, N);
  vec3 dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(dot(T, T), dot(B, B)) + 1e-8);
  mat3 tbn = mat3(normalize(T * invmax), normalize(B * invmax), N);
  vec3 nmap = uHasNormal > 0.5 ? texture(uNormal, vUv).xyz * 2.0 - 1.0 : vec3(0.0, 0.0, 1.0);
  vec3 Nw = normalize(mix(N, normalize(tbn * vec3(nmap.xy, nmap.z)), 0.7));

  vec3 albedo = uHasMap > 0.5 ? texture(uMap, vUv).rgb : vec3(0.42, 0.40, 0.38);
  float rough = uHasRough > 0.5 ? texture(uRough, vUv).g : 0.8;

  vec3 L = normalize(uSun);
  float ndl = max(dot(Nw, L), 0.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(Nw, H), 0.0), mix(28.0, 6.0, rough)) * (1.0 - rough) * 0.30;

  vec3 col = albedo * uSunColor * (ndl * 0.85 + 0.15) * 0.95;
  col += albedo * vec3(0.10, 0.14, 0.24) * (0.55 + 0.45 * max(-N.y, 0.0));
  col += albedo * vec3(0.16, 0.36, 0.80) * uBounce * max(-Nw.y, 0.0);
  col += uSunColor * spec;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += vec3(0.26, 0.44, 0.80) * fres * 0.18;

  fragColor = vec4(col * uGain, 1.0);
}
`

export function makeRockMaterial(source?: THREE.MeshStandardMaterial): THREE.ShaderMaterial {
  const map = source?.map ?? null
  const normal = source?.normalMap ?? null
  const rough = source?.roughnessMap ?? null
  for (const t of [map, normal, rough]) {
    if (t) {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
      t.anisotropy = 4
      t.needsUpdate = true
    }
  }
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uMap: { value: map },
      uNormal: { value: normal },
      uRough: { value: rough },
      uSun: { value: new THREE.Vector3(0.62, 0.72, 0.34).normalize() },
      uSunColor: { value: new THREE.Color('#ffe6c8') },
      uBounce: { value: 0.30 },
      uGain: { value: 1.25 },
      uHasMap: { value: map ? 1 : 0 },
      uHasNormal: { value: normal ? 1 : 0 },
      uHasRough: { value: rough ? 1 : 0 },
    },
    depthWrite: true,
    depthTest: true,
  })
}
