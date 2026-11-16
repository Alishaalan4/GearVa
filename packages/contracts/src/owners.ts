import { z } from 'zod';
import { LOCALES, type Locale } from './garages';
import { PASSWORD_MIN_LENGTH, type SetPasswordInput, setPasswordSchema } from './staff';

// Car owners and the owner app (V3, flow.md 2.4, docs/mobile-api.md).

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const newPassword = z.string().min(PASSWORD_MIN_LENGTH).max(200);
const anyPassword = z.string().min(1).max(200);
const refreshToken = z.string().min(20).max(200);

/**
 * POST /mobile/v1/auth/set-password: the web page behind the owner's invite and reset
 * links (gearva.online/owner/set-password?token=...). Same rule as staff: 10+ characters.
 */
export const ownerSetPasswordSchema = setPasswordSchema;
export type OwnerSetPasswordInput = SetPasswordInput;

export interface OwnerSetPasswordResponse {
  /** the login email to type in the app */
  email: string;
}

// ---------------------------------------------------------------------------
// Auth (mobile-api.md 2)
// ---------------------------------------------------------------------------

export const ownerLoginSchema = z.object({ email, password: anyPassword });
export type OwnerLoginInput = z.infer<typeof ownerLoginSchema>;

/** refresh and logout send the refresh token in the body (a phone has no cookies). */
export const ownerRefreshSchema = z.object({ refreshToken });
export type OwnerRefreshInput = z.infer<typeof ownerRefreshSchema>;

export const ownerForgotPasswordSchema = z.object({ email });
export type OwnerForgotPasswordInput = z.infer<typeof ownerForgotPasswordSchema>;

export interface OwnerAccount {
  id: string;
  name: string;
  email: string;
  locale: Locale;
}

/** The answer of login and refresh. */
export interface OwnerAuthResponse {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  owner: OwnerAccount;
}

// ---------------------------------------------------------------------------
// Profile (mobile-api.md 3)
// ---------------------------------------------------------------------------

/** One garage where the owner is a customer, with their preferences there. */
export interface OwnerGarage {
  id: string;
  name: string;
  phone: string;
  locationText: string;
  hasLogo: boolean;
  remindersOptOut: boolean;
  marketingOptOut: boolean;
}

export interface OwnerProfile extends OwnerAccount {
  /** E.164 */
  phone: string;
  unreadNotifications: number;
  garages: OwnerGarage[];
}

export const updateOwnerProfileSchema = z.object({ locale: z.enum(LOCALES) });
export type UpdateOwnerProfileInput = z.infer<typeof updateOwnerProfileSchema>;

export const ownerPreferencesSchema = z
  .object({ remindersOptOut: z.boolean().optional(), marketingOptOut: z.boolean().optional() })
  .refine((v) => v.remindersOptOut !== undefined || v.marketingOptOut !== undefined, {
    message: 'Send remindersOptOut or marketingOptOut',
  });
export type OwnerPreferencesInput = z.infer<typeof ownerPreferencesSchema>;

export const ownerChangePasswordSchema = z.object({
  currentPassword: anyPassword,
  newPassword,
});
export type OwnerChangePasswordInput = z.infer<typeof ownerChangePasswordSchema>;

export const ownerDeleteAccountSchema = z.object({ password: anyPassword });
export type OwnerDeleteAccountInput = z.infer<typeof ownerDeleteAccountSchema>;
