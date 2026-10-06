// Vite only exposes variables prefixed with VITE_. Keep the local fallback in
// sync with the backend's PORT default so the app works without extra setup.
const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1"
).replace(/\/+$/, "");

function getApiBaseUrl() {
  return API_BASE_URL;
}

export function apiUrl(path: string) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("VITE_API_URL is not configured");
  }
  return `${apiBaseUrl}/${path.replace(/^\/+/, "")}`;
}

/**
 * Shared browser API client. Admin endpoints use the HTTP-only session cookie;
 * public endpoints also work with credentials included when CORS is configured.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
  options: { forceBackend?: boolean; authToken?: string } = {}
) {
  const method = String(init.method ?? "GET").toUpperCase();

  const headers = new Headers(init.headers);
  const token =
    options.authToken ??
    (typeof window !== "undefined" ? localStorage.getItem("adminToken") : null);

  if (options.authToken) {
    headers.set("Authorization", `Bearer ${options.authToken}`);
  } else if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      headers,
      credentials: init.credentials ?? "include",
    });
    return response;
  } catch (error) {
    throw error;
  }
}

export function normalizeCategorySlug(value: unknown) {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-and-/g, "-");
  return slug === "hilsha" ? "hilsa" : slug;
}

export function unwrapApiData<T>(payload: unknown, fallback: T): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return ((payload as { data?: T }).data ?? fallback) as T;
  }
  return (payload as T) ?? fallback;
}
