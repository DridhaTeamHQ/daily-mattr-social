-- ============================================================================
-- 0052 — A survey draft can be handed a time, the same as a campaign
-- ============================================================================
-- The companion to 0051. Same problem, and a sharper version of it: publishing
-- a survey does more than flip a status. It calls `ensure_survey_links`, which
-- mints a personal link for every active ambassador, and then tells all of
-- them. That is a launch, and a launch wants an hour somebody chose — not
-- whichever hour the admin happened to finish building the questions.
--
-- No `campaigns_publish_before_end` equivalent here, because a survey has no
-- deadline column to publish past. It runs until someone closes it.
-- ============================================================================

alter table public.surveys
  add column publish_at timestamptz;

comment on column public.surveys.publish_at is
  'When a draft is due to go live by itself. Null means nobody scheduled it. '
  'Cleared on the way out of draft, so it only ever describes a pending '
  'launch. See lib/surveys/auto-publish.';

-- The sweep's whole query: drafts with a time on them, due first. Partial, so
-- it holds the few surveys actually waiting rather than every survey ever run.
create index surveys_due_to_publish_idx
  on public.surveys (publish_at)
  where status = 'draft' and publish_at is not null;
