-- ─────────────────────────────────────────────────────────────────────────────
-- 0036 — The streak counts activity, not approvals
--
-- my_streak() counted days on which the caller's point_ledger gained a row.
-- Points arrive when an admin approves something, so the flame measured the
-- review queue as much as the ambassador: upload on Monday, approved on
-- Thursday, and Monday was never a streak day. Ambassadors who used the app
-- daily read a permanent 0 as the feature being broken, and they were not
-- wrong to — the card promises a daily streak and the query answered a
-- different question.
--
-- Now a day counts if anything the ambassador did reached the database that
-- day: a screenshot uploaded, a response arriving through their link, a
-- referral converting, or points landing. Approval still counts, so nobody's
-- current streak shortens; the union can only add days.
--
-- Everything else is unchanged — same name, same signature, same grants, same
-- Asia/Kolkata day boundary, and the run still has to reach today or
-- yesterday to be live.
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
      -- Points credited. What the function used to look at on its own.
      select (created_at at time zone 'Asia/Kolkata')::date as day
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
