import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { radialTexture } from './world'

/**
 * The star itself: a hot core, a thin refractive shell, two orbital rings of satellites, an
 * additive halo, and a streak of light behind it when it is falling.
 *
 * It is a light source with structure, never a plastic ball: the core is near-white, the shell is
 * additive and fresnel-rimmed, and the rings carry the purple of the reference.
 */

const RING_A = new THREE.Color('#b9a5ff')
const RING_B = new THREE.Color('#8fd8ff')

export function Orb({ streak }: { streak: boolean }) {
  const group = useRef<THREE.Group>(null)
  const ringA = useRef<THREE.Group>(null)
  const ringB = useRef<THREE.Group>(null)
  const satellites = useRef<THREE.Group>(null)
  const halo = useMemo(() => radialTexture('rgba(255,255,255,1)', 'rgba(196,214,255,0.55)', 128, 1.6), [])
  const glow = useMemo(() => radialTexture('rgba(255,255,255,0.95)', 'rgba(170,190,255,0.35)', 128, 2.2), [])

  const shellMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
        uniforms: { uColor: { value: new THREE.Color('#cfe0ff') } },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vNormal = normalize(mat3(modelMatrix) * normal);
            vView = normalize(cameraPosition - world.xyz);
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.4);
            gl_FragColor = vec4(uColor, rim * 0.9);
          }
        `,
      }),
    [],
  )

  const satelliteCount = 30
  const satellitesGeometry = useMemo(() => new THREE.SphereGeometry(0.045, 6, 6), [])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    if (group.current) group.current.position.y += Math.sin(t * 0.8) * delta * 0.22
    if (ringA.current) ringA.current.rotation.y += delta * 0.55
    if (ringB.current) ringB.current.rotation.y -= delta * 0.34
    if (satellites.current) satellites.current.rotation.y += delta * 0.9
  })

  return (
    <group ref={group}>
      <mesh scale={0.82}>
        <icosahedronGeometry args={[1, 4]} />
        <meshBasicMaterial color="#f6fbff" toneMapped={false} />
      </mesh>
      <mesh scale={0.88}>
        <icosahedronGeometry args={[1, 4]} />
        <primitive object={shellMaterial} attach="material" />
      </mesh>

      <sprite scale={[13, 13, 1]}>
        <spriteMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.35} toneMapped={false} />
      </sprite>
      <sprite scale={[2.6, 2.6, 1]}>
        <spriteMaterial map={halo} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.5} toneMapped={false} />
      </sprite>

      <group ref={ringA} rotation={[1.15, 0, 0.4]}>
        <mesh>
          <torusGeometry args={[1.55, 0.022, 8, 128]} />
          <meshBasicMaterial color={RING_A} transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh rotation={[0, 0.5, 0]}>
          <torusGeometry args={[1.95, 0.016, 8, 128]} />
          <meshBasicMaterial color={RING_B} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>

      <group ref={ringB} rotation={[1.6, 0.3, -0.6]}>
        <mesh>
          <torusGeometry args={[1.3, 0.018, 8, 128]} />
          <meshBasicMaterial color={RING_B} transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>

      <group ref={satellites}>
        {Array.from({ length: satelliteCount }).map((_, index) => {
          const a = (index / satelliteCount) * Math.PI * 2
          const r = 1.7 + (index % 3) * 0.22
          return (
            <mesh
              key={index}
              geometry={satellitesGeometry}
              position={[Math.cos(a) * r, Math.sin(a * 2) * 0.28, Math.sin(a) * r]}
            >
              <meshBasicMaterial color={index % 2 === 0 ? RING_A : RING_B} toneMapped={false} />
            </mesh>
          )
        })}
      </group>

      {streak && <Streak />}
    </group>
  )
}

/** The tail: a cone of light dragged behind the fall, widest at the orb. */
function Streak() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color('#dfe9ff') } },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float along = smoothstep(1.0, 0.0, vUv.y);
            float edge = pow(sin(vUv.x * 3.14159), 1.6);
            gl_FragColor = vec4(uColor, along * along * edge * 0.5);
          }
        `,
      }),
    [],
  )
  return (
    <mesh position={[0, 0, 7.5]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 1]}>
      <coneGeometry args={[1.5, 16, 24, 1, true]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
