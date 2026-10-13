import { PageHeader } from "../components/ui/page-header";
import { Link, redirect, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { browserApi, requireSession, sessionError } from "../api";
import { ActionLink, Card, CardHeader, CardTitle, CardContent, Page } from "../ui";
import { PendingRequests } from "./join";
export async function home(request: Request) {
  const session = await requireSession(request);
  try {
    const { data: groups } = await browserApi(request.signal).listMyGroups({ query: { page: 1, page_size: 100 } });
    const saved = document.cookie.split(";").map(value => value.trim()).find(value => value.startsWith(`asisteam-group-${session.user_id}=`))?.split("=")[1];
    const remembered = groups.find(group => group.id === saved);
    return redirect(remembered ? `/groups/${remembered.id}` : !groups.length ? "/welcome" : groups.length === 1 ? `/groups/${groups[0]!.id}` : "/groups");
  } catch (error) { return sessionError(error, request); }
}
export async function loader({ request }: LoaderFunctionArgs) {
  await requireSession(request);
  try {
    const api = browserApi(request.signal), { data: groups } = await api.listMyGroups({ query: { page: 1, page_size: 100 } });
    if (groups.length) return redirect(groups.length === 1 ? `/groups/${groups[0]!.id}` : "/groups");
    const [profile, pending] = await Promise.all([api.getOwnProfile(), api.listMembershipOnboarding()]);
    return { profile, pending: pending.data };
  } catch (error) { return sessionError(error, request); }
}
export function Component() {
  const { profile, pending } = useLoaderData<typeof loader>();
  return <Page className="max-w-7xl px-0 py-0 md:px-0 [overflow-wrap:anywhere]"><title>Bienvenida · Asisteam</title><PageHeader title={profile.full_name ? `¡Hola, ${profile.full_name.split(" ")[0]}!` : "¡Bienvenido/a a Asisteam!"}/>
    <p>{pending.length ? "Tu cuenta está lista y tus solicitudes siguen guardadas. Revisa quién debe completar cada paso." : "Tu cuenta está lista. Para comenzar, crea un grupo o únete a uno existente con un código de invitación."}</p>
    {!profile.birthdate && <p>Revisa tu nombre y completa tu fecha de nacimiento en <Link to="/profile" className="underline">Mi perfil</Link> antes de unirte como deportista.</p>}
    <PendingRequests memberships={pending} />
    <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle as="h2">Crear un grupo</CardTitle></CardHeader><CardContent className="space-y-4"><p>Administra tu club o equipo. Puedes configurarlo antes de contratar. Para activar deportistas necesitas el primer pago aprobado de un plan mensual; no hay prueba gratuita.</p><ActionLink href="/groups/new" variant="primary">Crear un grupo</ActionLink></CardContent></Card>
    <Card><CardHeader><CardTitle as="h2">Unirme con código</CardTitle></CardHeader><CardContent className="space-y-4"><p>Únete como deportista. El administrador gestiona los cupos; no necesitas contratar un plan.</p><ActionLink href="/join" variant="secondary">Unirme con código</ActionLink></CardContent></Card></div>
    <p>Si eres apoderado, abre la invitación por email que te envió el administrador. El código de grupo incorpora solo deportistas.</p><nav aria-label="Tu cuenta y ayuda" className="flex flex-wrap gap-3"><ActionLink href="/profile">Mi perfil</ActionLink><ActionLink href="/profile#privacy">Consultar ayuda y soporte</ActionLink></nav>
  </Page>;
}
