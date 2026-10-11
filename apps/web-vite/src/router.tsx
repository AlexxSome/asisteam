import { createBrowserRouter, type RouteObject } from "react-router";
import { Root, RouteError, PrivateLayout } from "./shell";
import { requireSession } from "./api";
import { LoadingState } from "./ui";
export const routes: RouteObject[] = [
  {
    id: "root",
    path: "/",
    Component: Root,
    ErrorBoundary: RouteError,
    HydrateFallback: LoadingState,
    children: [
      {
        index: true,
        loader: async ({ request }) => (await import("./routes/welcome")).home(request),
      },
      { path: "login", lazy: () => import("./routes/login") },
      { path: "register", lazy: () => import("./routes/register") },
      { path: "forgot-password", lazy: () => import("./routes/forgot-password") },
      { path: "reset-password", lazy: () => import("./routes/reset-password") },
      { path: "invitations/:token", lazy: () => import("./routes/invitation") },
      { path: "legal/2026-09-21", lazy: () => import("./routes/legal") },
      {
        id: "private",
        loader: ({ request }) => requireSession(request, false),
        shouldRevalidate: () => true,
        Component: PrivateLayout,
        children: [
          { path: "welcome", lazy: () => import("./routes/welcome") },
          { path: "join", lazy: () => import("./routes/join") },
          { path: "accept-terms", lazy: () => import("./routes/terms") },
          { path: "groups", lazy: () => import("./routes/groups") },
          { path: "groups/:groupId", lazy: () => import("./routes/group") },
          { path: "logout", lazy: () => import("./routes/logout") },
        ],
      },
      { path: "*", lazy: () => import("./routes/unavailable") },
    ],
  },
];
export const createRouter = () => createBrowserRouter(routes);
