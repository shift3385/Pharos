import type {
  AuthUser,
  LoginInput,
  RegisterInput,
  Session,
} from "../model/types";

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:3000";

/** Error carrying the backend's machine-readable code (e.g. "invalid_credentials"). */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Thrown when the backend is unreachable (offline / connection refused). */
export class NetworkError extends Error {
  constructor() {
    super("Network request failed");
    this.name = "NetworkError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new NetworkError();
  }

  const data =
    res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const body = data as { code?: string; message?: string } | null;
    throw new ApiError(
      res.status,
      body?.code ?? "error",
      body?.message ?? `Request failed with status ${res.status}`,
    );
  }
  return data as T;
}

export const authApi = {
  register: (input: RegisterInput) =>
    request<Session>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  login: (input: LoginInput) =>
    request<Session>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  refresh: (refreshToken: string) =>
    request<Session>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),
  logout: (refreshToken: string) =>
    request<null>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),
  me: (accessToken: string) =>
    request<AuthUser>("/auth/me", {
      headers: { authorization: `Bearer ${accessToken}` },
    }),
};
