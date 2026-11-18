import { z } from 'zod';
import { GARAGE_STATUSES, type GarageStatus } from './garages';
import { paginationQuerySchema } from './pagination';

// Step 5.10, super admins only: the audit log (flow.md 11.10) and messages to garages
// (flow.md 11.9).

const isoDate = z.iso.date();

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const AUDIT_ACTOR_TYPES = ['ADMIN', 'STAFF', 'OWNER', 'SYSTEM'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const auditLogQuerySchema = paginationQuerySchema.extend({
  actorType: z.enum(AUDIT_ACTOR_TYPES).optional(),
  /** only this person's actions (an admin, a staff member or a car owner) */
  actorId: z.uuid().optional(),
  garageId: z.uuid().optional(),
  /** part of the action name, e.g. "password" or "admin.users" */
  q: z.string().trim().max(100).optional(),
  /** days in Asia/Beirut, both included */
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export interface AuditLogItem {
  id: string;
  createdAt: string;
  actorType: AuditActorType;
  /** null for SYSTEM, or when the person was deleted */
  actor: { id: string; name: string; email: string | null } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  garage: { id: string; name: string } | null;
  before: unknown;
  after: unknown;
  ip: string | null;
}

export const accessLogQuerySchema = paginationQuerySchema.extend({
  adminId: z.uuid().optional(),
  garageId: z.uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type AccessLogQuery = z.infer<typeof accessLogQuerySchema>;

/** An admin inside a garage's data ("View as", flow.md 11.3): the pages, never the data. */
export interface AccessLogItem {
  id: string;
  createdAt: string;
  admin: { id: string; name: string };
  garage: { id: string; name: string };
  /** VIEW_AS_GARAGE_START, VIEW_AS_GARAGE_END, RECORD_VIEWED */
  action: string;
  path: string | null;
  ip: string | null;
}

// ---------------------------------------------------------------------------
// Messages to garages
// ---------------------------------------------------------------------------

export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 2000;
/** One message reaches at most this many hand-picked garages (a status reaches all). */
export const ANNOUNCEMENT_GARAGES_MAX = 500;

export const announcementAudienceSchema = z.discriminatedUnion('kind', [
  /** every garage with one of these statuses (all four = every garage) */
  z.object({
    kind: z.literal('STATUS'),
    statuses: z.array(z.enum(GARAGE_STATUSES)).min(1).max(GARAGE_STATUSES.length),
  }),
  /** these garages only */
  z.object({
    kind: z.literal('SELECTED'),
    garageIds: z.array(z.uuid()).min(1).max(ANNOUNCEMENT_GARAGES_MAX),
  }),
]);
export type AnnouncementAudience = z.infer<typeof announcementAudienceSchema>;

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(3).max(ANNOUNCEMENT_TITLE_MAX),
  body: z.string().trim().min(3).max(ANNOUNCEMENT_BODY_MAX),
  audience: announcementAudienceSchema,
  /** also email each garage's owner */
  sendEmail: z.boolean(),
  /** the last day the banner shows (Asia/Beirut); none = until each person closes it */
  showUntil: isoDate.nullable().optional(),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  sentBy: { id: string; name: string };
  /** null = until each person closes it */
  showUntil: string | null;
  /** false once ended or past showUntil */
  showing: boolean;
  emailSent: boolean;
  garages: number;
  /** of the emails written for this message */
  emails: { sent: number; failed: number; queued: number };
  /** staff members who closed the banner */
  dismissals: number;
}

export interface AnnouncementDetail extends AnnouncementItem {
  garageList: { id: string; name: string; status: GarageStatus }[];
}

/** garage-web: the banners for the signed-in staff member. */
export interface GarageAnnouncement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}
