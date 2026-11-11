import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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

/**
 * FILES_ADAPTER=s3: an S3-compatible bucket, Cloudflare R2 in production (README 9).
 * Render's disk is wiped on every deploy and every free-plan spin-down, so files that must
 * stay (logos, invoice PDFs) live here. The bucket is private; only the API reads it.
 */
@Injectable()
export class S3FileStorage implements FileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    this.bucket = env.S3_BUCKET!;
    this.client = new S3Client({
      region: 'auto', // R2 has no regions
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: true, // https://<endpoint>/<bucket>/<key>: works on R2 and MinIO alike
      credentials: { accessKeyId: env.S3_ACCESS_KEY!, secretAccessKey: env.S3_SECRET_KEY! },
    });
  }

  async put(key: string, body: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: mimeType }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return object.Body ? Buffer.from(await object.Body.transformToByteArray()) : null;
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }
}
