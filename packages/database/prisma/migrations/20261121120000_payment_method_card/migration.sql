-- Step 7.6 (user request 2026-11-21): the "Whish" payment method is now "Visa card".
-- Renaming the enum value keeps every existing payment (invoices and subscriptions).
ALTER TYPE "PaymentMethod" RENAME VALUE 'WHISH' TO 'CARD';
