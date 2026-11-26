import { useEffect } from 'react'
import type { JSX } from 'react'
import { Scene1Space } from './scenes/Scene1Space'
import { Scene2Clouds } from './scenes/Scene2Clouds'
import { Scene3Forest } from './scenes/Scene3Forest'
import { Scene4Lake } from './scenes/Scene4Lake'
import { Scene5Desert } from './scenes/Scene5Desert'
import { Scene6Ice } from './scenes/Scene6Ice'
import { Scene7Descent } from './scenes/Scene7Descent'
import { Scene8Seabed } from './scenes/Scene8Seabed'

/**
 * The app is the picture. `?scene=1..8` mounts exactly one scene, full-bleed, with no interface at
 * all: no header, no chapter copy, no progress, no sound controls, no footer. The only interaction
 * is the pointer's fluid trail, which lives in the post chain.
 *
 * Scenes 3–8 are not built yet and answer with an empty sky rather than a blank screen.
 */

const SCENES: Record<number, () => JSX.Element> = {
  1: Scene1Space,
  2: Scene2Clouds,
  3: Scene3Forest,
  4: Scene4Lake,
  5: Scene5Desert,
  6: Scene6Ice,
  7: Scene7Descent,
  8: Scene8Seabed,
}

export default function App({ scene = 1 }: { scene?: number }) {
  useEffect(() => {
    document.documentElement.dataset.scene = String(scene)
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.background = '#04060c'
    document.body.style.overflow = 'hidden'
    document.body.style.background = '#04060c'
  }, [scene])

  const Scene = SCENES[scene]

  return (
    <div
      data-scene={scene}
      data-testid="scene"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#04060c',
        touchAction: 'none',
      }}
    >
      {Scene ? (
        <Scene />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(120% 90% at 70% 15%, #101a30 0%, #070b16 45%, #04060c 100%)',
          }}
        />
      )}
    </div>
  )
}
