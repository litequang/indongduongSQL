import type { Page, User, Role } from "../../shared/contracts";
import { api, json } from "../services/api";
export interface UserQuery {
  page: number;
  pageSize: number;
  search: string;
  role?: Role;
  active?: "true" | "false";
  sort?: string;
  direction?: string;
}
export const userRepository = {
  list: (query: UserQuery) =>
    api<Page<User>>(
      `/users?${new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      )}`,
    ),
  create: (input: {
    username: string;
    name: string;
    phone: string;
    role: Role;
    machineAssigned: string;
    password: string;
  }) => api<{ user: User }>("/users", { method: "POST", body: json(input) }),
  update: (id: string, input: Partial<User> & { version: number }) =>
    api<{ user: User }>(`/users/${id}`, { method: "PATCH", body: json(input) }),
  reset: (user: User, password: string) =>
    api(`/users/${user.id}/reset-password`, {
      method: "POST",
      body: json({ password, version: user.version }),
    }),
  revoke: (id: string) =>
    api(`/users/${id}/revoke-sessions`, { method: "POST", body: "{}" }),
};
