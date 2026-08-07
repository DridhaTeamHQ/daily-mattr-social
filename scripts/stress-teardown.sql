-- ============================================================================
-- DailyMattr Socials — stress teardown. Removes everything stress-seed.sql and
-- the scaffold created. Order respects foreign keys. Run whole in the SQL
-- editor. The 1,000 ambassador *logins* are removed separately with:
--     npx tsx scripts/stress-1000.mts --cleanup
-- ============================================================================

-- Activity first (children before parents) -----------------------------------
delete from survey_answers a using survey_responses r
  where a.response_id = r.id and r.respondent_name = 'STRESS';
delete from survey_responses where respondent_name = 'STRESS';
delete from submissions       where review_note   = 'STRESS';
delete from referral_conversions where external_user_ref like 'stress-%';

-- point_ledger is append-only (trigger); disable it only for this teardown ----
alter table point_ledger disable trigger point_ledger_no_delete;
delete from point_ledger where note like 'STRESS|%';
alter table point_ledger enable trigger point_ledger_no_delete;

-- Scaffold --------------------------------------------------------------------
delete from survey_links where slug like 'stress-%';
delete from survey_questions q using surveys s
  where q.survey_id = s.id and s.title like 'STRESS %';
delete from surveys where title like 'STRESS %';
delete from campaign_tasks t using campaigns c
  where t.campaign_id = c.id and c.title like 'STRESS %';
delete from campaigns where title like 'STRESS %';

-- The stray survey the earlier click test left behind, if present -------------
delete from survey_links l using surveys s
  where l.survey_id = s.id and s.title = 'Stress test survey';
delete from surveys where title = 'Stress test survey';

-- Verify zero -----------------------------------------------------------------
select
 (select count(*) from referral_conversions where external_user_ref like 'stress-%') as conversions_left,
 (select count(*) from survey_responses where respondent_name='STRESS')              as responses_left,
 (select count(*) from point_ledger where note like 'STRESS|%')                      as ledger_left,
 (select count(*) from surveys where title like 'STRESS %')                          as surveys_left,
 (select count(*) from campaigns where title like 'STRESS %')                        as campaigns_left;
