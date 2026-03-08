// Shared types for the MCM Companion Chrome extension.
// Mirrors the essential types from the main app's src/types/index.ts.
// Keep in sync manually if the main app types change.

// ─── Character types (mirrored from main app) ────────────────────────────────

export type StoryGenre =
  | "dating_sim"
  | "mystery"
  | "fantasy"
  | "survival"
  | "workplace_drama"
  | "soap_opera";

export type InteractionMode =
  | "flirt"
  | "interrogate"
  | "recruit"
  | "befriend"
  | "roast"
  | "apologize";

export type CharacterExpression =
  | "neutral"
  | "talking"
  | "happy"
  | "angry"
  | "sad"
  | "surprised";

/** A character saved to the player's permanent collection index. */
export interface SavedCharacter {
  id: string;
  objectLabel: string;
  name: string;
  personality: string;
  voiceStyle: string;
  emotionalState: string;
  portraitUrl?: string;
  portraits?: Partial<Record<CharacterExpression, string>>;
  genre: StoryGenre;
  relationshipScore: number;
  savedAt: number;
  memories: string[];
  interactionCount: number;
}

// ─── Extension-specific types ─────────────────────────────────────────────────

/** Browser context injected into /api/recall calls. */
export interface BrowserContext {
  currentUrl: string;
  currentTitle: string;
  currentDomain: string;
  selectedText?: string;
  /** Prose summary of recent browsing activity. */
  activityDigest: string;
}

/** One entry in the rolling tab activity log. */
export interface ActivityEntry {
  url: string;
  title: string;
  domain: string;
  timestamp: number;
  /** How long the user spent on this page/tab in ms. 0 if still active. */
  timeSpentMs: number;
}

/** Persisted extension settings. */
export interface ExtensionSettings {
  /** Base URL of the MCM Next.js app (e.g. http://localhost:3000). */
  apiBaseUrl: string;
  /** ID of the currently active character. null if none selected. */
  activeCharacterId: string | null;
  /** Whether the character should proactively comment on browsing activity. */
  proactiveComments: boolean;
  /** Whether to track tab activity at all. */
  trackActivity: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBaseUrl: "http://localhost:3001",
  activeCharacterId: null,
  proactiveComments: true,
  trackActivity: true,
};

// ─── Message types (extension internal messaging) ────────────────────────────

export type ExtensionMessage =
  | { type: "IMPORT_CHARACTERS" }
  | { type: "CHARACTERS_IMPORTED"; characters: SavedCharacter[] }
  | { type: "IMPORT_FAILED"; reason: string }
  | { type: "SET_ACTIVE_CHARACTER"; characterId: string }
  | { type: "OPEN_SIDE_PANEL" }
  | { type: "CONTEXT_MENU_QUERY"; selectedText: string; sourceUrl: string; sourceTitle: string }
  | { type: "TAB_CHANGED"; entry: ActivityEntry };

// ─── API payloads ──────────────────────────────────────────────────────────────

export interface RecallRequest {
  character: SavedCharacter;
  interactionMode: InteractionMode;
  message: string;
  browserContext?: BrowserContext;
}

export interface RecallResponse {
  response: string;
  relationshipDelta: number;
  newRelationshipToUser: number;
  emotionalStateUpdate: string;
}

export interface SuggestRequest {
  mode: InteractionMode;
  characterName: string;
  personality: string;
}

export interface SuggestResponse {
  suggestion: string;
}

// ─── Chat history ──────────────────────────────────────────────────────────────

export type ChatMessageRole = "user" | "character" | "system";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  text: string;
  timestamp: number;
  /** Relationship delta from this exchange (character messages only). */
  relationshipDelta?: number;
  interactionMode?: InteractionMode;
}

export interface ChatHistory {
  characterId: string;
  messages: ChatMessage[];
  /** Last known relationship score (synced back to SavedCharacter on activity). */
  relationshipScore: number;
  emotionalState: string;
}
