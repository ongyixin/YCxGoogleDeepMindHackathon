// API fetch helpers for the MCM Companion extension.
// All calls proxy through the main app's Next.js API routes.

import type {
  SavedCharacter,
  InteractionMode,
  BrowserContext,
  RecallRequest,
  RecallResponse,
  SuggestResponse,
} from "./types.js";
import { getSettings } from "./storage.js";

async function getBaseUrl(): Promise<string> {
  const settings = await getSettings();
  return settings.apiBaseUrl.replace(/\/$/, "");
}

// ─── /api/recall ──────────────────────────────────────────────────────────────

/**
 * Send a chat message to a character via the stateless /api/recall endpoint.
 * Optionally includes browser context so the character can react to what
 * the user is currently looking at.
 */
export async function recallChat(
  character: SavedCharacter,
  mode: InteractionMode,
  message: string,
  browserContext?: BrowserContext
): Promise<RecallResponse> {
  const baseUrl = await getBaseUrl();

  const body: RecallRequest = {
    character,
    interactionMode: mode,
    message,
    ...(browserContext ? { browserContext } : {}),
  };

  const res = await fetch(`${baseUrl}/api/recall`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`/api/recall failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<RecallResponse>;
}

// ─── /api/suggest ─────────────────────────────────────────────────────────────

/**
 * Fetch a suggested message for the given interaction mode and character.
 * Returns a fallback string on failure so the UI never shows an error for
 * what is essentially a nice-to-have feature.
 */
export async function fetchSuggestion(
  mode: InteractionMode,
  characterName: string,
  personality: string
): Promise<string> {
  try {
    const baseUrl = await getBaseUrl();

    const res = await fetch(`${baseUrl}/api/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, characterName, personality }),
    });

    if (!res.ok) return "";

    const data = (await res.json()) as SuggestResponse;
    return data.suggestion ?? "";
  } catch {
    return "";
  }
}

// ─── Connectivity check ───────────────────────────────────────────────────────

/** Returns true if the configured API base URL appears to be reachable. */
export async function checkApiConnectivity(): Promise<boolean> {
  try {
    const baseUrl = await getBaseUrl();
    const res = await fetch(`${baseUrl}/api/recall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(4000),
    });
    // 400 = reachable but bad request — that's fine, we just need to confirm the server is up
    return res.status < 500;
  } catch {
    return false;
  }
}
