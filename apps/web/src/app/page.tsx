import { redirect } from "next/navigation";

import { groupHomePath } from "@/lib/groups";

/**
 * Restaura solo una preferencia que aún corresponde a una membresía ACTIVE.
 */
export default async function HomePage() {
  redirect(await groupHomePath());
}
