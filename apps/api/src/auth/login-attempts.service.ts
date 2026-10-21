import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@gearva/contracts';
import type Redis from 'ioredis';
import { AppException } from '../common/errors/app-exception';
import { REDIS } from '../common/redis/redis.module';

/** Failed password or code attempts per email before a 15-minute lockout (flow.md 2.2). */
const MAX_FAILURES = 10;
const WINDOW_SECONDS = 15 * 60;

/**
 * Per-email lockout, on top of the per-IP rate limit. Counters live in Redis and expire
 * on their own. Admins and staff have separate counters (different login forms).
 */
@Injectable()
export class LoginAttemptsService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async assertNotLockedOut(kind: 'admin' | 'staff', email: string): Promise<void> {
    const count = Number(await this.redis.get(this.key(kind, email)));
    if (count >= MAX_FAILURES) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.RATE_LIMITED,
        'Too many failed attempts. Try again in 15 minutes.',
      );
    }
  }

  async recordFailure(kind: 'admin' | 'staff', email: string): Promise<void> {
    const key = this.key(kind, email);
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, WINDOW_SECONDS);
  }

  async clear(kind: 'admin' | 'staff', email: string): Promise<void> {
    await this.redis.del(this.key(kind, email));
  }

  private key(kind: string, email: string): string {
    return `auth:failures:${kind}:${email}`;
  }
}
