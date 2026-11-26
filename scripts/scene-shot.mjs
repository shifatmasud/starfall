import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

// node scripts/scene-shot.mjs <scene> <name> [width] [height] [dpr]
const scene = Number(process.argv[2] ?? 2)
const name = process.argv[3] ?? `s${scene}`
const width = Number(process.argv[4] ?? 1440)
const height = Number(process.argv[5] ?? 900)
const dpr = Number(process.argv[6] ?? 1)
const PORT = Number(process.env.QA_PORT ?? 4300 + Math.floor(Math.random() * 200))
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  env: { ...process.env, CI: '1' },
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 120; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/`)
    if (r.ok) break
  } catch {}
  await sleep(250)
}
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
})
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: dpr,
  isMobile: width < 700,
  hasTouch: width < 700,
})
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('ERR ' + m.text())
})
await page.goto(`http://127.0.0.1:${PORT}/?scene=${scene}&qa=1&minframes=${process.env.QA_FRAMES ?? 20}${process.env.QA_EXTRA ?? ''}`, { waitUntil: 'load' })
await page.waitForFunction(() => (window.__ORB_FRAME__ ?? 0) > Number(new URLSearchParams(location.search).get('minframes') ?? 3), null, { timeout: 180000 }).catch(() => console.log('no frames'))
await sleep(Number(process.env.QA_SETTLE ?? 3000))
const path = `artifacts/${name}.png`
if (process.env.QA_DOM) await page.screenshot({ path, timeout: 180000 })
else {
  // read the WebGL canvas itself (preserveDrawingBuffer is on under ?qa): a full-page screenshot
  // stalls SwiftShader long enough for the renderer watchdog to rebuild the canvas mid-capture
  const data = await page.evaluate(() => document.querySelector('canvas')?.toDataURL('image/png') ?? '')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(path, Buffer.from(data.split(',')[1] ?? '', 'base64'))
}
const frames = await page.evaluate(() => window.__ORB_FRAME__ ?? 0)
console.log(`scene ${scene} ${width}x${height}@${dpr} → ${path} frames=${frames} errors=${errors.length}`)
if (errors.length) console.log(errors.slice(0, 5).join('\n'))
await browser.close()
server.kill('SIGTERM')
