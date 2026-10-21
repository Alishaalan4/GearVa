import { Inject, Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
import { ENV, type Env } from '../config/env';

const RECOVERY_CODE_COUNT = 10;

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Recovery codes are compared without dashes, spaces or case. */
function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^0-9a-f]/g, '');
}

/**
 * TOTP 2FA for admins (README 5.2, flow.md 2.3): standard 6-digit, 30-second codes that
 * any authenticator app understands. The secret is stored encrypted (AES-256-GCM with
 * TOTP_ENCRYPTION_KEY); recovery codes are stored as SHA-256 hashes, used once each.
 */
@Injectable()
export class TotpService {
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Env) {
    this.key = Buffer.from(env.TOTP_ENCRYPTION_KEY, 'base64');
  }

  newSecret(): string {
    return new Secret({ size: 20 }).base32;
  }

  otpauthUri(secret: string, accountName: string): string {
    return this.totp(secret, accountName).toString();
  }

  /** Accepts the current code and one step either side, for clock drift. */
  verify(secret: string, code: string): boolean {
    return this.totp(secret).validate({ token: code, window: 1 }) !== null;
  }

  encrypt(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), encrypted]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
      .join(':');
  }

  decrypt(stored: string): string {
    const [version, iv, tag, encrypted] = stored.split(':');
    if (version !== 'v1' || !iv || !tag || !encrypted)
      throw new Error('Unknown TOTP secret format');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** 10 codes like `3f9a1-c07be` (40 random bits each); only the hashes are stored. */
  newRecoveryCodes(): { codes: string[]; hashes: string[] } {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      const hex = randomBytes(5).toString('hex');
      return `${hex.slice(0, 5)}-${hex.slice(5)}`;
    });
    const hashes = codes.map((c) => sha256(normalizeRecoveryCode(c)).toString('hex'));
    return { codes, hashes };
  }

  /** Index of the matching stored hash, or -1. */
  findRecoveryCode(hashes: string[], code: string): number {
    const candidate = sha256(normalizeRecoveryCode(code));
    return hashes.findIndex((h) => {
      const stored = Buffer.from(h, 'hex');
      return stored.length === candidate.length && timingSafeEqual(stored, candidate);
    });
  }

  private totp(secret: string, label = 'admin'): TOTP {
    return new TOTP({
      issuer: 'Gearva Admin',
      label,
      secret: Secret.fromBase32(secret),
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
  }
}
