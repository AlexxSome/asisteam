import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthLayout({ title, description, inviteCode, children }: {
  title: string;
  description: string;
  inviteCode?: string;
  children: ReactNode;
}) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-8 sm:py-12">
    <p className="text-h2 text-primary">Asisteam</p>
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle as="h1">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {inviteCode && <p className="text-small text-info">Tu invitación se conservará para continuar al grupo.</p>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  </main>;
}
