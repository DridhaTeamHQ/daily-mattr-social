import { assertAdmin } from "@/lib/admin/guards";
import { redisCache } from "@/lib/cache/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  try { await assertAdmin(); }
  catch { return Response.json({ error: "Forbidden" }, { status: 403, headers: { "Cache-Control": "private, no-store" } }); }
  return Response.json(await redisCache.stats(), { headers: { "Cache-Control": "private, no-store" } });
}
