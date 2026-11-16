import { z } from 'zod';
import { paginationQuerySchema } from './pagination';
import { PASSWORD_MIN_LENGTH, STAFF_ROLES, type StaffRole } from './staff';

// The super admin's Users page (flow.md 11.8, step 5.9): Gearva's admins, every garage's
// staff, and the car owners with the app. Super admins only.

export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;
export type AdminRoleName = (typeof ADMIN_ROLES)[number];

/** Admin accounts can create and suspend every garage: a longer password (as the seed). */
export const ADMIN_PASSWORD_MIN_LENGTH = 12;

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const adminPassword = z.string().min(ADMIN_PASSWORD_MIN_LENGTH).max(200);
const userPassword = z.string().min(PASSWORD_MIN_LENGTH).max(200);
const name = z.string().trim().min(2).max(120);

// ---------------------------------------------------------------------------
// Admins
// ---------------------------------------------------------------------------

export interface AdminUserItem {
  id: string;
  email: string;
  name: string;
  role: AdminRoleName;
  isActive: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** A new admin with the password the super admin chose and tells them (no email). */
export const createAdminUserSchema = z.object({
  name,
  email,
  role: z.enum(ADMIN_ROLES),
  password: adminPassword,
});
export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;

export const updateAdminUserSchema = z
  .object({ name, role: z.enum(ADMIN_ROLES), isActive: z.boolean() })
  .partial();
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;

export const setAdminPasswordSchema = z.object({ password: adminPassword });
export type SetAdminPasswordInput = z.infer<typeof setAdminPasswordSchema>;

// ---------------------------------------------------------------------------
// Garage staff (every garage)
// ---------------------------------------------------------------------------

export const adminStaffQuerySchema = paginationQuerySchema.extend({
  /** name or email */
  q: z.string().trim().max(120).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  garageId: z.uuid().optional(),
});
export type AdminStaffQuery = z.infer<typeof adminStaffQuerySchema>;

export interface AdminStaffItem {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  garage: { id: string; name: string };
  /** null = all branches */
  branchName: string | null;
  isActive: boolean;
  /** false until the person used their invite link */
  hasPassword: boolean;
  lastLoginAt: string | null;
}

export const updateAdminStaffSchema = z.object({ isActive: z.boolean() });
export type UpdateAdminStaffInput = z.infer<typeof updateAdminStaffSchema>;

/** Garage staff and car owners: the app's own rule, 10+ characters. */
export const setUserPasswordSchema = z.object({ password: userPassword });
export type SetUserPasswordInput = z.infer<typeof setUserPasswordSchema>;

// ---------------------------------------------------------------------------
// Car owners
// ---------------------------------------------------------------------------

/** `ACTIVE` uses the app; `INVITED` has a login email but no password yet; `NONE` neither. */
export const OWNER_ACCOUNT_STATES = ['ACTIVE', 'INVITED', 'NONE'] as const;
export type OwnerAccountState = (typeof OWNER_ACCOUNT_STATES)[number];

export const adminOwnersQuerySchema = paginationQuerySchema.extend({
  /** name, the end of the phone (4+ digits), or email */
  q: z.string().trim().max(120).optional(),
  account: z.enum(OWNER_ACCOUNT_STATES).optional(),
});
export type AdminOwnersQuery = z.infer<typeof adminOwnersQuerySchema>;

export interface AdminOwnerItem {
  id: string;
  name: string;
  phone: string;
  /** the app login, if any */
  email: string | null;
  account: OwnerAccountState;
  garages: { id: string; name: string }[];
  lastLoginAt: string | null;
}

/** What a "send link" did: which email, and whether it was an invite or a reset. */
export interface SentLink {
  kind: 'invite' | 'reset';
  email: string;
}
