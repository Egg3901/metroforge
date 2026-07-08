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
const ZOOM_STEPS = Number(process.argv[3] ?? 14);
const DEMO = process.argv.includes('demo');
const TRAFFIC = process.argv.includes('traffic');
const URL = 'http://localhost:4180' + (DEMO ? '/?dev=1' : '');

async function main(): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR:', m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle' });

  // new-game screen: pick the city, then start
  const LABELS: Record<string, string> = { nyc: 'New York', la: 'Los Angeles', boston: 'Boston', chicago: 'Chicago', cleveland: 'Cleveland', atlanta: 'Atlanta' };
  await page.getByRole('button', { name: 'Free Play' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: LABELS[preset] ?? preset }).first().click();
  await page.getByRole('button', { name: /Found a Transit Authority/i }).click();
  await page.waitForTimeout(5000); // worker init + OSM load + first render

  if (TRAFFIC) {
    await page.getByRole('button', { name: '60×' }).click().catch(() => {});
    await page.getByRole('button', { name: /^Traffic$/ }).click().catch(() => {});
    await page.waitForTimeout(16000); // advance clock to afternoon + several assignments
  }

  if (DEMO) {
    // build a couple of demo transit lines via the exposed sim client
    const built = await page.evaluate(async () => {
      const client = (window as unknown as { __mf?: any }).__mf;
      if (!client) return 'no client';
      const line = async (mode: string, pts: [number, number][]) => {
        const ids: number[] = [];
        for (const [x, y] of pts) {
          const r = await client.command({ kind: 'buildStation', mode, pos: { x, y } });
          if (r.ok && r.createdId != null) ids.push(r.createdId);
        }
        for (let i = 0; i + 1 < ids.length; i++) {
          await client.command({ kind: 'buildTrack', mode, grade: 'surface', fromStationId: ids[i], toStationId: ids[i + 1], waypoints: [] });
        }
        if (ids.length >= 2) await client.command({ kind: 'createRoute', mode, stationIds: ids });
        return ids.length;
      };
      const a = await line('bus', [[-3200, -400], [-1600, 100], [0, -200], [1600, 300], [3200, -100]]);
      const b = await line('bus', [[-200, -3000], [200, -1200], [0, 200], [-400, 1600], [200, 3000]]);
      return `bus lines: ${a}, ${b} stations`;
    });
    console.log('demo:', built);
    await page.waitForTimeout(2500);
  }
  if (process.argv.includes('goals')) {
    await page.getByRole('button', { name: 'Objectives' }).click().catch(() => {});
    await page.waitForTimeout(800);
  }
  if (process.argv.includes('lines')) {
    await page.getByRole('button', { name: 'Lines' }).click().catch(() => {});
    await page.waitForTimeout(800);
  }
  if (process.argv.includes('routepanel')) {
    // open Lines, then click a line row (named "Bus 2") to reveal the RoutePanel
    await page.getByRole('button', { name: 'Lines' }).click().catch(() => {});
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Bus 2/ }).first().click().catch(() => {});
    await page.waitForTimeout(800);
  }

  await page.screenshot({ path: `grader/shot-${preset}-overview.png` });

  // zoom in toward center with wheel events, then capture street level
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    for (let i = 0; i < ZOOM_STEPS; i++) {
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
