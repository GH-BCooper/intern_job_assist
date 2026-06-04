/*
  # Add interview learnings and role applied to

  ## Summary
  Adds a table to store post-interview learnings and questions asked.
  Also adds a column to track the role applied for in each application.

  ## New Tables
  - `interview_learnings`
    - `id` (uuid, primary key)
    - `application_id` (uuid, FK → applications, cascade delete)
    - `user_id` (uuid, FK → auth.users, for RLS)
    - `learnings` (text, optional notes about the interview)
    - `questions_asked` (text, optional questions they asked)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## Changes to applications table
  - Add `role_applied_to` (varchar, optional role name)

  ## Security
  - RLS enabled on interview_learnings
  - Users can only view/edit their own learnings
*/

CREATE TABLE IF NOT EXISTS interview_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES applications(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  learnings TEXT DEFAULT '',
  questions_asked TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE interview_learnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own interview learnings"
  ON interview_learnings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own interview learnings"
  ON interview_learnings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own interview learnings"
  ON interview_learnings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own interview learnings"
  ON interview_learnings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_interview_learnings_application_id ON interview_learnings(application_id);
CREATE INDEX IF NOT EXISTS idx_interview_learnings_user_id ON interview_learnings(user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'applications' AND column_name = 'role_applied_to'
  ) THEN
    ALTER TABLE applications ADD COLUMN role_applied_to VARCHAR(255) DEFAULT '';
  END IF;
END $$;
