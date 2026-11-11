// Deploy step: the production-only pieces that need no outside service to test.
// The Resend email adapter (with fetch replaced) and the visitor-IP forwarding (README 9).
import type { NextFunction, Request, Response } from 'express';
import { CLIENT_IP_HEADER, PROXY_SECRET_HEADER, forwardedClientIp } from '../src/app.setup';
import type { Env } from '../src/config/env';
import { ResendEmailChannel } from '../src/notifications/adapters/resend-email.channel';

describe('Resend email adapter', () => {
  const env = { RESEND_API_KEY: 're_test', EMAIL_FROM: 'Gearva <no-reply@gearva.online>' } as Env;
  const input = {
    recipient: 'owner@example.com',
    template: 'password-reset',
    locale: 'en' as const,
    data: { name: 'Sam', link: 'https://gearva.online/set-password?token=x', hours: 1 },
  };
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function answer(status: number, body: unknown) {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify(body), { status }));
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it('posts the rendered email with the key, and keeps the message id', async () => {
    const fetchMock = answer(200, { id: 'msg_1' });
    const result = await new ResendEmailChannel(env).send(input);

    expect(result).toEqual({ ok: true, providerMessageId: 'msg_1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer re_test');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ from: env.EMAIL_FROM, to: ['owner@example.com'] });
    expect(body.subject).toEqual(expect.any(String));
    expect(body.text).toContain('https://gearva.online/set-password?token=x');
  });

  it('a rate limit or outage is retried; a refused email is final', async () => {
    answer(429, { message: 'Too many requests' });
    expect(await new ResendEmailChannel(env).send(input)).toMatchObject({
      ok: false,
      retryable: true,
    });
    answer(503, {});
    expect(await new ResendEmailChannel(env).send(input)).toMatchObject({ retryable: true });
    answer(422, { message: 'The gearva.online domain is not verified' });
    expect(await new ResendEmailChannel(env).send(input)).toEqual({
      ok: false,
      error: 'Resend 422: The gearva.online domain is not verified',
      retryable: false,
    });
  });

  it('bad template data fails before anything is sent', async () => {
    const fetchMock = answer(200, {});
    const result = await new ResendEmailChannel(env).send({ ...input, data: {} });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Visitor IP from the web apps', () => {
  const secret = 'a'.repeat(40);

  function run(headers: Record<string, string>, configured: string | undefined = secret) {
    const req = { headers: { 'x-forwarded-for': '10.0.0.5', ...headers } } as unknown as Request;
    const next = jest.fn() as NextFunction;
    forwardedClientIp(configured)(req, {} as Response, next);
    expect(next).toHaveBeenCalled();
    return req.headers;
  }

  it('with the shared secret, the visitor IP replaces X-Forwarded-For', () => {
    const headers = run({ [PROXY_SECRET_HEADER]: secret, [CLIENT_IP_HEADER]: '203.0.113.7' });
    expect(headers['x-forwarded-for']).toBe('203.0.113.7');
    expect(headers[PROXY_SECRET_HEADER]).toBeUndefined();
    expect(headers[CLIENT_IP_HEADER]).toBeUndefined();
  });

  it('without it, or with a wrong one, nobody chooses their own IP', () => {
    expect(run({ [CLIENT_IP_HEADER]: '6.6.6.6' })['x-forwarded-for']).toBe('10.0.0.5');
    expect(
      run({ [PROXY_SECRET_HEADER]: 'b'.repeat(40), [CLIENT_IP_HEADER]: '6.6.6.6' })[
        'x-forwarded-for'
      ],
    ).toBe('10.0.0.5');
    expect(
      run({ [PROXY_SECRET_HEADER]: 'short', [CLIENT_IP_HEADER]: '6.6.6.6' })['x-forwarded-for'],
    ).toBe('10.0.0.5');
    expect(
      run({ [PROXY_SECRET_HEADER]: secret, [CLIENT_IP_HEADER]: 'not-an-ip' })['x-forwarded-for'],
    ).toBe('10.0.0.5');
  });

  it('is off when no secret is configured (development, tests)', () => {
    const headers = run({ [PROXY_SECRET_HEADER]: '', [CLIENT_IP_HEADER]: '6.6.6.6' }, undefined);
    expect(headers['x-forwarded-for']).toBe('10.0.0.5');
  });
});
