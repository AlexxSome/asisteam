import { useEffect, useRef } from "react";
import {
  Link,
  Outlet,
  isRouteErrorResponse,
  useLocation,
  useNavigation,
  useRevalidator,
  useRouteError,
  useRouteLoaderData,
} from "react-router";
import { ApiClientError } from "@asisteam/api-client";
import { httpSchemas } from "@asisteam/core/browser";
import { Alert, Button, LoadingState, Page, ShellContentContext } from "./ui";
import { browserApi, requireSession, sessionError } from "./api";
import { AppShell } from "./components/app-shell";
import type { LoaderFunctionArgs } from "react-router";
export function Root() {
  const privateRoute=useRouteLoaderData("private");
  const location = useLocation(),
    main = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (location.hash) {
      try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(); }
      catch { /* An invalid fragment must not interrupt authorized navigation. */ }
    } else main.current?.querySelector<HTMLElement>("#main-content, #main")?.focus();
  }, [location.pathname, location.hash]);
  return (
    <div ref={main}>
      {!privateRoute && <a href="#main" className="sr-only focus:not-sr-only">
        Saltar al contenido
      </a>}
      <Outlet />
    </div>
  );
}
export async function privateLoader({request}:LoaderFunctionArgs){
 const session=await requireSession(request,false);
 if(!session.accepted)return {...session,groups:[],group:undefined};
 try {
  const api=browserApi(request.signal);
  const {data:groups}=await api.listMyGroups({query:{page:1,page_size:100}});
  const id=/^\/groups\/([0-9a-f-]{36})(?:\/|$)/.exec(new URL(request.url).pathname)?.[1];
  if(id && !httpSchemas.GroupParams.safeParse({groupId:id}).success)throw new Response(null,{status:404});
  const group=id?await api.getGroup({params:{groupId:id}}):undefined;
  return {...session,groups,group};
 }catch(error){return sessionError(error,request);}
}
export function PrivateLayout() {
 const session=useRouteLoaderData("private") as Awaited<ReturnType<typeof privateLoader>>;
 const navigation=useNavigation(),location=useLocation();
 if(navigation.state!=="idle")return <Page><LoadingState label={navigation.state === "submitting" ? "Procesando…" : "Cargando página…"}/></Page>;
 return <AppShell key={session.user_id} group={session.group} groups={session.groups} userId={session.user_id}><ShellContentContext.Provider value={true}><Outlet key={location.pathname}/></ShellContentContext.Provider></AppShell>;
}
export function RouteError() {
  const error = useRouteError(),
    revalidator = useRevalidator();
  const unavailable =
    (isRouteErrorResponse(error) && [400, 403, 404].includes(error.status)) ||
    (error instanceof ApiClientError && [400, 403, 404].includes(error.status));
  return (
    <Page>
      <h1>
        {unavailable ? "Recurso no disponible" : "No pudimos cargar la página"}
      </h1>
      <Alert>
        {unavailable
          ? "El recurso no existe o no tienes acceso."
          : "Revisa tu conexión y vuelve a intentarlo."}
      </Alert>
      <Button
        busy={revalidator.state === "loading"}
        onClick={() => revalidator.revalidate()}
      >
        Volver a cargar
      </Button>
      <p>
        <Link to="/groups" className="text-primary underline">
          Volver a mis grupos
        </Link>
      </p>
    </Page>
  );
}
