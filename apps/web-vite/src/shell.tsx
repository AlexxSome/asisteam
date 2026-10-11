import { useEffect, useRef } from "react";
import {
  Form,
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
import { Alert, Button, LoadingState, Page } from "./ui";
import type { requireSession } from "./api";
export function Root() {
  const location = useLocation(),
    main = useRef<HTMLDivElement>(null);
  useEffect(() => {
    main.current?.querySelector<HTMLElement>("#main")?.focus();
  }, [location.pathname]);
  return (
    <div ref={main}>
      <a href="#main" className="sr-only focus:not-sr-only">
        Saltar al contenido
      </a>
      <Outlet />
    </div>
  );
}
export function PrivateLayout() {
  const session = useRouteLoaderData("private") as Awaited<
    ReturnType<typeof requireSession>
  >;
  const navigation = useNavigation(),
    location = useLocation();
  return (
    <div key={session.user_id}>
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-4 border-b bg-surface px-4 py-3">
        <Link to="/groups" className="text-h2 text-primary">
          {import.meta.env.VITE_APP_NAME ?? "Asisteam"}
        </Link>
        <Form method="post" action="/logout">
          <Button busy={navigation.state !== "idle"}>Cerrar sesión</Button>
        </Form>
      </header>
      {navigation.state !== "idle" ? (
        <Page>
          <LoadingState
            label={
              navigation.state === "submitting"
                ? "Procesando…"
                : "Cargando página…"
            }
          />
        </Page>
      ) : (
        <Outlet key={location.pathname} />
      )}
    </div>
  );
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
