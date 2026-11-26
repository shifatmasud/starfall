import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * The bubble trail of the descent panel: instanced quads, each a thin-walled bubble (a bright rim,
 * a clear middle, a highlight toward the surface), streaming from the orb up along its wake, large
 * and dense near the glass, thinning and scattering as they rise.
 */

const VERT = /* glsl */ `
attribute vec4 aSeed;      // x: phase 0..1, y: size, z: lateral, w: wobble
uniform vec2 uHead;
uniform vec2 uDir;
uniform float uLen;
uniform float uSpread;
uniform float uSize;
uniform float uAspect;
uniform float uTime;
out vec2 vQ;
out float vFade;
void main() {
  float t = fract(aSeed.x + uTime * 0.035);
  vec2 perp = vec2(-uDir.y, uDir.x);
  float spread = uSpread * (0.15 + t * 1.1);
  float lat = aSeed.z * spread + sin(t * 18.0 + aSeed.w * 6.28) * spread * 0.18;
  vec2 c = uDir * (t * uLen + 0.02) + perp * lat;
  float s = uSize * aSeed.y * mix(1.0, 0.45, t);
  vQ = position.xy;
  vFade = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.75, 1.0, t));
  vec2 uv = uHead + (c + position.xy * s) * vec2(1.0 / uAspect, 1.0);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}
`

const FRAG = /* glsl */ `
precision highp float;
in vec2 vQ;
in float vFade;
uniform vec3 uColor;
layout(location = 0) out vec4 fragColor;
void main() {
  float d = length(vQ);
  if (d > 1.0) discard;
  float rim = smoothstep(0.62, 0.92, d) * (1.0 - smoothstep(0.92, 1.0, d));
  float fill = 0.10 * (1.0 - d);
  float hi = smoothstep(0.32, 0.0, length(vQ - vec2(-0.35, 0.38)));
  vec3 col = uColor * (rim * 0.85 + fill) + vec3(1.0) * hi * 0.9;
  fragColor = vec4(col * vFade, 1.0);
}
`

export type BubblesProps = {
  head: { x: number; y: number }
  dir: [number, number]
  len: number
  spread: number
  size: number
  count?: number
  color?: string
}

export function Bubbles({ head, dir, len, spread, size, count = 90, color = '#cfeeff' }: BubblesProps) {
  const viewport = useThree((s) => s.size)
  const { mesh, mat } = useMemo(() => {
    const geo = new THREE.InstancedBufferGeometry()
    const base = new THREE.PlaneGeometry(2, 2)
    geo.index = base.index
    geo.setAttribute('position', base.getAttribute('position'))
    const seeds = new Float32Array(count * 4)
    let s = 7
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < count; i++) {
      const big = rnd()
      seeds[i * 4] = i / count + rnd() * 0.01
      seeds[i * 4 + 1] = 0.25 + Math.pow(big, 3) * 1.1
      seeds[i * 4 + 2] = (rnd() * 2 - 1) * (0.4 + rnd() * 0.6)
      seeds[i * 4 + 3] = rnd()
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4))
    geo.instanceCount = count
    const v = new THREE.Vector2(...dir).normalize()
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uHead: { value: new THREE.Vector2(head.x, head.y) },
        uDir: { value: v },
        uLen: { value: len },
        uSpread: { value: spread },
        uSize: { value: size },
        uAspect: { value: 1.5 },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    mesh.renderOrder = 12
    return { mesh, mat }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])
  useFrame((state) => {
    const u = mat.uniforms
    u.uAspect.value = viewport.width / Math.max(1, viewport.height)
    u.uHead.value.set(head.x, head.y)
    u.uTime.value = state.clock.elapsedTime
  })
  return <primitive object={mesh} />
}
