-- ============================================================================
-- 0007 — Lock down function execution
-- ============================================================================
-- Two problems the database linter caught once the schema was live.
--
-- 1. Postgres grants EXECUTE on new functions to PUBLIC. The earlier
--    `revoke ... from anon, authenticated` statements were therefore no-ops —
--    the PUBLIC grant still let anyone call them. Anonymous callers could hit
--    /rest/v1/rpc/ensure_survey_links and mint survey links, or read any
--    ambassador's total via ambassador_points().
--
--    The fix is `revoke ... from public` first, then grant back only what the
--    app actually calls.
--
-- 2. Four functions had a mutable search_path. A SECURITY DEFINER function
--    without a pinned search_path can be hijacked by a caller who puts a
--    same-named object earlier in their own path.
-- ============================================================================

-- ─── Pin search_path ────────────────────────────────────────────────────────

alter function public.gen_referral_code()          set search_path = public, pg_temp;
alter function public.gen_survey_slug()            set search_path = public, pg_temp;
alter function public.touch_updated_at()           set search_path = public, pg_temp;
alter function public.point_ledger_forbid_update() set search_path = public, pg_temp;

-- ─── Revoke the default PUBLIC grant ────────────────────────────────────────

revoke execute on function public.gen_referral_code()                            from public, anon, authenticated;
revoke execute on function public.gen_survey_slug()                              from public, anon, authenticated;
revoke execute on function public.touch_updated_at()                             from public, anon, authenticated;
revoke execute on function public.handle_new_user()                              from public, anon, authenticated;
revoke execute on function public.guard_profile_privilege_columns()              from public, anon, authenticated;
revoke execute on function public.point_ledger_forbid_update()                   from public, anon, authenticated;
revoke execute on function public.point_ledger_forbid_delete()                   from public, anon, authenticated;
revoke execute on function public.ambassador_points(uuid)                        from public, anon, authenticated;
revoke execute on function public.ensure_survey_links(uuid)                      from public, anon, authenticated;
revoke execute on function public.find_similar_submissions(bit, integer, uuid)   from public, anon, authenticated;
revoke execute on function public.is_admin()                                     from public, anon;
revoke execute on function public.is_active_ambassador()                         from public, anon;
revoke execute on function public.leaderboard(integer)                           from public, anon;
revoke execute on function public.my_standing()                                  from public, anon;
revoke execute on function public.my_survey_stats()                              from public, anon;
revoke execute on function public.my_referral_stats()                            from public, anon;

-- ─── Grant back exactly what the app calls ──────────────────────────────────

-- RLS policies call these on every query, so signed-in users need them. Trigger
-- functions are deliberately absent: Postgres checks EXECUTE at CREATE TRIGGER
-- time, not when the trigger fires, so revoking costs nothing.
grant execute on function public.is_admin()                to authenticated;
grant execute on function public.is_active_ambassador()    to authenticated;

-- The ambassador-facing aggregates. Each one filters on auth.uid() internally,
-- which is why a signed-in user calling them directly is harmless.
grant execute on function public.leaderboard(integer)      to authenticated;
grant execute on function public.my_standing()             to authenticated;
grant execute on function public.my_survey_stats()         to authenticated;
grant execute on function public.my_referral_stats()       to authenticated;

-- Everything else — ensure_survey_links, ambassador_points,
-- find_similar_submissions, and the slug/code generators — is called only by
-- server code holding the service-role key, which bypasses grants entirely.
