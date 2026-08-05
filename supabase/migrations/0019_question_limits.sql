-- ============================================================================
-- 0019 — How many options a multi-choice question accepts
-- ============================================================================
-- The alternative was inferring the limit from the prompt text ("pick 2",
-- "choose two"), which fails the first time somebody writes "select up to two
-- of the three below" — and fails silently, by letting a respondent pick five.
--
-- A column is asked for once, by whoever writes the question, and is then
-- simply true. NULL means no limit, which is what every existing question
-- keeps.
-- ============================================================================

alter table public.survey_questions
  add column if not exists max_select integer
    check (max_select is null or max_select > 0);
