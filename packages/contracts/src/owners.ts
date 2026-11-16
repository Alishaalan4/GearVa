import { type SetPasswordInput, setPasswordSchema } from './staff';

// Car owners and the owner app (V3, flow.md 2.4, docs/mobile-api.md).

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
