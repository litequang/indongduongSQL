let csrfToken = "";
export function setCsrfToken(value: string) {
  csrfToken = value;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const requestSessionToken = csrfToken;
  const mutation = !!options.method && options.method !== "GET";
  const response = await fetch(`/api${url}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(mutation
        ? { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }
        : {}),
      ...options.headers,
    },
  }).catch(() => {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Không thể kết nối máy chủ. Kiểm tra mạng và thử lại.",
    );
  });
  const data = await response.json().catch(() => ({
    error: {
      code: "INVALID_RESPONSE",
      message: "Phản hồi máy chủ không hợp lệ.",
    },
  }));
  if (!response.ok) {
    if (
      response.status === 401 &&
      requestSessionToken &&
      requestSessionToken === csrfToken &&
      url !== "/auth/login" &&
      url !== "/auth/me"
    )
      window.dispatchEvent(new Event("idd-session-expired"));
    throw new ApiError(
      response.status,
      data.error?.code || "REQUEST_FAILED",
      data.error?.message || "Không thể kết nối máy chủ.",
    );
  }
  return data as T;
}
export const json = (value: unknown) => JSON.stringify(value);
