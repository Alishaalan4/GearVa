import { SetPasswordForm } from '@/features/auth/set-password-form';

/** The invite and password-reset emails link to /set-password?token=... (flow.md 2.1). */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <SetPasswordForm token={typeof token === 'string' ? token : undefined} />;
}
