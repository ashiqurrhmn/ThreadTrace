import fs from 'fs';
import path from 'path';
import { LRUCache } from 'lru-cache';
import { env } from '../config/env';

export interface CachedPassportEntry {
  passportCode: string;
  version: number;
  etag: string;
  publicPayload: Record<string, unknown>;
  evidenceSnapshot: Array<{
    id: string;
    certificateNumber: string;
    certTypeCode: string;
    claimTag: string | null;
    issuer: string;
    validUntil: string;
    status: string;
  }>;
  availableVersions: number[];
  cachedAt: string;
}

export interface CachePort {
  get(key: string): CachedPassportEntry | null;
  set(key: string, entry: CachedPassportEntry): void;
  delete(key: string): void;
  listKeys(): string[];
  stats(): { memoryEntries: number; diskEntries: number; cacheDir: string };
}

/**
 * Adapter Pattern (QA4): Hybrid In-Memory LRU + Local Disk JSON Snapshot Cache.
 * Survives both PostgreSQL shutdown AND Express restarts without requiring Redis/Docker.
 */
export class HybridLruDiskCacheAdapter implements CachePort {
  private readonly lru: LRUCache<string, CachedPassportEntry>;
  private readonly cacheDir: string;

  constructor(cacheDir: string = env.CACHE_ABS_DIR) {
    this.cacheDir = cacheDir;
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.lru = new LRUCache<string, CachedPassportEntry>({
      max: 1000,
    });
    this.warmFromDisk();
  }

  private keyToFilename(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.cacheDir, `${safe}.json`);
  }

  private warmFromDisk(): void {
    try {
      const files = fs.readdirSync(this.cacheDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const raw = fs.readFileSync(path.join(this.cacheDir, file), 'utf-8');
        const parsed = JSON.parse(raw) as CachedPassportEntry;
        const key = file.replace(/\.json$/, '');
        this.lru.set(key, parsed);
      }
    } catch {
      // Ignore empty or unreadable initial cache dir
    }
  }

  get(key: string): CachedPassportEntry | null {
    const memHit = this.lru.get(key);
    if (memHit) return memHit;

    const filePath = this.keyToFilename(key);
    if (fs.existsSync(filePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CachedPassportEntry;
        this.lru.set(key, parsed);
        return parsed;
      } catch {
        return null;
      }
    }
    return null;
  }

  set(key: string, entry: CachedPassportEntry): void {
    this.lru.set(key, entry);
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      fs.writeFileSync(this.keyToFilename(key), JSON.stringify(entry, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[CachePort] Failed to persist snapshot to disk:', err);
    }
  }

  delete(key: string): void {
    this.lru.delete(key);
    const filePath = this.keyToFilename(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  listKeys(): string[] {
    try {
      return fs
        .readdirSync(this.cacheDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''));
    } catch {
      return [];
    }
  }

  stats(): { memoryEntries: number; diskEntries: number; cacheDir: string } {
    return {
      memoryEntries: this.lru.size,
      diskEntries: this.listKeys().length,
      cacheDir: this.cacheDir,
    };
  }
}

export const passportCache: CachePort = new HybridLruDiskCacheAdapter();
