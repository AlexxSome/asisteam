"use client";

import { useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { SOCIAL_AUTH_ERROR, SOCIAL_PROVIDERS, SOCIAL_PROVIDER_LABELS, type SocialLoginContext } from "@asisteam/core";
import { loginWithSocial } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { SocialProviderAvailability } from "@/lib/social-auth";

type Provider = (typeof SOCIAL_PROVIDERS)[number];

export function SocialLoginButtons({ context = {}, disabled = false, providers, onPendingChange }: {
  context?: SocialLoginContext;
  disabled?: boolean;
  providers?: SocialProviderAvailability;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pendingRef = useRef(false);
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);
  return (
    <div className="space-y-3" aria-label="Acceso con cuenta social">
      {SOCIAL_PROVIDERS.map(provider => (
        <div key={provider} className="space-y-1">
          <Button type="button" variant="secondary" className="w-full" loading={pending && provider === activeProvider}
            aria-describedby={providers?.[provider] === false ? `${provider}-unavailable` : undefined}
            disabled={disabled || pending || providers?.[provider] === false} onClick={() => {
              if (pendingRef.current) return;
              pendingRef.current = true;
              setActiveProvider(provider);
              setError(null);
              onPendingChange?.(true);
              startTransition(async () => {
                try {
                  const result = await loginWithSocial({ ...context, provider });
                  if (result?.error) setError(result.error);
                } catch (error) {
                  unstable_rethrow(error);
                  setError(SOCIAL_AUTH_ERROR);
                } finally {
                  pendingRef.current = false;
                  onPendingChange?.(false);
                }
              });
            }}>
            Continuar con {SOCIAL_PROVIDER_LABELS[provider]}
          </Button>
          {providers?.[provider] === false && <p id={`${provider}-unavailable`} className="text-small text-muted-foreground">
            {SOCIAL_PROVIDER_LABELS[provider]} no está disponible en este momento. Puedes usar tu email.
          </p>}
        </div>
      ))}
      {providers && Object.values(providers).includes(null) && <p className="text-small text-muted-foreground">
        No pudimos comprobar la disponibilidad del acceso social. Puedes intentarlo o usar tu email.
      </p>}
      <p role="status" className="text-small text-muted-foreground">{pending && activeProvider ? `Conectando con ${SOCIAL_PROVIDER_LABELS[activeProvider]}…` : ""}</p>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
