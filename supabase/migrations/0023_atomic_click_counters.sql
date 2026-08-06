-- Counting clicks without losing them.
--
-- The public survey page counted a visit by reading click_count and writing
-- back value + 1. That is a lost update, and it fails exactly when the link is
-- working: everyone who lands in the same moment reads the same number and
-- writes the same number. A load test of 137 views recorded 9 clicks — the
-- other 128 overwrote each other. The counter was quietly least accurate on
-- the surveys that spread the furthest.
--
-- One statement, computed in the database, is the fix. `click_count + 1` on
-- the server is atomic per row; nothing has to be read first.

-- `amount` because the server coalesces: one write carries every visit that
-- arrived while the previous write was in flight, so a burst of 500 costs a
-- handful of round trips instead of 500. See lib/click-counter.ts.
create or replace function public.bump_survey_click(link_id uuid, amount int default 1)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.survey_links
  set click_count = click_count + greatest(amount, 0)
  where id = link_id;
$$;

-- Callable by nobody but the server. The public survey page runs on the
-- service-role client because `anon` has no SELECT policy on survey_links —
-- a masked slug is the only credential, and exposing the table would let
-- anyone enumerate every ambassador's links.
revoke execute on function public.bump_survey_click(uuid, int) from public, anon, authenticated;
