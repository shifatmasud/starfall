import { createElement } from 'react'
import { AtmosphericDust } from './AtmosphericDust'
import { GoldenStar } from './GoldenStar'
import type { OrbNumberRef, OrbPointer, OrbPointerRef } from './GoldenStar'

/**
 * Stream 1 — the fallen star and the air it carries.
 *
 * `OrbScene` is the whole stream in one element: the golden core and the atmospheric dust. There
 * are no orbital rings and no halo shell — the glow is the light itself, caught by the selective
 * bloom in `PostFX`. It reads the page's scroll and pointer through refs (never through props or
 * state), so scrolling never re-renders React and the scene can never jitter against the page.
 */

export type OrbTier = 'low' | 'high'

export type OrbSceneProps = {
  /** Scroll progress 0..1 for the whole journey. */
  progressRef: OrbNumberRef
  /** Pointer in -1..1 screen units; `null` while it has not moved. */
  pointerRef: OrbPointerRef
  /** `low` halves the dust counts (phones); the star is unchanged. */
  tier: OrbTier
}

// No JSX here on purpose: this stays a plain `.ts` module.
export function OrbScene({ progressRef, pointerRef, tier }: OrbSceneProps) {
  return createElement(
    'group',
    { name: 'orb' },
    createElement(GoldenStar, { progressRef, pointerRef }),
    createElement(AtmosphericDust, { progressRef, pointerRef, tier }),
  )
}

export { AtmosphericDust, GoldenStar }
export type { OrbNumberRef, OrbPointer, OrbPointerRef }
