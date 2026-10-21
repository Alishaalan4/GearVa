import { z } from 'zod';

// Shared by the API (validation) and the admin web app (forms). flow.md 2.3.

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const totpCode = z.string().regex(/^\d{6}$/);

export const adminLoginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

/** Either the 6-digit code from the authenticator app or one recovery code. */
export const adminTotpVerifySchema = z
  .object({
    code: totpCode.optional(),
    recoveryCode: z.string().trim().min(10).max(20).optional(),
  })
  .refine((v) => (v.code === undefined) !== (v.recoveryCode === undefined), {
    message: 'Send either code or recoveryCode',
  });
export type AdminTotpVerifyInput = z.infer<typeof adminTotpVerifySchema>;

/** Turning 2FA on: one code from the app proves it was set up correctly. */
export const adminTotpEnableSchema = z.object({ code: totpCode });
export type AdminTotpEnableInput = z.infer<typeof adminTotpEnableSchema>;

export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'ADMIN';
  /** 2FA is optional; when on, every login also needs a code. */
  totpEnabled: boolean;
}

/**
 * The password step's answer: signed in already (2FA off), or a code is needed next.
 */
export type AdminLoginResponse = { next: 'DONE'; admin: AdminProfile } | { next: 'TOTP_VERIFY' };

export interface AdminTotpSetupResponse {
  /** otpauth:// URI, shown as a QR code by the admin web app */
  otpauthUri: string;
  /** the same secret in base32, for typing in by hand */
  secret: string;
}

export interface AdminTotpEnableResponse {
  /** Shown once, never again. Each one replaces a code for one login. */
  recoveryCodes: string[];
}
