/*
  # Create applications table for InternTrack

  ## Summary
  Creates the core data table for storing internship application records. User identity
  is managed by Supabase Auth (auth.users), so only the applications table is needed here.

  ## New Tables
  - `applications`
    - `id` (uuid, primary key)
    - `user_id` (uuid, FK → auth.users, cascade delete)
    - `company_name` (varchar, required)
    - `company_description` (text)
    - `resume_used` (varchar)
    - `cover_letter_used` (varchar)
    - `response_status` (varchar, default 'Pending')
    - `interview_offered` (boolean, default false)
    - `final_status` (varchar, default 'In Progress')
    - `date_applied` (date)
    - `salary_info` (text)
    - `interview_questions` (text)
    - `tasks_to_complete` (text)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## Security
  - RLS enabled on applications
  - SELECT: users can only read their own applications
  - INSERT: users can only insert applications for themselves
  - UPDATE: users can only update their own applications
  - DELETE: users can only delete their own applications
*/

CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_name VARCHAR(150) NOT NULL,
  company_description TEXT DEFAULT '',
  resume_used VARCHAR(255) DEFAULT '',
  cover_letter_used VARCHAR(255) DEFAULT '',
  response_status VARCHAR(100) DEFAULT 'Pending',
  interview_offered BOOLEAN DEFAULT FALSE,
  final_status VARCHAR(100) DEFAULT 'In Progress',
  date_applied DATE,
  salary_info TEXT DEFAULT '',
  interview_questions TEXT DEFAULT '',
  tasks_to_complete TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own applications"
  ON applications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own applications"
  ON applications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own applications"
  ON applications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own applications"
  ON applications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);
