import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@gearva/contracts';
import type { Request } from 'express';
import { ADMIN_COOKIES } from '../auth/cookies';
import { SessionService } from '../auth/session.service';
import { RequestContext } from '../common/context/request-context';
import { PlatformDb } from '../common/db/platform-db';
import { AppException } from '../common/errors/app-exception';

/**
 * Protects every /admin/v1 endpoint except the login steps (README 5.2). Needs a valid
 * access cookie whose session is still open and an active admin with 2FA enabled.
 * Sets the request actor (ADMIN, no garage) for audit rows.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly platformDb: PlatformDb,
    private readonly context: RequestContext,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token: unknown = req.cookies?.[ADMIN_COOKIES.access];
    const claims =
      typeof token === 'string' ? await this.sessions.verifyAccess(token, 'admin') : null;
    if (!claims || !(await this.sessions.isActive(claims.sid))) throw notSignedIn();

    const admin = await this.platformDb.client.adminUser.findUnique({ where: { id: claims.sub } });
    if (!admin?.isActive || !admin.totpEnabled) throw notSignedIn();

    this.context.setActor({
      type: 'ADMIN',
      id: admin.id,
      garageId: null,
      role: admin.role,
      branchId: null,
    });
    return true;
  }
}

function notSignedIn(): AppException {
  return new AppException(HttpStatus.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not signed in');
}
