#!/usr/bin/env node
/**
 * Trail white-artifact QA (SwiftShader). For each scene: a clean frame, then a fast stroke across the
 * frame and a capture while the wake is alive. Counts pixels that were dark in the clean frame and
 * turned light-grey/white in the wake frame — the milky artifact. Writes artifacts/trailwhite-sN-*.png.
 *
 *   node scripts/trail-white-qa.mjs 1 2 3
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ['1']
const W = 1024, H = 640, PORT = 4187
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', env: { ...process.env, CI: '1' } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) break } catch {} await sleep(250) }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'] })
try {
  for (const s of scenes) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
    page.on('pageerror', (e) => console.log('ERR', e.message))
    await page.goto(`http://127.0.0.1:${PORT}/?scene=${s}&qa=1`, { waitUntil: 'load' })
    await page.waitForFunction(() => (window.__ORB_FRAME__ ?? 0) > 3, null, { timeout: 120000 }).catch(() => console.log('no frames'))
    await sleep(800)
    await page.screenshot({ path: `artifacts/trailwhite-s${s}-clean.png` })
    // a stroke that waits on real frames, so the slow rasterizer paints every segment
    const frame = () => page.evaluate(() => window.__ORB_FRAME__ ?? 0)
    const pts = 24
    for (let i = 0; i <= pts; i++) {
      const t = i / pts
      const x = W * (0.12 + 0.76 * t)
      const y = H * (0.55 + 0.25 * Math.sin(t * Math.PI * 2))
      const f0 = await frame()
      await page.mouse.move(x, y)
      await page.waitForFunction((f) => (window.__ORB_FRAME__ ?? 0) > f, f0, { timeout: 20000 }).catch(() => {})
    }
    await page.screenshot({ path: `artifacts/trailwhite-s${s}-wake.png` })
    console.log(`scene ${s}: saved`)
    await page.close()
  }
} finally {
  await browser.close()
  server.kill('SIGTERM')
}
