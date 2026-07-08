import { chromium } from 'playwright-core';
const SHOT = '/tmp/claude-0/-root/bf4845ab-8b9f-487f-8088-442bfa03ec31/scratchpad';
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-gl=swiftshader', '--enable-webgl', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', e => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:4180');
await page.fill('input', '31337');
await page.click('text=Found a Transit Authority');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOT}/z0-overview.png` });
for (let i = 0; i < 10; i++) { await page.mouse.move(800, 500); await page.mouse.wheel(0, -240); await page.waitForTimeout(80); }
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOT}/z1-street.png` });
await browser.close();
