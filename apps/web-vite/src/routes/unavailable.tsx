import { Link } from "react-router";
import { Page } from "../ui";
export function Component() {
  return (
    <Page>
      <h1>Página no disponible</h1>
      <p>El recurso no existe o no tienes acceso.</p>
      <Link to="/groups" className="text-primary underline">
        Volver a mis grupos
      </Link>
    </Page>
  );
}
