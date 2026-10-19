import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';
import type { NotificationChannel, SendInput, SendResult } from '../notification-channel';
import { renderEmail } from '../templates';

/** EMAIL_ADAPTER=console: prints the email instead of sending it (development, tests). */
@Injectable()
export class ConsoleEmailChannel implements NotificationChannel {
  readonly channel = 'EMAIL' as const;
  private readonly logger = new Logger('Email');

  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(input: SendInput): Promise<SendResult> {
    const email = renderEmail(input.template, input.locale, input.data);
    this.logger.log(
      `\nFrom: ${this.env.EMAIL_FROM}\nTo: ${input.recipient}\nSubject: ${email.subject}\n\n${email.text}\n`,
    );
    return { ok: true };
  }
}
