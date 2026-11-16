import { OwnerSetPasswordForm } from '@/features/owner/owner-set-password-form';

/**
 * A car owner's invite and reset emails link to /<locale>/owner/set-password?token=...
 * (flow.md 2.4): the password for the Gearva owner app.
 */
export default async function OwnerSetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <OwnerSetPasswordForm token={typeof token === 'string' ? token : undefined} />;
}
