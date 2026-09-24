import { describe, expect, it } from 'vitest';

import type { FeedItem } from './founders';

import {
  addressForHandle,
  decorateFeedProjects,
  demoFollowFeed,
  deriveFounderDirectory,
  founderHandle,
} from './founders';
import { demoAddresses, mockProjects } from './mock';

function item(over: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'x',
    author: demoAddresses.founderHelio,
    authorName: 'HelioFrost Labs',
    projectId: '1',
    projectSlug: null,
    projectTitle: null,
    title: 'T',
    body: 'B',
    attachmentCids: [],
    createdAt: '2026-05-01T00:00:00.000Z',
    source: 'live',
    ...over,
  };
}

describe('demoFollowFeed', () => {
  it('aggregates every showcase founder update, newest first', () => {
    const feed = demoFollowFeed(mockProjects);
    // Only HelioFrost has mock updates; both are included.
    expect(feed).toHaveLength(2);
    // Newest (iso(-2) "Production run complete") precedes the older one.
    expect(feed[0]!.title).toContain('Production run complete');
    expect(feed.every((i) => i.source === 'demo')).toBe(true);
    // Every item carries its project linkage from the catalogue.
    expect(feed.every((i) => i.projectSlug === 'heliofrost-pro')).toBe(true);
  });

  it('restricts to the given founder addresses', () => {
    expect(demoFollowFeed(mockProjects, [demoAddresses.founderHelio])).toHaveLength(2);
    // Aero owns a project but has no updates.
    expect(demoFollowFeed(mockProjects, [demoAddresses.founderAero])).toHaveLength(0);
  });

  it('matches founders case-insensitively', () => {
    const upper = ('0x' + demoAddresses.founderHelio.slice(2).toUpperCase()) as typeof demoAddresses.founderHelio;
    expect(demoFollowFeed(mockProjects, [upper])).toHaveLength(2);
  });
});

describe('decorateFeedProjects', () => {
  it('links a known on-chain id back to its catalogue entry', () => {
    const [only] = decorateFeedProjects([item({ id: 'live-1', projectId: '1', projectSlug: null })], mockProjects);
    expect(only?.projectSlug).toBe('heliofrost-pro');
    expect(only?.projectTitle).toBe('HelioFrost Pro');
  });

  it('leaves an unknown project id untouched rather than inventing a link', () => {
    const [only] = decorateFeedProjects([item({ projectId: '999' })], mockProjects);
    expect(only?.projectSlug).toBeNull();
    expect(only?.projectTitle).toBeNull();
  });
});

describe('founder directory + handles', () => {
  it('derives one entry per founder that owns a project', () => {
    const directory = deriveFounderDirectory(mockProjects);
    expect(directory.length).toBeGreaterThan(0);
    expect(directory.every((f) => f.projectCount >= 1)).toBe(true);
  });

  it('resolves a handle back to its founder address', () => {
    const helio = deriveFounderDirectory(mockProjects).find(
      (f) => f.address.toLowerCase() === demoAddresses.founderHelio.toLowerCase(),
    );
    expect(helio).toBeDefined();
    const handle = founderHandle(demoAddresses.founderHelio);
    expect(addressForHandle(handle, mockProjects)?.toLowerCase()).toBe(
      demoAddresses.founderHelio.toLowerCase(),
    );
  });

  it('accepts a raw 0x address as a handle token', () => {
    expect(addressForHandle(demoAddresses.founderAero, mockProjects)?.toLowerCase()).toBe(
      demoAddresses.founderAero.toLowerCase(),
    );
  });

  it('returns null for an unknown handle', () => {
    expect(addressForHandle('nobody', mockProjects)).toBeNull();
  });
});
