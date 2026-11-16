// Sends one test push to one phone (README 6, Phase 6 "Done when": a push reaches a test
// device token through Firebase). The token comes from the app's debug build, or from
// device_tokens after the test owner signed in on the phone.
//
//   npm run push:test -w @gearva/api -- <FCM registration token>
//
// Needs FCM_SERVICE_ACCOUNT_JSON in the environment (or the repo-root .env).
import { loadEnv } from '../config/env';
import { FcmPushSender, serviceAccountSchema } from '../notifications/push/push-sender';

async function main(): Promise<void> {
  const token = process.argv[2];
  if (!token) throw new Error('Usage: npm run push:test -w @gearva/api -- <FCM token>');
  const env = loadEnv();
  if (!env.FCM_SERVICE_ACCOUNT_JSON) throw new Error('FCM_SERVICE_ACCOUNT_JSON is not set');
  const account = serviceAccountSchema.parse(JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON));
  const outcome = await new FcmPushSender(account).send(token, {
    title: 'Gearva test',
    body: 'Push messages work. هذه رسالة تجريبية.',
    data: { type: 'TEST', notificationId: '', refType: '', refId: '' },
  });
  console.log(`Project ${account.project_id}: ${outcome}`);
  if (outcome !== 'SENT') process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
