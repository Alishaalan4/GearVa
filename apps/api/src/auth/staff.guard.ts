import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES, type StaffRole } from '@gearva/contracts';
import type { Request } from 'express';
import { RequestContext } from '../common/context/request-context';
import { PlatformDb } from '../common/db/platform-db';
import { AppException } from '../common/errors/app-exception';
import { garageLockReason, garageLocked } from '../common/garage-lock';
import { STAFF_COOKIES } from './cookies';
import { SessionService } from './session.service';
import { PUBLIC_KEY, ROLES_KEY } from './staff-access.decorators';

/**
 * Global guard for every garage staff route (/v1/*), so no endpoint can forget it:
 *   1. a valid staff access cookie whose session is still open, for an active user
 *   2. the subscription lock: GARAGE_LOCKED when suspended or expired (flow.md 2.5)
 *   3. the role check from @Roles (flow.md 1)
 * Then it sets the tenant context (README 5.1, flow.md 2.6): garage, user, role, branch,
 * all from the server-side session, never from the request.
 * Routes outside /v1 (admin, health) and @Public routes are left to their own guards.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly platformDb: PlatformDb,
    private readonly context: RequestContext,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.path.startsWith('/v1/')) return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const token: unknown = req.cookies?.[STAFF_COOKIES.access];
    const claims =
      typeof token === 'string' ? await this.sessions.verifyAccess(token, 'staff') : null;
    if (!claims || !(await this.sessions.isActive(claims.sid))) throw notSignedIn();

    // Credential lookup before any tenant context exists (database.md 4.2): platform role.
    const user = await this.platformDb.client.user.findUnique({
      where: { id: claims.sub },
      include: { garage: true },
    });
    if (!user?.isActive || user.garage.deletedAt) throw notSignedIn();

    const reason = garageLockReason(user.garage);
    if (reason) throw garageLocked(reason);

    const roles = this.reflector.getAllAndOverride<StaffRole[] | undefined>(ROLES_KEY, targets);
    if (roles && !roles.includes(user.role)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.FORBIDDEN,
        'Not allowed for your role',
      );
    }

    this.context.setActor({
      type: 'STAFF',
      id: user.id,
      garageId: user.garageId,
      role: user.role,
      branchId: user.branchId,
    });
    return true;
  }
}

function notSignedIn(): AppException {
  return new AppException(HttpStatus.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not signed in');
}
