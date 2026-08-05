-- ============================================================================
-- 0021 — The task library, set to the programme's own list (spec 2.2)
-- ============================================================================
-- The seed library was a plausible guess. This replaces it with the actual
-- tasks and point values the programme runs, for the three networks it has a
-- presence on.
--
-- Superseded rows are DEACTIVATED, not deleted. `campaign_tasks.library_id` is
-- ON DELETE RESTRICT and a campaign already points at some of them — deleting
-- would either fail or erase what a past campaign asked people to do.
-- Deactivating takes them out of the picker and leaves history intact.
-- ============================================================================

-- ─── Instagram ──────────────────────────────────────────────────────────────

update public.task_library set label = 'Follow the page', default_points = 5,
  proof_type = 'screenshot', cadence = 'once',
  instructions = 'Follow @dailymattr and screenshot the Following state.'
  where slug = 'ig_follow';

update public.task_library set label = 'Share a reel to your story', default_points = 10,
  proof_type = 'screenshot', cadence = 'twice_weekly',
  instructions = 'Put a reel on your story and screenshot the story.'
  where slug = 'ig_story';

update public.task_library set label = 'Comment meaningfully on a post', default_points = 5,
  proof_type = 'screenshot', cadence = 'daily',
  instructions = 'A real comment, not just emojis. Screenshot the post showing it.'
  where slug = 'ig_comment';

-- ─── LinkedIn ───────────────────────────────────────────────────────────────

update public.task_library set label = 'Repost with your own take', default_points = 20,
  proof_type = 'link', cadence = 'weekly',
  instructions = 'Repost with two or three lines of your own, then paste the URL.'
  where slug = 'li_share';

update public.task_library set label = 'Write a post tagging DailyMattr', default_points = 40,
  proof_type = 'link', cadence = 'milestone',
  instructions = 'On why India needs a Gen-Z news app. Tag DailyMattr and paste the URL.'
  where slug = 'li_post';

-- ─── X ──────────────────────────────────────────────────────────────────────

update public.task_library set label = 'Retweet or quote a headline', default_points = 10,
  proof_type = 'link', cadence = 'twice_weekly',
  instructions = 'Add your own take, then paste the link.'
  where slug = 'x_repost';

-- ─── The ones the seed did not have ─────────────────────────────────────────
-- "Follow the page" exists three times, once per network, with its own slug.
-- The label is identical because the action is; the platform is what makes
-- them different tasks.

insert into public.task_library (slug, label, platform, proof_type, cadence, default_points, instructions)
values
  ('ig_feedback', 'Give structured feedback', 'Instagram', 'text', 'milestone', 20,
   'One thing you liked and one thing to improve.'),
  ('ig_own_reel', 'Make your own 15-second reel', 'Instagram', 'link', 'milestone', 40,
   'React to or review the DailyMattr concept, then paste the reel URL.'),
  ('li_follow', 'Follow the page', 'LinkedIn', 'screenshot', 'once', 5,
   'Follow DailyMattr on LinkedIn and screenshot the Following state.'),
  ('li_comment', 'Comment with a genuine POV', 'LinkedIn', 'link', 'weekly', 10,
   'Add a real opinion on a trending post and paste the comment link.'),
  ('x_follow', 'Follow the page', 'X', 'screenshot', 'once', 5,
   'Follow DailyMattr on X and screenshot the Following state.'),
  ('x_reply_thread', 'Reply thread on three headlines', 'X', 'link', 'weekly', 15,
   'Pick three headlines, add context or opinion, paste the thread link.')
on conflict (slug) do nothing;

-- ─── Retired ────────────────────────────────────────────────────────────────
-- 'Like the reel' and 'Share it' are superseded by the story and comment tasks
-- above; 'Post on X' is not part of the programme's X list.

update public.task_library set active = false
  where slug in ('ig_like', 'ig_share', 'x_post');
