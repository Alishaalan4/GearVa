import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ERROR_CODES, type OwnerOffer } from '@gearva/contracts';
import type { Prisma, TenantTx } from '@gearva/database';
import { OwnerDb } from '../common/db/owner-db';
import { AppException } from '../common/errors/app-exception';
import { garageLockReason } from '../common/garage-lock';
import { FILE_STORAGE, type FileStorage } from '../files/file-storage';

/** The app shows at most this many offers (mobile-api.md 7.1 is not paginated). */
const MAX_OFFERS = 50;

function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Offer not found');
}

/**
 * Offers in the owner app (mobile-api.md 7, flow.md 2.4 step 7 and 10): the active offers
 * of garages where the person is a live customer who has not turned offers off. A locked
 * or deleted garage shows none. Read through OwnerDb (owner_read on offers).
 */
@Injectable()
export class OwnerOffersService {
  constructor(
    private readonly db: OwnerDb,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /** What "visible to this owner now" means, for the list, the image and a view. */
  private visible(ownerId: string, now: Date): Prisma.OfferWhereInput {
    return {
      isActive: true,
      startsAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      garage: {
        deletedAt: null,
        customers: { some: { ownerId, deletedAt: null, marketingOptOut: false } },
      },
    };
  }

  private async find(tx: TenantTx, offerId: string, now: Date) {
    const offer = await tx.offer.findFirst({
      where: { id: offerId, ...this.visible(this.db.ownerId, now) },
      include: { garage: true, image: true },
    });
    return offer && !garageLockReason(offer.garage, now) ? offer : null;
  }

  /** mobile-api.md 7.1: newest first. */
  async list(): Promise<OwnerOffer[]> {
    const now = new Date();
    const rows = await this.db.run((tx) =>
      tx.offer.findMany({
        where: this.visible(this.db.ownerId, now),
        include: { garage: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: MAX_OFFERS,
      }),
    );
    return rows
      .filter((o) => !garageLockReason(o.garage, now))
      .map((o) => ({
        id: o.id,
        garage: { id: o.garage.id, name: o.garage.name },
        title: o.title,
        body: o.body,
        hasImage: o.imageFileId !== null,
        discountType: o.discountType,
        discountValue: o.discountValue,
        expiresAt: o.expiresAt?.toISOString() ?? null,
      }));
  }

  /** mobile-api.md 7.2. */
  async image(offerId: string): Promise<{ bytes: Buffer; mimeType: string }> {
    const offer = await this.db.run((tx) => this.find(tx, offerId, new Date()));
    const bytes = offer?.image ? await this.storage.get(offer.image.storageKey) : null;
    if (!offer?.image || !bytes) throw notFound();
    return { bytes, mimeType: offer.image.mimeType };
  }

  /** mobile-api.md 7.3: the first view counts; opening it again changes nothing. */
  async viewed(offerId: string): Promise<void> {
    const ownerId = this.db.ownerId;
    await this.db.run(async (tx) => {
      const offer = await this.find(tx, offerId, new Date());
      if (!offer) throw notFound();
      await tx.offerView.createMany({
        data: [{ garageId: offer.garageId, offerId: offer.id, ownerId }],
        skipDuplicates: true,
      });
    });
  }
}
