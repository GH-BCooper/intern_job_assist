/*
  # Add interview dates table

  ## Summary
  Creates a table to track multiple interview dates for each application.

  ## New Tables
  - `interview_dates`
    - `id` (uuid, primary key)
    - `application_id` (uuid, FK → applications, cascade delete)
    - `user_id` (uuid, FK → auth.users, for RLS)
    - `interview_date` (date, required)
    - `label` (varchar, default 'Round 1')
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Users can only view interview dates for their own applications
  - Users can only insert/update/delete interview dates for their own applications
*/

CREATE TABLE IF NOT EXISTS interview_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES applications(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  interview_date DATE NOT NULL,
  label VARCHAR(100) DEFAULT 'Round 1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE interview_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own interview dates"
  ON interview_dates FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own interview dates"
  ON interview_dates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own interview dates"
  ON interview_dates FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own interview dates"
  ON interview_dates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_interview_dates_application_id ON interview_dates(application_id);
CREATE INDEX IF NOT EXISTS idx_interview_dates_user_id ON interview_dates(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_dates_date ON interview_dates(interview_date);
