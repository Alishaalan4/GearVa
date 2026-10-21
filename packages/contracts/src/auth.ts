import { z } from 'zod';

// Shared by the API (validation) and the admin web app (forms). flow.md 2.3.

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const adminLoginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

/** Either the 6-digit code from the authenticator app or one recovery code. */
export const adminTotpVerifySchema = z
  .object({
    code: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    recoveryCode: z.string().trim().min(10).max(20).optional(),
  })
  .refine((v) => (v.code === undefined) !== (v.recoveryCode === undefined), {
    message: 'Send either code or recoveryCode',
  });
export type AdminTotpVerifyInput = z.infer<typeof adminTotpVerifySchema>;

/** What the password step asks for next. */
export type AdminLoginNext = 'TOTP_SETUP' | 'TOTP_VERIFY';

export interface AdminLoginResponse {
  next: AdminLoginNext;
}

export interface AdminTotpSetupResponse {
  /** otpauth:// URI, shown as a QR code by the admin web app */
  otpauthUri: string;
  /** the same secret in base32, for typing in by hand */
  secret: string;
}

export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'ADMIN';
}

export interface AdminSessionResponse extends AdminProfile {
  /** Only on the very first 2FA verification. Shown once, never again. */
  recoveryCodes?: string[];
}
