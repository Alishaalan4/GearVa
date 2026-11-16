import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '@gearva/contracts';
import type { Request } from 'express';
import { SessionService } from '../auth/session.service';
import { PUBLIC_KEY } from '../auth/staff-access.decorators';
import { RequestContext } from '../common/context/request-context';
import { PlatformDb } from '../common/db/platform-db';
import { AppException } from '../common/errors/app-exception';

/**
 * Global guard for every owner app route (/mobile/v1/*), so none can forget it
 * (docs/mobile-api.md 1): a Bearer access token of type `owner` whose session is open, for
 * an owner whose app account still exists. It then sets the actor (type OWNER, no
 * garage); OwnerDb takes the owner from it. Login, refresh, logout, forgot and set
 * password are @Public. A locked garage does not block the owner (flow.md 2.4 step 7).
 */
@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly platformDb: PlatformDb,
    private readonly context: RequestContext,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    // By the controller's declared path, never the URL text (as StaffGuard).
    if (!isOwnerController(ctx.getClass())) return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw notSignedIn();
    const claims = await this.sessions.verifyAccess(token, 'owner');
    if (!claims || !(await this.sessions.isActive(claims.sid))) throw notSignedIn();

    // The account lookup happens before an owner context exists: platform role.
    const owner = await this.platformDb.client.owner.findUnique({
      where: { id: claims.sub },
      select: { id: true, passwordHash: true },
    });
    if (!owner?.passwordHash) throw notSignedIn();

    this.context.setActor({
      type: 'OWNER',
      id: owner.id,
      garageId: null,
      role: null,
      branchId: null,
    });
    this.context.setSessionId(claims.sid);
    return true;
  }
}

/** A controller declared as @Controller('mobile/v1/...'): the owner app API (README 3). */
export function isOwnerController(controller: object): boolean {
  const path: unknown = Reflect.getMetadata(PATH_METADATA, controller);
  const paths = Array.isArray(path) ? path : [path];
  return paths.some((p) => /^\/?mobile\/v1(\/|$)/.test(String(p ?? '')));
}

function notSignedIn(): AppException {
  return new AppException(HttpStatus.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not signed in');
}
