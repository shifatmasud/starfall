import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import type { MotionValue } from 'framer-motion'
import * as THREE from 'three'
import { journey } from './atmosphereState'
import { REDUCED_MOTION } from './quality'
import { LAST, orbAt, stationAt, tangentAt } from '../world/path'

/**
 * The camera — a third-person chase, like an open-world game.
 *
 * The star leads along the world spline (`path.ts`); the lens trails behind it at a distance the
 * station table keys per chapter, rides a little above, and looks straight at it, so the star is
 * dead centre in every frame while the world sweeps past.
 *
 * Everything that makes it feel hand-flown rather than bolted on:
 *  · a critically damped spring (w = 3 rad/s, sub-stepped at 120 Hz, so an 8 fps phone behaves like
 *    a 60 fps laptop) carries the lens toward its chase point — it leans into the turns instead of
 *    snapping to them;
 *  · banking roll keyed per station, plus a little more from the path's own horizontal curvature;
 *  · FOV that opens with speed and settles when the star slows;
 *  · a handheld breath of two incommensurate sines (centimetres);
 *  · pointer / touch look-around, with a per-chapter gain, damped through the same spring.
 */

class Damped {
  value: number
  velocity = 0
  constructor(
    initial: number,
    readonly omega = 3,
  ) {
    this.value = initial
  }
  step(target: number, dt: number) {
    const n = Math.max(1, Math.ceil(dt * 120))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      const accel = this.omega * this.omega * (target - this.value) - 2 * this.omega * this.velocity
      this.velocity += accel * h
      this.value += this.velocity * h
    }
    return this.value
  }
}

export function CameraRig({ progress }: { progress: MotionValue<number> }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const rig = useMemo(() => {
    return {
      pos: new THREE.Vector3(0, 220, 40),
      look: new THREE.Vector3(),
      orb: new THREE.Vector3(),
      tangent: new THREE.Vector3(0, 0, -1),
      flat: new THREE.Vector3(0, 0, -1),
      prevTangent: new THREE.Vector3(0, 0, -1),
      chase: new THREE.Vector3(),
      parX: new Damped(0),
      parY: new Damped(0),
      fov: new Damped(38, 4),
      lastP: 0,
      started: false,
      speed: 0,
      bankRoll: 0,
    }
  }, [])

  useFrame((state, delta) => {
    const dt = Math.min(0.05, delta)
    const p = Math.min(1, Math.max(0, progress.get()))
    const u = p * LAST
    journey.u = u
    journey.p = p
    journey.beat = Math.round(u)
    journey.time = state.clock.elapsedTime

    // the star's station and heading
    orbAt(p, rig.orb)
    tangentAt(p, rig.tangent)
    const st = stationAt(u)

    // scroll speed → a small FOV surge while the fall accelerates
    const raw = (p - rig.lastP) / Math.max(dt, 1e-3)
    rig.lastP = p
    rig.speed += (Math.min(6, Math.abs(raw) * 7) - rig.speed) * Math.min(1, dt * 4)

    // the chase point: behind the star along its *horizontal* heading, a little above — a
    // third-person chase, never a crane looking down on the subject
    rig.flat.set(rig.tangent.x, 0, rig.tangent.z)
    if (rig.flat.lengthSq() < 1e-6) rig.flat.set(0, 0, -1)
    rig.flat.normalize()
    rig.chase.copy(rig.orb).addScaledVector(rig.flat, -st.trail)
    rig.chase.y += st.lift

    // critically damped follow, with the pointer's parallax folded into the target
    const pointer = REDUCED_MOTION ? { x: 0, y: 0 } : state.pointer
    journey.px += (pointer.x - journey.px) * Math.min(1, dt * 5)
    journey.py += (pointer.y - journey.py) * Math.min(1, dt * 5)
    const px = rig.parX.step(journey.px * 0.30 * st.par, dt)
    const py = rig.parY.step(journey.py * 0.15 * st.par, dt)
    rig.chase.x += px
    rig.chase.y += py

    // an exponential chase: frame-rate independent, and it leans into a turn without snapping
    if (!rig.started || rig.pos.distanceTo(rig.chase) > 22) {
      // a scroll jump (or the first frame): the chase takes up its station at once, never swings
      rig.pos.copy(rig.chase)
      rig.started = true
    }
    rig.pos.lerp(rig.chase, 1 - Math.exp(-dt * 6.5))

    // handheld breath (centimetres), gone under reduced motion
    const time = state.clock.elapsedTime
    const breath = REDUCED_MOTION ? 0 : 1
    const bx = (Math.sin(time * 0.41) * 0.05 + Math.sin(time * 0.87 + 1.7) * 0.02) * breath
    const by = (Math.sin(time * 0.53 + 0.6) * 0.04 + Math.sin(time * 1.13) * 0.014) * breath

    // banking: the keyed roll plus the path's own horizontal turn
    const turn =
      (rig.tangent.x * rig.prevTangent.z - rig.tangent.z * rig.prevTangent.x) /
      Math.max(dt, 1e-3)
    rig.prevTangent.copy(rig.tangent)
    rig.bankRoll += (THREE.MathUtils.clamp(-turn * 0.06, -0.1, 0.1) - rig.bankRoll) * Math.min(1, dt * 2)
    const roll = st.roll + rig.bankRoll + Math.sin(time * 0.37 + 2.1) * 0.0008 * breath

    camera.position.set(rig.pos.x + bx, rig.pos.y + by, rig.pos.z)
    rig.look.copy(rig.orb)
    // the pointer also nudges the aim a touch, so the world slides rather than the star
    rig.look.x += px * 0.25
    rig.look.y += py * 0.2
    camera.up.set(0, 1, 0)
    camera.lookAt(rig.look)
    camera.rotateZ(roll - journey.px * 0.006)

    const wantFov = st.fov + Math.min(1.8, rig.speed * 0.4)
    if (Math.abs(camera.fov - wantFov) > 0.01) {
      camera.fov = wantFov
      camera.updateProjectionMatrix()
    }
  })

  return null
}
