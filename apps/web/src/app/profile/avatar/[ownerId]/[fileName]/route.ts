import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ ownerId: string; fileName: string }> }) {
  const { ownerId, fileName } = await context.params;
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!/^[0-9a-f-]{36}$/.test(ownerId) || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(fileName)) return new Response(null, { status: 404, headers });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 404, headers });
  const { data, error } = await supabase.storage.from("avatars").download(`${ownerId}/${fileName}`);
  if (error || !data) return new Response(null, { status: 404, headers });
  return new Response(data, { headers: { ...headers, "Content-Type": data.type } });
}
