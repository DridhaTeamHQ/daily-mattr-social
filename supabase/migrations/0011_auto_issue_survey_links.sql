-- ============================================================================
-- 0011 — Issue survey links when an ambassador becomes active
-- ============================================================================
-- Links were only ever created at one moment: when a survey was published.
-- Anyone who became active afterwards — every future ambassador — got nothing,
-- and their Surveys page sat empty with no indication why. The only remedy was
-- an admin remembering to press "Issue missing links" on each live survey.
--
-- Publishing covers "new survey, existing ambassadors". This covers the other
-- direction: "existing surveys, new ambassador". Between them there is no gap.
-- ============================================================================

create or replace function public.issue_survey_links_for_ambassador()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role = 'ambassador' and new.status = 'active' then
    insert into public.survey_links (survey_id, ambassador_id, slug)
    select s.id, new.id, public.gen_survey_slug()
    from public.surveys s
    where s.status = 'live'
      and not exists (
        select 1
        from public.survey_links l
        where l.survey_id = s.id
          and l.ambassador_id = new.id
      )
    on conflict (survey_id, ambassador_id) do nothing;
  end if;

  return new;
end;
$$;

-- `of status, role` keeps this off the hot path: editing a phone number or
-- college shouldn't re-scan every live survey.
create trigger profiles_issue_survey_links
  after insert or update of status, role on public.profiles
  for each row execute function public.issue_survey_links_for_ambassador();

revoke execute on function public.issue_survey_links_for_ambassador()
  from public, anon, authenticated;

-- ─── Backfill ───────────────────────────────────────────────────────────────
-- Everyone already active who missed out, including anyone activated between
-- a survey going live and this migration running.

insert into public.survey_links (survey_id, ambassador_id, slug)
select s.id, p.id, public.gen_survey_slug()
from public.surveys s
cross join public.profiles p
where s.status = 'live'
  and p.role = 'ambassador'
  and p.status = 'active'
  and not exists (
    select 1
    from public.survey_links l
    where l.survey_id = s.id
      and l.ambassador_id = p.id
  )
on conflict (survey_id, ambassador_id) do nothing;
