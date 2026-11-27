import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * A soft contact shadow: the diffuse pool of shade a palm, a boulder or a colonnade lays on the
 * ground. Real shadow maps are a luxury on a CPU rasterizer and a hard shadow is the opposite of this
 * look, so the shade is painted: an ellipse whose alpha feathers out, warmed toward the sand it lies on
 * and jittered at the rim so it never reads as a decal.
 */
export function SoftShadow({
  position,
  radius = 1,
  stretch = [1, 1],
  rotation = 0,
  opacity = 0.34,
  color = '#7a5236',
}: {
  position: [number, number, number]
  /** radius of the pool of shade at its core, scene units */
  radius?: number
  /** x/z scale of the ellipse (a palm's shade leans away from the sun) */
  stretch?: [number, number]
  rotation?: number
  opacity?: number
  color?: string
}) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        uniforms: { uCol: { value: new THREE.Color(color) }, uA: { value: opacity } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; uniform vec3 uCol; uniform float uA;
          float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
          void main(){
            float r = length(vUv);
            float wob = 0.12 * (vn(vUv * 3.5) - 0.5) + 0.06 * (vn(vUv * 9.0) - 0.5);
            float a = smoothstep(1.0, 0.15, r + wob);
            a *= a;
            if (a < 0.004) discard;
            gl_FragColor = vec4(uCol, a * uA);
          }`,
      }),
    [color, opacity],
  )
  return (
    <mesh material={mat} position={position} rotation={[-Math.PI / 2, 0, rotation]} scale={[radius * stretch[0], radius * stretch[1], 1]} renderOrder={1}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
