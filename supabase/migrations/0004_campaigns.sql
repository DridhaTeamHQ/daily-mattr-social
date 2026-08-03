-- ============================================================================
-- 0004 — Instagram campaigns and screenshot submissions
-- ============================================================================
-- One campaign per reel. Each campaign carries the tasks we want done (like,
-- comment, share, story), each worth points. Ambassadors prove the work with a
-- screenshot; `submissions` stores both the file and every piece of evidence we
-- gathered about it, so a reviewer can see *why* the machine decided what it
-- decided rather than being handed a bare verdict.
-- ============================================================================

create type campaign_status  as enum ('draft', 'live', 'ended');
create type task_type        as enum ('like', 'comment', 'share', 'story');
create type submission_status as enum (
  'pending',        -- uploaded, checks still running
  'auto_approved',  -- passed deterministic checks and cleared the AI threshold
  'needs_review',   -- inconclusive; sitting in the admin queue
  'approved',       -- a human approved it
  'rejected',       -- failed
  'revoked'         -- was approved, later reversed
);

-- ─── Campaigns ──────────────────────────────────────────────────────────────

create table public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  title           text            not null,
  description     text,
  instagram_url   text            not null,

  -- The handle the screenshot must show. Stored without the '@'.
  expected_handle text            not null default 'dailymattr',
  caption_hint    text,

  thumbnail_path  text,
  status          campaign_status not null default 'draft',
  starts_at       timestamptz     not null default now(),
  ends_at         timestamptz,

  created_by      uuid        references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint campaigns_window_sane check (ends_at is null or ends_at > starts_at)
);

create index campaigns_status_idx on public.campaigns (status, starts_at desc);

create trigger campaigns_touch_updated_at
  before update on public.campaigns
  for each row execute function public.touch_updated_at();

comment on column public.campaigns.starts_at is
  'Also used as a fraud signal: a screenshot whose EXIF capture time predates '
  'this cannot be proof of work on this campaign.';

-- ─── Tasks ──────────────────────────────────────────────────────────────────

create table public.campaign_tasks (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid      not null references public.campaigns (id) on delete cascade,
  type         task_type not null,
  points       integer   not null default 10,
  instructions text,
  required     boolean   not null default true,
  order_index  integer   not null default 0,

  constraint campaign_tasks_points_sane check (points between 0 and 1000),
  -- A reel has one 'like' task, not three.
  constraint campaign_tasks_unique_type unique (campaign_id, type)
);

create index campaign_tasks_campaign_idx on public.campaign_tasks (campaign_id, order_index);

-- ─── Submissions ────────────────────────────────────────────────────────────

create table public.submissions (
  id               uuid primary key default gen_random_uuid(),
  campaign_task_id uuid              not null references public.campaign_tasks (id) on delete cascade,
  ambassador_id    uuid              not null references public.profiles (id) on delete cascade,
  attempt          integer           not null default 1,

  -- Storage object key in the private 'screenshots' bucket.
  screenshot_path  text              not null,

  -- ─ Fingerprints ─
  sha256           text              not null,
  -- 64-bit difference hash as a bit string. Near-duplicate search is
  -- bit_count(phash # other) — see find_similar_submissions() below.
  phash            bit(64),

  -- ─ Image facts ─
  width            integer,
  height           integer,
  byte_size        integer,
  mime_type        text,
  captured_at      timestamptz,       -- from EXIF, when present
  uploaded_at      timestamptz       not null default now(),

  -- ─ Verdicts ─
  checks           jsonb             not null default '{}'::jsonb,  -- deterministic results
  ai_verdict       jsonb,                                            -- raw model output
  ai_confidence    numeric(4,3),
  ai_model         text,

  status           submission_status not null default 'pending',
  reject_reason    text,

  reviewer_id      uuid        references public.profiles (id) on delete set null,
  review_note      text,
  reviewed_at      timestamptz,

  constraint submissions_confidence_range check (
    ai_confidence is null or ai_confidence between 0 and 1
  )
);

create index submissions_task_idx      on public.submissions (campaign_task_id);
create index submissions_ambassador_idx on public.submissions (ambassador_id, uploaded_at desc);
create index submissions_queue_idx      on public.submissions (status, uploaded_at asc)
  where status in ('needs_review', 'pending');
create index submissions_sha256_idx     on public.submissions (sha256);

-- One live submission per task per ambassador. Rejected and revoked rows are
-- excluded so a student can try again after a genuine mistake, bounded by the
-- submissions.max_attempts setting.
create unique index submissions_one_active_per_task
  on public.submissions (campaign_task_id, ambassador_id)
  where status not in ('rejected', 'revoked');

create unique index submissions_attempt_key
  on public.submissions (campaign_task_id, ambassador_id, attempt);

-- ─── Near-duplicate search ──────────────────────────────────────────────────

-- The single most effective anti-fraud check we have: one student screenshots
-- a like, then the image gets passed around a WhatsApp group. Exact-hash
-- matching misses it (recompression changes bytes), perceptual hashing doesn't.
--
-- This is a sequential scan. That is fine at the scale of a college cohort
-- (thousands of rows, sub-millisecond). If this ever reaches millions, the fix
-- is a BK-tree or the `pg_similarity` extension, not an index on this column.
create or replace function public.find_similar_submissions(
  probe            bit(64),
  max_distance     integer default 6,
  exclude_id       uuid    default null
)
returns table (
  id            uuid,
  ambassador_id uuid,
  distance      integer,
  status        submission_status,
  uploaded_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.ambassador_id,
    bit_count(s.phash # probe)::integer,
    s.status,
    s.uploaded_at
  from public.submissions s
  where s.phash is not null
    and (exclude_id is null or s.id <> exclude_id)
    and bit_count(s.phash # probe) <= max_distance
  order by bit_count(s.phash # probe) asc, s.uploaded_at asc;
$$;

revoke execute on function public.find_similar_submissions(bit, integer, uuid) from anon, authenticated;

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.campaigns      enable row level security;
alter table public.campaign_tasks enable row level security;
alter table public.submissions    enable row level security;

create policy campaigns_select_live on public.campaigns
  for select to authenticated
  using (status = 'live');

create policy campaigns_all_admin on public.campaigns
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy campaign_tasks_select_live on public.campaign_tasks
  for select to authenticated
  using (exists (
    select 1 from public.campaigns c
    where c.id = campaign_id and c.status = 'live'
  ));

create policy campaign_tasks_all_admin on public.campaign_tasks
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- A student sees their own submissions and their status. They cannot INSERT
-- directly: uploads go through POST /api/submissions, which runs the checks
-- with the service-role key. Letting the client insert would mean letting it
-- choose its own `status`.
create policy submissions_select_own on public.submissions
  for select to authenticated
  using (ambassador_id = auth.uid());

create policy submissions_all_admin on public.submissions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
