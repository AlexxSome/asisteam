import { groupHomePath } from "@/lib/groups";
import { redirect } from "next/navigation";
/**
 * Restaura solo una preferencia que aún corresponde a una membresía ACTIVE.
 */
export default async function HomePage() {
    redirect(await groupHomePath());
}
