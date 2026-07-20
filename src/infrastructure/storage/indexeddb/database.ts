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
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  async connect(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const transaction = request.transaction;
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion || DB_VERSION;

        for (let v = oldVersion + 1; v <= newVersion; v++) {
          if (migrations[v] && transaction) {
            migrations[v](db, transaction);
          }
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        logger.error('Failed to open IndexedDB', event);
        reject(request.error);
      };
    });

    return this.initPromise;
  }

  async getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    const db = await this.connect();
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }
}
