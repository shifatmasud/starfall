import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { radialTexture } from './world'

/**
 * The star itself: a glass pearl with a small hot core inside it, two thin orbital rings, a soft
 * halo, and a lavender trail behind it while it falls.
 *
 * The reference is a polished glass marble, not a glowing ball: almost all of its read is the rim,
 * the sky caught in the shell, and a small bright nucleus visible through it. So the shell is a real
 * physical glass material (`MeshPhysicalMaterial`, clearcoat + iridescence, no committed transmission
 * pass), the nucleus is small and bright, and nothing fills the volume with white.
 */

const RING_A = new THREE.Color('#bda8ff')
const RING_B = new THREE.Color('#9fd6ff')
const TRAIL = new THREE.Color('#c7b4ff')

export function Orb({ streak }: { streak: boolean }) {
  const group = useRef<THREE.Group>(null)
  const ringA = useRef<THREE.Group>(null)
  const ringB = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const halo = useMemo(() => radialTexture('rgba(255,255,255,1)', 'rgba(206,220,255,0.5)', 128, 1.5), [])
  const glow = useMemo(() => radialTexture('rgba(236,240,255,0.9)', 'rgba(180,170,255,0.32)', 128, 2.4), [])

  // Glass: a thin shell whose read is reflection and rim, plus a faint interior interference so the
  // surface has the lilac-silver sheen of the reference rather than looking like clear plastic.
  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#c6d2f0',
        metalness: 0,
        roughness: 0.08,
        transparent: true,
        opacity: 0.44,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        iridescence: 0.9,
        iridescenceIOR: 1.3,
        envMapIntensity: 1.15,
        side: THREE.FrontSide,
        depthWrite: false,
      }),
    [],
  )

  const rimMaterial = useMemo(
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
            float facing = abs(dot(normalize(vNormal), normalize(vView)));
            // a hard, thin rim: the pearl's edge is its brightest line, and it should stay a line
            float rim = pow(1.0 - facing, 3.0) + pow(1.0 - facing, 7.0) * 1.1;
            gl_FragColor = vec4(uColor, rim * 0.85);
          }
        `,
      }),
    [],
  )

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    if (group.current) group.current.position.y += Math.sin(t * 0.8) * delta * 0.2
    if (ringA.current) ringA.current.rotation.y += delta * 0.45
    if (ringB.current) ringB.current.rotation.y -= delta * 0.3
    if (inner.current) {
      inner.current.rotation.y += delta * 0.12
      inner.current.rotation.x += delta * 0.05
    }
  })

  return (
    <group ref={group}>
      {/* nucleus: small, hot, and the only near-white thing in the pearl */}
      <mesh scale={0.07}>
        <icosahedronGeometry args={[1, 4]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh scale={0.15}>
        <icosahedronGeometry args={[1, 3]} />
        <meshBasicMaterial color="#e2ebff" transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>

      {/* the glass shell, and the rim line on top of it */}
      <mesh scale={1}>
        <icosahedronGeometry args={[1, 5]} />
        <primitive object={glass} attach="material" />
      </mesh>
      <mesh scale={1.004}>
        <icosahedronGeometry args={[1, 5]} />
        <primitive object={rimMaterial} attach="material" />
      </mesh>

      {/* concentric structure seen through the glass: thin interior rings, the way the reference's
          pearl shows its rings on both faces. Solid inner spheres read as a grey dome instead. */}
      <group ref={inner}>
        {[0.78, 0.58, 0.38].map((r, i) => (
          <mesh key={r} rotation={[Math.PI / 2, i * 0.22, 0]}>
            <torusGeometry args={[r, 0.006, 6, 128]} />
            <meshBasicMaterial color="#cfdcff" transparent opacity={0.22 - i * 0.04} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>

      <sprite scale={[0.75, 0.75, 1]}>
        <spriteMaterial map={halo} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.05} toneMapped={false} />
      </sprite>
      <sprite scale={[1.5, 1.5, 1]}>
        <spriteMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.03} toneMapped={false} />
      </sprite>

      {/* two thin rings, tilted like the reference's: they read as glass orbits, not hoops */}
      <group ref={ringA} rotation={[1.32, 0, 0.34]}>
        <mesh>
          <torusGeometry args={[1.3, 0.006, 6, 192]} />
          <meshBasicMaterial color={RING_A} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh rotation={[0.16, 0.4, 0]}>
          <torusGeometry args={[1.52, 0.004, 6, 192]} />
          <meshBasicMaterial color={RING_B} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <group ref={ringB} rotation={[1.72, 0.28, -0.62]}>
        <mesh>
          <torusGeometry args={[1.16, 0.004, 6, 192]} />
          <meshBasicMaterial color={RING_B} transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>

      {streak && <Streak />}
    </group>
  )
}

/**
 * The trail: a thin white core inside a wider lavender plume, both tapering away from the pearl, with
 * a few sparks riding along it. In the reference the trail is the only strongly coloured element in
 * the frame, which is what makes the pearl read as falling rather than floating.
 */
function Streak() {
  const core = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uLength: { value: 11 } },
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
            float along = vUv.y;                        // 0 at the pearl, 1 at the tip
            float body = pow(1.0 - along, 2.2);
            float edge = pow(sin(vUv.x * 3.14159), 2.2);
            gl_FragColor = vec4(uColor, body * edge * 0.42);
          }
        `,
      }),
    [],
  )
  const plume = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: TRAIL } },
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
            float along = vUv.y;
            float body = pow(1.0 - along, 1.4);
            float edge = pow(sin(vUv.x * 3.14159), 1.3);
            gl_FragColor = vec4(uColor, body * edge * 0.22);
          }
        `,
      }),
    [],
  )
  return (
    <group rotation={[-0.16, 0, 0.5]}>
      {/* the trail drags behind the pearl: +z is backwards along the fall, tipped up and to the
          side so it reads as a wake rather than as a beam pointed at the lens */}
      <mesh position={[0, 0, 3.1]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.3, 5.6, 24, 1, true]} />
        <primitive object={plume} attach="material" />
      </mesh>
      <mesh position={[0, 0, 2.6]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.07, 4.8, 18, 1, true]} />
        <primitive object={core} attach="material" />
      </mesh>
    </group>
  )
}
