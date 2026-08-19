import "server-only";

/**
 * Read every row, not the first thousand.
 *
 * PostgREST caps a select at 1000 rows and says nothing about it — no error,
 * no flag, just a short array. Every aggregate on the admin side was written
 * as `select(...)` with no range, so each one was silently correct up to a
 * thousand rows and silently wrong after.
 *
 * The programme's own target makes that certain rather than hypothetical: the
 * goal is 10,000 downloads, and `referral_conversions` gets a row per install.
 * The goal tracker would have stopped at 1,000 and stayed there — reporting
 * 10% forever while the real number climbed. The ledger gets a row per
 * earning, so it crosses a thousand sooner than that, and every balance,
 * league table and points total reads from it.
 *
 * A 1000-ambassador load test is what surfaced it: 1001 profiles in the table,
 * 1000 returned by a plain select.
 *
 * The order is not decoration. Postgres may return rows in any order it likes
 * for an unordered query, and it need not pick the same order twice — so
 * paging an unordered select can hand you the same row on two pages and never
 * hand you another one at all. Every caller passes a unique column.
 */

const PAGE = 1000;

/**
 * Hard stop at a million rows.
 *
 * A loop that pages until it sees a short page is a loop that never ends if
 * something upstream keeps answering with full pages. This turns that into a
 * wrong number and a loud log rather than a server that stops responding.
 */
const MAX = 1_000_000;

/**
 * Two ways this used to return a wrong number in silence, both fixed here.
 *
 * 1. A failed page was swallowed. `data` was destructured without `error`, so
 *    a timeout or a refused request produced `null`, which became `[]`, which
 *    became a total computed from the pages that happened to succeed. The
 *    survey page did exactly this and rendered "422 responses / nobody has
 *    answered" — see getSurveyResponses.
 * 2. Hitting MAX logged to a server console nobody reads and returned the
 *    truncated rows anyway, so an admin saw half a ledger presented as a
 *    balance.
 *
 * Both now throw. A page that fails to load is a bad outcome; a page that
 * quietly shows the wrong money is a worse one.
 *
 * Still OFFSET-based, and OFFSET is quadratic: page k makes Postgres walk and
 * discard k*1000 rows first, so a full read of N rows examines ~N²/2000. At
 * 24k rows that is nothing; at millions it is the dominant cost of the admin
 * pages, and the fix is not a better loop — it is not reading raw rows at all.
 * These callers should become SQL aggregates (`sum(delta) group by
 * ambassador_id`) which return thousands of rows instead of millions. Tracked
 * in docs/STRESS-AND-SECURITY-REPORT.md.
 */
export async function readAll<T>(
  /** `range` is inclusive at both ends, which is what PostgREST expects. */
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error?: { message: string } | null }>,
  label = "readAll",
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; from < MAX; from += PAGE) {
    /**
     * A failed page is retried before it becomes an error page.
     *
     * Refusing to return a half-read total is right — a wrong number shown as
     * an authoritative one is worse than an error. But most failures here are
     * not the database being wrong, they are a socket the pool had already
     * closed or a cold PostgREST taking its first request: transient, and
     * cured by asking again a moment later. Without this, one blip on one page
     * of a thirty-page read turns an admin screen into "Something broke".
     *
     * Three tries, backing off, and only then does it give up. Read-only and
     * idempotent, so a retry cannot double anything.
     */
    let data: T[] | null = null;
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await page(from, from + PAGE - 1).then(
        (r) => r,
        // A rejected promise is the network-level version of the same
        // problem and has to be caught, not left to reject the whole render.
        (cause: unknown) => ({
          data: null,
          error: { message: cause instanceof Error ? cause.message : String(cause) },
        }),
      );

      if (!result.error) {
        data = result.data;
        lastError = null;
        break;
      }

      lastError = result.error.message;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 250));
      }
    }

    if (lastError) {
      throw new Error(
        `[${label}] page at offset ${from} failed after 3 attempts: ${lastError}`,
      );
    }

    const batch = data ?? [];
    rows.push(...batch);

    // A short page is the last page. An empty one ends it too, which is the
    // case where the row count is an exact multiple of the page size.
    if (batch.length < PAGE) return rows;
  }

  throw new Error(
    `[${label}] exceeded ${MAX} rows. Returning a truncated total would be a wrong number shown as an authoritative one; this read must move to a SQL aggregate.`,
  );
}
