-- ============================================================================
-- 0051 — A draft can be handed a time instead of a button press
-- ============================================================================
-- Publishing was one shape: an admin, awake, pressing Publish. That is the
-- wrong shape for the thing it does. A campaign wants to land when the cohort
-- is on their phones — 9am, the morning of the reel drop — and the admin who
-- built it is finishing at eleven the night before. The only way to hit the
-- hour was to be there at the hour.
--
-- `publish_at` is that hour, written down. A draft carrying one goes live when
-- the clock passes it, through exactly the same door as the button: status to
-- 'live', every active ambassador notified. See `lib/campaigns/auto-publish`.
--
-- Deliberately NOT `starts_at`, which already exists and looks like it would
-- do. `starts_at` is a fraud signal — a screenshot whose EXIF capture time
-- predates it cannot be proof of work — and it is what the dashboard and the
-- completion periods order and bucket by. Overloading it would have made
-- "schedule this for Friday" silently mean "and reject every screenshot taken
-- before Friday", which is a different promise than the one the button makes.
-- ============================================================================

alter table public.campaigns
  add column publish_at timestamptz;

comment on column public.campaigns.publish_at is
  'When a draft is due to go live by itself. Null means nobody scheduled it. '
  'Cleared on the way out of draft, so it only ever describes a pending '
  'launch — what actually happened is in the audit log.';

-- A campaign that publishes after its own deadline would go live and be ended
-- by the deadline sweep in the same minute. That is never what was meant, so
-- it is refused here rather than half-honoured.
alter table public.campaigns
  add constraint campaigns_publish_before_end
  check (publish_at is null or ends_at is null or publish_at < ends_at);

-- The sweep's whole query: drafts with a time on them, due first. Partial, so
-- the index holds only the handful of campaigns actually waiting rather than
-- every campaign that ever ran.
create index campaigns_due_to_publish_idx
  on public.campaigns (publish_at)
  where status = 'draft' and publish_at is not null;
