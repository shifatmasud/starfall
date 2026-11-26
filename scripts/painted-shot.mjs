#!/usr/bin/env node
/**
 * Scene shots in SwiftShader (software WebGL) for the reference comparison.
 *
 *   node scripts/painted-shot.mjs 3 4 5          # 1050x700 (the reference's 3:2) of each scene
 *   SIZES=390x844,1440x900 node scripts/painted-shot.mjs 3
 *
 * Writes artifacts/shot-s<N>-<W>x<H>.png. Requires `npm run build` first.
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ['3']
const sizes = (process.env.SIZES ?? '1050x700').split(',').map((s) => s.split('x').map(Number))
const extra = process.env.Q ?? ''
const PORT = 4189
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', env: { ...process.env, CI: '1' } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) break } catch {} await sleep(250) }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'] })
try {
  for (const s of scenes) for (const [w, h] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()) })
    await page.goto(`http://127.0.0.1:${PORT}/?scene=${s}&qa=1${extra}`, { waitUntil: 'load' })
    await page.waitForFunction(() => (window.__ORB_FRAME__ ?? 0) > 4, null, { timeout: 120000 }).catch(() => errs.push('no frames'))
    await sleep(600)
    await page.screenshot({ path: `artifacts/shot-s${s}-${w}x${h}.png` })
    console.log(`scene ${s} ${w}x${h}`, errs.length ? errs.slice(0, 4).join(' | ').slice(0, 1500) : 'ok')
    await page.close()
  }
} finally {
  await browser.close()
  server.kill('SIGTERM')
}
