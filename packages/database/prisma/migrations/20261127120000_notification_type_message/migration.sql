-- Step 7.10 (user request 2026-11-27): a WhatsApp message staff send from their own phone
-- with a ready text ("Thank you", or a greeting they finish themselves) is logged as MESSAGE.
-- The other ready texts reuse CAR_READY, INVOICE, PAYMENT_REMINDER and SERVICE_REMINDER.
ALTER TYPE "NotificationType" ADD VALUE 'MESSAGE';
