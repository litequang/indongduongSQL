import type { Settings } from "../../shared/contracts";
import { api, json } from "../services/api";
export const settingsRepository = {
  get: () => api<{ settings: Settings }>("/settings"),
  save: (settings: Settings) =>
    api<{ settings: Settings }>("/settings", {
      method: "PATCH",
      body: json(settings),
    }),
};
