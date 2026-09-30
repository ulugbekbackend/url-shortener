import { useAuthStore } from "../stores/authStore";

/** Empty VITE_API_URL means same origin (the Vite dev server proxies /api). */
export const API_BASE = `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}/api/v1`;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type QueryValue = string | number | boolean | null | undefined;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: unknown;
  form?: FormData;
  /** Send the access token and retry once after a refresh on 401. */
  auth?: boolean;
  responseType?: "json" | "blob";
}

const toCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Recursively rename object keys; the API speaks snake_case, the app camelCase. */
function convertKeys(value: unknown, convert: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => convertKeys(item, convert));
  if (value !== null && typeof value === "object" && value.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [convert(k), convertKeys(v, convert)]),
    );
  }
  return value;
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const { error } = (await res.json()) as {
      error?: { code: string; message: string; details?: unknown };
    };
    if (error) return new ApiError(res.status, error.code, error.message, error.details);
  } catch {
    // not a JSON error body
  }
  return new ApiError(res.status, `HTTP_${res.status}`, res.statusText || "Request failed");
}

let refreshing: Promise<string | null> | null = null;

/**
 * Exchange the refresh cookie for a new access token. Concurrent callers share one request:
 * the server rotates refresh tokens and treats a reused one as theft, so parallel refreshes
 * would sign the user out.
 */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return null;
      const { access_token: token } = (await res.json()) as { access_token: string };
      useAuthStore.getState().setToken(token);
      return token;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, form, auth = true, responseType = "json" } = options;

  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(toSnake(key), String(value));
    }
  }

  const send = () => {
    const headers: Record<string, string> = {};
    const token = useAuthStore.getState().accessToken;
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    let payload: BodyInit | undefined = form;
    if (!form && body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(convertKeys(body, toSnake));
    }
    return fetch(url, { method, headers, body: payload, credentials: "include" });
  };

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && auth) {
      if (await refreshAccessToken()) {
        res = await send();
      } else {
        useAuthStore.getState().logout();
      }
    }
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server. Check your connection.");
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  if (responseType === "blob") return (await res.blob()) as T;
  return convertKeys(await res.json(), toCamel) as T;
}

/** Human-readable message for any error thrown by `request`. */
export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}
