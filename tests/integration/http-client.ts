export class Client {
  cookie = "";
  csrf = "";
  constructor(public base: string) {}
  async request(
    url: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(this.base + "/api" + url, {
      method,
      headers: {
        ...(method !== "GET"
          ? {
              "Content-Type": "application/json",
              Origin: this.base,
              "X-CSRF-Token": this.csrf,
            }
          : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const cookie = response.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0];
    const data = await response.json();
    if (data.csrfToken) this.csrf = data.csrfToken;
    return { status: response.status, data, headers: response.headers };
  }
}
