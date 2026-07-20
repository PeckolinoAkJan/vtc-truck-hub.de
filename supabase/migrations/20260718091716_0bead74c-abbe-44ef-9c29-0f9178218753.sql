
-- === 1. APP_SETTINGS: Whitelist öffentlicher Keys ===
-- Ersetze die generische key-basierte Policy durch eine strikte Whitelist.
DROP POLICY IF EXISTS "Authenticated read client_download_url" ON public.app_settings;

CREATE POLICY "Public keys readable by authenticated"
  ON public.app_settings FOR SELECT TO authenticated
  USING (key IN ('client_download_url'));

CREATE POLICY "Public keys readable by anon"
  ON public.app_settings FOR SELECT TO anon
  USING (key IN ('client_download_url'));

-- === 2. EVENT-BANNERS Storage: nur VTC-Mitglieder oder Teilnehmer öffentlicher Events ===
DROP POLICY IF EXISTS event_banners_read_members ON storage.objects;

CREATE POLICY event_banners_read_scoped ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (
    bucket_id = 'event-banners'
    AND EXISTS (
      SELECT 1 FROM public.vtc_events e
      WHERE (e.banner_url LIKE '%' || storage.objects.name || '%'
             OR storage.objects.name LIKE e.vtc_id::text || '/%')
        AND (
          e.visibility = 'public'
          OR (auth.uid() IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.vtc_members m
                WHERE m.vtc_id = e.vtc_id AND m.user_id = auth.uid()
              ))
          OR (auth.uid() IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.vtc_event_participants p
                WHERE p.event_id = e.id AND p.user_id = auth.uid()
              ))
        )
    )
  );

-- === 3. VEHICLE-MEDIA Storage: Insert an existierendes Fahrzeug binden ===
DROP POLICY IF EXISTS vehicle_media_write_staff ON storage.objects;

CREATE POLICY vehicle_media_write_staff ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vehicle-media'
    AND auth.uid() IS NOT NULL
    AND owner = auth.uid()
    AND private.has_vtc_role(
      auth.uid(),
      (split_part(name, '/', 1))::uuid,
      ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role, 'dispatcher'::public.vtc_role]
    )
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.vtc_id = (split_part(name, '/', 1))::uuid
        AND v.id::text = split_part(name, '/', 2)
    )
  );

-- === 4. SECURITY DEFINER Hardening ===
-- Trigger-Only Funktionen: EXECUTE von PUBLIC/anon/authenticated widerrufen (nur Trigger-Kontext).
REVOKE EXECUTE ON FUNCTION public.add_vtc_owner_on_create() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.jobs_prevent_driver_field_tamper() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.jobs_reverse_balance_on_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_non_owner_owner_grant() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_non_owner_owner_invite() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_prevent_balance_tamper() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_global_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_vtc_channels() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_default_trial() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settlements_assign_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settlements_recalc_totals() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settlements_update_disputed_flag() FROM PUBLIC, anon, authenticated;

-- Public-Read Funktionen: von SECURITY DEFINER auf INVOKER umstellen (vtcs erlaubt anon SELECT bereits).
ALTER FUNCTION public.list_public_vtcs() SECURITY INVOKER;
ALTER FUNCTION public.get_public_vtc(text) SECURITY INVOKER;

-- Aggregat-Leaderboards: DEFINER bleibt (aggregiert über RLS-geschützte jobs/profiles),
-- aber EXECUTE strikt nur an anon+authenticated, nicht PUBLIC.
REVOKE EXECUTE ON FUNCTION public.get_top_drivers(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_top_vtcs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_drivers(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_vtcs(integer) TO anon, authenticated;

-- Auth-gated RPCs: nur authenticated
REVOKE EXECUTE ON FUNCTION public.accept_vtc_join_request(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pay_driver_jobs(uuid, uuid, uuid, numeric, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pay_settlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_vtc_join_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_driver_jobs(uuid, uuid, uuid, numeric, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_settlement(uuid) TO authenticated;
