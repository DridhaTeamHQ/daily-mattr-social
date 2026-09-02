import Link from "next/link";
import { Database } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/ui/stat";
import { requireAdmin } from "@/lib/admin/queries";
import { redisCache } from "@/lib/cache/redis";

export const metadata = { title: "Cache health" };
export const dynamic = "force-dynamic";

export default async function CacheHealthPage() {
  await requireAdmin();
  const stats = await redisCache.stats();
  const percent = (value: number | null) => value === null ? "—" : `${value.toFixed(2)}%`;
  const status = {
    connected: "Last Redis request succeeded",
    ready: "Configured · no Redis request yet on this instance",
    disabled: "Disabled",
    fallback: "Using database fallback",
  }[stats.status];

  return (
    <div className="space-y-6">
      <PageHeader title="Cache health" description="Database result caching · diagnostics kept in server memory" icon={Database} tone="brand"
        action={<form action="/admin/analytics/cache" method="get"><button type="submit" className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-ink">Refresh</button></form>} />
      <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm">
        <p className="font-bold">{status}</p>
        <p className="mt-2 text-ink-soft">Counters cover only this server instance since {stats.local.since}. They reset on restart and can differ between instances. No hit/miss counters are stored in Redis.</p>
        {stats.retryAt ? <p className="mt-2">Redis {stats.lastFailure}. This instance will try again after {stats.retryAt}. Reads continue through the database.</p> : null}
        {stats.status === "disabled" ? <p className="mt-2">Redis is disabled or its server configuration is missing or invalid. Database reads continue normally.</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cache hit rate" value={percent(stats.rates.hitPercent)} sub={`${stats.rates.hits} hits on this instance`} />
        <Stat label="Cache miss rate" value={percent(stats.rates.missPercent)} sub={`${stats.rates.misses} misses on this instance`} />
        <Stat label="Completed data lookups" value={stats.rates.lookups} sub="Hits + misses on this instance" />
        <Stat label="Successful data writes" value={stats.local.writes} sub={`${(stats.local.bytesWritten / 1024).toFixed(1)} KiB written since startup`} />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm leading-relaxed">
        <h2 className="font-bold">What Redis stores</h2>
        <p className="mt-2">Admin query results are stored under keys such as data:admin:profiles, data:admin:campaigns and data:admin:submissions, followed by a revision and query identifier. Filters and pages use separate entries. Keys appear when a page loads and expire after five minutes.</p>
        <p className="mt-2">A cache hit returns the saved rows and skips that database query. Completed edits invalidate admin data. Authorization, payment checks, financial exports and screenshot URL signing still use fresh data.</p>
        <p className="mt-2">Install counts expire after 30 seconds; public totals after 10 minutes. The small admin revision key is used for invalidation. No daily metrics hashes are created.</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm leading-relaxed">
        <h2 className="font-bold">How the percentages work</h2>
        <p className="mt-2">Hit rate = hits ÷ (hits + misses) × 100. Miss rate uses the same denominator. No lookups yet shows —. These are instance-local observations, not totals across the website.</p>
        <p className="mt-2">Errors and bypasses are separate from misses. Reading these diagnostics makes no Redis request. Normal admin layout reads still count.</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm">
        <h2 className="font-bold">Fallback diagnostics · this server instance</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {([
            ["Disabled cache reads", stats.local.disabled], ["Circuit bypasses", stats.local.circuitBypasses],
            ["Read errors", stats.local.readErrors], ["Write errors", stats.local.writeErrors],
            ["Oversized or unsupported writes", stats.local.oversized],
            ["Revision read errors", stats.local.generationErrors], ["Invalidation errors", stats.local.invalidationErrors],
          ] as const).map(([label, value]) => <div key={label}><dt className="text-ink-soft">{label}</dt><dd className="text-lg font-bold">{value}</dd></div>)}
        </dl>
        <p className="mt-4 text-ink-soft">Each data hit uses one Redis GET. A miss adds one SET if the result fits within 1 MiB. Revision checks and invalidation use additional commands. Check your Upstash dashboard for plan usage.</p>
      </div>
      <Link href="/admin/analytics" className="text-sm font-bold text-brand-strong">Back to analytics</Link>
    </div>
  );
}
