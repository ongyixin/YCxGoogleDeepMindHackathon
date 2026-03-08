// MCM Companion — Side Panel script
// Main chat UI: character display, message send/receive, browser context injection,
// conversation history, typewriter effect, proactive comment display.

import {
  getActiveCharacter,
  getActivity,
  buildActivityDigest,
  getChatHistory,
  saveChatHistory,
  clearChatHistory,
  updateCharacter,
  getSettings,
} from "../shared/storage.js";
import { recallChat, fetchSuggestion } from "../shared/api.js";
import type {
  SavedCharacter,
  InteractionMode,
  ChatMessage,
  ChatHistory,
  BrowserContext,
} from "../shared/types.js";

// ─── Relationship helpers ─────────────────────────────────────────────────────

const REL_THRESHOLDS: [number, string, string][] = [
  [80,  "DEVOTED",  "#FF80C0"],
  [40,  "FRIENDLY", "#7FE080"],
  [-40, "NEUTRAL",  "#FFDE00"],
  [-80, "HOSTILE",  "#FF8040"],
  [-Infinity, "ENEMY", "#FF4040"],
];

function getRelMeta(score: number): { label: string; color: string } {
  for (const [threshold, label, color] of REL_THRESHOLDS) {
    if (score >= threshold) return { label, color };
  }
  return { label: "ENEMY", color: "#FF4040" };
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

const screenEmpty       = document.getElementById("screen-empty") as HTMLElement;
const screenChat        = document.getElementById("screen-chat") as HTMLElement;
const charPortrait      = document.getElementById("char-portrait") as HTMLElement;
const charName          = document.getElementById("char-name") as HTMLElement;
const charLabel         = document.getElementById("char-label") as HTMLElement;
const charState         = document.getElementById("char-state") as HTMLElement;
const relLabel          = document.getElementById("rel-label") as HTMLElement;
const relBarFill        = document.getElementById("rel-bar-fill") as HTMLElement;
const relScore          = document.getElementById("rel-score") as HTMLElement;
const contextBadge      = document.getElementById("context-badge") as HTMLElement;
const contextBadgeText  = document.getElementById("context-badge-text") as HTMLElement;
const contextBadgeClear = document.getElementById("context-badge-clear") as HTMLElement;
const activityStatus    = document.getElementById("activity-status") as HTMLElement;
const activityText      = document.getElementById("activity-text") as HTMLElement;
const btnShowFeed       = document.getElementById("btn-show-feed") as HTMLButtonElement;
const activityFeed      = document.getElementById("activity-feed") as HTMLElement;
const activityFeedList  = document.getElementById("activity-feed-list") as HTMLElement;
const btnHideFeed       = document.getElementById("btn-hide-feed") as HTMLButtonElement;
const chatMessages      = document.getElementById("chat-messages") as HTMLElement;
const typingIndicator   = document.getElementById("typing-indicator") as HTMLElement;
const modeSelector      = document.getElementById("mode-selector") as HTMLElement;
const btnSuggest        = document.getElementById("btn-suggest") as HTMLButtonElement;
const inputMessage      = document.getElementById("input-message") as HTMLTextAreaElement;
const btnSend           = document.getElementById("btn-send") as HTMLButtonElement;
const toggleContext     = document.getElementById("toggle-context") as HTMLInputElement;
const btnClearHistory   = document.getElementById("btn-clear-history") as HTMLButtonElement;

// ─── State ────────────────────────────────────────────────────────────────────

let activeCharacter: SavedCharacter | null = null;
let chatHistory: ChatHistory | null = null;
let currentMode: InteractionMode = "befriend";
let pendingContextQuery: { selectedText: string; sourceUrl: string; sourceTitle: string } | null = null;
let currentTab: { url: string; title: string } | null = null;

// ─── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const character = await getActiveCharacter();

  // Get the current active tab for context
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (tabs[0]?.url && tabs[0]?.title) {
    currentTab = { url: tabs[0].url, title: tabs[0].title };
    if (tabs[0].url.startsWith("http://") || tabs[0].url.startsWith("https://")) {
      showActivityBar(tabs[0].title);
    }
  }

  if (!character) {
    showScreen("empty");
    return;
  }

  await loadCharacter(character);
}

async function loadCharacter(character: SavedCharacter) {
  activeCharacter = character;

  const history = await getChatHistory(character.id);
  chatHistory = history ?? {
    characterId: character.id,
    messages: [],
    relationshipScore: character.relationshipScore,
    emotionalState: character.emotionalState,
  };

  renderHeader(character);
  renderHistory(chatHistory);
  showScreen("chat");
}

// ─── Screen management ────────────────────────────────────────────────────────

function showScreen(screen: "empty" | "chat") {
  screenEmpty.classList.toggle("hidden", screen !== "empty");
  screenChat.classList.toggle("hidden", screen !== "chat");
}

// ─── Header rendering ─────────────────────────────────────────────────────────

function renderHeader(character: SavedCharacter) {
  const theme = getPortraitTheme(character.personality);
  charPortrait.style.background = theme.gradient;
  if (character.portraitUrl) {
    charPortrait.innerHTML = `<img src="${escapeHtml(character.portraitUrl)}" alt="${escapeHtml(character.name)}" />`;
  } else {
    charPortrait.innerHTML = theme.emoji;
    charPortrait.style.fontSize = "24px";
  }

  charName.textContent = character.name;
  charLabel.textContent = character.objectLabel;
  charState.textContent = character.emotionalState.toUpperCase();
  updateRelBar(character.relationshipScore);
}

function updateRelBar(score: number) {
  const { label, color } = getRelMeta(score);
  const pct = ((score + 100) / 200) * 100;

  relLabel.textContent = label;
  relLabel.style.color = color;
  relBarFill.style.width = `${pct}%`;
  relBarFill.style.background = color;
  relScore.textContent = (score > 0 ? "+" : "") + score;
}

function updateEmotionalState(state: string) {
  charState.textContent = state.toUpperCase();
}

// ─── Activity bar + feed ──────────────────────────────────────────────────────

function showActivityBar(title: string) {
  activityText.textContent = title;
  activityStatus.classList.remove("hidden");
}

function hideActivityBar() {
  activityStatus.classList.add("hidden");
  activityFeed.classList.add("hidden");
}

async function renderActivityFeed() {
  const entries = await getActivity();
  activityFeedList.innerHTML = "";

  if (entries.length === 0) {
    activityFeedList.innerHTML = `<div class="activity-empty">No activity logged yet. Browse some pages first.</div>`;
    return;
  }

  // Show most recent first, cap at 20 entries
  const recent = [...entries].reverse().slice(0, 20);
  for (const entry of recent) {
    const el = document.createElement("div");
    el.className = "activity-entry";

    const mins = Math.round(entry.timeSpentMs / 60000);
    const timeStr = mins > 0 ? `${mins}m` : "<1m";
    const relTime = formatRelativeTime(entry.timestamp);

    el.innerHTML = `
      <span class="activity-entry-domain">${escapeHtml(entry.domain)}</span>
      <span class="activity-entry-title" title="${escapeHtml(entry.title)}">${escapeHtml(entry.title)}</span>
      <span class="activity-entry-time">${timeStr} · ${relTime}</span>
    `;
    activityFeedList.appendChild(el);
  }
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

btnShowFeed.addEventListener("click", async () => {
  await renderActivityFeed();
  activityFeed.classList.remove("hidden");
});

btnHideFeed.addEventListener("click", () => {
  activityFeed.classList.add("hidden");
});

// ─── Context badge ────────────────────────────────────────────────────────────

function showContextBadge(text: string) {
  contextBadgeText.textContent = text;
  contextBadge.classList.remove("hidden");
}

function hideContextBadge() {
  contextBadge.classList.add("hidden");
  pendingContextQuery = null;
}

contextBadgeClear.addEventListener("click", hideContextBadge);

// ─── Chat rendering ───────────────────────────────────────────────────────────

function renderHistory(history: ChatHistory) {
  chatMessages.innerHTML = "";
  for (const msg of history.messages) {
    appendMessageToDOM(msg, false);
  }
  scrollToBottom();
}

function appendMessageToDOM(msg: ChatMessage, animate = true) {
  const el = buildMessageEl(msg, animate);
  chatMessages.appendChild(el);
}

function buildMessageEl(msg: ChatMessage, _animate: boolean): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = `msg msg-${msg.role}`;
  wrapper.dataset.id = msg.id;

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = msg.text;
  wrapper.appendChild(bubble);

  if (msg.role !== "system") {
    const meta = document.createElement("div");
    meta.className = "msg-meta";

    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    meta.appendChild(Object.assign(document.createElement("span"), { textContent: time }));

    if (msg.interactionMode) {
      const tag = document.createElement("span");
      tag.className = "msg-mode-tag";
      tag.textContent = msg.interactionMode.toUpperCase();
      meta.appendChild(tag);
    }

    if (msg.relationshipDelta !== undefined && msg.relationshipDelta !== 0) {
      const delta = document.createElement("span");
      const sign = msg.relationshipDelta > 0 ? "+" : "";
      delta.className = `rel-delta ${msg.relationshipDelta > 0 ? "pos" : "neg"}`;
      delta.textContent = `${sign}${msg.relationshipDelta}`;
      meta.appendChild(delta);
    }

    wrapper.appendChild(meta);
  }

  return wrapper;
}

/**
 * Typewriter effect for incoming character messages.
 * Returns a promise that resolves when typing completes.
 */
async function typewriterAppend(text: string, msgId: string): Promise<void> {
  const wrapper = document.createElement("div");
  wrapper.className = "msg msg-character";
  wrapper.dataset.id = msgId;

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  const cursor = document.createElement("span");
  cursor.className = "cursor";
  bubble.appendChild(cursor);
  wrapper.appendChild(bubble);
  chatMessages.appendChild(wrapper);
  scrollToBottom();

  const CHAR_DELAY_MS = 18;
  for (let i = 0; i < text.length; i++) {
    bubble.insertBefore(document.createTextNode(text[i]), cursor);
    if (i % 3 === 0) scrollToBottom(); // keep scroll in sync during typing
    await sleep(CHAR_DELAY_MS);
  }

  cursor.remove();
  return;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Mode selector ────────────────────────────────────────────────────────────

modeSelector.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    modeSelector.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode as InteractionMode;
  });
});

// ─── Build browser context ────────────────────────────────────────────────────

async function buildBrowserContext(selectedText?: string): Promise<BrowserContext | undefined> {
  if (!toggleContext.checked) return undefined;

  const settings = await getSettings();
  if (!settings.trackActivity) return undefined;

  const activity = await getActivity();
  const digest = buildActivityDigest(activity);

  const tab = currentTab;

  if (!tab?.url) return undefined;

  try {
    const url = new URL(tab.url);
    return {
      currentUrl: tab.url,
      currentTitle: tab.title,
      currentDomain: url.hostname.replace(/^www\./, ""),
      activityDigest: digest,
      ...(selectedText ? { selectedText } : {}),
    };
  } catch {
    return undefined;
  }
}

// ─── Send message ─────────────────────────────────────────────────────────────

async function sendMessage(text: string) {
  if (!activeCharacter || !chatHistory) return;

  const trimmed = text.trim();
  if (!trimmed) return;

  inputMessage.value = "";
  btnSend.disabled = true;
  btnSuggest.disabled = true;

  // Build user message
  const userMsg: ChatMessage = {
    id: `msg_${Date.now()}_user`,
    role: "user",
    text: trimmed,
    timestamp: Date.now(),
    interactionMode: currentMode,
  };

  chatHistory.messages.push(userMsg);
  appendMessageToDOM(userMsg);
  scrollToBottom();

  // Show typing indicator
  typingIndicator.classList.remove("hidden");

  try {
    const selectedText = pendingContextQuery?.selectedText;
    const browserCtx = await buildBrowserContext(selectedText);

    const result = await recallChat(activeCharacter, currentMode, trimmed, browserCtx);

    // Hide typing indicator before typewriter
    typingIndicator.classList.add("hidden");

    const charMsgId = `msg_${Date.now()}_char`;

    // Typewriter render
    await typewriterAppend(result.response, charMsgId);

    const charMsg: ChatMessage = {
      id: charMsgId,
      role: "character",
      text: result.response,
      timestamp: Date.now(),
      relationshipDelta: result.relationshipDelta,
      interactionMode: currentMode,
    };

    // Append meta row to the existing typed bubble
    const wrapper = chatMessages.querySelector(`[data-id="${charMsgId}"]`);
    if (wrapper) {
      const meta = document.createElement("div");
      meta.className = "msg-meta";
      const time = new Date(charMsg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      meta.appendChild(Object.assign(document.createElement("span"), { textContent: time }));

      if (result.relationshipDelta !== 0) {
        const sign = result.relationshipDelta > 0 ? "+" : "";
        const delta = Object.assign(document.createElement("span"), {
          className: `rel-delta ${result.relationshipDelta > 0 ? "pos" : "neg"}`,
          textContent: `${sign}${result.relationshipDelta}`,
        });
        meta.appendChild(delta);
      }
      wrapper.appendChild(meta);
    }

    chatHistory.messages.push(charMsg);

    // Update local state with new relationship/emotional state
    chatHistory.relationshipScore = result.newRelationshipToUser;
    chatHistory.emotionalState = result.emotionalStateUpdate;

    // Update character in storage
    const updatedCharacter: SavedCharacter = {
      ...activeCharacter,
      relationshipScore: result.newRelationshipToUser,
      emotionalState: result.emotionalStateUpdate,
      interactionCount: activeCharacter.interactionCount + 1,
    };
    activeCharacter = updatedCharacter;
    await updateCharacter(updatedCharacter);

    // Update header
    updateRelBar(result.newRelationshipToUser);
    updateEmotionalState(result.emotionalStateUpdate);

    // Clear context badge after it's been used
    if (pendingContextQuery) hideContextBadge();

    // Persist history
    await saveChatHistory(chatHistory);
  } catch (err) {
    typingIndicator.classList.add("hidden");

    const errMsg: ChatMessage = {
      id: `msg_${Date.now()}_sys`,
      role: "system",
      text: `Connection error: ${String(err)}. Check the API URL in settings.`,
      timestamp: Date.now(),
    };
    chatHistory.messages.push(errMsg);
    appendMessageToDOM(errMsg);
    scrollToBottom();
    await saveChatHistory(chatHistory);
  } finally {
    btnSend.disabled = false;
    btnSuggest.disabled = false;
    inputMessage.focus();
  }
}

// ─── Send button / Enter key ──────────────────────────────────────────────────

btnSend.addEventListener("click", () => {
  sendMessage(inputMessage.value);
});

inputMessage.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(inputMessage.value);
  }
});

// ─── Suggest button ───────────────────────────────────────────────────────────

btnSuggest.addEventListener("click", async () => {
  if (!activeCharacter) return;
  btnSuggest.disabled = true;
  btnSuggest.textContent = "…";

  const suggestion = await fetchSuggestion(currentMode, activeCharacter.name, activeCharacter.personality);

  btnSuggest.textContent = "✦";
  btnSuggest.disabled = false;

  if (suggestion) {
    inputMessage.value = suggestion;
    inputMessage.focus();
  }
});

// ─── Clear history ────────────────────────────────────────────────────────────

btnClearHistory.addEventListener("click", async () => {
  if (!activeCharacter) return;
  await clearChatHistory(activeCharacter.id);
  chatHistory = {
    characterId: activeCharacter.id,
    messages: [],
    relationshipScore: activeCharacter.relationshipScore,
    emotionalState: activeCharacter.emotionalState,
  };
  chatMessages.innerHTML = "";
});

// ─── Runtime message handling ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
chrome.runtime.onMessage.addListener((message: any) => {
  // Context menu: user selected text on a page and asked the character about it
  if (message.type === "CONTEXT_MENU_QUERY") {
    pendingContextQuery = {
      selectedText: message.selectedText,
      sourceUrl: message.sourceUrl,
      sourceTitle: message.sourceTitle,
    };

    const label = message.selectedText
      ? `"${message.selectedText.slice(0, 60)}${message.selectedText.length > 60 ? "…" : ""}"`
      : `From: ${message.sourceTitle}`;

    showContextBadge(`Context: ${label}`);

    // Pre-fill a natural prompt for the user
    if (message.selectedText) {
      inputMessage.value = `What do you think about this? "${message.selectedText.slice(0, 120)}"`;
    }
    inputMessage.focus();
    return;
  }

  // Proactive comment from background worker
  if (message.type === "PROACTIVE_COMMENT" && activeCharacter && chatHistory) {
    const proactiveMsg: ChatMessage = {
      id: `msg_${Date.now()}_char`,
      role: "character",
      text: message.text as string,
      timestamp: Date.now(),
      relationshipDelta: message.relationshipDelta as number,
    };

    chatHistory.messages.push(proactiveMsg);
    appendMessageToDOM(proactiveMsg);
    scrollToBottom();

    if (message.newRelationshipScore !== undefined) {
      chatHistory.relationshipScore = message.newRelationshipScore as number;
      updateRelBar(message.newRelationshipScore as number);
    }
    if (message.emotionalState) {
      chatHistory.emotionalState = message.emotionalState as string;
      updateEmotionalState(message.emotionalState as string);
    }

    saveChatHistory(chatHistory).catch(() => {});
    return;
  }

  // Tab changed: update activity bar and live-refresh the feed if it's open
  if (message.type === "TAB_CHANGED") {
    const entry = message.entry as { url: string; title: string };
    if (entry?.url && entry?.title) {
      currentTab = { url: entry.url, title: entry.title };
      if (entry.url.startsWith("http://") || entry.url.startsWith("https://")) {
        showActivityBar(entry.title);
      } else {
        hideActivityBar();
      }
      // Refresh the feed in the background if it's currently visible
      if (!activityFeed.classList.contains("hidden")) {
        renderActivityFeed().catch(() => {});
      }
    }
    return;
  }

  // Active character changed from popup
  if (message.type === "SET_ACTIVE_CHARACTER") {
    init().catch(console.error);
    return;
  }
});

// ─── Boot ──────────────────────────────────────────────────────────────────────

init().catch(console.error);
