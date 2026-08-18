-- ============================================================================
-- 0031 — Who a survey is for
-- ============================================================================
-- Until now every survey was the same shape: an ambassador shares their link
-- and members of the public answer it. Some surveys are the opposite — the
-- ambassadors themselves are the respondents, one answer each, and a stranger
-- filling it in is noise rather than data.
--
--   'public'      — the existing kind. Anyone with the link answers, the
--                   response_cap is the survey-wide ceiling, and the survey
--                   closes itself when it fills.
--   'participant' — the ambassador the link was issued to answers it, signed
--                   in, exactly once. No email or phone is asked for, because
--                   the account already says who they are. The cap does not
--                   apply: the survey stays open until every ambassador has
--                   had their turn.
--
-- Defaulting to 'public' so every survey that already exists keeps behaving
-- exactly as it did.
-- ============================================================================

create type survey_audience as enum ('public', 'participant');

alter table public.surveys
  add column audience survey_audience not null default 'public';

comment on column public.surveys.audience is
  'public: anyone with the link. participant: only the ambassador the link '
  'was issued to, once, while signed in.';
