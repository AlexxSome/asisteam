import { createServerApiClient } from "@/lib/api/server";
export async function GET(_request: Request, context: {
    params: Promise<{
        ownerId: string;
        fileName: string;
    }>;
}) {
    const { ownerId, fileName } = await context.params;
    const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    if (!/^[0-9a-f-]{36}$/.test(ownerId) || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(fileName))
        return new Response(null, { status: 404, headers });
    {
        try {
            const data = await createServerApiClient().getAvatar({ params: { ownerId, fileName } });
            return new Response(Buffer.from(data.content_base64, "base64"), { headers: { ...headers, "Content-Type": data.type } });
        }
        catch {
            return new Response(null, { status: 404, headers });
        }
    }
}
