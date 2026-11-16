import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type OwnerSetPasswordInput,
  type OwnerSetPasswordResponse,
} from '@gearva/contracts';
import { hashAccessToken } from '../auth/access-links';
import { PasswordService } from '../auth/password.service';
import { SessionService } from '../auth/session.service';
import { RequestContext } from '../common/context/request-context';
import { PlatformDb } from '../common/db/platform-db';
import { AppException } from '../common/errors/app-exception';

/**
 * Car-owner accounts for the owner app (flow.md 2.4, docs/mobile-api.md 2). `owners` is a
 * platform table and no tenant is known here, so this uses the platform role
 * (database.md 6.6: "gearva_platform (admin, owner login) reads and writes owners").
 */
@Injectable()
export class OwnerAuthService {
  constructor(
    private readonly platformDb: PlatformDb,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly context: RequestContext,
  ) {}

  /**
   * flow.md 2.4 step 2: the invite (or reset) link's page. Saves the password, makes the
   * link unusable and ends every app session of this owner. No session is opened: the
   * owner signs in from the app.
   */
  async setPassword(input: OwnerSetPasswordInput): Promise<OwnerSetPasswordResponse> {
    const db = this.platformDb.client;
    const owner = await db.owner.findUnique({
      where: { inviteTokenHash: hashAccessToken(input.token) },
    });
    const usable =
      owner?.email && owner.inviteExpiresAt !== null && owner.inviteExpiresAt > new Date();
    if (!owner?.email || !usable) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.INVALID_LINK,
        'This link is invalid or has expired',
      );
    }

    // Only the request that still finds the token wins, so a link works exactly once.
    const now = new Date();
    const { count } = await db.owner.updateMany({
      where: { id: owner.id, inviteTokenHash: owner.inviteTokenHash },
      data: {
        passwordHash: await this.passwords.hash(input.password),
        passwordSetAt: now,
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
    });
    if (count === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.INVALID_LINK,
        'This link is invalid or has expired',
      );
    }
    await this.sessions.revokeAll('OWNER', owner.id);

    // The audit row (owner.set_password) belongs to the owner, not to a garage.
    this.context.setActor({
      type: 'OWNER',
      id: owner.id,
      garageId: null,
      role: null,
      branchId: null,
    });
    return { email: owner.email };
  }
}
