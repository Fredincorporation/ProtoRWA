/**
 * Captures full-page screenshots of the app for visual review.
 *
 * Usage: node scripts/screenshot.mjs [url] [outFile]
 * Requires a Chromium build: pnpm exec playwright install chromium
 */

import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3100/';
const outFile = process.argv[3] ?? 'screenshot.png';

const browser = await chromium.launch();

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    // The designs are dark-mode only; keep the colour scheme consistent.
    colorScheme: 'dark',
    deviceScaleFactor: 1,
  });

  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('requestfailed', (request) => {
    errors.push(`requestfailed: ${request.url()} - ${request.failure()?.errorText ?? 'unknown'}`);
  });

  // `networkidle` never settles here: wagmi keeps a websocket open for wallet
  // state and chain subscriptions. Wait for the DOM plus a paint instead.
  const response = await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForLoadState('domcontentloaded');

  // Let webfonts and any entrance animations settle.
  await page.waitForTimeout(2_500);

  await page.screenshot({ path: outFile, fullPage: true });

  console.log(`status: ${response?.status()}`);
  console.log(`title:  ${await page.title()}`);
  console.log(`saved:  ${outFile}`);
  console.log(`console errors: ${errors.length}`);
  for (const error of errors.slice(0, 15)) {
    console.log(`  - ${error}`);
  }
} finally {
  await browser.close();
}
