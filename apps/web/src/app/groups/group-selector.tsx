"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useTransition } from "react";
import { MEMBERSHIP_ROLE_LABELS } from "@asisteam/core";
import type { MyGroup } from "@/lib/groups";
import { activeGroupCookie, switchedGroupPath } from "@/lib/group-routing";
import { navigateWithUnsavedChanges } from "@/lib/use-unsaved-changes";

export function GroupSelector({ groups, activeId, userId, guardianOnly }: {
  groups: MyGroup[]; activeId: string; userId: string; guardianOnly: boolean;
}) {
  const pathname = usePathname();
  const selectId = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    // Preferencia por cuenta y dispositivo, nunca tokens. Al restaurarla el
    // servidor vuelve a comprobar la membresía; una cookie manipulada no autoriza.
    document.cookie = `${activeGroupCookie(userId)}=${activeId}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, [activeId, userId]);
  if (guardianOnly) return null;
  return <div className="min-w-0 space-y-2">
    <label htmlFor={selectId} className="block text-sm font-medium">Grupo activo</label>
    <select id={selectId} value={activeId} disabled={pending} aria-busy={pending}
      className="min-h-11 w-full min-w-0 rounded-md border border-input bg-surface px-3 text-body"
      onChange={(event) => {
        const group = groups.find((item) => item.id === event.target.value);
        if (group) navigateWithUnsavedChanges(() => startTransition(() => router.push(switchedGroupPath(pathname, group.id, group.roles))));
      }}>
      {groups.map((group) => <option key={group.id} value={group.id}>
        {group.name} — {group.roles.map((role) => MEMBERSHIP_ROLE_LABELS[role]).join(" + ")}
      </option>)}
    </select>
    <Link href="/groups" className="flex min-h-11 items-center text-sm underline underline-offset-4">Ver todos mis grupos</Link>
  </div>;
}
