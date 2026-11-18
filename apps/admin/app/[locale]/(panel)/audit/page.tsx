import { Suspense } from 'react';
import { AuditPage } from '@/features/audit/audit-page';

/** flow.md 11.10: super admins only (the page and the API both check). */
export default function Page() {
  return (
    <Suspense>
      <AuditPage />
    </Suspense>
  );
}
