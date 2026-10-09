// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import { redirect } from "next/navigation";

import { groupHomePath } from "@legacy/lib/groups";

/**
 * Restaura solo una preferencia que aún corresponde a una membresía ACTIVE.
 */
export default async function HomePage() {
  redirect(await groupHomePath());
}
