import { isErrorResponse, type ErrorResponse } from '@cplan/contracts';
import { demoApiResponse } from '@/shared/demo';
import { API_BASE } from './base-url';

/**
 * Client HTTP unique du dashboard.
 *
 * Règle (docs/06-CONVENTIONS-DEV.md §6) : aucun `fetch` direct dans un
 * composant. Tout passe par ici, puis par un hook TanStack Query.
 *
 * Le rafraîchissement de token et l'en-tête Authorization seront branchés en
 * Phase 01 ; la forme est posée dès maintenant pour que rien n'ait à bouger.
 */

const ACCESS_KEY = 'cplan.access-token';
const REFRESH_KEY = 'cplan.refresh-token';
const ACTIVE_SCOPE_KEY = 'csbnk.active-scope.v1';
let refreshPromise: Promise<string | null> | null = null;

function appendActiveScopeHeaders(headers: Headers): void {
  try {
    const raw = localStorage.getItem(ACTIVE_SCOPE_KEY);
    if (!raw) return;
    const scope = JSON.parse(raw) as {
      type?: string;
      organizationalUnitId?: string | null;
      languageSectionId?: string | null;
      educationTrackId?: string | null;
      classId?: string | null;
    };
    if (scope.type) headers.set('X-Active-Scope-Type', scope.type);
    if (scope.organizationalUnitId)
      headers.set('X-Organizational-Unit-Id', scope.organizationalUnitId);
    if (scope.languageSectionId) headers.set('X-Language-Section-Id', scope.languageSectionId);
    if (scope.educationTrackId) headers.set('X-Education-Track-Id', scope.educationTrackId);
    if (scope.classId) headers.set('X-Class-Id', scope.classId);
  } catch {
    localStorage.removeItem(ACTIVE_SCOPE_KEY);
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;
  refreshPromise ??= fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const tokens = (await response.json()) as { accessToken: string; refreshToken: string };
      localStorage.setItem(ACCESS_KEY, tokens.accessToken);
      localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
      return tokens.accessToken;
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: ErrorResponse['error']['details'];
  readonly requestId: string;

  constructor(status: number, payload: ErrorResponse) {
    super(payload.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.error.code;
    this.details = payload.error.details;
    this.requestId = payload.error.request_id;
  }
}

/** Erreur réseau — à distinguer d'une erreur métier renvoyée par le serveur. */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Impossible de joindre le serveur. Vérifiez votre connexion.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Clé d'idempotence — obligatoire sur les créations de paiement. */
  idempotencyKey?: string;
  /** Délai maximal avant d'abandonner une requête réseau. */
  timeoutMs?: number;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, idempotencyKey, timeoutMs = 10_000, headers, ...rest } = options;

  const demoResponse = demoApiResponse(path, rest.method ?? 'GET', body);
  if (demoResponse !== undefined) return demoResponse as T;

  const requestHeaders = new Headers(headers);
  appendActiveScopeHeaders(requestHeaders);
  requestHeaders.set('Accept', 'application/json');
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
  if (idempotencyKey) requestHeaders.set('Idempotency-Key', idempotencyKey);
  const accessToken = localStorage.getItem(ACCESS_KEY);
  if (accessToken && !requestHeaders.has('Authorization')) {
    requestHeaders.set('Authorization', `Bearer ${accessToken}`);
  }

  let response: Response;
  const timeoutController = new AbortController();
  const timeout = window.setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = rest.signal ?? timeoutController.signal;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      signal,
      headers: requestHeaders,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch (cause) {
    throw new NetworkError(cause);
  } finally {
    window.clearTimeout(timeout);
  }

  if (
    response.status === 401 &&
    !path.startsWith('/auth/refresh') &&
    !path.startsWith('/auth/login')
  ) {
    const renewedToken = await refreshAccessToken();
    if (renewedToken) {
      requestHeaders.set('Authorization', `Bearer ${renewedToken}`);
      try {
        response = await fetch(`${API_BASE}${path}`, {
          ...rest,
          headers: requestHeaders,
          ...(body !== undefined && { body: JSON.stringify(body) }),
        });
      } catch (cause) {
        throw new NetworkError(cause);
      }
    } else {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    }
  }

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isErrorResponse(payload)) {
      throw new ApiError(response.status, payload);
    }
    // Le serveur a répondu hors contrat : on ne masque pas le problème.
    throw new ApiError(response.status, {
      error: {
        code: 'INTERNAL_ERROR',
        message: `Réponse inattendue du serveur (HTTP ${response.status}).`,
        request_id: response.headers.get('x-request-id') ?? 'unknown',
      },
    });
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
};

export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const demoResponse = demoApiResponse(path, 'POST', form);
  if (demoResponse !== undefined) return demoResponse as T;
  const headers = new Headers({ Accept: 'application/json' });
  appendActiveScopeHeaders(headers);
  const token = localStorage.getItem(ACCESS_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: form });
  } catch (cause) {
    throw new NetworkError(cause);
  }
  if (response.status === 401) {
    const renewedToken = await refreshAccessToken();
    if (renewedToken) {
      headers.set('Authorization', `Bearer ${renewedToken}`);
      response = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: form });
    }
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isErrorResponse(payload)) throw new ApiError(response.status, payload);
    throw new ApiError(response.status, {
      error: {
        code: 'INTERNAL_ERROR',
        message: `Téléversement impossible (HTTP ${response.status}).`,
        request_id: response.headers.get('x-request-id') ?? 'unknown',
      },
    });
  }
  return payload as T;
}

export async function downloadApiFile(path: string, filename: string): Promise<void> {
  const headers = new Headers({ Accept: '*/*' });
  appendActiveScopeHeaders(headers);
  const token = localStorage.getItem(ACCESS_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { headers });
  if (!response.ok) throw new Error(`Téléchargement impossible (HTTP ${response.status}).`);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
