import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSupabaseList<T = Record<string, unknown>>(
  table: string,
  select = "*",
  orderBy: { column: string; ascending?: boolean } = { column: "created_at", ascending: false },
  realtimeTables: string[] = [table],
  refreshIntervalMs = 1500,
) {
  const [data, setData] = useState<T[]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const realtimeKey = useMemo(() => realtimeTables.join(","), [realtimeTables]);
  const watchedTables = useMemo(() => realtimeKey.split(",").filter(Boolean), [realtimeKey]);

  const loadData = useCallback(
    async (active: () => boolean, showLoading = false) => {
      if (showLoading) setLoading(true);
      setError(null);

      const q: any = (supabase as any)
        .from(table)
        .select(select)
        .order(orderBy.column, { ascending: orderBy.ascending ?? false });

      const result = (await q) as { data: T[] | null; error: { message: string } | null };

      if (!active()) return;

      if (result.error) setError(result.error.message);
      else setData(result.data ?? []);

      if (showLoading) setLoading(false);
    },
    [table, select, orderBy.column, orderBy.ascending],
  );

  useEffect(() => {
    let active = true;
    const isActive = () => active;

    void loadData(isActive, true);

    const channel = supabase.channel(`public:${table}:${select}:${realtimeKey}`);

    watchedTables.forEach((realtimeTable) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: realtimeTable },
        () => void loadData(isActive),
      );
    });

    channel.subscribe();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadData(isActive);
      }
    }, refreshIntervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadData(isActive);
      }
    };

    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [loadData, realtimeKey, refreshIntervalMs, select, table, watchedTables]);

  return { data, loading, error };
}
