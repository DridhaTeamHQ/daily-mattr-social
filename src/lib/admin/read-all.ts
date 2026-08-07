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

export async function readAll<T>(
  /** `range` is inclusive at both ends, which is what PostgREST expects. */
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  label = "readAll",
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; from < MAX; from += PAGE) {
    const { data } = await page(from, from + PAGE - 1);
    const batch = data ?? [];
    rows.push(...batch);

    // A short page is the last page. An empty one ends it too, which is the
    // case where the row count is an exact multiple of the page size.
    if (batch.length < PAGE) return rows;
  }

  console.error(
    `[${label}] stopped at ${MAX} rows — the table is larger than this was built for.`,
  );
  return rows;
}
