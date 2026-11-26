import { api, json } from "./api";
export const bootstrapService = {
  status: () =>
    api<{ initialized: boolean; setupEnabled: boolean }>("/setup/status"),
  bootstrap: (input: {
    setupSecret: string;
    companyName: string;
    name: string;
    username: string;
    password: string;
  }) => api("/setup/bootstrap", { method: "POST", body: json(input) }),
};
