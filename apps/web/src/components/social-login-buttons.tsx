"use client";

import { useState, useTransition } from "react";
import { SOCIAL_AUTH_ERROR, SOCIAL_PROVIDERS, SOCIAL_PROVIDER_LABELS, type SocialLoginContext } from "@asisteam/core";
import { loginWithSocial } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

export function SocialLoginButtons({ context = {}, disabled = false }: { context?: SocialLoginContext; disabled?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3" aria-label="Acceso con cuenta social">
      {SOCIAL_PROVIDERS.map(provider => (
        <Button key={provider} type="button" variant="outline" className="w-full"
          disabled={disabled || pending} onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                const result = await loginWithSocial({ ...context, provider });
                if (result?.error) setError(result.error);
              } catch {
                setError(SOCIAL_AUTH_ERROR);
              }
            });
          }}>
          Continuar con {SOCIAL_PROVIDER_LABELS[provider]}
        </Button>
      ))}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
