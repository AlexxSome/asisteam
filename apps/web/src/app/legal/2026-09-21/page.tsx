import type { Metadata } from "next";
import { ACCOUNT_TERMS_2026_09_21 as notice } from "@asisteam/core";

export const metadata: Metadata = { title: "Condiciones de uso y privacidad" };

// Archivo de la versión mostrada: no reemplazar su contenido al publicar otra versión.
export default function AccountTermsPage() {
  return <main className="mx-auto min-h-dvh max-w-2xl space-y-8 px-4 py-8 sm:py-12">
    <header className="space-y-2">
      <p className="text-h2 text-primary">Asisteam</p>
      <h1 className="text-h1">Condiciones de uso y privacidad</h1>
      <p className="text-small text-muted-foreground">Versión {notice.version}</p>
    </header>
    <section id="condiciones" className="space-y-3">
      <h2 className="text-h2">Condiciones de uso</h2>
      <p>{notice.purpose}</p>
      <p>{notice.minors}</p>
    </section>
    <section id="privacidad" className="space-y-3">
      <h2 className="text-h2">Privacidad de tus datos</h2>
      <p>{notice.visibility}</p>
      <p>{notice.rights}</p>
    </section>
    <p className="text-small text-muted-foreground">Puedes cerrar esta pestaña para volver al formulario. Consultar este aviso no registra una aceptación.</p>
  </main>;
}
