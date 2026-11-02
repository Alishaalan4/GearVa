import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type InvoiceSettings,
  type UpdateInvoiceSettingsInput,
} from '@gearva/contracts';
import type { GarageSettings } from '@gearva/database';
import { RequestContext } from '../common/context/request-context';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';
import { FILE_STORAGE, type FileStorage } from '../files/file-storage';

function imageType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'image/jpeg';
  return null;
}

function toSettings(settings: GarageSettings): InvoiceSettings {
  return {
    brandColor: settings.brandColor,
    hasLogo: settings.logoFileId !== null,
    invoiceNumberFormat: settings.invoiceNumberFormat,
    termsText: settings.termsText,
    vatEnabled: settings.vatEnabled,
    vatRatePercent: settings.vatRatePercent?.toString() ?? null,
    vatNumber: settings.vatNumber,
  };
}

/** The garage's invoice settings (database.md 4.2). VAT stays off until a garage turns it on. */
@Injectable()
export class InvoiceSettingsService {
  constructor(
    private readonly db: TenantDb,
    private readonly context: RequestContext,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async get(): Promise<InvoiceSettings> {
    const garageId = this.db.garageId;
    return toSettings(
      await this.db.run((tx) => tx.garageSettings.findUniqueOrThrow({ where: { garageId } })),
    );
  }

  async update(input: UpdateInvoiceSettingsInput): Promise<InvoiceSettings> {
    const garageId = this.db.garageId;
    const saved = await this.db.run(async (tx) => {
      const current = await tx.garageSettings.findUniqueOrThrow({ where: { garageId } });
      const vatEnabled = input.vatEnabled ?? current.vatEnabled;
      const vatRate =
        input.vatRatePercent === undefined ? current.vatRatePercent : input.vatRatePercent;
      if (vatEnabled && vatRate === null) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.BAD_REQUEST,
          'VAT needs a rate before it can be turned on',
        );
      }
      return tx.garageSettings.update({ where: { garageId }, data: input });
    });
    return toSettings(saved);
  }

  /** The type comes from the bytes, never from the upload's own claim. */
  async saveLogo(bytes: Buffer): Promise<InvoiceSettings> {
    const mimeType = imageType(bytes);
    if (!mimeType) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.BAD_REQUEST,
        'The logo must be a PNG or JPEG image',
      );
    }
    const garageId = this.db.garageId;
    const createdById = this.context.actor?.id;
    if (!createdById) throw new Error('A logo needs a signed-in staff member');
    const storageKey = `garages/${garageId}/logo-${randomUUID()}`;
    await this.storage.put(storageKey, bytes, mimeType);
    const saved = await this.db.run(async (tx) => {
      const file = await tx.file.create({
        data: {
          garageId,
          kind: 'LOGO',
          storageKey,
          mimeType,
          sizeBytes: bytes.length,
          createdById,
        },
      });
      return tx.garageSettings.update({ where: { garageId }, data: { logoFileId: file.id } });
    });
    return toSettings(saved);
  }

  async logo(): Promise<{ bytes: Buffer; mimeType: string }> {
    const garageId = this.db.garageId;
    const file = await this.db.run(async (tx) => {
      const settings = await tx.garageSettings.findUniqueOrThrow({
        where: { garageId },
        include: { logo: true },
      });
      return settings.logo;
    });
    const bytes = file ? await this.storage.get(file.storageKey) : null;
    if (!file || !bytes) {
      throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'No logo yet');
    }
    return { bytes, mimeType: file.mimeType };
  }
}
