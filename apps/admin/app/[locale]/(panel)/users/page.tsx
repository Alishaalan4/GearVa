import { UsersPage } from '@/features/users/users-page';

/** flow.md 11.8: super admins only (the page and the API both check). */
export default function Users() {
  return <UsersPage />;
}
