-- ============================================================================
-- 0018 — A student's own stipend progress, month by month
-- ============================================================================
-- `stipend_eligibility()` cannot serve this. It is admin-only and returns the
-- whole cohort, and a student must not be able to read anyone else's downloads
-- by calling it a different way.
--
-- SECURITY DEFINER with `auth.uid()` baked in rather than taken as a
-- parameter: there is deliberately no argument for *whose* progress to fetch,
-- so there is nothing to tamper with. The only input is how far back to look.
-- ============================================================================

create or replace function public.my_stipend_progress(months_back integer default 6)
returns table (
  period      date,
  downloads   bigint,
  surveys     bigint,
  met         boolean,
  paid_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me            uuid := auth.uid();
  min_downloads integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_min_downloads'), 30);
  min_surveys   integer := coalesce((select value::text::integer from public.app_settings where key = 'stipend_min_surveys'), 3);
  span          integer := greatest(1, least(coalesce(months_back, 6), 24));
begin
  if me is null then
    return;
  end if;

  return query
  -- generate_series rather than the months that happen to have data: a month
  -- where someone did nothing is exactly the month they need to see.
  with periods as (
    select (date_trunc('month', now()) - (n || ' months')::interval)::date as p
    from generate_series(0, span - 1) as n
  ),
  dl as (
    select date_trunc('month', rc.converted_at)::date as p, count(*) as n
    from public.referral_conversions rc
    where rc.ambassador_id = me and rc.status = 'counted'
    group by 1
  ),
  sv as (
    select date_trunc('month', sr.submitted_at)::date as p, count(*) as n
    from public.survey_responses sr
    where sr.ambassador_id = me and sr.status = 'valid'
    group by 1
  ),
  pay as (
    select b.period_month as p, max(po.status::text) as st
    from public.payouts po
    join public.payout_batches b on b.id = po.batch_id
    where po.ambassador_id = me and po.kind = 'stipend' and b.period_month is not null
    group by 1
  )
  select
    periods.p,
    coalesce(dl.n, 0),
    coalesce(sv.n, 0),
    coalesce(dl.n, 0) >= min_downloads and coalesce(sv.n, 0) >= min_surveys,
    coalesce(pay.st, 'none')
  from periods
  left join dl  on dl.p  = periods.p
  left join sv  on sv.p  = periods.p
  left join pay on pay.p = periods.p
  order by periods.p desc;
end;
$$;

revoke execute on function public.my_stipend_progress(integer) from public, anon;
grant execute on function public.my_stipend_progress(integer) to authenticated;
