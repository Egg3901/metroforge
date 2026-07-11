import { chromium } from 'playwright-core';
const SHOT = '/tmp/claude-0/-root/bf4845ab-8b9f-487f-8088-442bfa03ec31/scratchpad';
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-gl=swiftshader', '--enable-webgl', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('console', m => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text()); });
page.on('pageerror', e => console.log('PAGE EXCEPTION:', e.message));
await page.goto('http://localhost:4180');
await page.waitForTimeout(1000);
// Cleveland toy splash → start
await page.click('[data-testid="toy-start"]');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOT}/01-city.png` });
// place 3 bus stations near center via canvas clicks
await page.keyboard.press('s');
const cx = 800, cy = 475;
for (const [dx, dy] of [[-120, 0], [80, 60], [220, -80]]) {
  await page.mouse.click(cx + dx, cy + dy);
  await page.waitForTimeout(300);
}
await page.screenshot({ path: `${SHOT}/02-stations.png` });
// track: click station1, station2; then station2->3
await page.keyboard.press('t');
await page.mouse.click(cx - 120, cy); await page.waitForTimeout(200);
await page.mouse.click(cx + 80, cy + 60); await page.waitForTimeout(400);
await page.mouse.click(cx + 80, cy + 60); await page.waitForTimeout(200);
await page.mouse.click(cx + 220, cy - 80); await page.waitForTimeout(400);
// route
await page.keyboard.press('r');
await page.mouse.click(cx - 120, cy); await page.waitForTimeout(150);
await page.mouse.click(cx + 80, cy + 60); await page.waitForTimeout(150);
await page.mouse.click(cx + 220, cy - 80); await page.waitForTimeout(150);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOT}/03-route.png` });
// run at 60x for a while
await page.click('text=60×');
await page.waitForTimeout(8000);
await page.screenshot({ path: `${SHOT}/04-running.png` });
const hud = await page.locator('[data-testid="toy-topbar"]').innerText();
console.log('HUD:', hud.replace(/\n/g, ' | '));
await browser.close();
