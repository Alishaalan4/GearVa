import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'gearva:audit';

export interface AuditMeta {
  /** e.g. `garage.create`, `invoice.cancel` (database.md section 4.6) */
  action: string;
  /** e.g. `garage`, `invoice` */
  entityType: string;
}

/** Names the audit row a mutating endpoint writes. Put it on every POST/PUT/PATCH/DELETE. */
export const Audit = (action: string, entityType: string) =>
  SetMetadata(AUDIT_KEY, { action, entityType } satisfies AuditMeta);
