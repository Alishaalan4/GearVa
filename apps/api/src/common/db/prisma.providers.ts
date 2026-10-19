import { createPrismaClient, type PrismaClient } from '@gearva/database';
import type { FactoryProvider } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';

/** gearva_app: RLS enforced. Only TenantDb may use it. */
export const APP_PRISMA = Symbol('APP_PRISMA');
/** gearva_platform: bypasses RLS. Only PlatformDb may use it. */
export const PLATFORM_PRISMA = Symbol('PLATFORM_PRISMA');

export const appPrismaProvider: FactoryProvider<PrismaClient> = {
  provide: APP_PRISMA,
  inject: [ENV],
  useFactory: (env: Env) => createPrismaClient(env.DATABASE_URL),
};

export const platformPrismaProvider: FactoryProvider<PrismaClient> = {
  provide: PLATFORM_PRISMA,
  inject: [ENV],
  useFactory: (env: Env) => createPrismaClient(env.PLATFORM_DATABASE_URL),
};
