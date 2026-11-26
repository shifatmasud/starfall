#!/usr/bin/env node
/**
 * Scene QA: headless Chromium on ANGLE/SwiftShader (CPU), one scene at a time.
 *
 *   node scripts/scene-qa.mjs 1            # ?scene=1, desktop + mobile
 *   QA_ONLY=mobile node scripts/scene-qa.mjs 1
 *
 * Fails on any console error or page error, and on a page that never drew a frame.
 */
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const SCENE = process.argv[2] ?? '1'
const PORT = Number(process.env.QA_PORT ?? 4180)
const BASE = `http://127.0.0.1:${PORT}/`
const OUT = path.resolve('artifacts')

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
].filter((v) => !process.env.QA_ONLY || v.name === process.env.QA_ONLY)

const CHROMIUM_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--disable-gpu-sandbox',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForServer(url, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error(`preview never answered at ${url}`)
}

const server = spawn(
  'npm',
  ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } },
)
server.stdout.on('data', (c) => process.stdout.write(`[preview] ${c}`))
server.stderr.on('data', (c) => process.stderr.write(`[preview] ${c}`))

const problems = []
let browser
try {
  await mkdir(OUT, { recursive: true })
  await waitForServer(BASE)
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: CHROMIUM_ARGS })
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
    })
    const page = await context.newPage()
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push({ vp: vp.name, text: m.text() })
    })
    page.on('pageerror', (e) => problems.push({ vp: vp.name, text: e.message }))

    const url = `${BASE}?scene=${SCENE}&qa=1`
    await page.goto(url, { waitUntil: 'load', timeout: 90_000 })
    // a CPU rasterizer needs a moment for the first frames; wait on the counter, not the clock
    await page
      .waitForFunction(() => (window.__ORB_FRAME__ ?? 0) > 2, null, { timeout: 120_000 })
      .catch(() => problems.push({ vp: vp.name, text: 'no frames drawn' }))
    await sleep(2500)
    const file = path.join(OUT, `scene${SCENE}-${vp.name}.png`)
    await page.screenshot({ path: file })
    console.log(`saved ${file}`)
    console.log(`  frames=${await page.evaluate(() => window.__ORB_FRAME__ ?? 0)}`)
    await context.close()
  }
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}

if (problems.length) {
  console.error('PROBLEMS:')
  for (const p of problems) console.error(` - [${p.vp}] ${p.text}`)
  process.exit(1)
}
console.log('clean: no console errors')
