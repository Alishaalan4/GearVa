import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type CreateOfferInput,
  ERROR_CODES,
  type OfferItem,
  type OfferListQuery,
  type Paginated,
  type UpdateOfferInput,
  offerState,
} from '@gearva/contracts';
import type { Offer } from '@gearva/database';
import { RequestContext } from '../common/context/request-context';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';
import { paginated, toSkipTake } from '../common/pagination';
import { FILE_STORAGE, type FileStorage } from '../files/file-storage';
import { imageType } from '../files/image-type';

function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Offer not found');
}

function badRequest(message: string): AppException {
  return new AppException(HttpStatus.BAD_REQUEST, ERROR_CODES.BAD_REQUEST, message);
}

function toItem(offer: Offer & { _count: { views: number } }): OfferItem {
  const startsAt = offer.startsAt.toISOString();
  const expiresAt = offer.expiresAt?.toISOString() ?? null;
  return {
    id: offer.id,
    title: offer.title,
    body: offer.body,
    hasImage: offer.imageFileId !== null,
    discountType: offer.discountType,
    discountValue: offer.discountValue,
    startsAt,
    expiresAt,
    isActive: offer.isActive,
    state: offerState({ isActive: offer.isActive, startsAt, expiresAt }),
    viewCount: offer._count.views,
    createdAt: offer.createdAt.toISOString(),
  };
}

const WITH_VIEWS = { _count: { select: { views: true } } } as const;

/**
 * A garage's offers (flow.md 10, step 6.5): OWNER and MANAGER create and edit them; the
 * owner app shows the active ones to the garage's customers. Never deleted: switched off
 * with isActive (database.md 6.1). Targeting and broadcasts are Phase 7, so every offer
 * is for all customers (`target = ALL`).
 */
@Injectable()
export class OffersService {
  constructor(
    private readonly db: TenantDb,
    private readonly context: RequestContext,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async list(query: OfferListQuery): Promise<Paginated<OfferItem>> {
    const where = { garageId: this.db.garageId };
    const [rows, total] = await this.db.run(
      async (tx) =>
        [
          await tx.offer.findMany({
            where,
            include: WITH_VIEWS,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            ...toSkipTake(query),
          }),
          await tx.offer.count({ where }),
        ] as const,
    );
    return paginated(rows.map(toItem), total, query);
  }

  async detail(offerId: string): Promise<OfferItem> {
    const garageId = this.db.garageId;
    const offer = await this.db.run((tx) =>
      tx.offer.findFirst({ where: { id: offerId, garageId }, include: WITH_VIEWS }),
    );
    if (!offer) throw notFound();
    return toItem(offer);
  }

  async create(input: CreateOfferInput): Promise<OfferItem> {
    const garageId = this.db.garageId;
    const createdById = this.context.actor?.id;
    if (!createdById) throw new Error('An offer needs a signed-in staff member');
    const offer = await this.db.run((tx) =>
      tx.offer.create({
        data: {
          garageId,
          title: input.title,
          body: input.body,
          discountType: input.discountType,
          discountValue: input.discountValue,
          startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          isActive: input.isActive ?? true,
          target: 'ALL',
          createdById,
        },
        include: WITH_VIEWS,
      }),
    );
    return toItem(offer);
  }

  /** The result is checked as a whole: a PERCENT at most 100, the end after the start. */
  async update(offerId: string, input: UpdateOfferInput): Promise<OfferItem> {
    const garageId = this.db.garageId;
    const offer = await this.db.run(async (tx) => {
      const current = await tx.offer.findFirst({ where: { id: offerId, garageId } });
      if (!current) throw notFound();
      const discountType = input.discountType ?? current.discountType;
      const discountValue = input.discountValue ?? current.discountValue;
      const startsAt = input.startsAt ? new Date(input.startsAt) : current.startsAt;
      const expiresAt =
        input.expiresAt === undefined
          ? current.expiresAt
          : input.expiresAt === null
            ? null
            : new Date(input.expiresAt);
      if (discountType === 'PERCENT' && discountValue > 100) {
        throw badRequest('A percent discount is at most 100');
      }
      if (expiresAt && expiresAt <= startsAt) throw badRequest('The end must be after the start');
      return tx.offer.update({
        where: { id: current.id },
        data: {
          title: input.title,
          body: input.body,
          discountType,
          discountValue,
          startsAt,
          expiresAt,
          isActive: input.isActive,
        },
        include: WITH_VIEWS,
      });
    });
    return toItem(offer);
  }

  /** PNG or JPEG, checked from the bytes. A new image replaces the old one. */
  async saveImage(offerId: string, bytes: Buffer): Promise<OfferItem> {
    const mimeType = imageType(bytes);
    if (!mimeType) throw badRequest('The image must be a PNG or JPEG');
    const garageId = this.db.garageId;
    const createdById = this.context.actor?.id;
    if (!createdById) throw new Error('An image needs a signed-in staff member');
    await this.detail(offerId);
    const storageKey = `garages/${garageId}/offers/${offerId}-${randomUUID()}`;
    await this.storage.put(storageKey, bytes, mimeType);
    const offer = await this.db.run(async (tx) => {
      const file = await tx.file.create({
        data: {
          garageId,
          kind: 'OFFER_IMAGE',
          storageKey,
          mimeType,
          sizeBytes: bytes.length,
          createdById,
        },
      });
      return tx.offer.update({
        where: { id: offerId },
        data: { imageFileId: file.id },
        include: WITH_VIEWS,
      });
    });
    return toItem(offer);
  }

  async image(offerId: string): Promise<{ bytes: Buffer; mimeType: string }> {
    const garageId = this.db.garageId;
    const file = await this.db.run(async (tx) => {
      const offer = await tx.offer.findFirst({
        where: { id: offerId, garageId },
        include: { image: true },
      });
      if (!offer) throw notFound();
      return offer.image;
    });
    const bytes = file ? await this.storage.get(file.storageKey) : null;
    if (!file || !bytes) throw notFound();
    return { bytes, mimeType: file.mimeType };
  }
}
