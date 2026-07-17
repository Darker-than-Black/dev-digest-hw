import { ApiErrorBody } from '@devdigest/shared';
import { config } from './config.js';

/**
 * Error thrown when the DevDigest API returns a non-2xx response. Carries the
 * structured `ApiErrorBody` code/message when the server sent one.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Thin fetch wrapper over the DevDigest API. No auth header — local
 * LocalNoAuthProvider resolves the default workspace server-side.
 * TODO(multi-tenant): add an X-Workspace / bearer header here when auth lands.
 *
 * Callers parse the returned JSON with the matching @devdigest/shared schema
 * for contract-verified I/O.
 */
export async function api<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const url = `${config.apiUrl}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: { 'content-type': 'application/json' },
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch (cause) {
    throw new ApiError(
      0,
      'network_error',
      `Cannot reach DevDigest API at ${config.apiUrl} — is it running? (${String(cause)})`,
    );
  }

  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const parsed = ApiErrorBody.safeParse(json);
    if (parsed.success) {
      throw new ApiError(res.status, parsed.data.error.code, parsed.data.error.message);
    }
    throw new ApiError(res.status, 'http_error', `${res.status} ${res.statusText} for ${path}`);
  }

  return json as T;
}
