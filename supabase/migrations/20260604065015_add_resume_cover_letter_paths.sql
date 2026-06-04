/*
  # Add resume and cover letter storage paths

  ## Summary
  Adds columns to track the Supabase Storage paths for uploaded resume and cover letter PDFs.

  ## Changes
  - `applications` table
    - Add `resume_path` (varchar)
    - Add `cover_letter_path` (varchar)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'applications' AND column_name = 'resume_path'
  ) THEN
    ALTER TABLE applications ADD COLUMN resume_path VARCHAR(500) DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'applications' AND column_name = 'cover_letter_path'
  ) THEN
    ALTER TABLE applications ADD COLUMN cover_letter_path VARCHAR(500) DEFAULT '';
  END IF;
END $$;
