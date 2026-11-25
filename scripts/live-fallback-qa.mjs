import { chromium } from 'playwright'
// node scripts/live-fallback-qa.mjs <url> — proves a device without WebGL2 gets the still, not black
const base = process.argv[2] ?? 'https://starfall-story.vercel.app'
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage','--hide-scrollbars'] })
for (const scene of [1, 2]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (String(type).startsWith('webgl2')) return null
      return orig.call(this, type, ...rest)
    }
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/?scene=${scene}`, { waitUntil: 'load' })
  await new Promise((r) => setTimeout(r, 4000))
  const state = await page.evaluate(() => {
    const img = document.querySelector('img')
    const canvas = document.querySelector('canvas')
    return {
      canvases: document.querySelectorAll('canvas').length,
      img: img ? { src: img.getAttribute('src'), natural: img.naturalWidth, shown: getComputedStyle(img).display } : null,
      text: document.body.innerText.trim().slice(0, 120),
      dumped: canvas ? canvas.width : null,
    }
  })
  console.log(`scene ${scene}`, JSON.stringify(state), 'pageerrors:', errors.length)
  await page.screenshot({ path: `artifacts/live-fallback-s${scene}.png` })
  await page.close()
}
await browser.close()
