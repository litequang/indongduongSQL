import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "../../shared/contracts";
import { api, json, setCsrfToken, ApiError } from "../services/api";
interface AuthState {
  user: User | null;
  loading: boolean;
  error: Error | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
}
const Context = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      try {
        const data = await api<{ user: User; csrfToken: string }>("/auth/me");
        setCsrfToken(data.csrfToken);
        return data.user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setCsrfToken("");
          return null;
        }
        throw e;
      }
    },
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  useEffect(() => {
    const expired = () => {
      setCsrfToken("");
      client.clear();
      client.setQueryData(["session"], null);
    };
    window.addEventListener("idd-session-expired", expired);
    return () => window.removeEventListener("idd-session-expired", expired);
  }, [client]);
  useEffect(() => {
    if (session.data === null) {
      for (const q of client.getQueryCache().getAll())
        if (q.queryKey[0] !== "session" && q.queryKey[0] !== "setup")
          client.removeQueries({ queryKey: q.queryKey, exact: true });
    }
  }, [session.data, client]);
  const login = async (username: string, password: string) => {
    const result = await api<{ user: User; csrfToken: string }>("/auth/login", {
      method: "POST",
      body: json({ username, password }),
    });
    client.clear();
    setCsrfToken(result.csrfToken);
    client.setQueryData(["session"], result.user);
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST", body: "{}" });
    setCsrfToken("");
    client.clear();
    client.setQueryData(["session"], null);
  };
  return (
    <Context.Provider
      value={{
        user: session.data ?? null,
        loading: session.isPending,
        error: session.error,
        login,
        logout,
        refresh: session.refetch,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
