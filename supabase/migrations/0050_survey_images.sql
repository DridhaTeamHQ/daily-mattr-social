-- ─────────────────────────────────────────────────────────────────────────────
-- 0050 — A question can show a picture, and so can every option
--
-- Some questions cannot be asked in words. "Which of these posters would make
-- you download the app" is four images and a tick box; written out as four
-- descriptions it is a different question, and a worse one.
--
-- ─── Why the labels are left alone ──────────────────────────────────────────
--
-- The obvious shape is to turn `options` from a list of strings into a list of
-- `{label, image}` objects. That would be wrong here, and expensively so.
--
-- `options` is not a display list. The strings in it ARE the answers: a choice
-- is recorded into `survey_answers.value` as the label itself, the response
-- table counts by matching those strings, and `selections()` in the admin read
-- model splits nothing precisely so a comma inside a label stays part of it.
-- Changing the column's shape would orphan every answer already stored against
-- the old one — 1,003 responses today — and each of the four places that reads
-- it would need to understand both shapes for ever.
--
-- So the labels stay exactly as they are and the pictures go alongside, in a
-- list indexed the same way: `option_images[2]` is the picture for
-- `options[2]`. A null or a missing entry means that option has no picture,
-- which is the normal case and costs nothing to store.
--
-- The editors keep the two lists in step when an option is added, removed or
-- reordered. That is a real obligation, and it is the price of not breaking
-- the answers — a trade this table has made before, in 0019 and in the rating
-- labels, both of which also ride in or beside `options` rather than
-- reshaping it.
--
-- ─── Where the files live ───────────────────────────────────────────────────
--
-- The existing `campaign-media` bucket, under a `surveys/` prefix. It is
-- already public, already limited to 5 MB, already restricted to png/jpeg/webp
-- and already writable only by an admin. A survey image has exactly those
-- requirements: it is shown to a stranger with no account, so it cannot be
-- behind a signed URL, and it is written by an admin building the survey.
-- A second bucket would have been the same bucket with a different name.
--
-- The column holds the public URL rather than the object key. A key needs
-- resolving on every render, on a page built to be opened by two hundred
-- people at once; the URL is already what the browser needs, and the bucket
-- is public so there is nothing to sign.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.survey_questions
  add column if not exists image_url text,
  add column if not exists option_images jsonb not null default '[]'::jsonb;

comment on column public.survey_questions.image_url is
  'Optional picture shown with the question itself, as a public URL in the '
  'campaign-media bucket. Null for the ordinary text question.';

comment on column public.survey_questions.option_images is
  'Pictures for the choices, indexed to match `options`: option_images[i] '
  'belongs to options[i]. Null or absent means that choice has no picture. '
  'Kept beside the labels rather than merged into them because the labels are '
  'what answers are recorded as - see the migration header.';

-- A list, not an object, and never null. Every reader indexes into it, and a
-- shape check here is cheaper than four defensive `Array.isArray` calls that
-- would each have to decide what to do when it is not.
alter table public.survey_questions
  drop constraint if exists survey_questions_option_images_shape;

alter table public.survey_questions
  add constraint survey_questions_option_images_shape
  check (jsonb_typeof(option_images) = 'array');
