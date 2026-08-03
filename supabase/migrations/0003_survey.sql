-- ============================================================================
-- 0003 — Surveys
-- ============================================================================
-- Each ambassador gets their own link (/s/<slug>) per survey, which is how a
-- response gets attributed. Respondents are members of the public: they never
-- sign in, and `anon` holds no grants on these tables. All public writes go
-- through a server route holding the service-role key, which owns validation
-- and rate limiting.
-- ============================================================================

create type survey_status   as enum ('draft', 'live', 'closed');
create type response_status as enum ('valid', 'duplicate', 'flagged', 'rejected');

create type question_type as enum (
  'short_text', 'long_text', 'single_choice', 'multi_choice',
  'rating', 'number', 'email', 'phone'
);

-- ─── Surveys ────────────────────────────────────────────────────────────────

create table public.surveys (
  id                  uuid primary key default gen_random_uuid(),
  title               text          not null,
  description         text,
  status              survey_status not null default 'draft',
  points_per_response integer       not null default 10,

  -- Respondent identity requirements. Turning these off makes the survey
  -- easier to complete but much easier to farm.
  require_email       boolean       not null default true,
  require_phone       boolean       not null default false,

  created_by          uuid          references public.profiles (id) on delete set null,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),

  constraint surveys_points_sane check (points_per_response between 0 and 1000)
);

create trigger surveys_touch_updated_at
  before update on public.surveys
  for each row execute function public.touch_updated_at();

-- ─── Questions ──────────────────────────────────────────────────────────────

create table public.survey_questions (
  id          uuid primary key default gen_random_uuid(),
  survey_id   uuid          not null references public.surveys (id) on delete cascade,
  order_index integer       not null,
  type        question_type not null,
  prompt      text          not null,
  help_text   text,
  options     jsonb         not null default '[]'::jsonb,
  required    boolean       not null default true,

  -- Choice questions are meaningless without choices.
  constraint survey_questions_choices_present check (
    type not in ('single_choice', 'multi_choice')
    or jsonb_array_length(options) >= 2
  )
);

create unique index survey_questions_order_key
  on public.survey_questions (survey_id, order_index);

-- ─── Per-ambassador links ───────────────────────────────────────────────────

create table public.survey_links (
  id            uuid primary key default gen_random_uuid(),
  survey_id     uuid        not null references public.surveys (id) on delete cascade,
  ambassador_id uuid        not null references public.profiles (id) on delete cascade,
  slug          text        not null,
  click_count   integer     not null default 0,
  created_at    timestamptz not null default now(),

  constraint survey_links_slug_key   unique (slug),
  constraint survey_links_unique_pair unique (survey_id, ambassador_id)
);

create index survey_links_ambassador_idx on public.survey_links (ambassador_id);

create or replace function public.gen_survey_slug()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := '23456789abcdefghjkmnpqrstvwxyz';
  candidate text;
  attempt   int := 0;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from public.survey_links where slug = candidate);

    attempt := attempt + 1;
    if attempt > 50 then
      raise exception 'could not generate a unique survey slug after % attempts', attempt;
    end if;
  end loop;

  return candidate;
end;
$$;

-- Issues links for every active ambassador who doesn't have one yet. Called
-- when a survey goes live and whenever a new ambassador is activated.
create or replace function public.ensure_survey_links(target_survey uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  created int := 0;
  rec     record;
begin
  for rec in
    select p.id
    from public.profiles p
    where p.role = 'ambassador'
      and p.status = 'active'
      and not exists (
        select 1 from public.survey_links l
        where l.survey_id = target_survey and l.ambassador_id = p.id
      )
  loop
    insert into public.survey_links (survey_id, ambassador_id, slug)
    values (target_survey, rec.id, public.gen_survey_slug())
    on conflict (survey_id, ambassador_id) do nothing;
    created := created + 1;
  end loop;

  return created;
end;
$$;

-- ─── Responses ──────────────────────────────────────────────────────────────

create table public.survey_responses (
  id                uuid primary key default gen_random_uuid(),
  survey_link_id    uuid            not null references public.survey_links (id) on delete cascade,
  survey_id         uuid            not null references public.surveys (id) on delete cascade,
  -- Denormalised so a response survives even if the link row is rebuilt, and
  -- so attribution queries don't need a join.
  ambassador_id     uuid            not null references public.profiles (id) on delete cascade,

  respondent_name   text,
  respondent_email  text,
  respondent_phone  text,

  ip_hash           text,
  user_agent        text,
  status            response_status not null default 'valid',
  flag_reason       text,
  submitted_at      timestamptz     not null default now()
);

create index survey_responses_ambassador_idx on public.survey_responses (ambassador_id, submitted_at desc);
create index survey_responses_survey_idx     on public.survey_responses (survey_id, submitted_at desc);
create index survey_responses_ip_idx         on public.survey_responses (survey_id, ip_hash, submitted_at desc);

-- One valid response per person per survey. Case-insensitive on email, because
-- Priya@x.com and priya@x.com are the same student. Enforced in the database
-- rather than in application code so a race between two concurrent submits
-- can't slip a duplicate through.
create unique index survey_responses_one_email_per_survey
  on public.survey_responses (survey_id, lower(respondent_email))
  where status = 'valid' and respondent_email is not null;

create unique index survey_responses_one_phone_per_survey
  on public.survey_responses (survey_id, respondent_phone)
  where status = 'valid' and respondent_phone is not null;

-- ─── Answers ────────────────────────────────────────────────────────────────

create table public.survey_answers (
  id          uuid primary key default gen_random_uuid(),
  response_id uuid  not null references public.survey_responses (id) on delete cascade,
  question_id uuid  not null references public.survey_questions (id) on delete cascade,
  value       jsonb not null,

  constraint survey_answers_unique_pair unique (response_id, question_id)
);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.surveys          enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_links     enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_answers   enable row level security;

-- Ambassadors can see a live survey's title so their dashboard can describe it.
create policy surveys_select_live on public.surveys
  for select to authenticated
  using (status = 'live');

create policy surveys_all_admin on public.surveys
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy survey_questions_select_live on public.survey_questions
  for select to authenticated
  using (exists (
    select 1 from public.surveys s
    where s.id = survey_id and s.status = 'live'
  ));

create policy survey_questions_all_admin on public.survey_questions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- A student sees their own link and nobody else's.
create policy survey_links_select_own on public.survey_links
  for select to authenticated
  using (ambassador_id = auth.uid());

create policy survey_links_all_admin on public.survey_links
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Students get NO select policy here on purpose. RLS filters rows, not columns,
-- so "you may read your own responses" would also hand them every respondent's
-- email and phone number — their friends' personal data. They see counts only,
-- via my_survey_stats() below. Admins get the full rows.
create policy survey_responses_all_admin on public.survey_responses
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy survey_answers_select_admin on public.survey_answers
  for select to authenticated
  using (public.is_admin());

-- ─── Ambassador-safe aggregates ─────────────────────────────────────────────

-- Everything a student is allowed to know about their own survey performance:
-- how many people completed it and how many points that earned. No respondent
-- identities, no answers.
create or replace function public.my_survey_stats()
returns table (
  survey_id       uuid,
  survey_title    text,
  slug            text,
  click_count     integer,
  valid_responses bigint,
  flagged         bigint,
  points_earned   integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.title,
    l.slug,
    l.click_count,
    count(r.id) filter (where r.status = 'valid'),
    count(r.id) filter (where r.status in ('flagged', 'duplicate')),
    coalesce((
      select sum(pl.delta)::integer
      from public.point_ledger pl
      where pl.ambassador_id = auth.uid()
        and pl.reason = 'survey_response'
        and pl.source_type = 'survey_response'
        and pl.source_id in (
          select rr.id::text from public.survey_responses rr
          where rr.survey_id = s.id and rr.ambassador_id = auth.uid()
        )
    ), 0)
  from public.survey_links l
  join public.surveys s on s.id = l.survey_id
  left join public.survey_responses r
    on r.survey_link_id = l.id
  where l.ambassador_id = auth.uid()
    and s.status = 'live'
  group by s.id, s.title, l.slug, l.click_count
  order by s.created_at desc;
$$;
