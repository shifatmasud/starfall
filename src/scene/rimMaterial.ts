import * as THREE from 'three'

/**
 * Fresnel rim shell for the orb — GLSL ES 3.00 (`#version 300 es`), which is
 * only available on a WebGL2 context (see `src/gl/webgl2.ts`).
 *
 * three injects the attribute/uniform declarations, so the shader body stays
 * free of WebGL1-era `attribute` / `varying` / `texture2D` / `gl_FragColor`
 * usage: outputs are declared as `out` variables (GLSL ES 3.00).
 */
const vertexShader = /* glsl */ `
out vec3 vNormal;
out vec3 vViewDir;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`

const fragmentShader = /* glsl */ `
in vec3 vNormal;
in vec3 vViewDir;

uniform vec3 uColor;
uniform float uPower;
uniform float uIntensity;

layout(location = 0) out vec4 fragColor;

void main() {
  float facing = clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);
  float rim = pow(1.0 - facing, uPower);
  vec3 color = uColor * rim * uIntensity;
  fragColor = vec4(color, rim * uIntensity);
}
`

export function createRimMaterial({
  color = '#9B84FF',
  power = 3.2,
  intensity = 1.15,
}: { color?: string; power?: number; intensity?: number } = {}) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: power },
      uIntensity: { value: intensity },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  })
}
