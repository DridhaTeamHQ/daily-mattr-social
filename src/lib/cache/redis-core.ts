/** Transport and cache policy. Credentials are supplied only by the server-only wrapper. */
export type RedisConfig = {
  url: string;
  token: string;
  prefix: string;
  timeoutMs: number;
};

// Data lookups use GET. Diagnostics stay in process memory only.
export const MAX_CACHE_BYTES = 1024 * 1024;

export const GENERATION_SCRIPT = `
local generation = redis.call('GET', KEYS[1])
if not generation then
  generation = ARGV[1]
  redis.call('SET', KEYS[1], generation, 'EX', 86400)
end
return generation
`;

export function percentages(hits: number, misses: number) {
  const lookups = hits + misses;
  return {
    hits, misses, lookups,
    hitPercent: lookups ? (hits / lookups) * 100 : null,
    missPercent: lookups ? (misses / lookups) * 100 : null,
  };
}

class RedisFailure extends Error {
  constructor(readonly reason: "timeout" | "quota" | "unavailable") {
    super(reason);
  }
}

export class OptionalRedisCache {
  private retryAt = 0;
  private lastFailure: string | null = null;
  private lastSuccessAt: string | null = null;
  private readonly startedAt: string;
  private readonly local = {
    hits: 0, misses: 0, disabled: 0, circuitBypasses: 0,
    readErrors: 0, writeErrors: 0, oversized: 0, writes: 0, bytesWritten: 0,
    generationErrors: 0, invalidationErrors: 0,
  };

  constructor(
    private readonly config: RedisConfig | null,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    this.startedAt = new Date(now()).toISOString();
  }


  private async command(args: (string | number)[]): Promise<unknown> {
    const config = this.config!;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Bound the full operation, including a stalled response body. Abort also
      // releases the connection; the race protects against a non-cooperative fetch.
      return await Promise.race([
        (async () => {
          const response = await this.fetcher(config.url, {
            method: "POST",
            headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
            body: JSON.stringify(args),
            cache: "no-store",
            signal: controller.signal,
          });
          const body = await response.json().catch(() => null);
          if (!response.ok || !body || typeof body !== "object" || !("result" in body) || body.error) {
            const quota = response.status === 429 || (typeof body?.error === "string" && /quota|limit|maximum|max requests/i.test(body.error));
            throw new RedisFailure(quota ? "quota" : "unavailable");
          }
          return body.result;
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new RedisFailure("timeout"));
            controller.abort();
          }, config.timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private failed(error: unknown) {
    const reason = error instanceof RedisFailure ? error.reason : "unavailable";
    this.lastFailure = reason;
    this.retryAt = Math.max(this.retryAt, this.now() + (reason === "quota" ? 300_000 : 60_000));
    // Never log provider responses, cached data, URLs or credentials.
  }

  private succeeded() { this.lastSuccessAt = new Date(this.now()).toISOString(); }

  /** A missing/evicted generation gets a unique value; old keys cannot reappear. */
  async generation(scope: string): Promise<string | null> {
    if (!this.config || this.now() < this.retryAt) return null;
    try {
      const result = await this.command(["EVAL", GENERATION_SCRIPT, 1,
        `${this.config.prefix}:generation:${scope}`, crypto.randomUUID()]);
      if (typeof result !== "string" || !result) throw new Error("Invalid generation");
      this.succeeded();
      return result;
    } catch (error) {
      this.local.generationErrors++;
      this.failed(error);
      return null;
    }
  }

  /** Invalidate without scanning/deleting data keys. Existing fills use old keys. */
  async invalidate(scope: string): Promise<string | null> {
    if (!this.config || this.now() < this.retryAt) return null;
    try {
      const generation = crypto.randomUUID();
      const result = await this.command(["SET", `${this.config.prefix}:generation:${scope}`, generation, "EX", 86400]);
      if (result !== "OK") throw new Error("Invalidation rejected");
      this.succeeded();
      return generation;
    } catch (error) {
      this.local.invalidationErrors++;
      this.failed(error);
      return null;
    }
  }

  /** Only JSON data, never sessions, authorization decisions, or write results. */
  async remember<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    if (!this.config) { this.local.disabled++; return load(); }
    if (this.now() < this.retryAt) { this.local.circuitBypasses++; return load(); }

    const redisKey = `${this.config.prefix}:data:${key}`;
    try {
      const value = await this.command(["GET", redisKey]);
      if (value !== null) {
        if (typeof value !== "string") throw new Error("Invalid cache response");
        const envelope = JSON.parse(value);
        if (envelope?.version !== 1 || !Object.hasOwn(envelope, "data")) throw new Error("Invalid envelope");
        this.local.hits++;
        this.succeeded();
        return envelope.data as T;
      }
      this.local.misses++;
      this.succeeded();
    } catch (error) {
      this.local.readErrors++;
      this.failed(error);
      return load();
    }

    // Source errors propagate exactly once and never poison the cache. In
    // particular, callers must throw Supabase errors before returning data.
    const data = await load();
    if (this.now() < this.retryAt) return data;
    try {
      const value = JSON.stringify({ version: 1, data });
      if (data === undefined || Buffer.byteLength(value, "utf8") > MAX_CACHE_BYTES) {
        this.local.oversized++;
        return data;
      }
      const result = await this.command(["SET", redisKey, value, "EX", Math.max(1, Math.floor(ttlSeconds))]);
      if (result !== "OK") throw new Error("Cache write rejected");
      this.local.writes++;
      this.local.bytesWritten += Buffer.byteLength(value, "utf8");
      this.succeeded();
    } catch (error) {
      this.local.writeErrors++;
      this.failed(error);
    }
    return data;
  }

  // Reading diagnostics never issues a Redis request or changes the breaker.
  async stats() {
    return {
      scope: "server-instance" as const,
      status: !this.config ? "disabled" : this.now() < this.retryAt ? "fallback" : this.lastSuccessAt ? "connected" : "ready",
      rates: percentages(this.local.hits, this.local.misses),
      retryAt: this.now() < this.retryAt ? new Date(this.retryAt).toISOString() : null,
      lastFailure: this.lastFailure,
      lastSuccessAt: this.lastSuccessAt,
      local: { ...this.local, since: this.startedAt },
    };
  }
}
