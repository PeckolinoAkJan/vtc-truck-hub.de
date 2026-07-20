import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_EMAIL = "j.rikeit@gmail.com";
const DEFAULT_DOWNLOAD_URL =
  "https://github.com/PeckolinoAkJan/virtual-fleet-forge/actions/runs/29567899987/artifacts/8401896582";

export function useAppSetting(key: string, fallback = "") {
  const [value, setValue] = useState<string>(fallback);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (data?.value) setValue(data.value);
    setLoading(false);
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  return { value, loading, reload: load, setValue };
}

export function useClientDownloadUrl() {
  return useAppSetting("client_download_url", DEFAULT_DOWNLOAD_URL);
}

export function useIsSuperAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setIsAdmin(data.user?.email?.toLowerCase() === ADMIN_EMAIL);
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return isAdmin;
}

export const SUPER_ADMIN_EMAIL = ADMIN_EMAIL;
