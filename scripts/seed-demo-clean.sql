-- Removes everything scripts/seed-demo.mts created, and nothing else.
--
-- Run whole, in the Supabase SQL editor. It is safe to run twice.
--
-- Two things make this SQL rather than a CLI flag. `point_ledger` cascades from
-- `profiles`, and its append-only trigger refuses that cascade — so deleting a
-- demo ambassador through the API fails outright while their points exist. And
-- the auth user has to go too, which lives in the `auth` schema.
--
-- Demo rows are identified by:
--   profiles.email          ending '@demo.local'
--   surveys.title           in the two titles below
--   campaigns.title         in the three titles below
-- Nothing is matched on a wildcard that could catch real content.

begin;

-- Children of the demo surveys ----------------------------------------------
delete from public.survey_answers a
 using public.survey_responses r, public.surveys s
 where a.response_id = r.id
   and r.survey_id   = s.id
   and s.title in ('News app usage', 'How campus news reaches you');

delete from public.survey_responses r
 using public.surveys s
 where r.survey_id = s.id
   and s.title in ('News app usage', 'How campus news reaches you');

delete from public.survey_links l
 using public.surveys s
 where l.survey_id = s.id
   and s.title in ('News app usage', 'How campus news reaches you');

delete from public.survey_questions q
 using public.surveys s
 where q.survey_id = s.id
   and s.title in ('News app usage', 'How campus news reaches you');

-- Children of the demo campaigns ---------------------------------------------
delete from public.submissions sub
 using public.campaign_tasks t, public.campaigns c
 where sub.campaign_task_id = t.id
   and t.campaign_id        = c.id
   and c.title in (
     'Reel: why campus news is broken',
     'Shorts: 60-second exam bulletin',
     'Thread: what your college isn''t telling you');

delete from public.campaign_tasks t
 using public.campaigns c
 where t.campaign_id = c.id
   and c.title in (
     'Reel: why campus news is broken',
     'Shorts: 60-second exam bulletin',
     'Thread: what your college isn''t telling you');

-- Everything hanging off the demo people -------------------------------------
delete from public.referral_conversions rc
 using public.profiles p
 where rc.ambassador_id = p.id and p.email like '%@demo.local';

delete from public.redemption_requests rr
 using public.profiles p
 where rr.ambassador_id = p.id and p.email like '%@demo.local';

delete from public.notifications n
 using public.profiles p
 where n.profile_id = p.id and p.email like '%@demo.local';

delete from public.badge_awards b
 using public.profiles p
 where b.ambassador_id = p.id and p.email like '%@demo.local';

delete from public.active_days d
 using public.profiles p
 where d.ambassador_id = p.id and p.email like '%@demo.local';

-- The ledger is append-only by trigger; lifted only for this delete ----------
alter table public.point_ledger disable trigger point_ledger_no_delete;
delete from public.point_ledger l
 using public.profiles p
 where l.ambassador_id = p.id and p.email like '%@demo.local';
alter table public.point_ledger enable trigger point_ledger_no_delete;

-- The parents ----------------------------------------------------------------
delete from public.surveys
 where title in ('News app usage', 'How campus news reaches you');

delete from public.campaigns
 where title in (
   'Reel: why campus news is broken',
   'Shorts: 60-second exam bulletin',
   'Thread: what your college isn''t telling you');

-- Deleting the auth user cascades the profile away with it.
delete from auth.users u
 using public.profiles p
 where p.id = u.id and p.email like '%@demo.local';

commit;

-- Should all be zero, and profiles should be just your admin.
select
  (select count(*) from public.profiles where email like '%@demo.local') as demo_people,
  (select count(*) from public.surveys   where title in ('News app usage','How campus news reaches you')) as demo_surveys,
  (select count(*) from public.campaigns where title in ('Reel: why campus news is broken','Shorts: 60-second exam bulletin','Thread: what your college isn''t telling you')) as demo_campaigns,
  (select count(*) from public.profiles) as profiles_total,
  (select count(*) from public.point_ledger) as ledger_total;
