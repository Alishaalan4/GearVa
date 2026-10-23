import { z } from 'zod';
import type { GarageStatus, Locale } from './garages';
import { LOCALES } from './garages';
import { optionalPhoneSchema } from './phone';

// Garage staff (V1): set password, login, branches and staff management.
// flow.md 1 (permission matrix), 2.1, 2.2, 2.5. Shared by the API and garage-web.

export const STAFF_ROLES = ['OWNER', 'MANAGER', 'MECHANIC', 'RECEPTIONIST'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Roles the owner can give. The single OWNER is created by the admin (flow.md 2.1). */
export const INVITABLE_ROLES = ['MANAGER', 'MECHANIC', 'RECEPTIONIST'] as const;

/** Mechanics and receptionists work in one branch (flow.md 1). */
export const BRANCH_BOUND_ROLES: readonly StaffRole[] = ['MECHANIC', 'RECEPTIONIST'];

export const PASSWORD_MIN_LENGTH = 10;

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const password = z.string().min(PASSWORD_MIN_LENGTH).max(200);

/** The set-password page, for both the invite link and a password-reset link. */
export const setPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password,
});
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

export const staffLoginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

/** Why a garage is locked (flow.md 2.5); sent in `details.reason` with GARAGE_LOCKED. */
export type GarageLockReason = 'suspended' | 'expired' | 'trial_ended';

export interface StaffProfile {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  locale: Locale;
  /** null = all branches */
  branchId: string | null;
  garage: {
    id: string;
    name: string;
    status: GarageStatus;
    defaultLocale: Locale;
  };
}

// Branches (OWNER manages; OWNER and MANAGER can list).

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const createBranchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: optionalText(200),
  phone: optionalPhoneSchema,
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export interface BranchItem {
  id: string;
  name: string;
  /** BR1, BR2, ... used in invoice numbers; never changes */
  code: string;
  address: string | null;
  phone: string | null;
  isMain: boolean;
  isActive: boolean;
}

// Staff (OWNER only).

const branchRule = (v: { role?: StaffRole; branchId?: string | null }) =>
  v.role === undefined || !BRANCH_BOUND_ROLES.includes(v.role) || !!v.branchId;
const branchRuleMessage = {
  message: 'Mechanics and receptionists need a branch',
  path: ['branchId'],
};

export const inviteStaffSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email,
    role: z.enum(INVITABLE_ROLES),
    /** null = all branches (managers only) */
    branchId: z.uuid().nullable(),
    locale: z.enum(LOCALES),
  })
  .refine(branchRule, branchRuleMessage);
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

export const updateStaffSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    role: z.enum(INVITABLE_ROLES).optional(),
    branchId: z.uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(branchRule, branchRuleMessage);
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export interface StaffItem {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  locale: Locale;
  branchId: string | null;
  isActive: boolean;
  /** false until the invite link was used */
  hasPassword: boolean;
  linkExpiresAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}
