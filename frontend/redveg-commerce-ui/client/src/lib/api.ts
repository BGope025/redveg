import { isAdminCacheFallbackEnabled, isAdminMockMode, mockApiFetch } from './adminMockApi';

// Vite only exposes variables prefixed with VITE_. Keep the local fallback in
// sync with the backend's PORT default so the app works without extra setup.
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1').replace(/\/+$/, '');

function getApiBaseUrl() {
  return API_BASE_URL;
}

export function apiUrl(path: string) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error('VITE_API_URL is not configured');
  }
  return `${apiBaseUrl}/${path.replace(/^\/+/, '')}`;
}

/**
 * Shared browser API client. Admin endpoints use the HTTP-only session cookie;
 * public endpoints also work with credentials included when CORS is configured.
 */
export async function apiFetch(path: string, init: RequestInit = {}, options: { forceBackend?: boolean } = {}) {
  const method = String(init.method ?? 'GET').toUpperCase();
  if (!options.forceBackend && isAdminMockMode()) return mockApiFetch(path, method);

  const headers = new Headers(init.headers);
  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;
  
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      headers,
      credentials: init.credentials ?? 'include',
    });
    if (!options.forceBackend && response.ok && method === 'GET' && isAdminCacheFallbackEnabled()) {
      const cacheKey = `redveg-api-cache:${path}`;
      response.clone().text().then((body) => localStorage.setItem(cacheKey, body)).catch(() => undefined);
    }
    return response;
  } catch (error) {
    if (!options.forceBackend && method === 'GET' && isAdminCacheFallbackEnabled()) {
      const cached = localStorage.getItem(`redveg-api-cache:${path}`);
      if (cached) return new Response(cached, { status: 200, headers: { 'Content-Type': 'application/json', 'X-RedVeg-Data-Mode': 'cache' } });
    }
    throw error;
  }
}

export function normalizeCategorySlug(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-and-/g, '-');
}

export function unwrapApiData<T>(payload: unknown, fallback: T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return ((payload as { data?: T }).data ?? fallback) as T;
  }
  return (payload as T) ?? fallback;
}
