import { useRef } from 'react'
import { InkButton } from './InkButton'
import { SoundWave } from './SoundWave'

/** Shifat's mark: two mirrored rounded-quad strokes (love-letter `index.html` §1.3). */
const MARK =
  'M115.66 1.82L166.95 1.82A14 14 0 0 1 176.85 25.72L111.29 91.28A36 36 0 0 1 85.84 101.82L34.55 101.82A14 14 0 0 1 24.65 77.92L90.21 12.36A36 36 0 0 1 115.66 1.82ZM114.16 98.18L165.45 98.18A14 14 0 0 1 175.35 122.08L109.79 187.64A36 36 0 0 1 84.34 198.18L33.05 198.18A14 14 0 0 1 23.15 174.28L88.71 108.72A36 36 0 0 1 114.16 98.18Z'

export function Header({
  onDark,
  muted,
  onSound,
}: {
  onDark: boolean
  muted: boolean
  onSound: () => void
}) {
  const phase = useRef(0)
  const wave = (
    <span className="sroll ink-par">
      <span className="ir-a">
        <SoundWave muted={muted} phaseRef={phase} />
      </span>
      <span className="ir-b">
        <SoundWave muted={muted} phaseRef={phase} animate={false} />
      </span>
    </span>
  )
  return (
    <div className="hdr-fix">
      <div className="wrap">
        <header className={onDark ? 'on-dark' : undefined}>
          <a
            className="mark"
            href="https://shifatmasud-framer.vercel.app/"
            aria-label="Shifat Masud, portfolio"
            draggable={false}
          >
            <i>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 204 204" aria-hidden="true">
                <path fill="currentColor" d={MARK} />
              </svg>
            </i>
          </a>
          <InkButton kind="sound" label={muted ? 'Sound off' : 'Sound on'} pressed={!muted} onClick={onSound}>
            {wave}
          </InkButton>
        </header>
      </div>
    </div>
  )
}
