CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  vtc_id UUID NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL CHECK (length(message) > 0 AND length(message) <= 4000)
);

CREATE INDEX idx_messages_vtc_created ON public.messages(vtc_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read vtc messages"
ON public.messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.vtc_members m
    WHERE m.vtc_id = messages.vtc_id
      AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Members can send vtc messages"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.vtc_members m
    WHERE m.vtc_id = messages.vtc_id
      AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Sender can update own message"
ON public.messages FOR UPDATE
TO authenticated
USING (sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Sender can delete own message"
ON public.messages FOR DELETE
TO authenticated
USING (sender_id = auth.uid());