# Star Fall

A scroll-driven voyage: a small golden star falls out of the starry sky, through the morning
clouds, into a forest, over a lake in the middle of a meadow, across a desert oasis, over a frozen
land, out to the open sea — and down to the deep ocean floor, where it comes to rest.

Built with React 18, @react-three/fiber, three (WebGL2 / GLSL ES 3.00) and framer-motion. The post
chain is selective HDR bloom + ACES filmic, with the surface-tension / Lusion cursor trail ported
1:1 as the interactive layer.

- `src/scene/atmosphere/` — sky, clouds, stars, weather, the camera rig, the atmosphere table
- `src/scene/world/` — terrain, meadow, wildflowers, forest, horizon, sea props
- `src/scene/water/` — lake surface, ripple field, air–water split, kelp, seabed, spray
- `src/gl/` — WebGL2 context, the fluid cursor trail, the post chain

```
npm install
npm run build      # tsc --noEmit && vite build
npm run qa:visual  # SwiftShader screenshots of every chapter, desktop + mobile
```

Live: https://starfall.vercel.app

<!-- deploy: vite build, output dist -->
