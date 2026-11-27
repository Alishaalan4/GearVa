import { z } from 'zod';

// Step 7.10 (flow.md 9.7): "Message on WhatsApp". Staff pick a ready message, may change
// it, and send it from their own WhatsApp; Gearva only writes the text and logs the click.
// The templates are fixed for every garage (user decision 2026-11-27).

export const WHATSAPP_TEMPLATES = [
  /** the visit is done: the car can be picked up (visit page) */
  'CAR_READY',
  /** the invoice of the visit, its total and what is left to pay (visit page) */
  'INVOICE_READY',
  /** what the customer still owes this garage (when they owe something) */
  'PAYMENT_DUE',
  /** a general "time for your car's service" */
  'SERVICE_DUE',
  /** thank you for the visit */
  'THANK_YOU',
  /** a greeting only; staff write the rest */
  'FREE',
] as const;
export type WhatsappTemplate = (typeof WHATSAPP_TEMPLATES)[number];

/** GET /v1/customers/:customerId/whatsapp: the visit gives the car and invoice templates. */
export const whatsappQuerySchema = z.object({ visitId: z.uuid().optional() });
export type WhatsappQuery = z.infer<typeof whatsappQuerySchema>;

export interface WhatsappMessages {
  /** digits only, for https://wa.me/<phone> */
  phone: string;
  /** the customer's language: the texts are written in it */
  locale: 'en' | 'ar';
  /** the templates that fit, in the order of WHATSAPP_TEMPLATES, each with its text */
  messages: { template: WhatsappTemplate; text: string }[];
}

/** POST /v1/customers/:customerId/whatsapp-sent: staff opened WhatsApp with a message. */
export const whatsappSentSchema = z.object({
  template: z.enum(WHATSAPP_TEMPLATES),
  visitId: z.uuid().optional(),
});
export type WhatsappSentInput = z.infer<typeof whatsappSentSchema>;

export interface WhatsappSentResponse {
  /** the customer (also the audit row's entity) */
  id: string;
  /** the WhatsApp row in the notification log */
  notificationId: string;
}
