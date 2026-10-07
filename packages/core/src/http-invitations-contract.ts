import { z } from "zod";
import { invitationTokenSchema, sendInvitationRequestSchema, sentInvitationSchema } from "./schemas/invitation";
import { invitationRegistrationSchema, managedClaimSchema } from "./schemas/register";
const uuid = z.string().uuid();
const token = z.object({ token: invitationTokenSchema }).strict();
const row = z.object({ id: uuid, email: z.string().nullable(), role: z.enum(["ATHLETE", "GUARDIAN"]), status: z.enum(["PENDING", "ACCEPTED", "EXPIRED"]), expires_at: z.string().datetime({ offset: true }), created_at: z.string().datetime({ offset: true }) }).strict();
export const invitationHttpSchemas = {
  InvitationSend: sendInvitationRequestSchema,
  InvitationSent: z.object({ invitation: sentInvitationSchema.strict() }).strict(),
  InvitationToken: token,
  InvitationRegistration: token.extend({ registration: invitationRegistrationSchema.strict() }).strict(),
  InvitationClaim: token.extend({ registration: managedClaimSchema }).strict(),
  InvitationPreview: z.object({ group_name: z.string(), role: z.enum(["ATHLETE", "GUARDIAN"]), managed_activation: z.literal(true).optional() }).strict(),
  InvitationAccepted: z.object({ group_id: uuid, membership_status: z.enum(["ACTIVE", "PENDING", "INACTIVE", "INVITED"]) }).strict(),
  InvitationQuery: z.object({ page: z.number().int().min(1).max(100000).default(1) }).strict(),
  Invitations: z.object({ data: z.array(row), total: z.number().int().min(0) }).strict(),
  ActivationRequested: z.object({ status: z.enum(["READY", "CONSENT_PENDING"]) }).strict(),
  ActivationReview: z.object({ accepted: z.boolean() }).strict(),
  ActivationReviewed: z.object({ group_id: uuid, membership_id: uuid }).strict(),
  ActivationQuery: z.object({ page: z.number().int().min(1).max(100000).default(1), athlete_user_id: uuid.optional() }).strict(),
  Activations: z.object({ data: z.array(z.object({ request_id: uuid, membership_id: uuid, full_name: z.string(), relationship: z.string(), status: z.enum(["PENDING", "APPROVED"]), total_count: z.number().int().min(0) }).strict()) }).strict(),
};
const common = { module: "invitations", state: "implemented" } as const;
export const invitationHttpOperations = {
  sendInvitation: { ...common, authenticated: true, method: "POST", path: "/api/v1/invitations/send", body: "InvitationSend", response: "InvitationSent", status: 201, summary: "Emisión/reenvío/activación dirigida, 50/día/grupo y un ejecutor de correo" },
  previewInvitation: { ...common, authenticated: false, method: "POST", path: "/api/v1/invitations/preview", body: "InvitationToken", response: "InvitationPreview", status: 200, summary: "Vista mínima por proxy autorizado; token solo en body" },
  acceptInvitation: { ...common, authenticated: true, method: "POST", path: "/api/v1/invitations/accept", body: "InvitationToken", response: "InvitationAccepted", status: 200, summary: "Aceptación dirigida de cuenta vigente, sin replay" },
  registerInvitation: { ...common, authenticated: false, method: "POST", path: "/api/v1/invitations/register", body: "InvitationRegistration", response: "InvitationAccepted", status: 200, summary: "Registro por nonce y trigger Auth atómico" },
  claimInvitation: { ...common, authenticated: false, method: "POST", path: "/api/v1/invitations/claim", body: "InvitationClaim", response: "InvitationAccepted", status: 200, summary: "Credenciales MANAGED preservando perfil/historia y consentimiento" },
  listInvitations: { ...common, authenticated: true, method: "GET", path: "/api/v1/groups/{groupId}/invitations", params: "GroupParams", query: "InvitationQuery", response: "Invitations", status: 200, summary: "Historial ADMIN de diez filas sin digest ni datos del perfil" },
  requestManagedActivation: { ...common, authenticated: true, method: "POST", path: "/api/v1/groups/{groupId}/memberships/{membershipId}/activation", params: "MemberParams", response: "ActivationRequested", status: 201, summary: "Solicitud ADMIN; no sustituye consentimiento del apoderado" },
  reviewManagedActivation: { ...common, authenticated: true, method: "POST", path: "/api/v1/activation-requests/{requestId}", params: "ReviewParams", body: "ActivationReview", response: "ActivationReviewed", status: 201, summary: "Decisión del apoderado vigente; rechazo conserva historia" },
  listManagedActivations: { ...common, authenticated: true, method: "GET", path: "/api/v1/groups/{groupId}/activation-requests", params: "GroupParams", query: "ActivationQuery", response: "Activations", status: 200, summary: "Solicitudes propias del apoderado por RPC, sin PII" },
} as const;
