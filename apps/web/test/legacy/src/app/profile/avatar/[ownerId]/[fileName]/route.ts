// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import { moduleTransport } from "@legacy/lib/api/config";
import { createServerApiClient } from "@legacy/lib/api/server";
import { createClient } from "@legacy/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ ownerId: string; fileName: string }> }) {
  const { ownerId, fileName } = await context.params;
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!/^[0-9a-f-]{36}$/.test(ownerId) || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(fileName)) return new Response(null, { status: 404, headers });
  if (moduleTransport("storage") === "nest") {
    try {
      const data = await createServerApiClient().getAvatar({ params: { ownerId, fileName } });
      return new Response(Buffer.from(data.content_base64, "base64"), { headers: { ...headers, "Content-Type": data.type } });
    } catch { return new Response(null, { status: 404, headers }); }
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 404, headers });
  const { data, error } = await supabase.storage.from("avatars").download(`${ownerId}/${fileName}`);
  if (error || !data) return new Response(null, { status: 404, headers });
  return new Response(data, { headers: { ...headers, "Content-Type": data.type } });
}
