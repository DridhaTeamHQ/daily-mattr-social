-- ============================================================================
-- 0020 — Campaign platforms, per-task platforms, and suspension reasons
-- ============================================================================
-- Campaigns could only ever be Instagram: the four task types were an enum of
-- Instagram actions and the campaign carried an `instagram_url`. Running the
-- same push on Snapchat or Reddit had nowhere to go.
--
-- `platform` is free text rather than an enum on purpose. The list of networks
-- students actually use changes faster than migrations ship, and adding one
-- should cost a dropdown entry rather than a schema change and a deploy.
-- ============================================================================

alter table public.campaigns
  add column if not exists platform text not null default 'Instagram';

create index if not exists campaigns_platform_idx on public.campaigns (platform);

-- Per-task platform too, so one campaign can span networks — "post the clip on
-- X and put it on your Snapchat story" is one ask — and analytics can still
-- attribute each task to the right network.
alter table public.campaign_tasks
  add column if not exists platform text;

-- ─── Why an account was suspended ───────────────────────────────────────────
-- Without this, `suspended` is a state with no story. Nobody can tell a
-- payment dispute from a fake-screenshot ban six months later, the student
-- cannot be told why, and an admin reversing it has no idea what they are
-- reversing.

alter table public.profiles
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid
    references public.profiles (id) on delete set null;

-- ─── The networks the seed library was missing ──────────────────────────────

insert into public.task_library (slug, label, platform, proof_type, cadence, default_points, instructions)
values
  ('sc_story',    'Snapchat story',           'Snapchat', 'screenshot', 'twice_weekly', 15, 'Post it to your Snapchat story and screenshot the story view.'),
  ('sc_send',     'Send on Snapchat',         'Snapchat', 'screenshot', 'weekly',       10, 'Send it to friends and screenshot the send confirmation.'),
  ('fb_share',    'Share on Facebook',        'Facebook', 'link',       'weekly',       20, 'Share the post publicly and paste the link to your share.'),
  ('fb_group',    'Post to a Facebook group', 'Facebook', 'link',       'weekly',       25, 'Post in a relevant group and paste the post link.'),
  ('x_post',      'Post on X',                'X',        'link',       'weekly',       20, 'Post about DailyMattr and paste the post URL.'),
  ('x_repost',    'Repost on X',              'X',        'link',       'twice_weekly', 10, 'Repost and paste the link to your repost.'),
  ('rd_post',     'Post on Reddit',           'Reddit',   'link',       'weekly',       30, 'Post in a relevant subreddit and paste the permalink.'),
  ('rd_comment',  'Comment on Reddit',        'Reddit',   'link',       'weekly',       15, 'Leave a genuine comment and paste the permalink.'),
  ('yt_comment',  'Comment on YouTube',       'YouTube',  'link',       'weekly',       15, 'Comment on the video and paste the comment link.'),
  ('yt_short',    'Post a YouTube Short',     'YouTube',  'link',       'milestone',    40, 'Post a Short about DailyMattr and paste the URL.'),
  ('th_post',     'Post on Threads',          'Threads',  'link',       'weekly',       20, 'Post about DailyMattr and paste the URL.'),
  ('tg_share',    'Share on Telegram',        'Telegram', 'screenshot', 'weekly',       10, 'Share to a group or channel and screenshot it.')
on conflict (slug) do nothing;
