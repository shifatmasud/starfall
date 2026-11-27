import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { applyPainterlySurface } from '../scan/Fit'
import { lakeHeight, lakeShoreZ } from './LakeGround'

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return s - Math.floor(s)
}

export function LakeShore() {
  const pebbleRef = useRef<THREE.InstancedMesh>(null)

  const { geo, mat, pebbleGeo, pebbleMat, pebbles } = useMemo(() => {
    const segsX = 200
    const segsZ = 10
    const width = 34
    const ribbonDepth = 1.05

    const g = new THREE.PlaneGeometry(width, ribbonDepth, segsX, segsZ)
    g.rotateX(-Math.PI / 2)
    g.translate(-2.5, 0, 0)

    const pos = g.attributes.position as THREE.BufferAttribute
    const uv = g.attributes.uv as THREE.BufferAttribute
    const slopeAttr = new Float32Array(pos.count)

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const v = uv.getY(i)
      const shoreZ = lakeShoreZ(x)
      const z = shoreZ + (v - 0.36) * ribbonDepth
      const groundY = lakeHeight(x, z)
      const y = Math.max(0.022, groundY + 0.005)
      pos.setXYZ(i, x, y, z)

      // Compute bank slope along z so foam thins out naturally where bank is steep
      const dy = lakeHeight(x, shoreZ + 0.4) - lakeHeight(x, shoreZ - 0.2)
      slopeAttr[i] = dy / 0.6
    }
    pos.needsUpdate = true
    g.setAttribute('aSlope', new THREE.BufferAttribute(slopeAttr, 1))
    g.computeVertexNormals()

    const m = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      uniforms: {
        uFoamColor: { value: new THREE.Color('#eef6ff') },
        uWetSandColor: { value: new THREE.Color('#2c3c48') },
      },
      vertexShader: /* glsl */ `
        attribute float aSlope;
        out vec2 vUv;
        out vec3 vWorldPos;
        out float vSlope;
        void main() {
          vUv = uv;
          vSlope = aSlope;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        in vec2 vUv;
        in vec3 vWorldPos;
        in float vSlope;
        uniform vec3 uFoamColor;
        uniform vec3 uWetSandColor;
        layout(location = 0) out vec4 fragColor;

        float h21(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        float vn(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
            mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }
        float fbm(vec2 p) {
          return vn(p) * 0.55 + vn(p * 2.17 + 3.7) * 0.30 + vn(p * 4.39 - 1.9) * 0.15;
        }

        void main() {
          // Kill right-hand shore wedge (x > 5.5) and left ribbon end smoothly
          float endFade = smoothstep(-18.5, -13.0, vWorldPos.x) * (1.0 - smoothstep(2.5, 6.2, vWorldPos.x));
          if (endFade <= 0.001) discard;

          // Thin to zero where bank is steep
          float gentleBank = 1.0 - smoothstep(0.14, 0.32, vSlope);

          float n = fbm(vWorldPos.xz * vec2(2.4, 5.2));
          float micro = vn(vWorldPos.xz * 18.0);

          float edge = 0.36 + (n - 0.5) * 0.20;
          float dist = abs(vUv.y - edge);

          // Delicate broken lace line
          float lace = smoothstep(0.065, 0.01, dist) * smoothstep(0.46, 0.78, n + micro * 0.22) * gentleBank;
          // Dark wet-sand band immediately landward of the waterline
          float wetBand = smoothstep(0.28, 0.42, vUv.y) * (1.0 - smoothstep(0.55, 0.88, vUv.y));
          float alpha = clamp((lace * 0.34 + wetBand * 0.24 * (0.6 + 0.4 * n)) * endFade, 0.0, 0.44);

          float camD = length(vWorldPos - cameraPosition);
          alpha *= 1.0 - smoothstep(9.0, 22.0, camD);

          vec3 col = mix(uWetSandColor, uFoamColor, lace);
          fragColor = vec4(col, alpha);
        }
      `,
    })

    // High-subdivision smooth pale shoreline pebbles
    const pGeo = new THREE.IcosahedronGeometry(0.045, 3)
    const pPos = pGeo.attributes.position as THREE.BufferAttribute
    const pCols = new Float32Array(pPos.count * 3)
    const cPebbleLit = new THREE.Color('#dcdad0')
    const cPebbleWet = new THREE.Color('#6c7a84')
    const tmp = new THREE.Color()
    for (let i = 0; i < pPos.count; i++) {
      const vx = pPos.getX(i)
      const vy = pPos.getY(i)
      const vz = pPos.getZ(i)
      pPos.setXYZ(i, vx * 1.2, vy * 0.52, vz * 0.95)
      const up = THREE.MathUtils.smoothstep(vy, -0.03, 0.035)
      tmp.copy(cPebbleWet).lerp(cPebbleLit, up)
      pCols[i * 3] = tmp.r
      pCols[i * 3 + 1] = tmp.g
      pCols[i * 3 + 2] = tmp.b
    }
    pPos.needsUpdate = true
    pGeo.computeVertexNormals()
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCols, 3))

    const pMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.78,
      metalness: 0,
    })
    applyPainterlySurface(pMat, {
      soft: 0.85,
      rimColor: '#fff8e4',
      shadowTint: '#566674',
    })

    const pebbleList: { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number }[] = []
    for (let i = 0; i < 64; i++) {
      const x = -11.5 + hash(i * 2.1, 3.7) * 16.5
      const sz = lakeShoreZ(x)
      const z = sz + (hash(i * 4.3, 1.9) - 0.25) * 0.45
      const y = lakeHeight(x, z)
      if (y < 0.015 || y > 0.09) continue
      const sc = 0.65 + hash(i * 6.7, 5.1) * 1.1
      pebbleList.push({
        x,
        y: y - 0.004,
        z,
        sx: sc * (0.9 + hash(i, 7) * 0.45),
        sy: sc * 0.85,
        sz: sc * (0.9 + hash(i, 2) * 0.45),
        yaw: hash(i * 3.3, 8.1) * Math.PI * 2,
      })
    }

    return { geo: g, mat: m, pebbleGeo: pGeo, pebbleMat: pMat, pebbles: pebbleList }
  }, [])

  useLayoutEffect(() => {
    const pm = pebbleRef.current
    if (!pm) return
    const dummy = new THREE.Object3D()
    pebbles.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z)
      dummy.rotation.set(0, p.yaw, 0)
      dummy.scale.set(p.sx, p.sy, p.sz)
      dummy.updateMatrix()
      pm.setMatrixAt(idx, dummy.matrix)
    })
    pm.instanceMatrix.needsUpdate = true
  }, [pebbles])

  return (
    <group>
      <mesh geometry={geo} material={mat} renderOrder={2} />
      <instancedMesh ref={pebbleRef} args={[pebbleGeo, pebbleMat, pebbles.length]} />
    </group>
  )
}
