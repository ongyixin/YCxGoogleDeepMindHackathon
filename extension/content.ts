// MCM Companion — Content Script
// Injected only on the main app's origin (localhost:3000 / deployed URL).
// Bridges the gap between the app's localStorage and the extension's storage
// by reading mcm_characters and relaying them back on request.

const MCM_STORAGE_KEY = "mcm_characters";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "IMPORT_CHARACTERS") return false;

  try {
    const raw = localStorage.getItem(MCM_STORAGE_KEY);
    if (!raw) {
      sendResponse({ ok: false, reason: "No characters found in localStorage. Save at least one character in the app first." });
      return true;
    }

    let characters: unknown;
    try {
      characters = JSON.parse(raw);
    } catch {
      sendResponse({ ok: false, reason: "Character data in localStorage is malformed." });
      return true;
    }

    if (!Array.isArray(characters) || characters.length === 0) {
      sendResponse({ ok: false, reason: "No characters saved yet. Open the app and save a character first." });
      return true;
    }

    sendResponse({ ok: true, characters });
  } catch (err) {
    sendResponse({ ok: false, reason: `Unexpected error: ${String(err)}` });
  }

  return true; // keep message channel open for async
});
