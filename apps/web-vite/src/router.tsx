import { createBrowserRouter, type RouteObject } from "react-router";
import { Root, RouteError, PrivateLayout, privateLoader } from "./shell";
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
        loader: privateLoader,
        shouldRevalidate: () => true,
        Component: PrivateLayout,
        children: [
          { path: "welcome", lazy: () => import("./routes/welcome") },
          { path: "join", lazy: () => import("./routes/join") },
          { path: "accept-terms", lazy: () => import("./routes/terms") },
          { path: "groups", lazy: () => import("./routes/groups") },
          { path: "groups/new", lazy: () => import("./routes/group-new") },
          { path: "groups/:groupId/settings", lazy: () => import("./routes/group-settings") },
          { path: "groups/:groupId/settings/visibility", lazy: () => import("./routes/visibility") },
          { path: "profile", lazy: () => import("./routes/profile") },
          { path: "profile/birthdate-requests", lazy: () => import("./routes/birthdate-reviews") },
          { path: "groups/:groupId", lazy: () => import("./routes/group") },
          { path: "logout", lazy: () => import("./routes/logout") },
        ],
      },
      { path: "*", lazy: () => import("./routes/unavailable") },
    ],
  },
];
export const createRouter = () => createBrowserRouter(routes);
