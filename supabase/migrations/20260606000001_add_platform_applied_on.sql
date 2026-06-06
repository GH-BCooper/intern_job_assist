/*
  # Add platform_applied_on column to applications table

  ## Summary
  Adds a new column to track the platform/website where the internship application was submitted.

  ## Changes
  - Adds `platform_applied_on` (varchar) column to applications table
*/

ALTER TABLE applications ADD COLUMN platform_applied_on VARCHAR(255) DEFAULT '';
