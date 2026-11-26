import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsRepository } from "../repositories/settingsRepository";
import { useAuth } from "./AuthContext";
import type { ChangePage, Settings } from "../../shared/contracts";
import { api } from "../services/api";
const Context = createContext<{
  settings: Settings | undefined;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<unknown>;
} | null>(null);
export function ConfigProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const cursor = useRef("0");
  const syncGeneration = useRef(0);
  const config = useQuery({
    queryKey: ["settings", user?.id],
    queryFn: settingsRepository.get,
    enabled: !!user,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (config.data)
      document.documentElement.style.setProperty(
        "--brand-primary",
        config.data.settings.primaryColor,
      );
  }, [config.data]);
  useEffect(() => {
    if (!user) return;
    cursor.current = "0";
    const generation = ++syncGeneration.current;
    let alive = true;
    let running = false;
    const poll = async () => {
      if (document.hidden || !navigator.onLine || running) return;
      running = true;
      try {
        let more = true;
        let pages = 0;
        while (alive && more && pages++ < 10) {
          const delta = await api<ChangePage>(
            `/changes?cursor=${cursor.current}`,
          );
          if (!alive || generation !== syncGeneration.current) return;
          cursor.current = delta.cursor;
          more = delta.hasMore;
          if (delta.changes.some((x) => x.entity === "users")) {
            void client.invalidateQueries({ queryKey: ["users"] });
            void client.invalidateQueries({ queryKey: ["session"] });
          }
          if (delta.changes.some((x) => x.entity === "settings"))
            void client.invalidateQueries({ queryKey: ["settings"] });
        }
      } catch {
        /* Auth errors are handled centrally; queries retain explicit connection/error states. */
      } finally {
        running = false;
      }
    };
    const timer = window.setInterval(
      () => void poll(),
      config.data?.settings.pollIntervalMs ?? 4000,
    );
    const focus = () => {
      void client.invalidateQueries({ queryKey: ["session"] });
      void poll();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    document.addEventListener("visibilitychange", focus);
    void poll();
    return () => {
      alive = false;
      syncGeneration.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [user?.id, client, config.data?.settings.pollIntervalMs]);
  return (
    <Context.Provider
      value={{
        settings: config.data?.settings,
        loading: config.isPending,
        error: config.error,
        refresh: config.refetch,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useConfig() {
  const value = useContext(Context);
  if (!value) throw new Error("ConfigProvider missing");
  return value;
}
