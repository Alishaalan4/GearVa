import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env';

export const FILE_STORAGE = Symbol('FILE_STORAGE');

/** Where file bytes live (README 3). Only the API reads them; `files` holds the keys. */
export interface FileStorage {
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}

/** FILES_ADAPTER=local: a folder on this machine, for development and tests. */
@Injectable()
export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(@Inject(ENV) env: Env) {
    this.root = resolve(env.FILES_LOCAL_DIR);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  private pathOf(key: string): string {
    const path = resolve(join(this.root, key));
    if (!path.startsWith(this.root + sep)) throw new Error(`Bad file key: ${key}`);
    return path;
  }
}
