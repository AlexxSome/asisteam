import { z } from "zod";

const providerId = z.union([z.string(), z.number().int().nonnegative()]).transform(String).refine(value => /^[A-Za-z0-9_-]{1,128}$/.test(value));
const timestamp = z.string().datetime({ offset: true });
export const remoteSubscriptionSchema = z.object({
  id: providerId, external_reference: z.string().uuid(), collector_id: providerId,
  status: z.enum(["pending", "authorized", "paused", "cancelled"]), last_modified: timestamp,
  init_point: z.string().url().optional(), next_payment_date: timestamp.nullable().optional(),
  auto_recurring: z.object({ frequency: z.number(), frequency_type: z.string(), transaction_amount: z.coerce.number(), currency_id: z.string() }),
});
export const remoteInvoiceSchema = z.object({
  id: providerId, preapproval_id: providerId, transaction_amount: z.coerce.number(), currency_id: z.string(),
  debit_date: timestamp, last_modified: timestamp, status: z.string(),
  payment: z.object({ id: providerId.nullable().optional(), status: z.string().optional() }).nullable().optional(),
});
export const remotePaymentSchema = z.object({
  id: providerId, collector_id: providerId, transaction_amount: z.coerce.number(), currency_id: z.string(),
  status: z.string(), date_approved: timestamp.nullable(), date_last_updated: timestamp,
});
export type RemoteSubscription = z.infer<typeof remoteSubscriptionSchema>;
export type RemoteInvoice = z.infer<typeof remoteInvoiceSchema>;

export const remoteSubscriptionSearchSchema = z.object({ results: z.array(remoteSubscriptionSchema) });
export const remoteInvoiceSearchSchema = z.object({ paging: z.object({ total: z.number().int().nonnegative() }), results: z.array(remoteInvoiceSchema) });
export const mercadoPagoWebhookSchema = z.object({ type: z.enum(["subscription_preapproval", "subscription_authorized_payment", "payment"]),
  data: z.object({ id: z.union([z.string(), z.number()]).transform(String) }) });
