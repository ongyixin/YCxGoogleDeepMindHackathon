import type { ObjectCharacter, SavedCharacter, StoryGenre } from "@/types";

const STORAGE_KEY = "mcm_characters";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadSavedCharacters(): SavedCharacter[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedCharacter[];
  } catch {
    return [];
  }
}

export function saveCharacter(character: ObjectCharacter, genre: StoryGenre): SavedCharacter {
  const existing = loadSavedCharacters();
  const existingIndex = existing.findIndex((c) => c.id === character.id);

  const saved: SavedCharacter = {
    id: character.id,
    objectLabel: character.objectLabel,
    name: character.name,
    personality: character.personality,
    voiceStyle: character.voiceStyle,
    emotionalState: character.emotionalState,
    portraitUrl: character.portraitUrl,
    genre,
    relationshipScore: character.relationshipToUser,
    savedAt: existingIndex >= 0 ? existing[existingIndex].savedAt : Date.now(),
    memories: character.memories,
    interactionCount: existingIndex >= 0 ? existing[existingIndex].interactionCount + 1 : 1,
  };

  if (existingIndex >= 0) {
    existing[existingIndex] = saved;
  } else {
    existing.push(saved);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // silent — storage quota or private browsing
  }

  return saved;
}

export function isCharacterSaved(characterId: string): boolean {
  return loadSavedCharacters().some((c) => c.id === characterId);
}

export function removeSavedCharacter(characterId: string): void {
  const updated = loadSavedCharacters().filter((c) => c.id !== characterId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // silent
  }
}

export function getSavedCharacterCount(): number {
  return loadSavedCharacters().length;
}
