import { spawn } from 'node:child_process'
import process from 'node:process'
import { chromium } from 'playwright'

const PORT = Number(process.env.DBG_PORT ?? 4190)
const BASE = `http://127.0.0.1:${PORT}/`
const ARGS = [
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
const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, CI: '1' },
})
preview.stdout.on('data', (c) => process.stdout.write(`[preview] ${c}`))
preview.stderr.on('data', (c) => process.stderr.write(`[preview] ${c}`))

let browser
try {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE)
      if (res.ok) break
    } catch {
      /* wait */
    }
    await sleep(200)
  }
  browser = await chromium.launch({ headless: true, args: ARGS })
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } })
  page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}\n${e.stack?.split('\n').slice(0, 6).join('\n')}`))
  page.on('requestfailed', (r) => console.log(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`))
  page.on('response', (r) => {
    if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url()}`)
  })
  await page.goto(`${BASE}?qa=1`, { waitUntil: 'load' })
  await sleep(20000)
  console.log('ready flag:', await page.evaluate(() => window.__ORB_READY__))
  console.log('frames:', await page.evaluate(() => window.__ORB_FRAME__))
  await page.screenshot({ path: 'artifacts/debug.png' })
} catch (error) {
  console.error(error)
} finally {
  if (browser) await browser.close()
  preview.kill('SIGTERM')
}
