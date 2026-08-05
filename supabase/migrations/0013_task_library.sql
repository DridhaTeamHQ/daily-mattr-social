-- ============================================================================
-- 0013 — Task/Activity Library, and proof that isn't a screenshot
-- ============================================================================
-- Two problems solved together, because they are the same problem.
--
-- Campaigns could only ever ask for four things: like, comment, share, story.
-- Those are values in the `task_type` enum, so "post this on LinkedIn" or
-- "take this quiz" could not be expressed at all, and every campaign was
-- rebuilt from scratch rather than assembled from parts.
--
-- The second half follows from the first: a LinkedIn post or a quiz is not
-- evidenced by an Instagram screenshot. The spec asks for a queue of
-- "screenshots, links, and written responses", so a submission needs to be
-- able to carry a URL or a paragraph instead of an image.
--
-- The enum is deliberately left alone. `campaign_tasks.type` stays exactly as
-- it was for the four Instagram actions, and a task built from the library
-- points at `library_id` instead. Nothing that reads `type` today breaks, and
-- new task kinds cost a row rather than a migration — which is the whole
-- point of calling it a library.
-- ============================================================================

create type public.proof_type as enum ('screenshot', 'link', 'text', 'none');

create type public.task_cadence as enum ('daily', 'twice_weekly', 'weekly', 'milestone', 'once');

-- ─── The library ────────────────────────────────────────────────────────────

create table public.task_library (
  id             uuid primary key default gen_random_uuid(),
  slug           text        not null unique,
  label          text        not null,
  platform       text,
  instructions   text,
  proof_type     public.proof_type  not null default 'screenshot',
  cadence        public.task_cadence not null default 'once',
  default_points integer     not null default 10 check (default_points between 0 and 10000),
  active         boolean     not null default true,
  created_by     uuid        references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger task_library_touch_updated_at
  before update on public.task_library
  for each row execute function public.touch_updated_at();

create index task_library_active_idx on public.task_library (active, label);

-- ─── Wiring the library into campaigns ──────────────────────────────────────

alter table public.campaign_tasks
  add column if not exists library_id uuid references public.task_library (id) on delete restrict,
  add column if not exists label_override text,
  add column if not exists proof_type public.proof_type;

-- `type` becomes optional, because a library-built task is identified by its
-- library row. Exactly one of the two must be present — a task with neither is
-- unrenderable, and a task with both is ambiguous about which label wins.
alter table public.campaign_tasks alter column type drop not null;

alter table public.campaign_tasks
  add constraint campaign_tasks_identified
  check (num_nonnulls(type, library_id) = 1);

create index campaign_tasks_library_idx
  on public.campaign_tasks (library_id) where library_id is not null;

-- ─── Proof that isn't an image ──────────────────────────────────────────────

alter table public.submissions
  add column if not exists proof_url text,
  add column if not exists proof_text text;

-- A link or a written answer has no file, so the image columns stop being
-- mandatory. The check below keeps the table honest: every submission must
-- still carry evidence of SOME kind.
alter table public.submissions alter column screenshot_path drop not null;
alter table public.submissions alter column sha256 drop not null;

alter table public.submissions
  add constraint submissions_have_proof
  check (
    screenshot_path is not null
    or proof_url is not null
    or nullif(btrim(coalesce(proof_text, '')), '') is not null
  );

-- ─── Seed ───────────────────────────────────────────────────────────────────
-- The four Instagram actions are seeded so the library is not an empty page on
-- first open, plus the platforms the spec names beyond Instagram.

insert into public.task_library (slug, label, platform, proof_type, cadence, default_points, instructions)
values
  ('ig_like',        'Like the reel',            'Instagram', 'screenshot', 'daily',        10, 'Like the reel, then screenshot the post showing the filled heart.'),
  ('ig_comment',     'Leave a comment',          'Instagram', 'screenshot', 'daily',        15, 'Comment on the reel and screenshot the post showing your comment.'),
  ('ig_share',       'Share it',                 'Instagram', 'screenshot', 'twice_weekly', 15, 'Share the reel and screenshot the confirmation.'),
  ('ig_story',       'Post to story',            'Instagram', 'screenshot', 'weekly',       25, 'Post the reel to your story and screenshot your story.'),
  ('ig_follow',      'Follow the page',          'Instagram', 'screenshot', 'once',         10, 'Follow @dailymattr and screenshot the Following state.'),
  ('li_post',        'Post on LinkedIn',         'LinkedIn',  'link',       'weekly',       30, 'Post about DailyMattr on LinkedIn and paste the post URL.'),
  ('li_share',       'Share on LinkedIn',        'LinkedIn',  'link',       'weekly',       20, 'Reshare a DailyMattr post and paste the URL.'),
  ('wa_status',      'WhatsApp status',          'WhatsApp',  'screenshot', 'twice_weekly', 10, 'Put the link on your status and screenshot it.'),
  ('quiz',           'Complete the quiz',        NULL,        'text',       'milestone',    20, 'Answer the quiz questions in the box.'),
  ('survey_share',   'Share your survey link',   NULL,        'link',       'weekly',       10, 'Share your personal survey link and paste where you posted it.'),
  ('campus_poster',  'Put up a campus poster',   NULL,        'screenshot', 'milestone',    40, 'Photograph the poster where you put it up.')
on conflict (slug) do nothing;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Students need to read the library so their task list can name the thing they
-- are being asked to do. Only admins write it.

alter table public.task_library enable row level security;

create policy task_library_select_all on public.task_library
  for select to authenticated
  using (true);

create policy task_library_all_admin on public.task_library
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
