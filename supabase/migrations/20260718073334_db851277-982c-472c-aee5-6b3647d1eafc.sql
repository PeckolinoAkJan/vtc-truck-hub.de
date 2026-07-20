
-- 1) Document folders
CREATE TABLE public.vtc_document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vtc_document_folders_vtc_idx ON public.vtc_document_folders(vtc_id, sort);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_document_folders TO authenticated;
GRANT ALL ON public.vtc_document_folders TO service_role;
ALTER TABLE public.vtc_document_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_folders" ON public.vtc_document_folders
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_document_folders.vtc_id AND m.user_id = auth.uid())
  );
CREATE POLICY "admins_write_folders" ON public.vtc_document_folders
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_document_folders.vtc_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_document_folders.vtc_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
  );

-- 2) Document → folder mapping (link table, does not modify vtc_documents)
CREATE TABLE public.vtc_document_folder_map (
  document_id uuid PRIMARY KEY REFERENCES public.vtc_documents(id) ON DELETE CASCADE,
  folder_id uuid NOT NULL REFERENCES public.vtc_document_folders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vtc_document_folder_map_folder_idx ON public.vtc_document_folder_map(folder_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_document_folder_map TO authenticated;
GRANT ALL ON public.vtc_document_folder_map TO service_role;
ALTER TABLE public.vtc_document_folder_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_folder_map" ON public.vtc_document_folder_map
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.vtc_document_folders f
      JOIN public.vtc_members m ON m.vtc_id = f.vtc_id AND m.user_id = auth.uid()
      WHERE f.id = vtc_document_folder_map.folder_id
    )
  );
CREATE POLICY "admins_write_folder_map" ON public.vtc_document_folder_map
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.vtc_document_folders f
      JOIN public.vtc_members m ON m.vtc_id = f.vtc_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')
      WHERE f.id = vtc_document_folder_map.folder_id
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vtc_document_folders f
      JOIN public.vtc_members m ON m.vtc_id = f.vtc_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')
      WHERE f.id = vtc_document_folder_map.folder_id
    )
  );

-- 3) Channels
CREATE TABLE public.vtc_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort integer NOT NULL DEFAULT 0,
  is_private boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vtc_channels_vtc_idx ON public.vtc_channels(vtc_id, sort);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_channels TO authenticated;
GRANT ALL ON public.vtc_channels TO service_role;
ALTER TABLE public.vtc_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_channels" ON public.vtc_channels
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_channels.vtc_id AND m.user_id = auth.uid())
  );
CREATE POLICY "admins_write_channels" ON public.vtc_channels
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_channels.vtc_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_channels.vtc_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
  );

-- 4) Channel messages
CREATE TABLE public.vtc_channel_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.vtc_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  parent_id uuid REFERENCES public.vtc_channel_messages(id) ON DELETE SET NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vtc_channel_messages_channel_idx ON public.vtc_channel_messages(channel_id, created_at DESC);
CREATE INDEX vtc_channel_messages_vtc_idx ON public.vtc_channel_messages(vtc_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_channel_messages TO authenticated;
GRANT ALL ON public.vtc_channel_messages TO service_role;
ALTER TABLE public.vtc_channel_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_channel_messages" ON public.vtc_channel_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_channel_messages.vtc_id AND m.user_id = auth.uid())
  );
CREATE POLICY "members_insert_channel_messages" ON public.vtc_channel_messages
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND is_system = false AND
    EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_channel_messages.vtc_id AND m.user_id = auth.uid())
  );
CREATE POLICY "author_delete_channel_message" ON public.vtc_channel_messages
  FOR DELETE TO authenticated USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_channel_messages.vtc_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin'))
  );

-- 5) Reactions
CREATE TABLE public.vtc_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.vtc_channel_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX vtc_message_reactions_msg_idx ON public.vtc_message_reactions(message_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_message_reactions TO authenticated;
GRANT ALL ON public.vtc_message_reactions TO service_role;
ALTER TABLE public.vtc_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_reactions" ON public.vtc_message_reactions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.vtc_channel_messages msg
      JOIN public.vtc_members m ON m.vtc_id = msg.vtc_id AND m.user_id = auth.uid()
      WHERE msg.id = vtc_message_reactions.message_id
    )
  );
CREATE POLICY "self_insert_reaction" ON public.vtc_message_reactions
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.vtc_channel_messages msg
      JOIN public.vtc_members m ON m.vtc_id = msg.vtc_id AND m.user_id = auth.uid()
      WHERE msg.id = vtc_message_reactions.message_id
    )
  );
CREATE POLICY "self_delete_reaction" ON public.vtc_message_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Trigger to auto-seed default channels when a VTC is created
CREATE OR REPLACE FUNCTION public.seed_default_vtc_channels()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.vtc_channels (vtc_id, name, description, sort, is_private, is_default) VALUES
    (NEW.id, 'Allgemeiner Chat', 'Allgemeine Kommunikation für alle Mitglieder', 0, false, true),
    (NEW.id, 'Ankündigungen',    'Wichtige Informationen und Neuigkeiten',      1, false, false),
    (NEW.id, 'Regeln & Infos',   'Regeln, Handbuch und Verhaltenskodex',        2, true,  false),
    (NEW.id, 'Konvois & Events', 'Organisation von Konvois und Events',         3, false, false),
    (NEW.id, 'Off-Topic',        'Alles rund um Trucking und Community',        4, true,  false);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.seed_default_vtc_channels() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_seed_default_vtc_channels ON public.vtcs;
CREATE TRIGGER trg_seed_default_vtc_channels
  AFTER INSERT ON public.vtcs
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_vtc_channels();

-- Backfill channels for all existing VTCs that don't have any yet
INSERT INTO public.vtc_channels (vtc_id, name, description, sort, is_private, is_default)
SELECT v.id, c.name, c.description, c.sort, c.is_private, c.is_default
FROM public.vtcs v
CROSS JOIN (VALUES
  ('Allgemeiner Chat', 'Allgemeine Kommunikation für alle Mitglieder', 0, false, true),
  ('Ankündigungen',    'Wichtige Informationen und Neuigkeiten',      1, false, false),
  ('Regeln & Infos',   'Regeln, Handbuch und Verhaltenskodex',        2, true,  false),
  ('Konvois & Events', 'Organisation von Konvois und Events',         3, false, false),
  ('Off-Topic',        'Alles rund um Trucking und Community',        4, true,  false)
) AS c(name, description, sort, is_private, is_default)
WHERE NOT EXISTS (SELECT 1 FROM public.vtc_channels ch WHERE ch.vtc_id = v.id);
