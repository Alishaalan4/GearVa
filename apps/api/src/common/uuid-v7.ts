import { randomBytes } from 'node:crypto';

/**
 * A UUID v7 (README 5.4) for rows written with raw SQL, where Prisma's @default(uuid(7))
 * does not run: 48-bit Unix time in ms, version 7, variant 10, random bits (RFC 9562).
 */
export function uuidV7(now = Date.now()): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(now, 0, 6);
  bytes[6] = 0x70 | ((bytes[6] as number) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] as number) & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
