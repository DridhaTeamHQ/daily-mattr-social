-- ============================================================================
-- 0008 — Notifications, push subscriptions, streaks
-- ============================================================================
-- Three things the ambassador app needs to be worth opening daily:
--
--   notifications       in-app history, readable by the owner only
--   push_subscriptions  Web Push endpoints, one row per browser
--   my_streak()         consecutive days with earnings, for the flame
--
-- All writes come from server code holding the service-role key. Students may
-- read their own rows and mark them read; they may not create them, or the
-- notification feed becomes a place to write whatever you like.
-- ============================================================================

create type notification_type as enum (
  'submission_approved',
  'submission_rejected',
  'submission_revoked',
  'points_awarded',
  'campaign_live',
  'survey_live',
  'rank_up',
  'referral_confirmed',
  'account'
);

-- ─── Notifications ──────────────────────────────────────────────────────────

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid              not null references public.profiles (id) on delete cascade,
  type       notification_type not null,
  title      text              not null,
  body       text,

  -- Where tapping it should land. Relative path, never an absolute URL —
  -- these are rendered as links and an absolute one would be an open redirect
  -- with extra steps.
  href       text,

  meta       jsonb             not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz       not null default now(),

  constraint notifications_href_relative check (
    href is null or (href like '/%' and href not like '//%')
  )
);

create index notifications_inbox_idx
  on public.notifications (profile_id, created_at desc);

-- Powers the unread dot without scanning the whole history.
create index notifications_unread_idx
  on public.notifications (profile_id)
  where read_at is null;

-- ─── Push subscriptions ─────────────────────────────────────────────────────

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid        not null references public.profiles (id) on delete cascade,

  -- The endpoint URL is the browser's own identifier for this subscription,
  -- and is globally unique. Re-subscribing on the same browser should replace
  -- the row rather than add one, or every notification gets sent twice.
  endpoint   text        not null,
  p256dh     text        not null,
  auth       text        not null,

  user_agent text,
  created_at timestamptz not null default now(),
  last_used  timestamptz,

  constraint push_subscriptions_endpoint_key unique (endpoint)
);

create index push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

-- ─── Streak ─────────────────────────────────────────────────────────────────

-- Consecutive days, counting back from today, on which the caller earned
-- something. A gap ends the streak. Today not having earned yet does not —
-- otherwise every streak reads as zero until the student does something,
-- which is exactly backwards as a motivator.
create or replace function public.my_streak()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with days as (
    select distinct (created_at at time zone 'Asia/Kolkata')::date as day
    from public.point_ledger
    where ambassador_id = auth.uid()
      and delta > 0
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

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.notifications       enable row level security;
alter table public.push_subscriptions  enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (profile_id = auth.uid());

-- Marking as read is the only write a student gets. There is no INSERT policy
-- on purpose: the feed is written by server code, never by the client.
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy notifications_select_admin on public.notifications
  for select to authenticated
  using (public.is_admin());

-- A browser must be able to register and drop its own subscription.
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ─── Grants ─────────────────────────────────────────────────────────────────

revoke execute on function public.my_streak() from public, anon;
grant  execute on function public.my_streak() to authenticated;
