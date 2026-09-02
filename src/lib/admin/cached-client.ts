import "server-only";
import { cache } from "react";
import { assertAdmin } from "./guards";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { redisCache } from "@/lib/cache/redis";
import { adminReadFetch } from "@/lib/cache/admin-fetch";
import { getAdminGeneration } from "@/lib/cache/admin-generation";

// Authorization is always a fresh database read, deduplicated only per render.
// Cache entries cannot bypass a suspension or admin role removal.
const actor = cache(assertAdmin);

async function transport(access: "session" | "service") {
  return adminReadFetch({ cache: redisCache, projectUrl: publicEnv.supabaseUrl,
    actorId: await actor(), access, generation: getAdminGeneration });
}

/** Opt-in for admin READ models. Mutation code keeps the original clients. */
export const createCachedClient = cache(async () => createClient(await transport("session")));
export const createCachedAdminClient = cache(async () => createAdminClient(await transport("service")));
