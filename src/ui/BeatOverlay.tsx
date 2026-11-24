import { motion, useTransform, type MotionValue } from 'framer-motion'
import { useEffect, type ReactNode } from 'react'

/**
 * The pinned text slot — Surface Tension's `.slot`, ported (love-letter §1.4 / §1.8).
 *
 * The text never moves on its own: each line has a hard mask and its progress is derived from
 * scroll, so the words roll up through the mask as you scroll and roll out the top when the next
 * beat arrives. The reveal is `surface-tension`'s exact formula, line for line:
 *
 *     translate3d(0, (1 - v) * 102%, 0) skewX(2.52° · tl) scaleY(1 / (1 + 0.035 · |tl|))
 *     tl = clamp(1 - v, -1, 1)
 *
 * A second, much smaller transform rides the pointer (`--tx` / `--ty`): the type sits a few pixels
 * away from the scene under the hand, so the page has depth even before the scroll moves.
 */

export type BeatCopy = {
  id: string
  eyebrow: string
  title: string[]
  body: string[]
}

const COUNT = 8

/** [in-start, in-end, out-start, out-end] per beat, in scroll progress (0 → 1). */
const WINDOWS: [number, number, number, number][] = Array.from({ length: COUNT }, (_, i) => {
  const start = i / COUNT
  if (i === 0) return [0, 0, 0.041, 0.112] as [number, number, number, number]
  if (i === COUNT - 1) return [start + 0.012, start + 0.055, 1.4, 1.5] as [number, number, number, number]
  return [start + 0.012, start + 0.055, start + 0.086, start + 0.118] as [number, number, number, number]
})

function Line({
  progress,
  window: range,
  index,
  children,
}: {
  progress: MotionValue<number>
  window: [number, number, number, number]
  index: number
  children: ReactNode
}) {
  const shift = index * 0.0075
  const v = useTransform(
    progress,
    [range[0] + shift, range[1] + shift, range[2] + shift, range[3] + shift],
    [0, 1, 1, 2],
    { clamp: true },
  )
  const transform = useTransform(v, (value) => {
    const tl = Math.max(-1, Math.min(1, 1 - value))
    const y = ((1 - value) * 102).toFixed(2)
    return `translate3d(0, ${y}%, 0) skewX(${(2.52 * tl).toFixed(3)}deg) scaleY(${(
      1 /
      (1 + 0.035 * Math.abs(tl))
    ).toFixed(4)})`
  })
  const opacity = useTransform(v, (value) => (value >= 2 ? 0 : 1))
  return (
    <span className="slot__line">
      <motion.span className="slot__in" style={{ transform, opacity }}>
        {children}
      </motion.span>
    </span>
  )
}

export function BeatOverlay({ progress, beats }: { progress: MotionValue<number>; beats: BeatCopy[] }) {
  // the type's own parallax: written to CSS variables, never through React state
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let x = 0
    let y = 0
    let tx = 0
    let ty = 0
    const onMove = (event: PointerEvent) => {
      x = event.clientX / window.innerWidth - 0.5
      y = event.clientY / window.innerHeight - 0.5
    }
    const tick = () => {
      tx += (x - tx) * 0.08
      ty += (y - ty) * 0.08
      document.documentElement.style.setProperty('--tx', `${(-tx * 14).toFixed(2)}px`)
      document.documentElement.style.setProperty('--ty', `${(-ty * 10).toFixed(2)}px`)
      raf = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="slot__beat" aria-live="polite">
      {beats.map((beat, beatIndex) => (
        <div className="slot__copy" key={beat.id} data-beat={beat.id}>
          <p className="slot__eyebrow">
            <Line progress={progress} window={WINDOWS[beatIndex]} index={0}>
              {beat.eyebrow}
            </Line>
          </p>
          {beatIndex === 0 ? (
            <h1 className="slot__title">
              {beat.title.map((line, i) => (
                <Line key={line} progress={progress} window={WINDOWS[beatIndex]} index={i + 1}>
                  {line}
                </Line>
              ))}
            </h1>
          ) : (
            <h2 className="slot__title">
              {beat.title.map((line, i) => (
                <Line key={line} progress={progress} window={WINDOWS[beatIndex]} index={i + 1}>
                  {line}
                </Line>
              ))}
            </h2>
          )}
          <p className="slot__body">
            {beat.body.map((line, i) => (
              <Line
                key={line}
                progress={progress}
                window={WINDOWS[beatIndex]}
                index={beatIndex === 0 ? i + 2 : i + 1 + beat.title.length}
              >
                {line}
              </Line>
            ))}
          </p>
        </div>
      ))}
    </div>
  )
}
