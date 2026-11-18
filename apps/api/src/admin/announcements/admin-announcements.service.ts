import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  type AnnouncementDetail,
  type AnnouncementItem,
  type CreateAnnouncementInput,
  ERROR_CODES,
  type Paginated,
  type PaginationQuery,
} from '@gearva/contracts';
import type { Announcement, Notification, Prisma } from '@gearva/database';
import { RequestContext } from '../../common/context/request-context';
import { PlatformDb } from '../../common/db/platform-db';
import { AppException } from '../../common/errors/app-exception';
import { paginated, toSkipTake } from '../../common/pagination';
import { NotificationsService } from '../../notifications/notifications.service';
import { requireSuperAdmin } from '../admin-roles';
import { ADMIN_TIME_ZONE, nextDay, zonedDayStart } from '../admin-time';

function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Message not found');
}

type AnnouncementRow = Announcement & {
  sentBy: { id: string; name: string };
  _count: { garages: number; dismissals: number };
};

type EmailCounts = AnnouncementItem['emails'];

/**
 * Messages from Gearva to garages (flow.md 11.9, step 5.10), super admins only. A message
 * goes to every garage with the chosen statuses, or to hand-picked garages. Each garage
 * gets a banner in garage-web that every staff member sees until they close it (or until
 * `showUntil`), and, if asked, an email to each active garage owner. The emails are
 * ordinary notification rows of that garage (type ANNOUNCEMENT), so they show in its
 * notification log and use the same queue, retries and adapters.
 */
@Injectable()
export class AdminAnnouncementsService {
  private readonly logger = new Logger(AdminAnnouncementsService.name);

  constructor(
    private readonly platformDb: PlatformDb,
    private readonly notifications: NotificationsService,
    private readonly context: RequestContext,
  ) {}

  private get db() {
    return this.platformDb.client;
  }

  async create(input: CreateAnnouncementInput): Promise<AnnouncementDetail> {
    const adminId = requireSuperAdmin(this.context);
    // The banner shows through the whole last day (Beirut).
    const showUntil = input.showUntil
      ? zonedDayStart(nextDay(input.showUntil), ADMIN_TIME_ZONE)
      : null;
    if (showUntil && showUntil <= new Date()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_FAILED,
        'The last day of the banner is already over',
      );
    }

    const audience = input.audience;
    const garages = await this.db.garage.findMany({
      where: {
        deletedAt: null,
        ...(audience.kind === 'STATUS'
          ? { status: { in: audience.statuses } }
          : { id: { in: audience.garageIds } }),
      },
      select: { id: true, name: true },
    });
    if (garages.length === 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.NO_GARAGES_MATCH,
        'No garage matches this audience',
      );
    }
    const garageName = new Map(garages.map((g) => [g.id, g.name]));
    // Each garage's active owner(s); every staff member has an email.
    const owners = input.sendEmail
      ? await this.db.user.findMany({
          where: { garageId: { in: [...garageName.keys()] }, role: 'OWNER', isActive: true },
          select: { id: true, garageId: true, name: true, email: true, locale: true },
        })
      : [];

    const { announcement, queued } = await this.db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const announcement = await tx.announcement.create({
          data: {
            title: input.title,
            body: input.body,
            showUntil,
            emailSent: input.sendEmail,
            sentById: adminId,
          },
        });
        await tx.announcementGarage.createMany({
          data: garages.map((g) => ({ announcementId: announcement.id, garageId: g.id })),
        });
        if (owners.length === 0) return { announcement, queued: [] as Notification[] };
        await tx.notification.createMany({
          data: owners.map((o) => ({
            garageId: o.garageId,
            userId: o.id,
            channel: 'EMAIL' as const,
            type: 'ANNOUNCEMENT' as const,
            template: 'announcement',
            locale: o.locale === 'ar' ? 'ar' : 'en',
            recipient: o.email,
            payload: {
              name: o.name,
              garageName: garageName.get(o.garageId) ?? '',
              title: input.title,
              body: input.body,
            },
            dedupeKey: `ANNOUNCEMENT:${announcement.id}:${o.id}`,
            refType: 'announcement',
            refId: announcement.id,
            status: 'QUEUED' as const,
          })),
          skipDuplicates: true,
        });
        const queued = await tx.notification.findMany({
          where: { refType: 'announcement', refId: announcement.id },
        });
        return { announcement, queued };
      },
      { timeout: 30_000 },
    );

    // After commit. A Redis failure leaves the rows QUEUED; the retry job picks them up.
    for (const notification of queued) {
      try {
        await this.notifications.dispatch(notification);
      } catch (error) {
        this.logger.error(
          `Could not queue notification ${notification.id}; it stays QUEUED`,
          error as Error,
        );
      }
    }
    return this.get(announcement.id);
  }

  async list(query: PaginationQuery): Promise<Paginated<AnnouncementItem>> {
    requireSuperAdmin(this.context);
    const [rows, total] = await Promise.all([
      this.db.announcement.findMany({
        include: this.include(),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(query),
      }),
      this.db.announcement.count(),
    ]);
    const emails = await this.emailCounts(rows.map((r) => r.id));
    return paginated(
      rows.map((r) => this.toItem(r, emails)),
      total,
      query,
    );
  }

  async get(id: string): Promise<AnnouncementDetail> {
    requireSuperAdmin(this.context);
    const row = await this.db.announcement.findUnique({
      where: { id },
      include: {
        ...this.include(),
        garages: {
          include: { garage: { select: { id: true, name: true, status: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!row) throw notFound();
    const emails = await this.emailCounts([row.id]);
    return {
      ...this.toItem(row, emails),
      garageList: row.garages.map((g) => g.garage),
    };
  }

  /** Takes the banner down everywhere now; emails already sent stay sent. */
  async end(id: string): Promise<AnnouncementDetail> {
    requireSuperAdmin(this.context);
    const row = await this.db.announcement.findUnique({ where: { id } });
    if (!row) throw notFound();
    const now = new Date();
    if (!row.showUntil || row.showUntil > now) {
      await this.db.announcement.update({ where: { id }, data: { showUntil: now } });
    }
    return this.get(id);
  }

  private include() {
    return {
      sentBy: { select: { id: true, name: true } },
      _count: { select: { garages: true, dismissals: true } },
    } satisfies Prisma.AnnouncementInclude;
  }

  private async emailCounts(ids: string[]): Promise<Map<string, EmailCounts>> {
    const groups = await this.db.notification.groupBy({
      by: ['refId', 'status'],
      where: { refType: 'announcement', refId: { in: ids } },
      _count: { _all: true },
    });
    const counts = new Map<string, EmailCounts>();
    for (const g of groups) {
      if (!g.refId) continue;
      const c = counts.get(g.refId) ?? { sent: 0, failed: 0, queued: 0 };
      if (g.status === 'SENT' || g.status === 'DELIVERED') c.sent += g._count._all;
      else if (g.status === 'QUEUED') c.queued += g._count._all;
      else c.failed += g._count._all;
      counts.set(g.refId, c);
    }
    return counts;
  }

  private toItem(r: AnnouncementRow, emails: Map<string, EmailCounts>): AnnouncementItem {
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      sentBy: r.sentBy,
      showUntil: r.showUntil?.toISOString() ?? null,
      showing: !r.showUntil || r.showUntil > new Date(),
      emailSent: r.emailSent,
      garages: r._count.garages,
      emails: emails.get(r.id) ?? { sent: 0, failed: 0, queued: 0 },
      dismissals: r._count.dismissals,
    };
  }
}
