import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * A contact shadow: the poolof shade a palm, a boulder or a colonnade lays on the ground.
 *
 * Real shadow maps are a luxury on a CPU rasterizer, and a hard shadow is the opposite of this look,
 * so the shade is painted — but it is painted the way shade actually sits: a tight, nearly opaque
 * core where the prop meets the ground, a broad feathered penumbra that thins out to nothing, a rim
 * jittered so it never reads as a decal, and a multiplied (never black) tint so the receiving surface
 * keeps its own colour and grain: warm umber on sand, deep olive on grass, dark teal on the seabed.
 *
 * The blend is `dst * colour`, not an alpha over: a multiplied shade darkens sand to dark sand rather
 * than painting a grey ellipse over it, which is what made the old decals read as stickers.
 */
export function SoftShadow({
  position,
  radius = 1,
  stretch = [1, 1],
  rotation = 0,
  opacity = 0.55,
  color = '#9a7d63',
  /** how hard the core is, 0..1: 1 = a tight contact ring, 0 = a broad soft pool */
  contact = 0.55,
}: {
  position: [number, number, number]
  /** radius of the pool of shade at its core, scene units */
  radius?: number
  /** x/z scale of the ellipse (a palm's shade leans away from the sun) */
  stretch?: [number, number]
  rotation?: number
  /** how dark the core goes (0..1) */
  opacity?: number
  /** the shade's hue, multiplied into the receiving surface: warm umber, olive, teal — never black */
  color?: string
  contact?: number
}) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        // dst * colour: the shade is a multiplier on what is already there
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.DstColorFactor,
        blendDst: THREE.ZeroFactor,
        uniforms: { uCol: { value: new THREE.Color(color) }, uA: { value: opacity }, uContact: { value: contact } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; uniform vec3 uCol; uniform float uA; uniform float uContact;
          float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
          void main(){
            float r = length(vUv);
            // the rim wanders a little, so the pool of shade has an edge like a real penumbra
            float wob = 0.11 * (vn(vUv * 3.1) - 0.5) + 0.05 * (vn(vUv * 9.0) - 0.5);
            float rr = r + wob;

            // two terms: a broad pool that feathers out to nothing, and a tight core at the base
            float pool = smoothstep(1.0, 0.12, rr);
            pool *= pool;
            float core = smoothstep(0.62, 0.0, rr) * smoothstep(0.0, 0.10, rr) * uContact;

            float a = clamp(pool * 0.88 + core, 0.0, 1.0) * uA;
            if (a < 0.004) discard;
            // multiply blending: white leaves the ground untouched, the tint darkens it
            gl_FragColor = vec4(mix(vec3(1.0), uCol, a), 1.0);
          }`,
      }),
    [color, opacity, contact],
  )
  return (
    <mesh material={mat} position={position} rotation={[-Math.PI / 2, 0, rotation]} scale={[radius * stretch[0], radius * stretch[1], 1]} renderOrder={2}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
