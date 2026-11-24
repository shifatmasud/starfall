import type { PointerEvent } from 'react'

const MARK =
  'M115.66 1.82L166.95 1.82A14 14 0 0 1 176.85 25.72L111.29 91.28A36 36 0 0 1 85.84 101.82L34.55 101.82A14 14 0 0 1 24.65 77.92L90.21 12.36A36 36 0 0 1 115.66 1.82ZM114.16 98.18L165.45 98.18A14 14 0 0 1 175.35 122.08L109.79 187.64A36 36 0 0 1 84.34 198.18L33.05 198.18A14 14 0 0 1 23.15 174.28L88.71 108.72A36 36 0 0 1 114.16 98.18Z'

/** The fixed dark curtain the painted sheet scrolls over (Cost of Design, love-letter §1.6). */
export function Footer() {
  const replay = (event: PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType === 'mouse') return
    const node = event.currentTarget
    node.classList.add('is-tap')
    window.setTimeout(() => node.classList.remove('is-tap'), 1000)
  }
  return (
    <footer>
      <div className="wrap">
        <a
          className="foot-mark"
          href="https://shifatmasud-framer.vercel.app/"
          aria-label="Shifat Masud, portfolio"
          draggable={false}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 204 204" aria-hidden="true">
            <path fill="#f5f3ef" d={MARK} />
          </svg>
        </a>
        <span>
          Star Fall. A scroll journey by{' '}
          <a
            className="foot-name"
            href="https://shifatmasud-framer.vercel.app/"
            aria-label="Shifat Masud, portfolio"
            draggable={false}
            onPointerDown={replay}
          >
            Shifat Masud
          </a>
        </span>
        <span className="dim">November 2026</span>
      </div>
    </footer>
  )
}
