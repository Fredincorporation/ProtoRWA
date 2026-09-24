/**
 * @protorwa/shared - public surface.
 *
 * Imported by both the frontend and the tooling, so it must stay free of
 * runtime dependencies and side effects.
 */

export * from './types/index.js';
export * from './chains.js';
export * from './design/tokens.js';
export * from './contracts/index.js';
// Hand-authored (Stylus has no .sol artifact, so export-abis.mjs does not emit
// it); exported from the top barrel rather than contracts/index.ts to survive
// ABI regeneration.
export { hardwareVerifierAbi } from './contracts/HardwareVerifier.js';
export * from './settlement.js';
