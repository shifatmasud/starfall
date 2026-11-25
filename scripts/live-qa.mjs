import { chromium } from 'playwright'

// node scripts/live-qa.mjs <base-url>
const base = process.argv[2] ?? 'https://starfall-shifatmasuds-projects.vercel.app'
const views = [
  { name: 'desktop', width: 1440, height: 900, dpr: 1, isMobile: false, hasTouch: false },
  { name: 'mobile', width: 390, height: 844, dpr: 2, isMobile: true, hasTouch: true },
]
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'] })
for (const v of views) {
  const page = await browser.newPage({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dpr, isMobile: v.isMobile, hasTouch: v.hasTouch })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  const url = `${base}/?scene=1`
  const res = await page.goto(url, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => (window.__ORB_FRAME__ ?? 0) > 3, null, { timeout: 180000 }).catch(() => console.log('no frames'))
  await new Promise((r) => setTimeout(r, 2500))
  const path = `artifacts/live-${v.name}.png`
  await page.screenshot({ path, timeout: 120000 })
  console.log(`${v.name}: HTTP ${res?.status()} → ${path}  errors=${errors.length}`)
  if (errors.length) console.log('  ', errors.slice(0, 3).join(' | '))
  await page.close()
}
await browser.close()
