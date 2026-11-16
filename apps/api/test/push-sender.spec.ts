// Step 6.4: the Firebase HTTP v1 sender, against a mocked network (the real call is
// checked with a phone, README 6 "Done when"): the signed token request, the message,
// token reuse, and the outcomes the inbox channel acts on.
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { FcmPushSender } from '../src/notifications/push/push-sender';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const account = {
  project_id: 'gearva-test',
  client_email: 'firebase-adminsdk@gearva-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  token_uri: 'https://oauth2.googleapis.com/token',
};
const message = { title: 'Oil change due soon', body: 'Kindly check your km', data: { type: 'X' } };

describe('FcmPushSender (Firebase HTTP v1)', () => {
  const realFetch = global.fetch;
  let calls: { url: string; init: RequestInit }[];
  let sendStatus: number;
  let sendBody: string;

  beforeEach(() => {
    calls = [];
    sendStatus = 200;
    sendBody = '{"name":"projects/gearva-test/messages/1"}';
    global.fetch = jest.fn((url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url) === account.token_uri) {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 })),
        );
      }
      return Promise.resolve(new Response(sendBody, { status: sendStatus }));
    }) as typeof fetch;
  });

  afterAll(() => {
    global.fetch = realFetch;
  });

  it('signs a JWT with the service account and sends the message', async () => {
    const sender = new FcmPushSender(account);
    expect(await sender.send('device-token-1', message)).toBe('SENT');

    const [tokenCall, sendCall] = calls;
    const assertion = new URLSearchParams(String(tokenCall?.init.body)).get('assertion') as string;
    const [header, claims, signature] = assertion.split('.') as [string, string, string];
    const ok = createVerify('RSA-SHA256')
      .update(`${header}.${claims}`)
      .verify(publicKey, signature, 'base64url');
    expect(ok).toBe(true);
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: account.token_uri,
    });

    expect(sendCall?.url).toBe('https://fcm.googleapis.com/v1/projects/gearva-test/messages:send');
    expect((sendCall?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer ya29.test',
    );
    expect(JSON.parse(String(sendCall?.init.body))).toMatchObject({
      message: {
        token: 'device-token-1',
        notification: { title: message.title, body: message.body },
        data: message.data,
      },
    });
  });

  it('reuses the access token until it is about to expire', async () => {
    const sender = new FcmPushSender(account);
    await sender.send('a', message);
    await sender.send('b', message);
    expect(calls.filter((c) => c.url === account.token_uri)).toHaveLength(1);
  });

  it('DEAD for a removed app or an invalid token, FAILED otherwise', async () => {
    const sender = new FcmPushSender(account);
    sendStatus = 404;
    sendBody = '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}';
    expect(await sender.send('gone', message)).toBe('DEAD');
    sendStatus = 400;
    sendBody =
      '{"error":{"message":"The registration token is not a valid FCM registration token"}}';
    expect(await sender.send('bad', message)).toBe('DEAD');
    sendStatus = 503;
    sendBody = '{"error":{"status":"UNAVAILABLE"}}';
    expect(await sender.send('later', message)).toBe('FAILED');
  });
});
