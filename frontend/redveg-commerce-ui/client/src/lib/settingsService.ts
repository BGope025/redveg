import { HEADER_THEME_IDS, type HeaderThemeId } from "@/themes/headerThemes";
import { apiFetch } from "@/lib/api";

/**
 * Fetch the currently active header-theme ID.
 * Returns "default" when no theme has been saved.
 */
export async function getActiveHeaderThemeId(): Promise<HeaderThemeId> {
  const response = await apiFetch("settings/header-theme");
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(payload?.message || "Failed to load header theme");
  const value = payload?.data?.value;
  if (typeof value !== "string" || !HEADER_THEME_IDS.includes(value as HeaderThemeId)) {
    return "default";
  }
  return value as HeaderThemeId;
}

/**
 * Persist the active header-theme ID.
 * In production this must require admin authorization.
 */
export async function saveActiveHeaderThemeId(
  themeId: HeaderThemeId
): Promise<void> {
  const response = await apiFetch("settings/header-theme", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ value: themeId }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(payload?.message || "Failed to save header theme");

  // Read the persisted value back so the admin preview only reports success
  // when a fresh storefront request will receive the same theme.
  const persistedThemeId = await getActiveHeaderThemeId();
  if (persistedThemeId !== themeId) {
    throw new Error("The saved theme could not be confirmed. Please try again.");
  }
}

/**
 * Reset to default by removing the stored theme.
 * In production this must require admin authorization.
 */
export async function resetActiveHeaderThemeId(): Promise<void> {
  const response = await apiFetch("settings/header-theme", {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(payload?.message || "Failed to reset header theme");
}
