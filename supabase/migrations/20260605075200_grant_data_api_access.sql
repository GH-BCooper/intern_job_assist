/*
  # Grant Data API access to application tables

  ## Why
  Supabase Data API access requires both:
  - table privileges via GRANT
  - row-level security policies

  The existing schema defines RLS policies, but these tables were created in raw SQL
  migrations and may not have explicit privileges for the `authenticated` role.
  Without these grants, client queries fail with:
  `permission denied for table applications`
*/

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.applications
  TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.interview_dates
  TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.interview_learnings
  TO authenticated, service_role;
