/**
 * Exercises the AI assist API end to end and prints the validated result.
 *
 * Goes through the running Next server (so the server-side provider chain is what
 * gets tested, not a direct API call), and uses Playwright's request context so
 * it exercises the same HTTP path the browser takes.
 *
 * Usage: node scripts/test-ai.mjs [baseUrl]
 */

import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:3100';

const browser = await chromium.launch();

try {
  const context = await browser.newContext();

  // 1. Provider status.
  const statusResponse = await context.request.get(`${base}/api/ai/assist`);
  const status = await statusResponse.json();
  console.log('=== provider status ===');
  console.log(JSON.stringify(status));

  const tasks = [
    {
      task: 'description',
      prompt:
        'Write project copy for a hardware project named "HelioFrost Pro": a solar-powered vaccine cold-chain refrigerator for rural clinics in Taiwan. It uses a phase-change thermal reservoir and a redundant compressor.',
      context: { title: 'HelioFrost Pro', category: 'ENERGY', location: 'Kaohsiung, TW' },
    },
    {
      task: 'milestones',
      prompt:
        'Propose a 3-milestone production schedule for a solar vaccine refrigerator. Total raise is 100 ETH.',
      context: { target: '100', category: 'ENERGY' },
    },
    {
      task: 'risk',
      prompt:
        'Identify genuine production and delivery risks for a solar-powered vaccine refrigerator built in Taiwan and shipped globally.',
      context: { target: '100', location: 'Kaohsiung, TW' },
    },
  ];

  for (const body of tasks) {
    console.log(`\n=== task: ${body.task} ===`);
    const response = await context.request.post(`${base}/api/ai/assist`, {
      data: body,
      timeout: 120_000,
    });

    const payload = await response.json();

    if (!response.ok()) {
      console.log(`HTTP ${response.status()}`);
      console.log(JSON.stringify(payload, null, 2).slice(0, 1_500));
      continue;
    }

    console.log(`provider: ${payload.provider}   model: ${payload.model}`);
    // Print the validated data, which is what the UI would receive.
    console.log(JSON.stringify(payload.data, null, 2).slice(0, 1_800));
  }
} finally {
  await browser.close();
}
