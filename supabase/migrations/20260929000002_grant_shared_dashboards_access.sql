/*
  # Grant Data API access to shared_dashboards

  ## Why
  The same trap this project hit once before (see
  `20260605075200_grant_data_api_access.sql`): Supabase's Data API requires both
  RLS policies *and* table privileges. `20260929000001_add_shared_dashboards.sql`
  defined the policies but not the GRANT, so every read — including the one the
  `calendar-feed` Edge Function makes with the service role — failed with:

      permission denied for table shared_dashboards

  The GRANT has since been folded into that migration for projects created
  fresh. This file exists so a project that already applied the first version
  gets it too. It is idempotent, so running it twice is harmless.

  `anon` is intentionally granted nothing: anonymous readers reach the data only
  through `public_shared_dashboard(text)`, which is SECURITY DEFINER and takes a
  single token, so a share link can never be widened into a listing.
*/

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.shared_dashboards
  TO authenticated, service_role;
