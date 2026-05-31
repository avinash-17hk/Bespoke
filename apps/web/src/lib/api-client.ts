import type { ApiError } from "@bespoke/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Thrown when the API responds with a non-2xx { error, code } envelope. */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
  }
}

interface RequestOptions {
  method: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function request<T>(
  path: string,
  { method, body, headers }: RequestOptions,
): Promise<T> {
  // Only declare a JSON content-type when we actually send a body — Fastify's
  // default parser rejects an empty body when content-type is application/json
  // (FST_ERR_CTP_EMPTY_JSON_BODY), which would break bodyless POST/DELETE calls.
  const hasBody = body !== undefined;
  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json().catch(() => null)) as
    | { data: T }
    | ApiError
    | null;

  if (!response.ok || payload === null || "error" in payload) {
    const error = (payload as ApiError | null)?.error ?? response.statusText;
    const code = (payload as ApiError | null)?.code ?? "UNKNOWN";
    throw new ApiRequestError(error, code, response.status);
  }

  return payload.data;
}

/** All API calls go through this typed wrapper — cookies included for auth. */
export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
