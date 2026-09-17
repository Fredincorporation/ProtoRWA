import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges conditional class names, with later Tailwind utilities winning over
 * earlier conflicting ones. Every component uses this so callers can override
 * styles via `className` without specificity fights.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
