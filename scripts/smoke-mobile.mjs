import { chromium } from 'playwright-core';
const SHOT = '/tmp/claude-0/-root/bf4845ab-8b9f-487f-8088-442bfa03ec31/scratchpad';
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-gl=swiftshader', '--enable-webgl', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
page.on('pageerror', e => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:4180');
await page.fill('input', '31337');
await page.click('text=Found a Transit Authority');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOT}/m1-city.png` });
// tap station tool, place a station, open route panel flow
await page.locator("button[title*=\"Station\"]").last().tap();
await page.tap('canvas', { position: { x: 195, y: 400 } });
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOT}/m2-station.png` });
await browser.close();
