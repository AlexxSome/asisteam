"use client";

import { useRef, useState, useTransition } from "react";
import { SOCIAL_AUTH_ERROR, SOCIAL_PROVIDERS, SOCIAL_PROVIDER_LABELS, type SocialLoginContext } from "@asisteam/core";
import { loginWithSocial } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function SocialLoginButtons({ context = {}, disabled = false }: { context?: SocialLoginContext; disabled?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pendingRef = useRef(false);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  return (
    <div className="space-y-3" aria-label="Acceso con cuenta social">
      {SOCIAL_PROVIDERS.map(provider => (
        <Button key={provider} type="button" variant="secondary" className="w-full" loading={pending && provider === activeProvider}
          disabled={disabled || pending} onClick={() => {
            if (pendingRef.current) return;
            pendingRef.current = true;
            setActiveProvider(provider);
            setError(null);
            startTransition(async () => {
              try {
                const result = await loginWithSocial({ ...context, provider });
                if (result?.error) setError(result.error);
              } catch {
                setError(SOCIAL_AUTH_ERROR);
              } finally { pendingRef.current = false; }
            });
          }}>
          Continuar con {SOCIAL_PROVIDER_LABELS[provider]}
        </Button>
      ))}
      <p role="status" className="text-small text-muted-foreground">{pending ? "Conectando con el proveedor…" : ""}</p>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
