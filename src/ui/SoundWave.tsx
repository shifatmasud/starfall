import { useEffect, useRef } from 'react'

/**
 * The 22×14 sound wave, ported from `love-letter/js/audio.js` §1.9g: `amp` eases 0↔1 over 280 ms
 * with `easeInOut`, `phase += dt * 3.2`, a sine envelope so the ends stay put, stroke 1.4 with
 * round caps. The runner stops itself once it is muted and settled (or the tab is hidden) and
 * re-kicks on the toggle and on `visibilitychange`.
 *
 * `animate={false}` draws one still frame at the shared phase — the ink flood's copy of the wave,
 * so the pill never runs two loops for the same pixels.
 */

const W = 22
const H = 14
const MORPH_MS = 280
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

export function SoundWave({
  muted,
  phaseRef,
  animate = true,
}: {
  muted: boolean
  phaseRef: { current: number }
  animate?: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const amp = useRef(muted ? 0 : 1)
  const from = useRef(amp.current)
  const to = useRef(amp.current)
  const t0 = useRef(0)
  const raf = useRef(0)
  const lastT = useRef(0)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    el.width = Math.round(W * dpr)
    el.height = Math.round(H * dpr)
    const g = el.getContext('2d')
    if (!g) return
    g.scale(dpr, dpr)

    const paint = () => {
      g.clearRect(0, 0, W, H)
      g.lineWidth = 1.4
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.strokeStyle = '#fafafa'
      g.beginPath()
      for (let x = 1; x <= W - 1; x += 0.5) {
        const env = Math.sin((Math.PI * (x - 1)) / (W - 2))
        const y = H / 2 + Math.sin(x * 0.62 - phaseRef.current) * 3 * amp.current * env
        if (x === 1) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    }

    if (!animate) {
      amp.current = muted ? 0 : 1
      paint()
      return
    }

    const draw = (now: number) => {
      raf.current = 0
      const dt = Math.min(0.05, Math.max(0, now - lastT.current) / 1000)
      lastT.current = now
      const target = muted ? 0 : 1
      if (target !== to.current) {
        from.current = amp.current
        to.current = target
        t0.current = now
      }
      const k = Math.min(1, Math.max(0, (now - t0.current) / MORPH_MS))
      amp.current = from.current + (to.current - from.current) * easeInOut(k)
      phaseRef.current += dt * 3.2
      paint()
      if ((target === 0 && k >= 1) || document.hidden) return
      raf.current = requestAnimationFrame(draw)
    }
    const kick = () => {
      if (!raf.current) {
        lastT.current = performance.now()
        raf.current = requestAnimationFrame(draw)
      }
    }
    kick()
    const onVisibility = () => {
      if (!document.hidden) kick()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = 0
    }
  }, [muted, phaseRef, animate])

  return <canvas ref={canvas} className="snd-wave" width={W} height={H} aria-hidden="true" />
}
