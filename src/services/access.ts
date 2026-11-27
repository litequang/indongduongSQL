import { useQuery } from "@tanstack/react-query";
import type { AccessPolicy, Capability, Feature } from "../../shared/access";
import { api } from "./api";
import { useAuth } from "../context/AuthContext";
export interface AccessView {
  version: number;
  features: Record<Feature, boolean>;
  permissions: Record<Capability, boolean>;
  policy?: AccessPolicy;
}
export function useAccess() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["access", user?.id],
    queryFn: () => api<AccessView>("/access"),
    enabled: !!user,
    refetchInterval: 4000,
  });
}
