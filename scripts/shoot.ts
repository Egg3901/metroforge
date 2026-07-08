/**
 * Headless screenshot of the REAL running game (PixiJS/WebGL via swiftshader).
 * Drives the new-game screen, starts a city, and captures overview + zoomed.
 *
 *   npx vite-node scripts/shoot.ts boston
 *
 * Requires the preview server running: npx vite preview --port 4180
 * Writes grader/shot-<preset>-<zoom>.png
 */
import { chromium } from 'playwright-core';

const preset = process.argv[2] ?? 'boston';
const URL = 'http://localhost:4180';

async function main(): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR:', m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle' });

  // new-game screen: pick the city, then start
  await page.getByRole('button', { name: new RegExp(preset === 'nyc' ? 'New York' : preset, 'i') }).first().click();
  await page.getByRole('button', { name: /Found a Transit Authority/i }).click();
  await page.waitForTimeout(5000); // worker init + OSM load + first render

  await page.screenshot({ path: `grader/shot-${preset}-overview.png` });

  // zoom in toward center with wheel events, then capture street level
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    for (let i = 0; i < 14; i++) {
      await page.mouse.move(cx, cy);
      await page.mouse.wheel(0, -260);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `grader/shot-${preset}-zoom.png` });
  }
  await browser.close();
  console.log(`wrote grader/shot-${preset}-overview.png and -zoom.png`);
}
main().catch((e) => { console.error(e); process.exit(1); });
