import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import { RequestContext } from '../context/request-context';
import { PlatformDb } from './platform-db';
import {
  APP_PRISMA,
  PLATFORM_PRISMA,
  appPrismaProvider,
  platformPrismaProvider,
} from './prisma.providers';
import { TenantDb } from './tenant-db';

// The raw clients are not exported: other modules get TenantDb or PlatformDb only.
@Global()
@Module({
  providers: [appPrismaProvider, platformPrismaProvider, RequestContext, TenantDb, PlatformDb],
  exports: [RequestContext, TenantDb, PlatformDb],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(APP_PRISMA) private readonly app: PrismaClient,
    @Inject(PLATFORM_PRISMA) private readonly platform: PrismaClient,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.app.$disconnect(), this.platform.$disconnect()]);
  }
}
