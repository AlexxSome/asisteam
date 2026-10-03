import { z } from "zod";

export const billingPlanCodeSchema = z.enum(["TEAM", "CLUB", "ACADEMY"]);
export const subscriptionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkout"), group_id: z.string().uuid(), plan_code: billingPlanCodeSchema,
    payer_email: z.string().trim().email().max(254) }).strict(),
  z.object({ action: z.literal("sync"), group_id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("cancel"), group_id: z.string().uuid() }).strict(),
]);
export type SubscriptionRequest = z.infer<typeof subscriptionRequestSchema>;

const planSchema = z.object({ code: billingPlanCodeSchema, name: z.string(), amount_clp: z.number().int().positive(),
  athlete_limit: z.number().int().positive(), currency: z.literal("CLP") });
export const subscriptionStatusSchema = z.enum(["CREATING", "PENDING", "AUTHORIZED", "PAUSED", "CANCELLED", "FAILED"]);
export const billingSummarySchema = z.object({
  plans: z.array(planSchema), active_athletes: z.number().int().nonnegative(), athlete_limit: z.number().int().nonnegative().nullable(),
  subscription: z.object({ id: z.string().uuid(), plan_code: billingPlanCodeSchema, amount_clp: z.number().int(),
    status: subscriptionStatusSchema, next_payment_at: z.string().nullable(), activated_at: z.string().nullable() }).nullable(),
  invoices: z.array(z.object({ id: z.string(), plan_name: z.string(), due_at: z.string(), amount_clp: z.number().int(),
    status: z.enum(["PENDING", "PAID", "OVERDUE", "CANCELLED", "REFUNDED"]), paid_at: z.string().nullable() })),
  overdue_amount_clp: z.number().int().nonnegative(), total_invoices: z.number().int().nonnegative(), page: z.number().int().positive(),
});
export type BillingSummary = z.infer<typeof billingSummarySchema>;
export const SUBSCRIPTION_STATUS_LABELS: Record<z.infer<typeof subscriptionStatusSchema>, string> = {
  CREATING: "Preparando suscripción", PENDING: "Pendiente de autorización", AUTHORIZED: "Cobro recurrente autorizado",
  PAUSED: "Cobros pausados", CANCELLED: "Renovación cancelada", FAILED: "No se pudo iniciar",
};
export const INVOICE_STATUS_LABELS = { PENDING: "Pendiente", PAID: "Pagado", OVERDUE: "Vencido", CANCELLED: "Cancelado", REFUNDED: "Revertido" };
export const BILLING_ERROR_MESSAGES: Record<string, string> = {
  forbidden_origin: "Origen no permitido.",
  method_not_allowed: "Método no permitido.",
  invalid_webhook: "Notificación no válida.",
  authentication_required: "Inicia sesión para gestionar la suscripción.",
  group_not_found: "El grupo no existe o no tienes acceso.",
  admin_required: "Solo un administrador del grupo puede gestionar su suscripción.",
  invalid_billing_request: "Revisa el plan y el correo de pago.",
  subscription_exists: "Ya hay una suscripción en curso. Cancela su renovación antes de elegir otro plan.",
  checkout_uncertain: "Estamos verificando la creación del cobro. Actualiza su estado antes de volver a intentarlo.",
  billing_unavailable: "No pudimos conectar con el servicio de pagos. Vuelve a intentarlo.",
  payment_rejected: "Mercado Pago no pudo iniciar esta suscripción. Revisa el correo de pago y vuelve a intentarlo.",
  subscription_not_found: "Este grupo aún no tiene una suscripción para actualizar.",
};
export function formatClp(amount: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
}


export const localSubscriptionSchema = z.object({
  id: z.string().uuid(), group_id: z.string().uuid(), plan_code: z.string(), amount_clp: z.number().int(), athlete_limit: z.number().int(),
  status: z.string(), provider_subscription_id: z.string().nullable(), checkout_url: z.string().nullable(),
});
export type LocalSubscription = z.infer<typeof localSubscriptionSchema>;
