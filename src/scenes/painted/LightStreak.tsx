import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * The orb's light streak: a tapered ribbon from the orb back along its path — a hot white core, a
 * coloured sheath, a few stretched filaments and sparkles that drift down the tail. Drawn under the
 * orb, so its head melts into the glass.
 *
 * Every term is multiplied by an envelope that reaches exactly zero before the quad's own boundary —
 * across the ribbon (`edge`, hard zero at |y| = 1 local half-widths) and at the head and tail — so the
 * quad can never show an edge, however wide the ribbon is drawn. The ribbon is additive and depth-test
 * free, so it is drawn over the world but under the glass.
 */

const VERT = /* glsl */ `
uniform vec2 uHead;     // screen uv, y up
uniform vec2 uDir;      // unit vector from the head toward the tail, in screen-height units
uniform float uLen;     // fraction of screen height
uniform float uWidth;   // half-width at the head, fraction of screen height
uniform float uAspect;
out vec2 vA;            // x along 0..1 (head..tail), y across -1..1 (= one half-width)
void main() {
  vA = vec2(position.x * 0.5 + 0.5, position.y);
  vec2 perp = vec2(-uDir.y, uDir.x);
  vec2 p = uDir * vA.x * uLen + perp * vA.y * uWidth;
  vec2 uv = uHead + p * vec2(1.0 / uAspect, 1.0);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}
`

const FRAG = /* glsl */ `
precision highp float;
in vec2 vA;
uniform vec3 uColor;
uniform float uStrength;
uniform float uTime;
layout(location = 0) out vec4 fragColor;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float t = clamp(vA.x, 0.0, 1.0);
  // the ribbon broadens as it diffuses into the air instead of pinching to a razor wire
  float taper = mix(1.0, 0.42, pow(t, 0.75));
  float yn = vA.y / taper;
  float edge = smoothstep(1.0, 0.25, abs(yn));        // reaches 0 well before the boundary
  float head = smoothstep(0.0, 0.06, vA.x);           // melts into the orb
  float tail = pow(1.0 - t, 1.85);
  float fade = head * tail * edge;

  // a soft diffused core inside a wide ethereal sheath: light in air, not a laser wire
  float core = exp(-yn * yn * 3.2) * fade * 0.65;
  float sheath = exp(-yn * yn * 0.85) * pow(1.0 - t, 1.5) * 0.55 * edge * head;
  float strands = vn(vec2(t * 5.0 - uTime * 0.45, yn * 2.4)) * exp(-yn * yn * 1.4) * fade;
  strands = smoothstep(0.45, 0.92, strands) * 0.45;

  vec2 sg = vec2(t * 44.0 - uTime * 2.2, yn * 2.2);
  float sp = h21(floor(sg));
  float spark = step(0.94, sp) * smoothstep(0.55, 0.0, length(fract(sg) - 0.5)) * fade * 0.85;

  vec3 col = mix(uColor, vec3(1.0, 0.99, 0.97), 0.72) * core
           + uColor * (sheath + strands)
           + mix(uColor, vec3(1.0), 0.5) * spark;
  fragColor = vec4(col * uStrength, 1.0);
}
`

export type LightStreakProps = {
  head: { x: number; y: number }
  /** direction from the orb toward the tail, in screen space (x right, y up); normalised here */
  dir: [number, number]
  len: number
  width: number
  color?: string
  strength?: number
  bob?: number
}

export function LightStreak({ head, dir, len, width, color = '#bcdcff', strength = 1, bob = 0.004 }: LightStreakProps) {
  const size = useThree((s) => s.size)
  const mat = useMemo(() => {
    const v = new THREE.Vector2(...dir).normalize()
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uHead: { value: new THREE.Vector2(head.x, head.y) },
        uDir: { value: v },
        uLen: { value: len },
        uWidth: { value: width },
        uAspect: { value: 1.5 },
        uColor: { value: new THREE.Color(color) },
        uStrength: { value: strength },
        uTime: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    const u = mat.uniforms
    u.uAspect.value = size.width / Math.max(1, size.height)
    u.uHead.value.set(head.x, head.y + Math.sin(t * 0.9) * bob)
    ;(u.uDir.value as THREE.Vector2).set(dir[0], dir[1]).normalize()
    u.uLen.value = len
    u.uWidth.value = width
    u.uTime.value = t
  })
  return (
    <mesh frustumCulled={false} renderOrder={10} material={mat}>
      <planeGeometry args={[2, 2, 1, 1]} />
    </mesh>
  )
}
