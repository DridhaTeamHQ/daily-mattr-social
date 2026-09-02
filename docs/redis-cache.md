# Optional Redis data cache

The existing `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` enable the
server-side cache. Restart the local app or deploy the updated code to production.
No extra package or database migration is required.

Redis stores **query results and the admin invalidation revision**. It does not
store hit/miss counters, daily metrics hashes, logs or monitoring history.

## Data stored

| Data | TTL | Used by |
| --- | --- | --- |
| Admin database query results | 5 minutes | Overview, ambassadors/details, campaigns/tasks/library, reviews, surveys/responses/previews, referrals, leaderboards, cohorts, participation, growth, analytics, stipend/redemption/payout displays |
| Aggregate install counts | 30 seconds | Dashboard install rank and podium |
| Public programme totals | 10 minutes | `/stats` |

Caching is on demand: opening a page reads Redis first. On a miss, the original
Supabase query runs and its successful result is saved with an expiry. A hit
returns the saved result without repeating that query. Unvisited data is not
preloaded, and expired entries disappear from the Redis browser until requested
again. The database remains the source of truth.

Admin keys include a readable table/RPC name, for example:

- `dailymattr:<project>:production:v1:data:admin:profiles:<revision>:<query-hash>`
- `dailymattr:<project>:production:v1:data:admin:campaigns:<revision>:<query-hash>`
- `dailymattr:<project>:production:v1:data:admin:submissions:<revision>:<query-hash>`

The stored JSON envelope contains the query response body, HTTP status and count
headers. The response body contains the actual rows or aggregates, not hit/miss
information. Keys hash filters, pagination/ranges, count preference, schema,
response format, method, RPC arguments, admin identity and client role. Different
filters/pages cannot share the wrong results. Credentials are not part of keys.

The namespace separates Supabase projects and development/preview/production.
Use a unique `REDIS_CACHE_PREFIX` only when you need a custom namespace.

## Freshness and access

Admin authorization checks use Supabase on each render, before cache access.
They are deduplicated only within that render. Cache misses preserve the original
session/RLS or service-role client. Authorization, payment approval checks,
financial exports, screenshot URL signing and mutation clients stay uncached.
Ambassador balances/submissions/notifications retain their original live reads.

The admin transport caches successful PostgREST GET/HEAD requests plus these
read-only RPCs: `completion_leaderboard`, `ambassador_completion`,
`stipend_eligibility`. Errors, auth responses, storage signing and unknown RPCs
are not cached. HEAD counts and Content-Range are preserved. Identical reads are
deduplicated within the render, and no partial failed response is stored.
Supabase responses can set Cloudflare `__cf_bm`/`_cfuvid` cookies. These do not
prevent data caching, but their values are never stored or replayed. Responses
with any other cookie still bypass the cache.

Completed admin edits, student submissions, successful survey responses,
redemption requests, onboarding changes and automatic campaign closure rotate
one shared revision. New reads use new keys. A late response from an old query
cannot overwrite the new revision's data. Old data expires naturally; no scans
are needed in the application. The revision key expires after one day and gets a
unique value when recreated. It is invalidation metadata, not usage tracking.

External database changes, failed/partial mutations or failed invalidation can
leave displays up to five minutes behind. Financial actions always re-check
fresh data. This cache does not provide transaction isolation across queries.

The public stats page renders per request, so a second page cache cannot extend
the Redis totals' ten-minute lifetime.

## Failure behavior and command usage

- Missing configuration or `REDIS_CACHE_ENABLED=false`: use the database.
- Redis failures, quota errors and timeouts fall back to the original loader.
  Failed cache writes still return the successful database result.
- Each Redis request has an 800 ms deadline, including its response body.
  `REDIS_CACHE_TIMEOUT_MS` accepts 100–3000 ms. A miss can add a GET and SET;
  admin rendering can also require an initial revision lookup.
- No automatic retries. The affected instance bypasses Redis for 60 seconds
  after failure, or five minutes after a quota rejection, then tries again.
- Data payloads up to 1 MiB are cached. Larger/unsupported values are returned
  normally without storage; the cache health page shows skipped-write counts.
- A data hit uses one GET. A miss adds one SET. Revision checks/rotation require
  additional commands. There are no Redis commands for hit/miss reporting and
  no background health polling. Check Upstash for account-wide plan usage.

## Diagnostics

Open **Admin → Analytics → Cache health**, or its protected JSON endpoint at
`/admin/analytics/cache/data`. Diagnostics live only in this server instance's
memory since startup; they reset on restart and differ across server instances.
They are not website-wide or daily statistics. The page also shows successful
cache writes and cumulative bytes written, not the number of currently live keys.

Hit % = hits / (hits + misses) × 100; miss % uses the same denominator. No
observations displays `—`. Errors/bypasses are separate from misses. Reading the
diagnostics issues no Redis request. Normal admin layout data reads still count.
Connection status reports the last observation, not an active health probe.

## Verification and legacy cleanup

- `npm run test:redis` checks fallback, quota, expiry commands, key isolation,
  counts, revision invalidation, stale concurrent fills, larger payloads, and
  that data lookups use only GET/SET without metric writes.
- `npm run check:redis` uses the real Supabase SDK with a **synthetic** source and
  real Redis in a temporary namespace. It verifies stored row payloads, one
  source query for two reads, no Redis metrics writes and revision rotation.
  It does not query the production database. Its temporary keys are removed.
  The source includes a synthetic Cloudflare cookie to match Supabase responses.
- `node --conditions=react-server --import tsx scripts/diagnose-cache-headers.mts`
  makes a read-only HEAD request to Supabase and reports status and cookie names.
  It fetches no row bodies and writes nothing to Redis.
- `node --import tsx scripts/redis-maintenance.mts` lists this project's key names
  and TTLs without printing stored values.
- Add `--remove-legacy-metrics` to delete only this project's old dated metric
  keys. Application data and revision keys are preserved. Old deployments can
  recreate these hashes until they are updated.
