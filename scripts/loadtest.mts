/**
 * Load test.
 *
 * Answers one question: how many people can be on the site at once before it
 * stops answering. Not a benchmark of the machine — a check that the request
 * path has no per-request work that scales with the crowd.
 *
 * Usage:
 *   npx tsx scripts/loadtest.mts <base-url> [--users 200] [--seconds 15] [--path /stats]
 *
 * Point it at a PRODUCTION build (`npm run build && npm start`). A dev server
 * compiles on demand and measures the compiler, not the app.
 */

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";

function flag(name: string, fallback: number): number {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
}

const users = flag("users", 200);
const seconds = flag("seconds", 15);
/** Send every request from one address, to prove the rate limiter bites. */
const sameIp = args.includes("--same-ip");
const pathIndex = args.indexOf("--path");
const paths =
  pathIndex >= 0
    ? args[pathIndex + 1].split(",")
    : ["/stats", "/login", "/forgot-password"];

const latencies: number[] = [];
const codes = new Map<number | string, number>();
let done = 0;

const deadline = Date.now() + seconds * 1000;

/** One simulated visitor: request, record, repeat until the clock runs out. */
async function visitor(id: number) {
  while (Date.now() < deadline) {
    const path = paths[(id + done) % paths.length];
    const started = performance.now();
    try {
      const res = await fetch(base + path, {
        redirect: "manual",
        headers: {
          "user-agent": `loadtest/${id}`,
          // One address per simulated visitor unless asked otherwise. A crowd
          // is a thousand people, not one machine, and the rate limiter keys
          // on the address — testing them all as one measures the limiter.
          ...(sameIp ? {} : { "x-forwarded-for": `10.${id >> 16 & 255}.${id >> 8 & 255}.${id & 255}` }),
        },
      });
      // The body has to be drained or the socket stays busy and the next
      // request queues behind it, which measures the test rather than the app.
      await res.arrayBuffer().catch(() => undefined);
      latencies.push(performance.now() - started);
      codes.set(res.status, (codes.get(res.status) ?? 0) + 1);
    } catch (err) {
      latencies.push(performance.now() - started);
      const label = err instanceof Error ? err.message.slice(0, 40) : "error";
      codes.set(label, (codes.get(label) ?? 0) + 1);
    }
    done += 1;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

console.log(
  `${users} concurrent visitors · ${seconds}s · ${base} · ${paths.join(", ")}\n`,
);

const started = performance.now();
await Promise.all(Array.from({ length: users }, (_, i) => visitor(i)));
const elapsed = (performance.now() - started) / 1000;

const sorted = [...latencies].sort((a, b) => a - b);
const ok = [...codes].filter(([c]) => typeof c === "number" && c < 500);
const bad = [...codes].filter(([c]) => typeof c !== "number" || c >= 500);

console.log(`requests      ${done}`);
console.log(`throughput    ${(done / elapsed).toFixed(1)} req/s`);
console.log(`p50           ${percentile(sorted, 50).toFixed(0)} ms`);
console.log(`p95           ${percentile(sorted, 95).toFixed(0)} ms`);
console.log(`p99           ${percentile(sorted, 99).toFixed(0)} ms`);
console.log(`max           ${percentile(sorted, 100).toFixed(0)} ms`);
console.log(
  `responses     ${ok.map(([c, n]) => `${c}×${n}`).join(" ") || "none"}`,
);
console.log(
  `failures      ${bad.map(([c, n]) => `${c}×${n}`).join(" ") || "none"}`,
);
