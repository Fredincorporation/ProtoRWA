/**
 * Generates typed contract ABIs and address maps from the Foundry build output.
 *
 * Foundry emits a large artifact per contract; the frontend only needs the ABI
 * plus the deployed bytecode hash. This script keeps `shared/src/contracts`
 * in sync with the compiled contracts so type errors surface at build time
 * instead of at runtime.
 *
 * Usage: node contracts/export-abis.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'contracts', 'out');
const targetDir = join(root, 'shared', 'src', 'contracts');

/** Contracts the frontend interacts with, mapped to their artifact folder. */
const CONTRACTS = [
  { name: 'ClaimToken', file: 'ClaimToken.sol/ClaimToken.json' },
  { name: 'ProjectRegistry', file: 'ProjectRegistry.sol/ProjectRegistry.json' },
  { name: 'MilestoneEscrow', file: 'MilestoneEscrow.sol/MilestoneEscrow.json' },
  { name: 'SecondaryMarket', file: 'SecondaryMarket.sol/SecondaryMarket.json' },
];

if (!existsSync(outDir)) {
  console.error(`No build output at ${outDir}. Run "forge build" first.`);
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

const index = [];

for (const { name, file } of CONTRACTS) {
  const artifactPath = join(outDir, file);
  if (!existsSync(artifactPath)) {
    console.error(`Missing artifact: ${artifactPath}`);
    process.exit(1);
  }

  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  const abi = artifact.abi;

  if (!Array.isArray(abi)) {
    console.error(`Artifact ${name} has no ABI array.`);
    process.exit(1);
  }

  const banner = `/**
 * GENERATED FILE - do not edit by hand.
 * Source: contracts/out/${file}
 * Regenerate: forge build && node contracts/export-abis.mjs
 */

`;

  const varName = `${name.charAt(0).toLowerCase()}${name.slice(1)}Abi`;

  const contents = `${banner}export const ${varName} = ${JSON.stringify(abi, null, 2)} as const;

export type ${name}Abi = typeof ${varName};
`;

  writeFileSync(join(targetDir, `${name}.ts`), contents, 'utf8');

  const fnCount = abi.filter((entry) => entry.type === 'function').length;
  index.push({ name, fnCount });
}

/* Barrel that also re-exports the address helpers. */
const barrel = `/**
 * GENERATED FILE - do not edit by hand.
 * Regenerate: forge build && node contracts/export-abis.mjs
 */

export { claimTokenAbi } from './ClaimToken.js';
export { projectRegistryAbi } from './ProjectRegistry.js';
export { milestoneEscrowAbi } from './MilestoneEscrow.js';
export { secondaryMarketAbi } from './SecondaryMarket.js';

export * from './addresses.js';
`;

writeFileSync(join(targetDir, 'index.ts'), barrel, 'utf8');

console.log('Exported ABIs:');
for (const { name, fnCount } of index) {
  console.log(`  ${name.padEnd(18)} ${fnCount} functions`);
}
console.log(`\nWritten to shared/src/contracts/`);
console.log('Note: keep addresses in shared/src/contracts/addresses.ts (env-driven).');
