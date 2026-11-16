import { SetMetadata } from '@nestjs/common';
import type { StaffRole } from '@gearva/contracts';

export const PUBLIC_KEY = 'gearva:public';
export const ROLES_KEY = 'gearva:roles';

/**
 * A route that needs no session (login, set password, refresh, logout), for /v1 (staff)
 * and /mobile/v1 (owners, OwnerGuard).
 */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Staff roles allowed on a /v1 route (flow.md 1, permission matrix). Without it, any
 * signed-in staff member of an unlocked garage may call the route.
 */
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES_KEY, roles);
