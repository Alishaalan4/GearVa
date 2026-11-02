import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type InvoiceSettings,
  type UpdateInvoiceSettingsInput,
} from '@gearva/contracts';
import type { GarageSettings } from '@gearva/database';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';

function toSettings(settings: GarageSettings): InvoiceSettings {
  return {
    brandColor: settings.brandColor,
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
  constructor(private readonly db: TenantDb) {}

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
}
