/**
 * Database connection manager
 */
import { DB_NAME, DB_VERSION } from '../../../shared/constants';
import { migrations } from './migration';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('IndexedDB');

export class Database {
  private static instance: Database;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  private constructor() {}

  static getInstance(): Database {
    if (!Database.instance) Database.instance = new Database();
    return Database.instance;
  }

  async connect(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    const openPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is unavailable in this context'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        const transaction = request.transaction;
        for (let version = event.oldVersion + 1; version <= (event.newVersion || DB_VERSION); version++) {
          if (migrations[version] && transaction) migrations[version](db, transaction);
        }
      };
      request.onblocked = () => logger.warn('IndexedDB open/upgrade is blocked by another extension context');
      request.onsuccess = () => {
        const db = request.result;
        this.db = db;
        db.onversionchange = () => {
          logger.info('IndexedDB version changed; closing stale connection');
          db.close();
          if (this.db === db) this.db = null;
        };
        db.onclose = () => {
          if (this.db === db) this.db = null;
        };
        resolve(db);
      };
      request.onerror = (event) => {
        logger.error('Failed to open IndexedDB', event);
        reject(request.error ?? new Error('Failed to open IndexedDB'));
      };
    });

    this.initPromise = openPromise;
    try {
      return await openPromise;
    } finally {
      if (this.initPromise === openPromise) this.initPromise = null;
    }
  }

  async getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    const db = await this.connect();
    try {
      return db.transaction(storeName, mode).objectStore(storeName);
    } catch {
      if (this.db === db) this.db = null;
      const retryDb = await this.connect();
      return retryDb.transaction(storeName, mode).objectStore(storeName);
    }
  }

  close(): void {
    this.db?.close();
    this.db = null;
    this.initPromise = null;
  }
}
