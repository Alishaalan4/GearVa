import { Injectable } from '@nestjs/common';
import type { ActorType, AdminRole, StaffRole } from '@gearva/database';
import { ClsService, type ClsStore } from 'nestjs-cls';

/**
 * Who is making the request (README section 5.1, item 2). Set by the auth guards
 * (steps 1.4 and 1.6) from the verified token, never from the request body or URL.
 */
export interface Actor {
  type: ActorType;
  /** users.id, admin_users.id or owners.id; null for SYSTEM */
  id: string | null;
  /** the tenant; null for admins outside view-as-garage and for SYSTEM jobs */
  garageId: string | null;
  role: StaffRole | AdminRole | null;
  /** null = all branches */
  branchId: string | null;
}

export interface RequestStore extends ClsStore {
  actor?: Actor;
  ip?: string;
  userAgent?: string;
}

/** Per-request context stored with AsyncLocalStorage (nestjs-cls). */
@Injectable()
export class RequestContext {
  constructor(private readonly cls: ClsService<RequestStore>) {}

  setActor(actor: Actor): void {
    this.cls.set('actor', actor);
  }

  get actor(): Actor | undefined {
    return this.cls.isActive() ? this.cls.get('actor') : undefined;
  }

  get ip(): string | undefined {
    return this.cls.isActive() ? this.cls.get('ip') : undefined;
  }

  get userAgent(): string | undefined {
    return this.cls.isActive() ? this.cls.get('userAgent') : undefined;
  }

  /**
   * The current tenant. Throws when there is none: a tenant query without a tenant
   * is a programming error and must fail closed, never run unfiltered.
   */
  requireGarageId(): string {
    const garageId = this.actor?.garageId;
    if (!garageId) throw new Error('No tenant context: this code path needs a garage');
    return garageId;
  }
}
