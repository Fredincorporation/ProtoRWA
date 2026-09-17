/**
 * Ambient module declarations.
 *
 * Next handles CSS side-effect imports at build time, but TypeScript needs to be
 * told they exist or `tsc --noEmit` reports "cannot find module".
 */

declare module '*.css';
declare module '*.scss';
declare module '*.svg' {
  const content: string;
  export default content;
}
