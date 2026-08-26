-- ─────────────────────────────────────────────────────────────────────────────
-- 0038 — Showing up is a streak day
--
-- 0036 widened my_streak() from "points landed" to "the ambassador did
-- something", but every source it counted is still a piece of *work*: an
-- upload, a survey response, a referral. A student who signs in every single
-- morning and has nothing to submit yet reads 0 days, which is the reading
-- that made the card look broken in the first place.
--
-- Two more sources, both of them "you were here":
--
--   * active_days — one row per person per day, already written by
--     touch_active_day() on every dashboard load since 0024. The history was
--     being collected all along and nothing was reading it for the flame.
--
--   * today, unconditionally. my_streak() is called by the signed-in student's
--     own dashboard and nowhere else, so the call is itself proof that they
--     opened the app today. This matters because the active_days row for today
--     is written in Next's `after()` — it lands *after* the response that shows
--     the number. Without this branch the first visit of the day would show
--     yesterday's streak and only catch up on the next navigation, which is
--     precisely the "my streak didn't move" complaint.
--
-- Nothing is removed, so no existing streak gets shorter. Same name, same
-- signature, same grants, same Asia/Kolkata day boundary.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.my_streak()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with days as (
    select distinct day
    from (
      -- Signed in and looking at this right now. See the header: the row for
      -- today is written after the render, so the render cannot wait for it.
      select (now() at time zone 'Asia/Kolkata')::date as day
       where auth.uid() is not null

      union all

      -- Every earlier day they opened the app.
      select day
        from public.active_days
       where ambassador_id = auth.uid()

      union all

      -- Points credited. What the function used to look at on its own.
      select (created_at at time zone 'Asia/Kolkata')::date
        from public.point_ledger
       where ambassador_id = auth.uid()
         and delta > 0

      union all

      -- Proof sent in. Counted on the day it was uploaded, whatever the
      -- reviewer decided later — the ambassador's day of work is the upload.
      select (uploaded_at at time zone 'Asia/Kolkata')::date
        from public.submissions
       where ambassador_id = auth.uid()

      union all

      -- Somebody answered their survey link. Every status counts: this is a
      -- flame, not a payout, and a duplicate response still means the link
      -- was out there being shared.
      select (submitted_at at time zone 'Asia/Kolkata')::date
        from public.survey_responses
       where ambassador_id = auth.uid()

      union all

      -- A referral turned into a real signup.
      select (converted_at at time zone 'Asia/Kolkata')::date
        from public.referral_conversions
       where ambassador_id = auth.uid()
         and converted_at is not null
    ) activity
  ),
  ranked as (
    select day, row_number() over (order by day desc) as rn
    from days
    -- Anchor to today or yesterday; anything older is not a live streak.
    where day <= (now() at time zone 'Asia/Kolkata')::date
  ),
  runs as (
    select day, rn, day + (rn || ' days')::interval as grp
    from ranked
  )
  select coalesce((
    select count(*)::integer
    from runs
    where grp = (select grp from runs where rn = 1)
      and (select day from runs where rn = 1)
          >= (now() at time zone 'Asia/Kolkata')::date - 1
  ), 0);
$$;

-- Unchanged from 0008, restated because create or replace does not carry
-- grants forward when the function is recreated from a fresh database.
revoke execute on function public.my_streak() from public, anon;
grant  execute on function public.my_streak() to authenticated;
