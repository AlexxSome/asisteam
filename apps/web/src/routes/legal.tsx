import { AuthPage } from "../components/auth-page";
import { ACCOUNT_TERMS_2026_09_21 as notice } from "@asisteam/core/browser";
export function Notice() {
  return (
    <>
      <section id="condiciones" className="space-y-3">
        <h2>Condiciones de uso</h2>
        <p>{notice.purpose}</p>
        <p>{notice.minors}</p>
      </section>
      <section id="privacidad" className="space-y-3">
        <h2>Privacidad de tus datos</h2>
        <p>{notice.visibility}</p>
        <p>{notice.rights}</p>
      </section>
    </>
  );
}
export function Component() {
  return (
    <AuthPage title="Condiciones de uso y privacidad">
      <title>Condiciones de uso y privacidad · Asisteam</title>
      <p>Versión {notice.version}</p>
      <Notice />
      <p>Consultar este aviso no registra una aceptación.</p>
    </AuthPage>
  );
}
