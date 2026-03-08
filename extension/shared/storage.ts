// Typed wrappers around chrome.storage.local for the MCM Companion extension.

import type {
  SavedCharacter,
  ExtensionSettings,
  ActivityEntry,
  ChatHistory,
} from "./types.js";
import { DEFAULT_SETTINGS } from "./types.js";

// ─── Storage keys ─────────────────────────────────────────────────────────────

const KEYS = {
  CHARACTERS: "mcm_ext_characters",
  SETTINGS: "mcm_ext_settings",
  ACTIVITY: "mcm_ext_activity",
  CHAT_PREFIX: "mcm_ext_chat_",
} as const;

const MAX_ACTIVITY_ENTRIES = 50;
const MAX_CHAT_MESSAGES = 20;

// ─── Characters ───────────────────────────────────────────────────────────────

export async function getCharacters(): Promise<SavedCharacter[]> {
  const result = await chrome.storage.local.get(KEYS.CHARACTERS);
  return (result[KEYS.CHARACTERS] as SavedCharacter[]) ?? [];
}

export async function setCharacters(characters: SavedCharacter[]): Promise<void> {
  await chrome.storage.local.set({ [KEYS.CHARACTERS]: characters });
}

export async function getCharacterById(id: string): Promise<SavedCharacter | null> {
  const characters = await getCharacters();
  return characters.find((c) => c.id === id) ?? null;
}

export async function updateCharacter(updated: SavedCharacter): Promise<void> {
  const characters = await getCharacters();
  const idx = characters.findIndex((c) => c.id === updated.id);
  if (idx >= 0) {
    characters[idx] = updated;
  } else {
    characters.push(updated);
  }
  await setCharacters(characters);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[KEYS.SETTINGS] as Partial<ExtensionSettings>) };
}

export async function setSettings(partial: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ [KEYS.SETTINGS]: { ...current, ...partial } });
}

export async function getActiveCharacter(): Promise<SavedCharacter | null> {
  const settings = await getSettings();
  if (!settings.activeCharacterId) return null;
  return getCharacterById(settings.activeCharacterId);
}

export async function setActiveCharacter(characterId: string | null): Promise<void> {
  await setSettings({ activeCharacterId: characterId });
}

// ─── Activity log ─────────────────────────────────────────────────────────────

export async function getActivity(): Promise<ActivityEntry[]> {
  const result = await chrome.storage.local.get(KEYS.ACTIVITY);
  return (result[KEYS.ACTIVITY] as ActivityEntry[]) ?? [];
}

export async function appendActivity(entry: ActivityEntry): Promise<void> {
  const existing = await getActivity();
  const updated = [...existing, entry].slice(-MAX_ACTIVITY_ENTRIES);
  await chrome.storage.local.set({ [KEYS.ACTIVITY]: updated });
}

export async function updateLastActivity(patch: Partial<ActivityEntry>): Promise<void> {
  const existing = await getActivity();
  if (existing.length === 0) return;
  existing[existing.length - 1] = { ...existing[existing.length - 1], ...patch };
  await chrome.storage.local.set({ [KEYS.ACTIVITY]: existing });
}

/**
 * Build a short human-readable prose digest from recent activity entries,
 * suitable for injecting into an AI prompt.
 */
export function buildActivityDigest(entries: ActivityEntry[], maxEntries = 10): string {
  if (entries.length === 0) return "No recent browsing activity.";

  const recent = entries
    .slice(-maxEntries)
    .filter((e) => e.title && e.domain)
    .reverse(); // most recent first

  const lines = recent.map((e) => {
    const mins = Math.round(e.timeSpentMs / 60000);
    const timeStr = mins > 0 ? ` (${mins}m)` : "";
    return `${e.title} [${e.domain}]${timeStr}`;
  });

  return "Recently visited: " + lines.join(", ") + ".";
}

// ─── Chat history ──────────────────────────────────────────────────────────────

function chatKey(characterId: string): string {
  return `${KEYS.CHAT_PREFIX}${characterId}`;
}

export async function getChatHistory(characterId: string): Promise<ChatHistory | null> {
  const key = chatKey(characterId);
  const result = await chrome.storage.local.get(key);
  return (result[key] as ChatHistory) ?? null;
}

export async function saveChatHistory(history: ChatHistory): Promise<void> {
  const key = chatKey(history.characterId);
  // Cap messages
  const trimmed: ChatHistory = {
    ...history,
    messages: history.messages.slice(-MAX_CHAT_MESSAGES),
  };
  await chrome.storage.local.set({ [key]: trimmed });
}

export async function clearChatHistory(characterId: string): Promise<void> {
  await chrome.storage.local.remove(chatKey(characterId));
}
