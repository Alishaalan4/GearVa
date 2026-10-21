import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

/** argon2id password hashing (database.md 4.1). Used for admins now, staff in step 1.6. */
@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password, { type: argon2id });
  }

  /**
   * Checks a password. With no stored hash (unknown user, invite not accepted) it still
   * spends the same time on a dummy hash, so response times do not reveal who exists.
   */
  async verify(storedHash: string | null | undefined, password: string): Promise<boolean> {
    if (!storedHash) {
      this.dummyHash ??= this.hash('dummy password for timing');
      await verify(await this.dummyHash, password).catch(() => false);
      return false;
    }
    return verify(storedHash, password).catch(() => false);
  }
}
