// Dev helper: prints the camera spline (CameraRig POSES) per beat so the orb
// stage numbers can be chosen against the real lens.
import * as THREE from 'three'

const POSES = [
  { pos: [0, 92, 34], target: [0, 86, -90], fov: 40 },
  { pos: [0.9, 30, 22], target: [0, 26, -70], fov: 45 },
  { pos: [1.7, 6.1, 15], target: [0, 3.4, -50], fov: 47 },
  { pos: [0.5, 0.55, 11], target: [0, -0.8, -45], fov: 49 },
  { pos: [0, -6.2, 9], target: [0, 9.5, -30], fov: 53 },
]

const curve = new THREE.CatmullRomCurve3(POSES.map((p) => new THREE.Vector3(...p.pos)), false, 'centripetal')
const targets = new THREE.CatmullRomCurve3(POSES.map((p) => new THREE.Vector3(...p.target)), false, 'centripetal')

const cam = new THREE.PerspectiveCamera(40, 1440 / 900, 0.5, 1600)

for (let i = 0; i <= 8; i++) {
  const u = (i / 8) * 4
  const t = Math.min(0.9999, u / 4)
  const pos = curve.getPoint(t)
  const look = targets.getPoint(t)
  cam.position.copy(pos)
  cam.lookAt(look)
  cam.updateMatrixWorld()
  const fwd = cam.getWorldDirection(new THREE.Vector3())
  const i0 = Math.min(4, Math.floor(u))
  const f = u - i0
  const bi = Math.min(3, i0)
  const fov = POSES[bi].fov + (POSES[bi + 1].fov - POSES[bi].fov) * (f * f * (3 - 2 * f))
  cam.fov = fov
  cam.updateProjectionMatrix()
  process.stdout.write(
    `u=${u.toFixed(2)} cam=(${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)}) ` +
      `fwd=(${fwd.x.toFixed(3)},${fwd.y.toFixed(3)},${fwd.z.toFixed(3)}) fov=${fov.toFixed(1)} ` +
      `look=(${look.x.toFixed(1)},${look.y.toFixed(1)},${look.z.toFixed(1)})\n`,
  )
}

// for a point straight along the view ray at distance d: report screen position
function screen(d, drop, label) {
  const u = label
  const t = Math.min(0.9999, u / 4)
  const pos = curve.getPoint(t)
  const look = targets.getPoint(t)
  cam.position.copy(pos)
  cam.lookAt(look)
  const i0 = Math.min(4, Math.floor(u))
  const f = u - i0
  const bi = Math.min(3, i0)
  cam.fov = POSES[bi].fov + (POSES[bi + 1].fov - POSES[bi].fov) * (f * f * (3 - 2 * f))
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld()
  const fwd = cam.getWorldDirection(new THREE.Vector3())
  const p = pos.clone().addScaledVector(fwd, d)
  p.y += drop
  const ndc = p.clone().project(cam)
  return { p, ndc }
}

const STAGE = [
  [0, 30, 0],
  [1, 20, 0],
  [2, 16, -2.6],
  [3, 10.5, -1.35],
  [4, 10, 0],
]
for (const [u, d, drop] of STAGE) {
  const { p, ndc } = screen(d, drop, u)
  const orbPx = (2 * Math.atan(0.62 / d) * 180) / Math.PI
  const ringPx = (2 * Math.atan(1.34 / d) * 180) / Math.PI
  console.log(
    `beat ${u}: d=${d} drop=${drop} world=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) ` +
      `ndc=(${ndc.x.toFixed(3)},${ndc.y.toFixed(3)}) orb=${orbPx.toFixed(1)}deg rings=${ringPx.toFixed(1)}deg`,
  )
}
