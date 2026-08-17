-- ============================================================================
-- 0030 — Achievements
-- ============================================================================
-- Recognition an admin writes by hand: "Ran the GIET orientation stall",
-- "First to 50 responses". Everything else on an ambassador's record is
-- counted by the system, which means the work that does not fit a counter —
-- turning up, organising, helping somebody else finish — has nowhere to live.
--
-- Free text on purpose. A fixed list of badges would need a deploy every time
-- somebody does something new, and the point of this table is the things
-- nobody predicted.
--
-- `on delete cascade` from the profile: an achievement is about a person and
-- means nothing without them. `created_by` is `set null` — the admin who
-- wrote it may leave; the recognition stands.
-- ============================================================================

create table public.achievements (
  id            uuid        primary key default gen_random_uuid(),
  ambassador_id uuid        not null references public.profiles (id) on delete cascade,

  title         text        not null,
  note          text,

  -- When it happened, which is not always when it was typed in.
  awarded_at    timestamptz not null default now(),

  created_by    uuid        references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint achievements_title_sane
    check (char_length(btrim(title)) between 1 and 120),
  constraint achievements_note_sane
    check (note is null or char_length(note) <= 500)
);

create index achievements_ambassador_idx
  on public.achievements (ambassador_id, awarded_at desc);

alter table public.achievements enable row level security;

-- A student sees their own and nobody else's. There is no insert policy for
-- them on purpose: an achievement you can award yourself is not recognition.
create policy achievements_select_own on public.achievements
  for select to authenticated
  using (ambassador_id = auth.uid());

create policy achievements_all_admin on public.achievements
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

comment on table public.achievements is
  'Hand-written recognition for an ambassador. Admin-authored; the ambassador '
  'can read their own.';
