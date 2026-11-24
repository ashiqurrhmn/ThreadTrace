import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env';

export interface StoredFileMeta {
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StoragePort {
  save(buffer: Buffer, originalName: string, mimeType: string): Promise<StoredFileMeta>;
  read(filePath: string): Promise<Buffer>;
  exists(filePath: string): Promise<boolean>;
}

/**
 * Adapter Pattern (FR5): Local disk implementation behind StoragePort.
 * Swappable to MinIO / S3 without modifying EvidenceService.
 */
export class LocalDiskStorageAdapter implements StoragePort {
  private readonly baseDir: string;

  constructor(baseDir: string = env.UPLOAD_ABS_DIR) {
    this.baseDir = baseDir;
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  async save(buffer: Buffer, originalName: string, mimeType: string): Promise<StoredFileMeta> {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeName}`;
    const fullPath = path.join(this.baseDir, uniqueName);
    await fs.promises.writeFile(fullPath, buffer);
    return {
      fileName: originalName,
      filePath: uniqueName,
      mimeType,
      sizeBytes: buffer.length,
    };
  }

  async read(relativePath: string): Promise<Buffer> {
    const safeBasename = path.basename(relativePath);
    const fullPath = path.join(this.baseDir, safeBasename);
    return fs.promises.readFile(fullPath);
  }

  async exists(relativePath: string): Promise<boolean> {
    const safeBasename = path.basename(relativePath);
    const fullPath = path.join(this.baseDir, safeBasename);
    try {
      await fs.promises.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}

export const storagePort: StoragePort = new LocalDiskStorageAdapter();
