import { RolesOnly } from '@/components/roles-only';
import { OffersPage } from '@/features/offers/offers-page';

/** flow.md 1: offers are for the owner and managers. */
export default function OffersRoute() {
  return (
    <RolesOnly roles={['OWNER', 'MANAGER']}>
      <OffersPage />
    </RolesOnly>
  );
}
