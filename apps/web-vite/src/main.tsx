import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { sessionChannel } from "./session-events";
import { createRouter } from "./router";
import { LoadingState, Page } from "./ui";
import "../../web/src/app/globals.css";
const root = createRoot(document.getElementById("root")!);
let router = createRouter();
function render() {
  root.render(<RouterProvider router={router} />);
}
// Erase the entire router/DTO tree before validating restored or shared sessions.
function reset() {
  flushSync(() => root.render(
    <Page>
      <LoadingState label="Comprobando sesión…" />
    </Page>,
  ));
  router.dispose();
  router = createRouter();
  render();
}
render();
sessionChannel?.addEventListener("message", reset);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) reset();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") reset();
});
