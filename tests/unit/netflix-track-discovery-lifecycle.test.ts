import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetflixTrackDiscovery } from '@/adapters/netflix/netflix-track-discovery';

describe('NetflixTrackDiscovery global hook lifecycle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores page fetch and JSON.parse when discovery stops', () => {
    const originalFetch = vi.fn(async () => new Response('{}')) as unknown as typeof window.fetch;
    vi.stubGlobal('fetch', originalFetch);
    const originalJsonParse = JSON.parse;

    const discovery = new NetflixTrackDiscovery();
    discovery.start();

    expect(window.fetch).not.toBe(originalFetch);
    expect(JSON.parse).not.toBe(originalJsonParse);

    discovery.stop();

    expect(window.fetch).toBe(originalFetch);
    expect(JSON.parse).toBe(originalJsonParse);
  });
});
