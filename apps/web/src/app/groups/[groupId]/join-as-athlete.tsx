"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CapacityError } from "@/components/group-capacity";
import { joinAsAthlete } from "./actions";

export function JoinAsAthlete({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string>();
  const [needsBirthdate, setNeedsBirthdate] = useState(false);
  async function join() {
    setPending(true);
    setError(null);
    setErrorCode(undefined);
    setNeedsBirthdate(false);
    try {
      const result = await joinAsAthlete(groupId);
      if ("success" in result) router.refresh();
      else {
        setError(result.error.message);
        setErrorCode(result.error.code);
        setNeedsBirthdate(result.error.code === "athlete_birthdate_required");
      }
    } catch {
      setError("No pudimos confirmar el cambio. Vuelve a intentarlo.");
    } finally {
      setPending(false);
    }
  }
  return <section className="space-y-3 rounded-lg border p-5">
    <h2 className="text-lg font-semibold">También entreno en este grupo</h2>
    <p>Agrega tu rol de deportista para aparecer en la toma de asistencia. Conservarás tu rol de administrador.</p>
    <button type="button" onClick={join} disabled={pending} className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">
      {pending ? "Agregando…" : "Agregarme como deportista"}
    </button>
    {error && <CapacityError error={{ code: errorCode, message: error }} groupId={groupId} />}
    {needsBirthdate && <Link href="/profile" className="block underline">Ir a Mi perfil</Link>}
  </section>;
}
