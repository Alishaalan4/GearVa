import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { mergeMap, type Observable } from 'rxjs';
import { RequestContext } from '../common/context/request-context';
import { AUDIT_KEY, type AuditMeta } from './audit.decorator';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

/**
 * Every successful mutating request writes one audit_logs row (README section 5.6).
 * Requests without an actor (e.g. a public "forgot password") have nobody to attribute
 * the row to and are skipped; login endpoints set the actor before they return.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
    private readonly context: RequestContext,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!MUTATING.has(req.method)) return next.handle();

    const meta = this.reflector.getAllAndOverride<AuditMeta | undefined>(AUDIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const routePath = String((req.route as { path?: string } | undefined)?.path ?? req.path);
    if (!meta)
      this.logger.warn(`${req.method} ${routePath} has no @Audit(); using a generic action`);

    return next.handle().pipe(
      mergeMap(async (result: unknown) => {
        if (!this.context.actor) return result;
        try {
          await this.audit.record({
            action: meta?.action ?? `${req.method} ${routePath}`,
            entityType: meta?.entityType ?? 'unknown',
            entityId: asUuid((result as { id?: unknown } | null)?.id) ?? asUuid(req.params?.id),
          });
        } catch (error) {
          // The change is already committed; failing the response now would invite a
          // retry that repeats it. Log loudly instead (Sentry picks this up later).
          this.logger.error(`Audit write failed for ${req.method} ${routePath}`, error as Error);
        }
        return result;
      }),
    );
  }
}
