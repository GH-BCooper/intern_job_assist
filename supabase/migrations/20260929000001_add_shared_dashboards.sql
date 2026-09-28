/*
  # Read-only shared dashboards

  Powers the `/shared/:token` route: a link a user can hand to a mentor or a
  career centre that shows their *aggregate* insights, and never the raw
  application records.

  ## What this adds
  1. `shared_dashboards` — one row per share link.
     - `token` (text, unique)  the random, unguessable path segment
     - `user_id` (uuid)        owner, cascades on delete
     - `scope` (text)          'insights' today; room for more later
     - `payload` (jsonb)       the pre-computed snapshot the page renders
     - `expires_at` (timestamptz, nullable) null means no expiry
     - `revoked` (boolean)     soft kill switch that keeps the row for audit
     - `view_count` (integer)  incremented by the public read function

  ## Security
  - RLS is enabled. Owners get full CRUD on their own rows.
  - Anonymous visitors get **no direct table access at all**. They read through
    `public_shared_dashboard(token)`, a security-definer function that returns
    only the payload, and only for a row that is neither revoked nor expired.
    That keeps the token in a WHERE clause the client cannot widen, so a share
    link cannot be turned into a listing of every share link.

  ## Notes
  - `payload` holds a snapshot rather than a live query because the analytics
    it summarises are computed client-side from data that lives in the
    browser's local store; the owner refreshes the snapshot by re-sharing.
*/

CREATE TABLE IF NOT EXISTS shared_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'insights',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  label text NOT NULL DEFAULT '',
  expires_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_dashboards_user_id_idx ON shared_dashboards (user_id);
CREATE INDEX IF NOT EXISTS shared_dashboards_token_idx ON shared_dashboards (token);

ALTER TABLE shared_dashboards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can read their share links" ON shared_dashboards;
CREATE POLICY "Owners can read their share links"
  ON shared_dashboards FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can create share links" ON shared_dashboards;
CREATE POLICY "Owners can create share links"
  ON shared_dashboards FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can update their share links" ON shared_dashboards;
CREATE POLICY "Owners can update their share links"
  ON shared_dashboards FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can delete their share links" ON shared_dashboards;
CREATE POLICY "Owners can delete their share links"
  ON shared_dashboards FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

/*
  The only anonymous entry point. SECURITY DEFINER so it can read past RLS,
  but it accepts exactly one token and returns exactly one payload — there is
  no way to enumerate rows through it.
*/
CREATE OR REPLACE FUNCTION public_shared_dashboard(share_token text)
RETURNS TABLE (payload jsonb, label text, scope text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE shared_dashboards s
     SET view_count = s.view_count + 1
   WHERE s.token = share_token
     AND s.revoked = false
     AND (s.expires_at IS NULL OR s.expires_at > now());

  RETURN QUERY
  SELECT s.payload, s.label, s.scope, s.created_at
    FROM shared_dashboards s
   WHERE s.token = share_token
     AND s.revoked = false
     AND (s.expires_at IS NULL OR s.expires_at > now());
END;
$$;

REVOKE ALL ON FUNCTION public_shared_dashboard(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_shared_dashboard(text) TO anon, authenticated;
