// MCM Companion — Popup script
// Handles character import, character selection, and settings persistence.

import {
  getCharacters,
  setCharacters,
  getSettings,
  setSettings,
  setActiveCharacter,
} from "../shared/storage.js";
import type { SavedCharacter, ExtensionSettings } from "../shared/types.js";

// ─── Relationship helpers (mirrors CharacterCollection.tsx logic) ─────────────

const REL_LABELS: [number, string, string][] = [
  [80,  "DEVOTED",  "#FF80C0"],
  [40,  "FRIENDLY", "#7FE080"],
  [-40, "NEUTRAL",  "#FFDE00"],
  [-80, "HOSTILE",  "#FF8040"],
  [-Infinity, "ENEMY", "#FF4040"],
];

function getRelColor(score: number): string {
  for (const [threshold, , color] of REL_LABELS) {
    if (score >= threshold) return color;
  }
  return "#FF4040";
}

const PORTRAIT_THEMES: { keywords: string[]; emoji: string; gradient: string }[] = [
  { keywords: ["jealous", "envious", "bitter"],    emoji: "😤", gradient: "linear-gradient(135deg, #2d0a4e, #4a0080, #6d0070)" },
  { keywords: ["romantic", "longing", "love"],      emoji: "🌹", gradient: "linear-gradient(135deg, #4a0010, #8b1a3a, #4a0010)" },
  { keywords: ["mysterious", "cryptic", "secret"],  emoji: "🕯️", gradient: "linear-gradient(135deg, #0a0a0a, #1a1a2e, #0a0a0a)" },
  { keywords: ["comedic", "chaotic", "clown"],      emoji: "🎭", gradient: "linear-gradient(135deg, #4a2800, #7a4a00, #4a2800)" },
  { keywords: ["sage", "wise", "oracle"],           emoji: "🔮", gradient: "linear-gradient(135deg, #001040, #001870, #001040)" },
  { keywords: ["villain", "dark", "sinister"],      emoji: "💀", gradient: "linear-gradient(135deg, #0a0000, #200000, #0a0000)" },
  { keywords: ["anxious", "nervous", "worried"],    emoji: "😰", gradient: "linear-gradient(135deg, #001a1a, #003a3a, #001a1a)" },
];
const DEFAULT_THEME = { emoji: "✦", gradient: "linear-gradient(135deg, #0a0028, #1a0050, #0a0028)" };

function getPortraitTheme(personality: string) {
  const lower = personality.toLowerCase();
  for (const t of PORTRAIT_THEMES) {
    if (t.keywords.some((k) => lower.includes(k))) return t;
  }
  return DEFAULT_THEME;
}

// ─── DOM refs ──────────────────────────────────────────────────────────────────

const btnSettingsToggle = document.getElementById("btn-settings-toggle") as HTMLButtonElement;
const panelSettings     = document.getElementById("panel-settings") as HTMLElement;
const inputApiUrl       = document.getElementById("input-api-url") as HTMLInputElement;
const btnSaveSettings   = document.getElementById("btn-save-settings") as HTMLButtonElement;
const settingsStatus    = document.getElementById("settings-status") as HTMLParagraphElement;
const toggleProactive   = document.getElementById("toggle-proactive") as HTMLInputElement;
const toggleActivity    = document.getElementById("toggle-activity") as HTMLInputElement;
const btnImport         = document.getElementById("btn-import") as HTMLButtonElement;
const importStatus      = document.getElementById("import-status") as HTMLParagraphElement;
const charList          = document.getElementById("char-list") as HTMLDivElement;
const charCount         = document.getElementById("char-count") as HTMLSpanElement;
const emptyState        = document.getElementById("empty-state") as HTMLDivElement;
const btnOpenSidepanel  = document.getElementById("btn-open-sidepanel") as HTMLButtonElement;

// ─── State ────────────────────────────────────────────────────────────────────

let currentCharacters: SavedCharacter[] = [];

// ─── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const [characters, settings] = await Promise.all([getCharacters(), getSettings()]);
  currentCharacters = characters;

  inputApiUrl.value = settings.apiBaseUrl;
  toggleProactive.checked = settings.proactiveComments;
  toggleActivity.checked = settings.trackActivity;

  renderCharacterList(characters, settings.activeCharacterId);
}

// ─── Render ────────────────────────────────────────────────────────────────────

function renderCharacterList(characters: SavedCharacter[], activeId: string | null) {
  charList.innerHTML = "";

  if (characters.length === 0) {
    emptyState.classList.remove("hidden");
    charCount.textContent = "";
    return;
  }

  emptyState.classList.add("hidden");
  charCount.textContent = `(${characters.length})`;

  for (const char of characters) {
    const card = buildCharacterCard(char, char.id === activeId);
    charList.appendChild(card);
  }
}

function buildCharacterCard(char: SavedCharacter, isActive: boolean): HTMLElement {
  const theme = getPortraitTheme(char.personality);
  const relColor = getRelColor(char.relationshipScore);
  const relPct = ((char.relationshipScore + 100) / 200) * 100;

  const card = document.createElement("button");
  card.className = `char-card${isActive ? " active" : ""}`;
  card.dataset.id = char.id;

  const portraitHtml = char.portraitUrl
    ? `<img src="${escapeHtml(char.portraitUrl)}" alt="${escapeHtml(char.name)}" />`
    : theme.emoji;

  card.innerHTML = `
    <div class="char-portrait" style="background: ${theme.gradient}">
      ${portraitHtml}
    </div>
    <div class="char-info">
      <div class="char-name">${escapeHtml(char.name)}</div>
      <div class="char-label">${escapeHtml(char.objectLabel)}</div>
      <div class="char-rel-bar">
        <div class="char-rel-fill" style="width: ${relPct}%; background: ${relColor}"></div>
      </div>
    </div>
    <div class="active-pip"></div>
  `;

  card.addEventListener("click", () => handleSelectCharacter(char.id));
  return card;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setImportStatus(msg: string, type: "ok" | "err" | "") {
  importStatus.textContent = msg;
  importStatus.className = `status-text${type ? ` ${type}` : ""}`;
}

function setSettingsStatus(msg: string, type: "ok" | "err" | "") {
  settingsStatus.textContent = msg;
  settingsStatus.className = `status-text${type ? ` ${type}` : ""}`;
}

// ─── Handlers ──────────────────────────────────────────────────────────────────

btnSettingsToggle.addEventListener("click", () => {
  panelSettings.classList.toggle("hidden");
});

btnSaveSettings.addEventListener("click", async () => {
  const url = inputApiUrl.value.trim();
  if (!url) {
    setSettingsStatus("URL cannot be empty.", "err");
    return;
  }
  const partial: Partial<ExtensionSettings> = {
    apiBaseUrl: url,
    proactiveComments: toggleProactive.checked,
    trackActivity: toggleActivity.checked,
  };
  await setSettings(partial);
  setSettingsStatus("Saved.", "ok");
  setTimeout(() => setSettingsStatus("", ""), 1500);
});

toggleProactive.addEventListener("change", () => setSettings({ proactiveComments: toggleProactive.checked }));
toggleActivity.addEventListener("change", () => setSettings({ trackActivity: toggleActivity.checked }));

btnImport.addEventListener("click", async () => {
  btnImport.disabled = true;
  setImportStatus("Looking for the app tab...", "");

  try {
    const settings = await getSettings();
    const apiBase = settings.apiBaseUrl.replace(/\/$/, "");

    // Derive the app origin from the configured API URL so any port/host works
    let appOrigin: string;
    try {
      appOrigin = new URL(apiBase).origin; // e.g. "http://localhost:3001"
    } catch {
      setImportStatus("Invalid API URL in settings. Check the URL and try again.", "err");
      btnImport.disabled = false;
      return;
    }

    // Find a tab whose URL starts with the configured origin
    const tabs = await chrome.tabs.query({});
    const appTab = tabs.find((t) => t.url && t.url.startsWith(appOrigin));

    if (!appTab?.id) {
      setImportStatus(
        `App tab not found. Open ${appOrigin} in a tab first.`,
        "err"
      );
      btnImport.disabled = false;
      return;
    }

    setImportStatus("Importing...", "");

    // Use scripting.executeScript (dynamic injection) — works on any URL without
    // requiring a pre-registered content script match.
    // The injected function returns a plain serialisable object; we cast on the
    // receiving side rather than inside the injected function to avoid the
    // `unknown[]` vs `SavedCharacter[]` TS conflict that arises because the
    // injected function's return type can't reference extension-side types.
    const results = await chrome.scripting.executeScript({
      target: { tabId: appTab.id },
      func: () => {
        const raw = localStorage.getItem("mcm_characters");
        if (!raw) {
          return { ok: false as const, reason: "No characters found. Save a character in the app first." };
        }
        try {
          const chars = JSON.parse(raw) as unknown[];
          if (!Array.isArray(chars) || chars.length === 0) {
            return { ok: false as const, reason: "No characters saved yet. Open Story Mode and save one first." };
          }
          return { ok: true as const, characters: chars };
        } catch {
          return { ok: false as const, reason: "Character data is malformed." };
        }
      },
    });

    const raw = results[0]?.result as
      | { ok: true; characters: unknown[] }
      | { ok: false; reason: string }
      | undefined;

    if (!raw) {
      setImportStatus("Could not read app data. Try refreshing the app tab.", "err");
      btnImport.disabled = false;
      return;
    }

    if (!raw.ok) {
      setImportStatus(raw.reason, "err");
      btnImport.disabled = false;
      return;
    }

    currentCharacters = raw.characters as SavedCharacter[];
    await setCharacters(currentCharacters);

    const freshSettings = await getSettings();
    renderCharacterList(currentCharacters, freshSettings.activeCharacterId);
    setImportStatus(
      `✓ Imported ${currentCharacters.length} character${currentCharacters.length !== 1 ? "s" : ""}.`,
      "ok"
    );
  } catch (err) {
    // Provide actionable messaging for the most common failure mode
    const msg = String(err);
    if (msg.includes("Cannot access") || msg.includes("permissions")) {
      setImportStatus("Permission denied. Reload the app tab and try again.", "err");
    } else {
      setImportStatus(`Failed: ${msg}`, "err");
    }
  } finally {
    btnImport.disabled = false;
  }
});

async function handleSelectCharacter(id: string) {
  await setActiveCharacter(id);

  // Update context menu title in background
  chrome.runtime.sendMessage({ type: "SET_ACTIVE_CHARACTER", characterId: id }).catch(() => {});

  // Re-render list with new active state
  renderCharacterList(currentCharacters, id);
  setImportStatus(`Active: ${currentCharacters.find((c) => c.id === id)?.name ?? id}`, "ok");
  setTimeout(() => setImportStatus("", ""), 2000);
}

btnOpenSidepanel.addEventListener("click", async () => {
  chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
  window.close();
});

// ─── Boot ──────────────────────────────────────────────────────────────────────

init().catch(console.error);
