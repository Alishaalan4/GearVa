import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES, type GarageAnnouncement } from '@gearva/contracts';
import { RequestContext } from '../common/context/request-context';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';

/** At most this many banners at once; older ones wait until newer ones are closed. */
const MAX_BANNERS = 5;

/**
 * garage-web's banners (flow.md 11.9, step 5.10): Gearva's messages to this garage that
 * still show and that this staff member has not closed. Through RLS: a garage reads only
 * the messages it received (announcement_read policy).
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly db: TenantDb,
    private readonly context: RequestContext,
  ) {}

  async active(): Promise<GarageAnnouncement[]> {
    const garageId = this.db.garageId;
    // An admin in "View as" sees what the garage sees; they have no dismissals.
    const userId = this.context.actor?.type === 'STAFF' ? this.context.actor.id : null;
    const rows = await this.db.run((tx) =>
      tx.announcement.findMany({
        where: {
          garages: { some: { garageId } },
          OR: [{ showUntil: null }, { showUntil: { gt: new Date() } }],
          ...(userId ? { dismissals: { none: { userId } } } : {}),
        },
        select: { id: true, title: true, body: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: MAX_BANNERS,
      }),
    );
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  /** Closes the banner for this staff member only (others still see it). */
  async dismiss(announcementId: string): Promise<void> {
    const garageId = this.db.garageId;
    const userId = this.context.actor?.id;
    if (this.context.actor?.type !== 'STAFF' || !userId) {
      throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Staff only');
    }
    await this.db.run(async (tx) => {
      const received = await tx.announcementGarage.findFirst({
        where: { garageId, announcementId },
        select: { id: true },
      });
      if (!received) {
        throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Message not found');
      }
      await tx.announcementDismissal.createMany({
        data: [{ garageId, announcementId, userId }],
        skipDuplicates: true,
      });
    });
  }
}
