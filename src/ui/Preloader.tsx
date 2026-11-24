import { useEffect, useRef, useState } from 'react'

/**
 * The first paint: a small glass capsule on black whose water fills left to right with the real
 * load, then the black slides up (1.3 s, cubic-bezier(.65,0,.35,1)) — love-letter §1.10.
 *
 * Drawn in canvas 2D on purpose: love-letter's capsule is a raymarched shader with a pixel
 * self-test and a 2D fallback, and the fallback is the part that always runs on Shifat's Adreno
 * 506 anyway. Two waves (the back one darker) and a slosh tilt driven by the fill *speed*.
 */

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
const DPR = Math.min(2, window.devicePixelRatio || 1)
const CW = 176
const CH = 72

export function Preloader({
  progress,
  done,
  onReveal,
  onGone,
}: {
  progress: number
  done: boolean
  /** the black has started to slide up: the page underneath may scroll */
  onReveal: () => void
  /** the black has fully left: the first painted frame is what the visitor sees */
  onGone: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const shown = useRef(0)
  const slosh = useRef(0)
  const sloshV = useRef(0)
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)
  const progressRef = useRef(progress)
  progressRef.current = progress
  const doneRef = useRef(done)
  doneRef.current = done
  const goneRef = useRef(false)
  goneRef.current = gone

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    el.width = Math.round(CW * DPR)
    el.height = Math.round(CH * DPR)
    const g = el.getContext('2d')
    if (!g) return
    g.scale(DPR, DPR)

    let raf = 0
    let last = performance.now()
    let shownAtEnd = false

    const draw = (t: number) => {
      const r = CH * 0.3
      const left = CW * 0.12
      const width = CW * 0.76
      const top = CH / 2 - r
      const fillX = left + width * shown.current
      const S = Math.max(-0.6, Math.min(0.6, slosh.current))

      g.clearRect(0, 0, CW, CH)
      g.fillStyle = '#000'
      g.fillRect(0, 0, CW, CH)

      const capsule = (x: number, y: number, w: number, h: number, rad: number) => {
        g.beginPath()
        g.moveTo(x + rad, y)
        g.arcTo(x + w, y, x + w, y + h, rad)
        g.arcTo(x + w, y + h, x, y + h, rad)
        g.arcTo(x, y + h, x, y, rad)
        g.arcTo(x, y, x + w, y, rad)
        g.closePath()
      }

      g.save()
      capsule(left, top, width, 2 * r, r)
      g.clip()
      g.fillStyle = '#05080c'
      g.fillRect(left, top, width, 2 * r)

      const wave = (offset: number, amp: number, phase: number, speed: number) => {
        g.beginPath()
        g.moveTo(left - 2, top - 2)
        for (let k = 0; k <= 24; k++) {
          const y = top - 2 + ((2 * r + 4) * k) / 24
          const q = (k / 24) * 2 - 1
          g.lineTo(fillX + offset + amp * Math.sin(q * 3.2 + t * speed + phase) * r * 0.35 - S * q * r * 0.5, y)
        }
        g.lineTo(left - 2, top + 2 * r + 2)
        g.closePath()
      }

      if (shown.current > 0.002) {
        wave(r * 0.12, 1, 1.7, 5)
        g.fillStyle = '#0b2f55'
        g.fill()
        wave(0, 1.2, 0, 6)
        const grad = g.createLinearGradient(0, top, 0, top + 2 * r)
        grad.addColorStop(0, '#5fb4f2')
        grad.addColorStop(0.55, '#2b8fd6')
        grad.addColorStop(1, '#0d4f8f')
        g.fillStyle = grad
        g.fill()
        g.strokeStyle = 'rgba(225,243,255,.55)'
        g.lineWidth = 1.5
        g.beginPath()
        for (let k = 0; k <= 24; k++) {
          const q = (k / 24) * 2 - 1
          const x = fillX + 1.2 * Math.sin(q * 3.2 + t * 6) * r * 0.35 - S * q * r * 0.5
          const y = top + (2 * r * k) / 24
          if (k) g.lineTo(x, y)
          else g.moveTo(x, y)
        }
        g.stroke()
      }

      // glass highlight
      g.fillStyle = 'rgba(255,255,255,.16)'
      capsule(left + r * 0.5, top + r * 0.22, width - r, r * 0.32, r * 0.16)
      g.fill()
      g.restore()

      g.strokeStyle = 'rgba(200,215,230,.55)'
      g.lineWidth = 1.5
      capsule(left, top, width, 2 * r, r)
      g.stroke()
    }

    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, now - last) / 1000)
      last = now
      // a tiny creep so a stalled load still feels alive, capped short of the end
      const end = doneRef.current
      const goal = end ? 1 : Math.min(0.97, progressRef.current + 0.02)
      const previous = shown.current
      shown.current = Math.min(goal, shown.current + Math.max((goal - shown.current) * Math.min(1, dt * (end ? 9 : 5)), end ? dt * 0.9 : 0))
      if (shown.current < previous) shown.current = previous
      if (!REDUCED) {
        sloshV.current += (-slosh.current * 90 - sloshV.current * 7 + ((shown.current - previous) / Math.max(dt, 1e-3)) * 6) * dt
        slosh.current += sloshV.current * dt
        slosh.current = Math.max(-0.6, Math.min(0.6, slosh.current))
      }
      draw((now - last) / 1000 + 12)
      if (end && shown.current >= 0.999 && !shownAtEnd) {
        shownAtEnd = true
        setLeaving(true)
        window.setTimeout(onReveal, REDUCED ? 60 : 700)
        window.setTimeout(() => {
          setGone(true)
          onGone()
        }, REDUCED ? 400 : 1400)
      }
      if (!goneRef.current) raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [onGone, onReveal])

  if (gone) return null

  return (
    <div
      id="pre"
      className={leaving ? 'up' : undefined}
      role="progressbar"
      aria-label="Loading"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <canvas ref={canvas} width={CW * DPR} height={CH * DPR} />
    </div>
  )
}
