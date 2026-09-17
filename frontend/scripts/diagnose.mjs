/**
 * Reports every console error, failed request and HTTP status from a page load.
 *
 * Usage: node scripts/diagnose.mjs [url]
 */

import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:3100/';

const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors = [];
  const failedRequests = [];
  const badResponses = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error)}`));

  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.failure()?.errorText ?? 'failed'} <- ${request.url()}`);
  });

  page.on('response', (response) => {
    if (response.status() >= 400) {
      badResponses.push(`${response.status()} <- ${response.url()}`);
    }
  });

  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(3_000);

  const unique = (items) => [...new Set(items)];

  console.log('=== console errors ===');
  for (const entry of unique(consoleErrors)) console.log('  ' + entry.slice(0, 300));

  console.log('\n=== failed requests ===');
  for (const entry of unique(failedRequests)) console.log('  ' + entry.slice(0, 300));

  console.log('\n=== HTTP >= 400 ===');
  for (const entry of unique(badResponses)) console.log('  ' + entry.slice(0, 300));

  console.log(
    `\ntotals: console=${unique(consoleErrors).length} failedReq=${unique(failedRequests).length} badHttp=${unique(badResponses).length}`,
  );
} finally {
  await browser.close();
}
