import "server-only";
import { cache } from "react";
import { redisCache } from "./redis";

// One revision read per server render, shared by all the admin read clients.
const requestState = cache(() => ({ generation: undefined as Promise<string | null> | undefined }));

export function getAdminGeneration() {
  const state = requestState();
  return state.generation ??= redisCache.generation("admin");
}

export async function invalidateAdminCache() {
  const generation = redisCache.invalidate("admin");
  requestState().generation = generation;
  await generation;
}
