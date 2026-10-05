import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { Database } from '@/infrastructure/storage/indexeddb/database';

describe('Database lifecycle', () => {
  const database = Database.getInstance();

  beforeEach(() => {
    database.close();
    vi.stubGlobal('indexedDB', fakeIndexedDB);
  });

  afterEach(() => {
    database.close();
    vi.unstubAllGlobals();
  });

  it('reconnects after an explicit close', async () => {
    const first = await database.connect();
    database.close();
    const second = await database.connect();
    expect(first).not.toBe(second);
    expect(second.name).toBe('open-web-translate');
  });

  it('does not pin a rejected initialization promise', async () => {
    const failingIndexedDb = {
      open: vi.fn(() => {
        const request: any = { error: null };
        queueMicrotask(() => {
          request.error = new Error('first open failed');
          request.onerror?.({ type: 'error' });
        });
        return request;
      }),
    };
    vi.stubGlobal('indexedDB', failingIndexedDb);
    await expect(database.connect()).rejects.toThrow('first open failed');
    vi.stubGlobal('indexedDB', fakeIndexedDB);
    await expect(database.connect()).resolves.toBeDefined();
  });
});
