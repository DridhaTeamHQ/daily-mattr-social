-- ============================================================================
-- DailyMattr Socials — stress VOLUME seed  (~5 million rows)
--
-- Mechanism-accurate: writes the SAME point_ledger rows the app writes, so
-- balances, league tables and analytics reconcile exactly.
--   referral download   -> +100  source_type referral_conversion
--   survey response      -> +10   source_type survey_response
--   campaign submission  -> +10   source_type submission   (approved only)
--
-- Every row is tagged so teardown finds it (see stress-teardown.sql):
--   surveys/campaigns.title            LIKE 'STRESS %'
--   survey_links.slug                  LIKE 'stress-%'
--   referral_conversions.external_user_ref LIKE 'stress-%'
--   survey_responses.respondent_name   = 'STRESS'
--   submissions.review_note            = 'STRESS'
--   point_ledger.note                  LIKE 'STRESS|%'
--
-- Assumes the scaffold already exists: 15 STRESS surveys (75 questions),
-- 15,000 stress- links, 10 STRESS campaigns (20 tasks), 1,000 ambassadors.
-- Run it whole in the Supabase SQL editor. Takes a few minutes.
-- ============================================================================

-- 1) One million counted installs, store mix ---------------------------------
insert into referral_conversions (ambassador_id, code, external_user_ref, source, status, store)
select p.id, p.referral_code, 'stress-'||p.id||'-'||gs,
       'api'::conversion_source, 'counted'::conversion_status,
       (array['play_store','app_store','unknown'])[1+floor(random()*3)::int]::install_store
from (select id, referral_code from profiles where role='ambassador') p
cross join generate_series(1,1000) gs;

-- 1b) …and the ledger row the app writes for each (+100) ----------------------
insert into point_ledger (ambassador_id, delta, reason, source_type, source_id, note)
select rc.ambassador_id, 100, 'referral'::ledger_reason, 'referral_conversion', rc.id::text, 'STRESS|referral'
from referral_conversions rc
where rc.external_user_ref like 'stress-%';

-- 2) ~495,000 survey responses (33 per link), all valid ----------------------
insert into survey_responses (survey_link_id, survey_id, ambassador_id, respondent_name, status)
select l.id, l.survey_id, l.ambassador_id, 'STRESS', 'valid'::response_status
from survey_links l
cross join generate_series(1,33) gs
where l.slug like 'stress-%';

-- 2b) ~2,475,000 answers, one per question of each response ------------------
insert into survey_answers (response_id, question_id, value)
select r.id, q.id,
  case q.type
    when 'single_choice' then to_jsonb((array['Alpha','Beta','Gamma','Delta'])[1+floor(random()*4)::int])
    when 'multi_choice'  then to_jsonb((array['Alpha','Beta','Gamma','Delta'])[1+floor(random()*4)::int])
    when 'rating'        then to_jsonb((1+floor(random()*5))::int)
    when 'number'        then to_jsonb(floor(random()*8)::int)
    else to_jsonb('Dark mode please'::text)
  end
from survey_responses r
join survey_questions q on q.survey_id = r.survey_id
where r.respondent_name = 'STRESS';

-- 2c) …and the ledger row for each response (+10) -----------------------------
insert into point_ledger (ambassador_id, delta, reason, source_type, source_id, note)
select r.ambassador_id, 10, 'survey_response'::ledger_reason, 'survey_response', r.id::text, 'STRESS|survey'
from survey_responses r
where r.respondent_name = 'STRESS';

-- 3) 20,000 campaign submissions (every ambassador on every task), 85% approved
insert into submissions (campaign_task_id, ambassador_id, status, review_note)
select t.id, p.id,
  (case when random() < 0.85 then 'approved' else 'pending' end)::submission_status,
  'STRESS'
from campaign_tasks t
join campaigns c on c.id = t.campaign_id and c.title like 'STRESS %'
cross join (select id from profiles where role='ambassador') p;

-- 3b) …and the ledger row for each APPROVED submission (+10) -------------------
insert into point_ledger (ambassador_id, delta, reason, source_type, source_id, note)
select s.ambassador_id, 10, 'instagram_task'::ledger_reason, 'submission', s.id::text, 'STRESS|campaign'
from submissions s
where s.review_note = 'STRESS' and s.status = 'approved';

-- Reconciliation -------------------------------------------------------------
select
 (select count(*)                from referral_conversions where external_user_ref like 'stress-%')                                       as conversions,
 (select count(*)                from survey_responses      where respondent_name = 'STRESS')                                              as responses,
 (select count(*)                from survey_answers a join survey_responses r on r.id=a.response_id where r.respondent_name='STRESS')     as answers,
 (select count(*)                from submissions           where review_note = 'STRESS')                                                  as submissions,
 (select count(*)                from submissions           where review_note = 'STRESS' and status='approved')                            as approved,
 (select count(*)                from point_ledger          where note like 'STRESS|%')                                                    as ledger_rows,
 (select coalesce(sum(delta),0)  from point_ledger          where note like 'STRESS|%')                                                    as points_allocated;
-- Expected: conversions 1,000,000 · responses ~495,000 · answers ~2,475,000
--           submissions 20,000 · approved ~17,000 · ledger ~1,512,000
--           points ≈ 1,000,000*100 + 495,000*10 + 17,000*10 = 104,950,000-ish
