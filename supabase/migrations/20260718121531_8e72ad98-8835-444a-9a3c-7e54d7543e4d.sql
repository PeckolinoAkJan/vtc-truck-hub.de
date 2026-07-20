
DO $$ BEGIN
  CREATE TYPE public.live_visibility AS ENUM ('private','vtc','public','hidden');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS live_visibility public.live_visibility NOT NULL DEFAULT 'vtc';

-- Allow authenticated users to see this column via the safe view path;
-- policies on profiles already exist. Just grant column-level SELECT.
GRANT SELECT (live_visibility) ON public.profiles TO authenticated;
GRANT SELECT (live_visibility) ON public.profiles TO anon;
