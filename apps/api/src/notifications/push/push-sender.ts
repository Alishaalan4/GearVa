import { createSign } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { z } from 'zod';

/** One push message: the visible part and the data the app uses on tap (mobile-api.md 6.3). */
export interface PushMessage {
  title: string;
  body: string;
  data: Record<string, string>;
}

/** `DEAD`: the token no longer exists (app removed, token replaced): delete it. */
export type PushOutcome = 'SENT' | 'DEAD' | 'FAILED';

export interface PushSender {
  /** false when no Firebase key is set: pushes are skipped, the inbox still works */
  readonly enabled: boolean;
  send(token: string, message: PushMessage): Promise<PushOutcome>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');

/** Without FCM_SERVICE_ACCOUNT_JSON (development, or before the key is set on Render). */
export class NoPushSender implements PushSender {
  readonly enabled = false;
  send(): Promise<PushOutcome> {
    return Promise.resolve('FAILED');
  }
}

/** The fields of a Firebase service account key file that sending needs. */
export const serviceAccountSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.email(),
  private_key: z.string().includes('PRIVATE KEY'),
  token_uri: z.url().default('https://oauth2.googleapis.com/token'),
});
export type ServiceAccount = z.infer<typeof serviceAccountSchema>;

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/**
 * Firebase Cloud Messaging HTTP v1 (the current API; the legacy server key is gone).
 * The service account signs a JWT (RS256) that Google trades for a 1-hour access token,
 * kept until shortly before it expires; each message is one POST. Built on node:crypto and
 * fetch, so no Firebase SDK is needed.
 */
export class FcmPushSender implements PushSender {
  readonly enabled = true;
  private readonly logger = new Logger(FcmPushSender.name);
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly account: ServiceAccount) {}

  async send(token: string, message: PushMessage): Promise<PushOutcome> {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.token()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: message.data,
            android: { priority: 'HIGH' },
            apns: { payload: { aps: { sound: 'default' } } },
          },
        }),
      },
    );
    if (res.ok) return 'SENT';
    const text = await res.text();
    // FCM: UNREGISTERED (404) = the app was removed or the token replaced; an invalid
    // token (400 INVALID_ARGUMENT naming the token) will never work either.
    if (res.status === 404 || (res.status === 400 && /registration token/i.test(text))) {
      return 'DEAD';
    }
    if (res.status === 401) this.accessToken = null;
    this.logger.warn(`FCM send failed (${res.status}): ${text.slice(0, 300)}`);
    return 'FAILED';
  }

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) {
      return this.accessToken.value;
    }
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({
        iss: this.account.client_email,
        scope: SCOPE,
        aud: this.account.token_uri,
        iat: now,
        exp: now + 3600,
      }),
    );
    const signature = createSign('RSA-SHA256')
      .update(`${header}.${claims}`)
      .sign(this.account.private_key, 'base64url');
    const res = await fetch(this.account.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }),
    });
    if (!res.ok) {
      throw new Error(`Google refused the Firebase key (${res.status}): ${await res.text()}`);
    }
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }
}
