import { HttpStatus } from '@nestjs/common';
import { ERROR_CODES } from '@gearva/contracts';
import type { RequestContext } from '../common/context/request-context';
import { AppException } from '../common/errors/app-exception';

/**
 * Settings that affect every garage (prices, reminder rules, default service types) are
 * changed by super admins only (flow.md 11.4). Returns the admin's id.
 */
export function requireSuperAdmin(context: RequestContext): string {
  const actor = context.actor;
  if (actor?.type !== 'ADMIN' || actor.role !== 'SUPER_ADMIN' || !actor.id) {
    throw new AppException(
      HttpStatus.FORBIDDEN,
      ERROR_CODES.FORBIDDEN,
      'Only a super admin can change this',
    );
  }
  return actor.id;
}
