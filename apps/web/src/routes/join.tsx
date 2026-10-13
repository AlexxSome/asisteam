import { PageHeader } from "../components/ui/page-header";
import { SubmissionForm, useFieldValidation } from "../auth-context";
import { redirect, useActionData, useLoaderData, useNavigation, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { ApiClientError, type ApiClient } from "@asisteam/api-client";
import { GROUP_ERROR_MESSAGES, httpSchemas, membershipOnboardingSteps } from "@asisteam/core/browser";
import { actionMessage, browserApi, requireSession, sessionError } from "../api";
import { ActionLink, Alert, Button, Field, Input, Page } from "../ui";
export function PendingRequests({ memberships }: { memberships: Awaited<ReturnType<ApiClient["listMembershipOnboarding"]>>["data"] }) {
  if (!memberships.length) return null;
  return <section aria-label="Mis solicitudes guardadas" className="space-y-4"><h2>Mis solicitudes guardadas</h2>{memberships.map(member => <article key={member.membership_id} className="space-y-3 rounded-lg border border-border bg-surface p-4 md:p-6"><h3>{member.group_name}</h3>
    <dl className="space-y-3">{membershipOnboardingSteps(member).map(step => <div key={step.label}><dt className="font-medium">{step.label}</dt><dd>{step.detail}</dd></div>)}</dl>
    <p>Tu solicitud ya está guardada. No necesitas volver a ingresar el código. El administrador coordina el vínculo y la aprobación; tu apoderado otorga el consentimiento.</p>
  </article>)}</section>;
}
export async function loader({ request }: LoaderFunctionArgs) {
  await requireSession(request);
  try { return { pending: (await browserApi(request.signal).listMembershipOnboarding()).data, code: new URL(request.url).searchParams.get("code") ?? "" }; }
  catch (error) { return sessionError(error, request); }
}
export async function action({ request }: ActionFunctionArgs) {
  await requireSession(request);
  const form = await request.formData(), parsed = httpSchemas.JoinByCode.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "El código debe tener 8 letras o números." };
  try {
    const { membership } = await browserApi(request.signal).joinByCode({ body: parsed.data });
    return membership.status === "PENDING" ? { pending: true } : redirect(`/groups/${membership.group_id}`);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return sessionError(error, request);
    return { error: error instanceof ApiClientError ? GROUP_ERROR_MESSAGES[error.error.code] ?? actionMessage(error) : actionMessage(error) };
  }
}
export function Component() {
  const {errors,validation}=useFieldValidation();
  const { pending, code } = useLoaderData<typeof loader>(), data = useActionData() as { error?: string; pending?: boolean } | undefined, nav = useNavigation();
  return <Page className="max-w-[672px] px-0 py-0 md:px-0 [overflow-wrap:anywhere]"><title>Unirme con código · Asisteam</title><PageHeader title="Unirme con código" description="Ingresa el código que compartió el administrador. Te incorporarás como deportista."/>
    {data?.pending && <p role="status">Tu solicitud quedó pendiente. El administrador y tu apoderado deben completar los pasos antes de participar.</p>}
    <PendingRequests memberships={pending} /><SubmissionForm method="post" className="space-y-4 rounded-lg border border-border bg-surface p-4 md:p-6">{data?.error && <Alert>{data.error}</Alert>}
      <Field id="code" label="Código de invitación" error={errors.code}><Input {...validation("code")} name="code" defaultValue={code} required minLength={8} maxLength={8} pattern="[A-Za-z0-9]{8}" autoComplete="off" /></Field><Button busy={nav.state !== "idle"}>Unirme al grupo</Button>
    </SubmissionForm><nav aria-label="Volver y pedir ayuda" className="flex flex-wrap gap-3"><ActionLink href="/welcome">Volver al inicio</ActionLink><ActionLink href="/profile#privacy">Consultar ayuda y soporte</ActionLink></nav></Page>;
}
