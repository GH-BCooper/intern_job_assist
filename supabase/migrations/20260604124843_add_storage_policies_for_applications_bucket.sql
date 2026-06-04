/*
  # Add Storage Policies for Applications Bucket

  1. Security
    - Add SELECT policy: authenticated users can view files in their own folder
    - Add INSERT policy: authenticated users can upload files to their own folder
    - Add UPDATE policy: authenticated users can update files in their own folder
    - Add DELETE policy: authenticated users can delete files in their own folder
  
  2. Important Notes
    - The bucket is public (for reading via getPublicUrl), but writes are restricted to the owning user
    - Folder structure: `{user_id}/{application_id}/resume.pdf` and `{user_id}/{application_id}/cover_letter.pdf`
    - Policies use split_part to extract the first path segment (user_id) and match against auth.uid()
*/

-- Allow authenticated users to view files in the applications bucket
CREATE POLICY "Authenticated users can view application files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'applications' AND split_part(name, '/', 1) = auth.uid()::text);

-- Allow authenticated users to upload files to their own folder
CREATE POLICY "Authenticated users can upload application files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'applications' AND split_part(name, '/', 1) = auth.uid()::text);

-- Allow authenticated users to update files in their own folder
CREATE POLICY "Authenticated users can update application files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'applications' AND split_part(name, '/', 1) = auth.uid()::text)
  WITH CHECK (bucket_id = 'applications' AND split_part(name, '/', 1) = auth.uid()::text);

-- Allow authenticated users to delete files in their own folder
CREATE POLICY "Authenticated users can delete application files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'applications' AND split_part(name, '/', 1) = auth.uid()::text);
