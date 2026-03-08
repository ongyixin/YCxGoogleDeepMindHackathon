// shared/types.ts
var DEFAULT_SETTINGS = {
  apiBaseUrl: "http://localhost:3001",
  activeCharacterId: null,
  proactiveComments: true,
  trackActivity: true
};

// shared/storage.ts
var KEYS = {
  CHARACTERS: "mcm_ext_characters",
  SETTINGS: "mcm_ext_settings",
  ACTIVITY: "mcm_ext_activity",
  CHAT_PREFIX: "mcm_ext_chat_"
};
var MAX_CHAT_MESSAGES = 20;
async function getCharacters() {
  const result = await chrome.storage.local.get(KEYS.CHARACTERS);
  return result[KEYS.CHARACTERS] ?? [];
}
async function setCharacters(characters) {
  await chrome.storage.local.set({ [KEYS.CHARACTERS]: characters });
}
async function getCharacterById(id) {
  const characters = await getCharacters();
  return characters.find((c) => c.id === id) ?? null;
}
async function updateCharacter(updated) {
  const characters = await getCharacters();
  const idx = characters.findIndex((c) => c.id === updated.id);
  if (idx >= 0) {
    characters[idx] = updated;
  } else {
    characters.push(updated);
  }
  await setCharacters(characters);
}
async function getSettings() {
  const result = await chrome.storage.local.get(KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...result[KEYS.SETTINGS] };
}
async function getActiveCharacter() {
  const settings = await getSettings();
  if (!settings.activeCharacterId) return null;
  return getCharacterById(settings.activeCharacterId);
}
async function getActivity() {
  const result = await chrome.storage.local.get(KEYS.ACTIVITY);
  return result[KEYS.ACTIVITY] ?? [];
}
function buildActivityDigest(entries, maxEntries = 10) {
  if (entries.length === 0) return "No recent browsing activity.";
  const recent = entries.slice(-maxEntries).filter((e) => e.title && e.domain).reverse();
  const lines = recent.map((e) => {
    const mins = Math.round(e.timeSpentMs / 6e4);
    const timeStr = mins > 0 ? ` (${mins}m)` : "";
    return `${e.title} [${e.domain}]${timeStr}`;
  });
  return "Recently visited: " + lines.join(", ") + ".";
}
function chatKey(characterId) {
  return `${KEYS.CHAT_PREFIX}${characterId}`;
}
async function getChatHistory(characterId) {
  const key = chatKey(characterId);
  const result = await chrome.storage.local.get(key);
  return result[key] ?? null;
}
async function saveChatHistory(history) {
  const key = chatKey(history.characterId);
  const trimmed = {
    ...history,
    messages: history.messages.slice(-MAX_CHAT_MESSAGES)
  };
  await chrome.storage.local.set({ [key]: trimmed });
}
async function clearChatHistory(characterId) {
  await chrome.storage.local.remove(chatKey(characterId));
}

// shared/api.ts
async function getBaseUrl() {
  const settings = await getSettings();
  return settings.apiBaseUrl.replace(/\/$/, "");
}
async function recallChat(character, mode, message, browserContext) {
  const baseUrl = await getBaseUrl();
  const body = {
    character,
    interactionMode: mode,
    message,
    ...browserContext ? { browserContext } : {}
  };
  const res = await fetch(`${baseUrl}/api/recall`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`/api/recall failed (${res.status}): ${text}`);
  }
  return res.json();
}
async function fetchSuggestion(mode, characterName, personality) {
  try {
    const baseUrl = await getBaseUrl();
    const res = await fetch(`${baseUrl}/api/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, characterName, personality })
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data.suggestion ?? "";
  } catch {
    return "";
  }
}

// sidepanel/sidepanel.ts
var REL_THRESHOLDS = [
  [80, "DEVOTED", "#FF80C0"],
  [40, "FRIENDLY", "#7FE080"],
  [-40, "NEUTRAL", "#FFDE00"],
  [-80, "HOSTILE", "#FF8040"],
  [-Infinity, "ENEMY", "#FF4040"]
];
function getRelMeta(score) {
  for (const [threshold, label, color] of REL_THRESHOLDS) {
    if (score >= threshold) return { label, color };
  }
  return { label: "ENEMY", color: "#FF4040" };
}
var PORTRAIT_THEMES = [
  { keywords: ["jealous", "envious", "bitter"], emoji: "\u{1F624}", gradient: "linear-gradient(135deg, #2d0a4e, #4a0080, #6d0070)" },
  { keywords: ["romantic", "longing", "love"], emoji: "\u{1F339}", gradient: "linear-gradient(135deg, #4a0010, #8b1a3a, #4a0010)" },
  { keywords: ["mysterious", "cryptic", "secret"], emoji: "\u{1F56F}\uFE0F", gradient: "linear-gradient(135deg, #0a0a0a, #1a1a2e, #0a0a0a)" },
  { keywords: ["comedic", "chaotic", "clown"], emoji: "\u{1F3AD}", gradient: "linear-gradient(135deg, #4a2800, #7a4a00, #4a2800)" },
  { keywords: ["sage", "wise", "oracle"], emoji: "\u{1F52E}", gradient: "linear-gradient(135deg, #001040, #001870, #001040)" },
  { keywords: ["villain", "dark", "sinister"], emoji: "\u{1F480}", gradient: "linear-gradient(135deg, #0a0000, #200000, #0a0000)" },
  { keywords: ["anxious", "nervous", "worried"], emoji: "\u{1F630}", gradient: "linear-gradient(135deg, #001a1a, #003a3a, #001a1a)" }
];
var DEFAULT_THEME = { emoji: "\u2726", gradient: "linear-gradient(135deg, #0a0028, #1a0050, #0a0028)" };
function getPortraitTheme(personality) {
  const lower = personality.toLowerCase();
  for (const t of PORTRAIT_THEMES) {
    if (t.keywords.some((k) => lower.includes(k))) return t;
  }
  return DEFAULT_THEME;
}
var screenEmpty = document.getElementById("screen-empty");
var screenChat = document.getElementById("screen-chat");
var charPortrait = document.getElementById("char-portrait");
var charName = document.getElementById("char-name");
var charLabel = document.getElementById("char-label");
var charState = document.getElementById("char-state");
var relLabel = document.getElementById("rel-label");
var relBarFill = document.getElementById("rel-bar-fill");
var relScore = document.getElementById("rel-score");
var contextBadge = document.getElementById("context-badge");
var contextBadgeText = document.getElementById("context-badge-text");
var contextBadgeClear = document.getElementById("context-badge-clear");
var activityStatus = document.getElementById("activity-status");
var activityText = document.getElementById("activity-text");
var btnShowFeed = document.getElementById("btn-show-feed");
var activityFeed = document.getElementById("activity-feed");
var activityFeedList = document.getElementById("activity-feed-list");
var btnHideFeed = document.getElementById("btn-hide-feed");
var chatMessages = document.getElementById("chat-messages");
var typingIndicator = document.getElementById("typing-indicator");
var modeSelector = document.getElementById("mode-selector");
var btnSuggest = document.getElementById("btn-suggest");
var inputMessage = document.getElementById("input-message");
var btnSend = document.getElementById("btn-send");
var toggleContext = document.getElementById("toggle-context");
var btnClearHistory = document.getElementById("btn-clear-history");
var activeCharacter = null;
var chatHistory = null;
var currentMode = "befriend";
var pendingContextQuery = null;
var currentTab = null;
async function init() {
  const character = await getActiveCharacter();
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
async function loadCharacter(character) {
  activeCharacter = character;
  const history = await getChatHistory(character.id);
  chatHistory = history ?? {
    characterId: character.id,
    messages: [],
    relationshipScore: character.relationshipScore,
    emotionalState: character.emotionalState
  };
  renderHeader(character);
  renderHistory(chatHistory);
  showScreen("chat");
}
function showScreen(screen) {
  screenEmpty.classList.toggle("hidden", screen !== "empty");
  screenChat.classList.toggle("hidden", screen !== "chat");
}
function renderHeader(character) {
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
function updateRelBar(score) {
  const { label, color } = getRelMeta(score);
  const pct = (score + 100) / 200 * 100;
  relLabel.textContent = label;
  relLabel.style.color = color;
  relBarFill.style.width = `${pct}%`;
  relBarFill.style.background = color;
  relScore.textContent = (score > 0 ? "+" : "") + score;
}
function updateEmotionalState(state) {
  charState.textContent = state.toUpperCase();
}
function showActivityBar(title) {
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
  const recent = [...entries].reverse().slice(0, 20);
  for (const entry of recent) {
    const el = document.createElement("div");
    el.className = "activity-entry";
    const mins = Math.round(entry.timeSpentMs / 6e4);
    const timeStr = mins > 0 ? `${mins}m` : "<1m";
    const relTime = formatRelativeTime(entry.timestamp);
    el.innerHTML = `
      <span class="activity-entry-domain">${escapeHtml(entry.domain)}</span>
      <span class="activity-entry-title" title="${escapeHtml(entry.title)}">${escapeHtml(entry.title)}</span>
      <span class="activity-entry-time">${timeStr} \xB7 ${relTime}</span>
    `;
    activityFeedList.appendChild(el);
  }
}
function formatRelativeTime(ts) {
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 6e4);
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
function showContextBadge(text) {
  contextBadgeText.textContent = text;
  contextBadge.classList.remove("hidden");
}
function hideContextBadge() {
  contextBadge.classList.add("hidden");
  pendingContextQuery = null;
}
contextBadgeClear.addEventListener("click", hideContextBadge);
function renderHistory(history) {
  chatMessages.innerHTML = "";
  for (const msg of history.messages) {
    appendMessageToDOM(msg, false);
  }
  scrollToBottom();
}
function appendMessageToDOM(msg, animate = true) {
  const el = buildMessageEl(msg, animate);
  chatMessages.appendChild(el);
}
function buildMessageEl(msg, _animate) {
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
    if (msg.relationshipDelta !== void 0 && msg.relationshipDelta !== 0) {
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
async function typewriterAppend(text, msgId) {
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
    if (i % 3 === 0) scrollToBottom();
    await sleep(CHAR_DELAY_MS);
  }
  cursor.remove();
  return;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
modeSelector.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    modeSelector.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode;
  });
});
async function buildBrowserContext(selectedText) {
  if (!toggleContext.checked) return void 0;
  const settings = await getSettings();
  if (!settings.trackActivity) return void 0;
  const activity = await getActivity();
  const digest = buildActivityDigest(activity);
  const tab = currentTab;
  if (!tab?.url) return void 0;
  try {
    const url = new URL(tab.url);
    return {
      currentUrl: tab.url,
      currentTitle: tab.title,
      currentDomain: url.hostname.replace(/^www\./, ""),
      activityDigest: digest,
      ...selectedText ? { selectedText } : {}
    };
  } catch {
    return void 0;
  }
}
async function sendMessage(text) {
  if (!activeCharacter || !chatHistory) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  inputMessage.value = "";
  btnSend.disabled = true;
  btnSuggest.disabled = true;
  const userMsg = {
    id: `msg_${Date.now()}_user`,
    role: "user",
    text: trimmed,
    timestamp: Date.now(),
    interactionMode: currentMode
  };
  chatHistory.messages.push(userMsg);
  appendMessageToDOM(userMsg);
  scrollToBottom();
  typingIndicator.classList.remove("hidden");
  try {
    const selectedText = pendingContextQuery?.selectedText;
    const browserCtx = await buildBrowserContext(selectedText);
    const result = await recallChat(activeCharacter, currentMode, trimmed, browserCtx);
    typingIndicator.classList.add("hidden");
    const charMsgId = `msg_${Date.now()}_char`;
    await typewriterAppend(result.response, charMsgId);
    const charMsg = {
      id: charMsgId,
      role: "character",
      text: result.response,
      timestamp: Date.now(),
      relationshipDelta: result.relationshipDelta,
      interactionMode: currentMode
    };
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
          textContent: `${sign}${result.relationshipDelta}`
        });
        meta.appendChild(delta);
      }
      wrapper.appendChild(meta);
    }
    chatHistory.messages.push(charMsg);
    chatHistory.relationshipScore = result.newRelationshipToUser;
    chatHistory.emotionalState = result.emotionalStateUpdate;
    const updatedCharacter = {
      ...activeCharacter,
      relationshipScore: result.newRelationshipToUser,
      emotionalState: result.emotionalStateUpdate,
      interactionCount: activeCharacter.interactionCount + 1
    };
    activeCharacter = updatedCharacter;
    await updateCharacter(updatedCharacter);
    updateRelBar(result.newRelationshipToUser);
    updateEmotionalState(result.emotionalStateUpdate);
    if (pendingContextQuery) hideContextBadge();
    await saveChatHistory(chatHistory);
  } catch (err) {
    typingIndicator.classList.add("hidden");
    const errMsg = {
      id: `msg_${Date.now()}_sys`,
      role: "system",
      text: `Connection error: ${String(err)}. Check the API URL in settings.`,
      timestamp: Date.now()
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
btnSend.addEventListener("click", () => {
  sendMessage(inputMessage.value);
});
inputMessage.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(inputMessage.value);
  }
});
btnSuggest.addEventListener("click", async () => {
  if (!activeCharacter) return;
  btnSuggest.disabled = true;
  btnSuggest.textContent = "\u2026";
  const suggestion = await fetchSuggestion(currentMode, activeCharacter.name, activeCharacter.personality);
  btnSuggest.textContent = "\u2726";
  btnSuggest.disabled = false;
  if (suggestion) {
    inputMessage.value = suggestion;
    inputMessage.focus();
  }
});
btnClearHistory.addEventListener("click", async () => {
  if (!activeCharacter) return;
  await clearChatHistory(activeCharacter.id);
  chatHistory = {
    characterId: activeCharacter.id,
    messages: [],
    relationshipScore: activeCharacter.relationshipScore,
    emotionalState: activeCharacter.emotionalState
  };
  chatMessages.innerHTML = "";
});
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CONTEXT_MENU_QUERY") {
    pendingContextQuery = {
      selectedText: message.selectedText,
      sourceUrl: message.sourceUrl,
      sourceTitle: message.sourceTitle
    };
    const label = message.selectedText ? `"${message.selectedText.slice(0, 60)}${message.selectedText.length > 60 ? "\u2026" : ""}"` : `From: ${message.sourceTitle}`;
    showContextBadge(`Context: ${label}`);
    if (message.selectedText) {
      inputMessage.value = `What do you think about this? "${message.selectedText.slice(0, 120)}"`;
    }
    inputMessage.focus();
    return;
  }
  if (message.type === "PROACTIVE_COMMENT" && activeCharacter && chatHistory) {
    const proactiveMsg = {
      id: `msg_${Date.now()}_char`,
      role: "character",
      text: message.text,
      timestamp: Date.now(),
      relationshipDelta: message.relationshipDelta
    };
    chatHistory.messages.push(proactiveMsg);
    appendMessageToDOM(proactiveMsg);
    scrollToBottom();
    if (message.newRelationshipScore !== void 0) {
      chatHistory.relationshipScore = message.newRelationshipScore;
      updateRelBar(message.newRelationshipScore);
    }
    if (message.emotionalState) {
      chatHistory.emotionalState = message.emotionalState;
      updateEmotionalState(message.emotionalState);
    }
    saveChatHistory(chatHistory).catch(() => {
    });
    return;
  }
  if (message.type === "TAB_CHANGED") {
    const entry = message.entry;
    if (entry?.url && entry?.title) {
      currentTab = { url: entry.url, title: entry.title };
      if (entry.url.startsWith("http://") || entry.url.startsWith("https://")) {
        showActivityBar(entry.title);
      } else {
        hideActivityBar();
      }
      if (!activityFeed.classList.contains("hidden")) {
        renderActivityFeed().catch(() => {
        });
      }
    }
    return;
  }
  if (message.type === "SET_ACTIVE_CHARACTER") {
    init().catch(console.error);
    return;
  }
});
init().catch(console.error);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc2hhcmVkL3R5cGVzLnRzIiwgIi4uL3NoYXJlZC9zdG9yYWdlLnRzIiwgIi4uL3NoYXJlZC9hcGkudHMiLCAic2lkZXBhbmVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBTaGFyZWQgdHlwZXMgZm9yIHRoZSBNQ00gQ29tcGFuaW9uIENocm9tZSBleHRlbnNpb24uXG4vLyBNaXJyb3JzIHRoZSBlc3NlbnRpYWwgdHlwZXMgZnJvbSB0aGUgbWFpbiBhcHAncyBzcmMvdHlwZXMvaW5kZXgudHMuXG4vLyBLZWVwIGluIHN5bmMgbWFudWFsbHkgaWYgdGhlIG1haW4gYXBwIHR5cGVzIGNoYW5nZS5cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIENoYXJhY3RlciB0eXBlcyAobWlycm9yZWQgZnJvbSBtYWluIGFwcCkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmV4cG9ydCB0eXBlIFN0b3J5R2VucmUgPVxuICB8IFwiZGF0aW5nX3NpbVwiXG4gIHwgXCJteXN0ZXJ5XCJcbiAgfCBcImZhbnRhc3lcIlxuICB8IFwic3Vydml2YWxcIlxuICB8IFwid29ya3BsYWNlX2RyYW1hXCJcbiAgfCBcInNvYXBfb3BlcmFcIjtcblxuZXhwb3J0IHR5cGUgSW50ZXJhY3Rpb25Nb2RlID1cbiAgfCBcImZsaXJ0XCJcbiAgfCBcImludGVycm9nYXRlXCJcbiAgfCBcInJlY3J1aXRcIlxuICB8IFwiYmVmcmllbmRcIlxuICB8IFwicm9hc3RcIlxuICB8IFwiYXBvbG9naXplXCI7XG5cbmV4cG9ydCB0eXBlIENoYXJhY3RlckV4cHJlc3Npb24gPVxuICB8IFwibmV1dHJhbFwiXG4gIHwgXCJ0YWxraW5nXCJcbiAgfCBcImhhcHB5XCJcbiAgfCBcImFuZ3J5XCJcbiAgfCBcInNhZFwiXG4gIHwgXCJzdXJwcmlzZWRcIjtcblxuLyoqIEEgY2hhcmFjdGVyIHNhdmVkIHRvIHRoZSBwbGF5ZXIncyBwZXJtYW5lbnQgY29sbGVjdGlvbiBpbmRleC4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2F2ZWRDaGFyYWN0ZXIge1xuICBpZDogc3RyaW5nO1xuICBvYmplY3RMYWJlbDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHBlcnNvbmFsaXR5OiBzdHJpbmc7XG4gIHZvaWNlU3R5bGU6IHN0cmluZztcbiAgZW1vdGlvbmFsU3RhdGU6IHN0cmluZztcbiAgcG9ydHJhaXRVcmw/OiBzdHJpbmc7XG4gIHBvcnRyYWl0cz86IFBhcnRpYWw8UmVjb3JkPENoYXJhY3RlckV4cHJlc3Npb24sIHN0cmluZz4+O1xuICBnZW5yZTogU3RvcnlHZW5yZTtcbiAgcmVsYXRpb25zaGlwU2NvcmU6IG51bWJlcjtcbiAgc2F2ZWRBdDogbnVtYmVyO1xuICBtZW1vcmllczogc3RyaW5nW107XG4gIGludGVyYWN0aW9uQ291bnQ6IG51bWJlcjtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEV4dGVuc2lvbi1zcGVjaWZpYyB0eXBlcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuLyoqIEJyb3dzZXIgY29udGV4dCBpbmplY3RlZCBpbnRvIC9hcGkvcmVjYWxsIGNhbGxzLiAqL1xuZXhwb3J0IGludGVyZmFjZSBCcm93c2VyQ29udGV4dCB7XG4gIGN1cnJlbnRVcmw6IHN0cmluZztcbiAgY3VycmVudFRpdGxlOiBzdHJpbmc7XG4gIGN1cnJlbnREb21haW46IHN0cmluZztcbiAgc2VsZWN0ZWRUZXh0Pzogc3RyaW5nO1xuICAvKiogUHJvc2Ugc3VtbWFyeSBvZiByZWNlbnQgYnJvd3NpbmcgYWN0aXZpdHkuICovXG4gIGFjdGl2aXR5RGlnZXN0OiBzdHJpbmc7XG59XG5cbi8qKiBPbmUgZW50cnkgaW4gdGhlIHJvbGxpbmcgdGFiIGFjdGl2aXR5IGxvZy4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQWN0aXZpdHlFbnRyeSB7XG4gIHVybDogc3RyaW5nO1xuICB0aXRsZTogc3RyaW5nO1xuICBkb21haW46IHN0cmluZztcbiAgdGltZXN0YW1wOiBudW1iZXI7XG4gIC8qKiBIb3cgbG9uZyB0aGUgdXNlciBzcGVudCBvbiB0aGlzIHBhZ2UvdGFiIGluIG1zLiAwIGlmIHN0aWxsIGFjdGl2ZS4gKi9cbiAgdGltZVNwZW50TXM6IG51bWJlcjtcbn1cblxuLyoqIFBlcnNpc3RlZCBleHRlbnNpb24gc2V0dGluZ3MuICovXG5leHBvcnQgaW50ZXJmYWNlIEV4dGVuc2lvblNldHRpbmdzIHtcbiAgLyoqIEJhc2UgVVJMIG9mIHRoZSBNQ00gTmV4dC5qcyBhcHAgKGUuZy4gaHR0cDovL2xvY2FsaG9zdDozMDAwKS4gKi9cbiAgYXBpQmFzZVVybDogc3RyaW5nO1xuICAvKiogSUQgb2YgdGhlIGN1cnJlbnRseSBhY3RpdmUgY2hhcmFjdGVyLiBudWxsIGlmIG5vbmUgc2VsZWN0ZWQuICovXG4gIGFjdGl2ZUNoYXJhY3RlcklkOiBzdHJpbmcgfCBudWxsO1xuICAvKiogV2hldGhlciB0aGUgY2hhcmFjdGVyIHNob3VsZCBwcm9hY3RpdmVseSBjb21tZW50IG9uIGJyb3dzaW5nIGFjdGl2aXR5LiAqL1xuICBwcm9hY3RpdmVDb21tZW50czogYm9vbGVhbjtcbiAgLyoqIFdoZXRoZXIgdG8gdHJhY2sgdGFiIGFjdGl2aXR5IGF0IGFsbC4gKi9cbiAgdHJhY2tBY3Rpdml0eTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfU0VUVElOR1M6IEV4dGVuc2lvblNldHRpbmdzID0ge1xuICBhcGlCYXNlVXJsOiBcImh0dHA6Ly9sb2NhbGhvc3Q6MzAwMVwiLFxuICBhY3RpdmVDaGFyYWN0ZXJJZDogbnVsbCxcbiAgcHJvYWN0aXZlQ29tbWVudHM6IHRydWUsXG4gIHRyYWNrQWN0aXZpdHk6IHRydWUsXG59O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgTWVzc2FnZSB0eXBlcyAoZXh0ZW5zaW9uIGludGVybmFsIG1lc3NhZ2luZykgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmV4cG9ydCB0eXBlIEV4dGVuc2lvbk1lc3NhZ2UgPVxuICB8IHsgdHlwZTogXCJJTVBPUlRfQ0hBUkFDVEVSU1wiIH1cbiAgfCB7IHR5cGU6IFwiQ0hBUkFDVEVSU19JTVBPUlRFRFwiOyBjaGFyYWN0ZXJzOiBTYXZlZENoYXJhY3RlcltdIH1cbiAgfCB7IHR5cGU6IFwiSU1QT1JUX0ZBSUxFRFwiOyByZWFzb246IHN0cmluZyB9XG4gIHwgeyB0eXBlOiBcIlNFVF9BQ1RJVkVfQ0hBUkFDVEVSXCI7IGNoYXJhY3RlcklkOiBzdHJpbmcgfVxuICB8IHsgdHlwZTogXCJPUEVOX1NJREVfUEFORUxcIiB9XG4gIHwgeyB0eXBlOiBcIkNPTlRFWFRfTUVOVV9RVUVSWVwiOyBzZWxlY3RlZFRleHQ6IHN0cmluZzsgc291cmNlVXJsOiBzdHJpbmc7IHNvdXJjZVRpdGxlOiBzdHJpbmcgfVxuICB8IHsgdHlwZTogXCJUQUJfQ0hBTkdFRFwiOyBlbnRyeTogQWN0aXZpdHlFbnRyeSB9O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgQVBJIHBheWxvYWRzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5leHBvcnQgaW50ZXJmYWNlIFJlY2FsbFJlcXVlc3Qge1xuICBjaGFyYWN0ZXI6IFNhdmVkQ2hhcmFjdGVyO1xuICBpbnRlcmFjdGlvbk1vZGU6IEludGVyYWN0aW9uTW9kZTtcbiAgbWVzc2FnZTogc3RyaW5nO1xuICBicm93c2VyQ29udGV4dD86IEJyb3dzZXJDb250ZXh0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlY2FsbFJlc3BvbnNlIHtcbiAgcmVzcG9uc2U6IHN0cmluZztcbiAgcmVsYXRpb25zaGlwRGVsdGE6IG51bWJlcjtcbiAgbmV3UmVsYXRpb25zaGlwVG9Vc2VyOiBudW1iZXI7XG4gIGVtb3Rpb25hbFN0YXRlVXBkYXRlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VnZ2VzdFJlcXVlc3Qge1xuICBtb2RlOiBJbnRlcmFjdGlvbk1vZGU7XG4gIGNoYXJhY3Rlck5hbWU6IHN0cmluZztcbiAgcGVyc29uYWxpdHk6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdWdnZXN0UmVzcG9uc2Uge1xuICBzdWdnZXN0aW9uOiBzdHJpbmc7XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBDaGF0IGhpc3RvcnkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmV4cG9ydCB0eXBlIENoYXRNZXNzYWdlUm9sZSA9IFwidXNlclwiIHwgXCJjaGFyYWN0ZXJcIiB8IFwic3lzdGVtXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2hhdE1lc3NhZ2Uge1xuICBpZDogc3RyaW5nO1xuICByb2xlOiBDaGF0TWVzc2FnZVJvbGU7XG4gIHRleHQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBudW1iZXI7XG4gIC8qKiBSZWxhdGlvbnNoaXAgZGVsdGEgZnJvbSB0aGlzIGV4Y2hhbmdlIChjaGFyYWN0ZXIgbWVzc2FnZXMgb25seSkuICovXG4gIHJlbGF0aW9uc2hpcERlbHRhPzogbnVtYmVyO1xuICBpbnRlcmFjdGlvbk1vZGU/OiBJbnRlcmFjdGlvbk1vZGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2hhdEhpc3Rvcnkge1xuICBjaGFyYWN0ZXJJZDogc3RyaW5nO1xuICBtZXNzYWdlczogQ2hhdE1lc3NhZ2VbXTtcbiAgLyoqIExhc3Qga25vd24gcmVsYXRpb25zaGlwIHNjb3JlIChzeW5jZWQgYmFjayB0byBTYXZlZENoYXJhY3RlciBvbiBhY3Rpdml0eSkuICovXG4gIHJlbGF0aW9uc2hpcFNjb3JlOiBudW1iZXI7XG4gIGVtb3Rpb25hbFN0YXRlOiBzdHJpbmc7XG59XG4iLCAiLy8gVHlwZWQgd3JhcHBlcnMgYXJvdW5kIGNocm9tZS5zdG9yYWdlLmxvY2FsIGZvciB0aGUgTUNNIENvbXBhbmlvbiBleHRlbnNpb24uXG5cbmltcG9ydCB0eXBlIHtcbiAgU2F2ZWRDaGFyYWN0ZXIsXG4gIEV4dGVuc2lvblNldHRpbmdzLFxuICBBY3Rpdml0eUVudHJ5LFxuICBDaGF0SGlzdG9yeSxcbn0gZnJvbSBcIi4vdHlwZXMuanNcIjtcbmltcG9ydCB7IERFRkFVTFRfU0VUVElOR1MgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgU3RvcmFnZSBrZXlzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5jb25zdCBLRVlTID0ge1xuICBDSEFSQUNURVJTOiBcIm1jbV9leHRfY2hhcmFjdGVyc1wiLFxuICBTRVRUSU5HUzogXCJtY21fZXh0X3NldHRpbmdzXCIsXG4gIEFDVElWSVRZOiBcIm1jbV9leHRfYWN0aXZpdHlcIixcbiAgQ0hBVF9QUkVGSVg6IFwibWNtX2V4dF9jaGF0X1wiLFxufSBhcyBjb25zdDtcblxuY29uc3QgTUFYX0FDVElWSVRZX0VOVFJJRVMgPSA1MDtcbmNvbnN0IE1BWF9DSEFUX01FU1NBR0VTID0gMjA7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBDaGFyYWN0ZXJzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Q2hhcmFjdGVycygpOiBQcm9taXNlPFNhdmVkQ2hhcmFjdGVyW10+IHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KEtFWVMuQ0hBUkFDVEVSUyk7XG4gIHJldHVybiAocmVzdWx0W0tFWVMuQ0hBUkFDVEVSU10gYXMgU2F2ZWRDaGFyYWN0ZXJbXSkgPz8gW107XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRDaGFyYWN0ZXJzKGNoYXJhY3RlcnM6IFNhdmVkQ2hhcmFjdGVyW10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgW0tFWVMuQ0hBUkFDVEVSU106IGNoYXJhY3RlcnMgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRDaGFyYWN0ZXJCeUlkKGlkOiBzdHJpbmcpOiBQcm9taXNlPFNhdmVkQ2hhcmFjdGVyIHwgbnVsbD4ge1xuICBjb25zdCBjaGFyYWN0ZXJzID0gYXdhaXQgZ2V0Q2hhcmFjdGVycygpO1xuICByZXR1cm4gY2hhcmFjdGVycy5maW5kKChjKSA9PiBjLmlkID09PSBpZCkgPz8gbnVsbDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVwZGF0ZUNoYXJhY3Rlcih1cGRhdGVkOiBTYXZlZENoYXJhY3Rlcik6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBjaGFyYWN0ZXJzID0gYXdhaXQgZ2V0Q2hhcmFjdGVycygpO1xuICBjb25zdCBpZHggPSBjaGFyYWN0ZXJzLmZpbmRJbmRleCgoYykgPT4gYy5pZCA9PT0gdXBkYXRlZC5pZCk7XG4gIGlmIChpZHggPj0gMCkge1xuICAgIGNoYXJhY3RlcnNbaWR4XSA9IHVwZGF0ZWQ7XG4gIH0gZWxzZSB7XG4gICAgY2hhcmFjdGVycy5wdXNoKHVwZGF0ZWQpO1xuICB9XG4gIGF3YWl0IHNldENoYXJhY3RlcnMoY2hhcmFjdGVycyk7XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBTZXR0aW5ncyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFNldHRpbmdzKCk6IFByb21pc2U8RXh0ZW5zaW9uU2V0dGluZ3M+IHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KEtFWVMuU0VUVElOR1MpO1xuICByZXR1cm4geyAuLi5ERUZBVUxUX1NFVFRJTkdTLCAuLi4ocmVzdWx0W0tFWVMuU0VUVElOR1NdIGFzIFBhcnRpYWw8RXh0ZW5zaW9uU2V0dGluZ3M+KSB9O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0U2V0dGluZ3MocGFydGlhbDogUGFydGlhbDxFeHRlbnNpb25TZXR0aW5ncz4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgY3VycmVudCA9IGF3YWl0IGdldFNldHRpbmdzKCk7XG4gIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtLRVlTLlNFVFRJTkdTXTogeyAuLi5jdXJyZW50LCAuLi5wYXJ0aWFsIH0gfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRBY3RpdmVDaGFyYWN0ZXIoKTogUHJvbWlzZTxTYXZlZENoYXJhY3RlciB8IG51bGw+IHtcbiAgY29uc3Qgc2V0dGluZ3MgPSBhd2FpdCBnZXRTZXR0aW5ncygpO1xuICBpZiAoIXNldHRpbmdzLmFjdGl2ZUNoYXJhY3RlcklkKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIGdldENoYXJhY3RlckJ5SWQoc2V0dGluZ3MuYWN0aXZlQ2hhcmFjdGVySWQpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2V0QWN0aXZlQ2hhcmFjdGVyKGNoYXJhY3RlcklkOiBzdHJpbmcgfCBudWxsKTogUHJvbWlzZTx2b2lkPiB7XG4gIGF3YWl0IHNldFNldHRpbmdzKHsgYWN0aXZlQ2hhcmFjdGVySWQ6IGNoYXJhY3RlcklkIH0pO1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgQWN0aXZpdHkgbG9nIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0QWN0aXZpdHkoKTogUHJvbWlzZTxBY3Rpdml0eUVudHJ5W10+IHtcbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KEtFWVMuQUNUSVZJVFkpO1xuICByZXR1cm4gKHJlc3VsdFtLRVlTLkFDVElWSVRZXSBhcyBBY3Rpdml0eUVudHJ5W10pID8/IFtdO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXBwZW5kQWN0aXZpdHkoZW50cnk6IEFjdGl2aXR5RW50cnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgZXhpc3RpbmcgPSBhd2FpdCBnZXRBY3Rpdml0eSgpO1xuICBjb25zdCB1cGRhdGVkID0gWy4uLmV4aXN0aW5nLCBlbnRyeV0uc2xpY2UoLU1BWF9BQ1RJVklUWV9FTlRSSUVTKTtcbiAgYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgW0tFWVMuQUNUSVZJVFldOiB1cGRhdGVkIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdXBkYXRlTGFzdEFjdGl2aXR5KHBhdGNoOiBQYXJ0aWFsPEFjdGl2aXR5RW50cnk+KTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgZ2V0QWN0aXZpdHkoKTtcbiAgaWYgKGV4aXN0aW5nLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICBleGlzdGluZ1tleGlzdGluZy5sZW5ndGggLSAxXSA9IHsgLi4uZXhpc3RpbmdbZXhpc3RpbmcubGVuZ3RoIC0gMV0sIC4uLnBhdGNoIH07XG4gIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtLRVlTLkFDVElWSVRZXTogZXhpc3RpbmcgfSk7XG59XG5cbi8qKlxuICogQnVpbGQgYSBzaG9ydCBodW1hbi1yZWFkYWJsZSBwcm9zZSBkaWdlc3QgZnJvbSByZWNlbnQgYWN0aXZpdHkgZW50cmllcyxcbiAqIHN1aXRhYmxlIGZvciBpbmplY3RpbmcgaW50byBhbiBBSSBwcm9tcHQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEFjdGl2aXR5RGlnZXN0KGVudHJpZXM6IEFjdGl2aXR5RW50cnlbXSwgbWF4RW50cmllcyA9IDEwKTogc3RyaW5nIHtcbiAgaWYgKGVudHJpZXMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJObyByZWNlbnQgYnJvd3NpbmcgYWN0aXZpdHkuXCI7XG5cbiAgY29uc3QgcmVjZW50ID0gZW50cmllc1xuICAgIC5zbGljZSgtbWF4RW50cmllcylcbiAgICAuZmlsdGVyKChlKSA9PiBlLnRpdGxlICYmIGUuZG9tYWluKVxuICAgIC5yZXZlcnNlKCk7IC8vIG1vc3QgcmVjZW50IGZpcnN0XG5cbiAgY29uc3QgbGluZXMgPSByZWNlbnQubWFwKChlKSA9PiB7XG4gICAgY29uc3QgbWlucyA9IE1hdGgucm91bmQoZS50aW1lU3BlbnRNcyAvIDYwMDAwKTtcbiAgICBjb25zdCB0aW1lU3RyID0gbWlucyA+IDAgPyBgICgke21pbnN9bSlgIDogXCJcIjtcbiAgICByZXR1cm4gYCR7ZS50aXRsZX0gWyR7ZS5kb21haW59XSR7dGltZVN0cn1gO1xuICB9KTtcblxuICByZXR1cm4gXCJSZWNlbnRseSB2aXNpdGVkOiBcIiArIGxpbmVzLmpvaW4oXCIsIFwiKSArIFwiLlwiO1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgQ2hhdCBoaXN0b3J5IFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5mdW5jdGlvbiBjaGF0S2V5KGNoYXJhY3RlcklkOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gYCR7S0VZUy5DSEFUX1BSRUZJWH0ke2NoYXJhY3RlcklkfWA7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRDaGF0SGlzdG9yeShjaGFyYWN0ZXJJZDogc3RyaW5nKTogUHJvbWlzZTxDaGF0SGlzdG9yeSB8IG51bGw+IHtcbiAgY29uc3Qga2V5ID0gY2hhdEtleShjaGFyYWN0ZXJJZCk7XG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChrZXkpO1xuICByZXR1cm4gKHJlc3VsdFtrZXldIGFzIENoYXRIaXN0b3J5KSA/PyBudWxsO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2F2ZUNoYXRIaXN0b3J5KGhpc3Rvcnk6IENoYXRIaXN0b3J5KTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IGtleSA9IGNoYXRLZXkoaGlzdG9yeS5jaGFyYWN0ZXJJZCk7XG4gIC8vIENhcCBtZXNzYWdlc1xuICBjb25zdCB0cmltbWVkOiBDaGF0SGlzdG9yeSA9IHtcbiAgICAuLi5oaXN0b3J5LFxuICAgIG1lc3NhZ2VzOiBoaXN0b3J5Lm1lc3NhZ2VzLnNsaWNlKC1NQVhfQ0hBVF9NRVNTQUdFUyksXG4gIH07XG4gIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtrZXldOiB0cmltbWVkIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2xlYXJDaGF0SGlzdG9yeShjaGFyYWN0ZXJJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnJlbW92ZShjaGF0S2V5KGNoYXJhY3RlcklkKSk7XG59XG4iLCAiLy8gQVBJIGZldGNoIGhlbHBlcnMgZm9yIHRoZSBNQ00gQ29tcGFuaW9uIGV4dGVuc2lvbi5cbi8vIEFsbCBjYWxscyBwcm94eSB0aHJvdWdoIHRoZSBtYWluIGFwcCdzIE5leHQuanMgQVBJIHJvdXRlcy5cblxuaW1wb3J0IHR5cGUge1xuICBTYXZlZENoYXJhY3RlcixcbiAgSW50ZXJhY3Rpb25Nb2RlLFxuICBCcm93c2VyQ29udGV4dCxcbiAgUmVjYWxsUmVxdWVzdCxcbiAgUmVjYWxsUmVzcG9uc2UsXG4gIFN1Z2dlc3RSZXNwb25zZSxcbn0gZnJvbSBcIi4vdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFNldHRpbmdzIH0gZnJvbSBcIi4vc3RvcmFnZS5qc1wiO1xuXG5hc3luYyBmdW5jdGlvbiBnZXRCYXNlVXJsKCk6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IHNldHRpbmdzID0gYXdhaXQgZ2V0U2V0dGluZ3MoKTtcbiAgcmV0dXJuIHNldHRpbmdzLmFwaUJhc2VVcmwucmVwbGFjZSgvXFwvJC8sIFwiXCIpO1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgL2FwaS9yZWNhbGwgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbi8qKlxuICogU2VuZCBhIGNoYXQgbWVzc2FnZSB0byBhIGNoYXJhY3RlciB2aWEgdGhlIHN0YXRlbGVzcyAvYXBpL3JlY2FsbCBlbmRwb2ludC5cbiAqIE9wdGlvbmFsbHkgaW5jbHVkZXMgYnJvd3NlciBjb250ZXh0IHNvIHRoZSBjaGFyYWN0ZXIgY2FuIHJlYWN0IHRvIHdoYXRcbiAqIHRoZSB1c2VyIGlzIGN1cnJlbnRseSBsb29raW5nIGF0LlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVjYWxsQ2hhdChcbiAgY2hhcmFjdGVyOiBTYXZlZENoYXJhY3RlcixcbiAgbW9kZTogSW50ZXJhY3Rpb25Nb2RlLFxuICBtZXNzYWdlOiBzdHJpbmcsXG4gIGJyb3dzZXJDb250ZXh0PzogQnJvd3NlckNvbnRleHRcbik6IFByb21pc2U8UmVjYWxsUmVzcG9uc2U+IHtcbiAgY29uc3QgYmFzZVVybCA9IGF3YWl0IGdldEJhc2VVcmwoKTtcblxuICBjb25zdCBib2R5OiBSZWNhbGxSZXF1ZXN0ID0ge1xuICAgIGNoYXJhY3RlcixcbiAgICBpbnRlcmFjdGlvbk1vZGU6IG1vZGUsXG4gICAgbWVzc2FnZSxcbiAgICAuLi4oYnJvd3NlckNvbnRleHQgPyB7IGJyb3dzZXJDb250ZXh0IH0gOiB7fSksXG4gIH07XG5cbiAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goYCR7YmFzZVVybH0vYXBpL3JlY2FsbGAsIHtcbiAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgIGhlYWRlcnM6IHsgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeShib2R5KSxcbiAgfSk7XG5cbiAgaWYgKCFyZXMub2spIHtcbiAgICBjb25zdCB0ZXh0ID0gYXdhaXQgcmVzLnRleHQoKS5jYXRjaCgoKSA9PiBcIlVua25vd24gZXJyb3JcIik7XG4gICAgdGhyb3cgbmV3IEVycm9yKGAvYXBpL3JlY2FsbCBmYWlsZWQgKCR7cmVzLnN0YXR1c30pOiAke3RleHR9YCk7XG4gIH1cblxuICByZXR1cm4gcmVzLmpzb24oKSBhcyBQcm9taXNlPFJlY2FsbFJlc3BvbnNlPjtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIC9hcGkvc3VnZ2VzdCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuLyoqXG4gKiBGZXRjaCBhIHN1Z2dlc3RlZCBtZXNzYWdlIGZvciB0aGUgZ2l2ZW4gaW50ZXJhY3Rpb24gbW9kZSBhbmQgY2hhcmFjdGVyLlxuICogUmV0dXJucyBhIGZhbGxiYWNrIHN0cmluZyBvbiBmYWlsdXJlIHNvIHRoZSBVSSBuZXZlciBzaG93cyBhbiBlcnJvciBmb3JcbiAqIHdoYXQgaXMgZXNzZW50aWFsbHkgYSBuaWNlLXRvLWhhdmUgZmVhdHVyZS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoU3VnZ2VzdGlvbihcbiAgbW9kZTogSW50ZXJhY3Rpb25Nb2RlLFxuICBjaGFyYWN0ZXJOYW1lOiBzdHJpbmcsXG4gIHBlcnNvbmFsaXR5OiBzdHJpbmdcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgYmFzZVVybCA9IGF3YWl0IGdldEJhc2VVcmwoKTtcblxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKGAke2Jhc2VVcmx9L2FwaS9zdWdnZXN0YCwge1xuICAgICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICAgIGhlYWRlcnM6IHsgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZSwgY2hhcmFjdGVyTmFtZSwgcGVyc29uYWxpdHkgfSksXG4gICAgfSk7XG5cbiAgICBpZiAoIXJlcy5vaykgcmV0dXJuIFwiXCI7XG5cbiAgICBjb25zdCBkYXRhID0gKGF3YWl0IHJlcy5qc29uKCkpIGFzIFN1Z2dlc3RSZXNwb25zZTtcbiAgICByZXR1cm4gZGF0YS5zdWdnZXN0aW9uID8/IFwiXCI7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBcIlwiO1xuICB9XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBDb25uZWN0aXZpdHkgY2hlY2sgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbi8qKiBSZXR1cm5zIHRydWUgaWYgdGhlIGNvbmZpZ3VyZWQgQVBJIGJhc2UgVVJMIGFwcGVhcnMgdG8gYmUgcmVhY2hhYmxlLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNoZWNrQXBpQ29ubmVjdGl2aXR5KCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICB0cnkge1xuICAgIGNvbnN0IGJhc2VVcmwgPSBhd2FpdCBnZXRCYXNlVXJsKCk7XG4gICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goYCR7YmFzZVVybH0vYXBpL3JlY2FsbGAsIHtcbiAgICAgIG1ldGhvZDogXCJQT1NUXCIsXG4gICAgICBoZWFkZXJzOiB7IFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7fSksXG4gICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoNDAwMCksXG4gICAgfSk7XG4gICAgLy8gNDAwID0gcmVhY2hhYmxlIGJ1dCBiYWQgcmVxdWVzdCBcdTIwMTQgdGhhdCdzIGZpbmUsIHdlIGp1c3QgbmVlZCB0byBjb25maXJtIHRoZSBzZXJ2ZXIgaXMgdXBcbiAgICByZXR1cm4gcmVzLnN0YXR1cyA8IDUwMDtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG4iLCAiLy8gTUNNIENvbXBhbmlvbiBcdTIwMTQgU2lkZSBQYW5lbCBzY3JpcHRcbi8vIE1haW4gY2hhdCBVSTogY2hhcmFjdGVyIGRpc3BsYXksIG1lc3NhZ2Ugc2VuZC9yZWNlaXZlLCBicm93c2VyIGNvbnRleHQgaW5qZWN0aW9uLFxuLy8gY29udmVyc2F0aW9uIGhpc3RvcnksIHR5cGV3cml0ZXIgZWZmZWN0LCBwcm9hY3RpdmUgY29tbWVudCBkaXNwbGF5LlxuXG5pbXBvcnQge1xuICBnZXRBY3RpdmVDaGFyYWN0ZXIsXG4gIGdldEFjdGl2aXR5LFxuICBidWlsZEFjdGl2aXR5RGlnZXN0LFxuICBnZXRDaGF0SGlzdG9yeSxcbiAgc2F2ZUNoYXRIaXN0b3J5LFxuICBjbGVhckNoYXRIaXN0b3J5LFxuICB1cGRhdGVDaGFyYWN0ZXIsXG4gIGdldFNldHRpbmdzLFxufSBmcm9tIFwiLi4vc2hhcmVkL3N0b3JhZ2UuanNcIjtcbmltcG9ydCB7IHJlY2FsbENoYXQsIGZldGNoU3VnZ2VzdGlvbiB9IGZyb20gXCIuLi9zaGFyZWQvYXBpLmpzXCI7XG5pbXBvcnQgdHlwZSB7XG4gIFNhdmVkQ2hhcmFjdGVyLFxuICBJbnRlcmFjdGlvbk1vZGUsXG4gIENoYXRNZXNzYWdlLFxuICBDaGF0SGlzdG9yeSxcbiAgQnJvd3NlckNvbnRleHQsXG59IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFJlbGF0aW9uc2hpcCBoZWxwZXJzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5jb25zdCBSRUxfVEhSRVNIT0xEUzogW251bWJlciwgc3RyaW5nLCBzdHJpbmddW10gPSBbXG4gIFs4MCwgIFwiREVWT1RFRFwiLCAgXCIjRkY4MEMwXCJdLFxuICBbNDAsICBcIkZSSUVORExZXCIsIFwiIzdGRTA4MFwiXSxcbiAgWy00MCwgXCJORVVUUkFMXCIsICBcIiNGRkRFMDBcIl0sXG4gIFstODAsIFwiSE9TVElMRVwiLCAgXCIjRkY4MDQwXCJdLFxuICBbLUluZmluaXR5LCBcIkVORU1ZXCIsIFwiI0ZGNDA0MFwiXSxcbl07XG5cbmZ1bmN0aW9uIGdldFJlbE1ldGEoc2NvcmU6IG51bWJlcik6IHsgbGFiZWw6IHN0cmluZzsgY29sb3I6IHN0cmluZyB9IHtcbiAgZm9yIChjb25zdCBbdGhyZXNob2xkLCBsYWJlbCwgY29sb3JdIG9mIFJFTF9USFJFU0hPTERTKSB7XG4gICAgaWYgKHNjb3JlID49IHRocmVzaG9sZCkgcmV0dXJuIHsgbGFiZWwsIGNvbG9yIH07XG4gIH1cbiAgcmV0dXJuIHsgbGFiZWw6IFwiRU5FTVlcIiwgY29sb3I6IFwiI0ZGNDA0MFwiIH07XG59XG5cbmNvbnN0IFBPUlRSQUlUX1RIRU1FUzogeyBrZXl3b3Jkczogc3RyaW5nW107IGVtb2ppOiBzdHJpbmc7IGdyYWRpZW50OiBzdHJpbmcgfVtdID0gW1xuICB7IGtleXdvcmRzOiBbXCJqZWFsb3VzXCIsIFwiZW52aW91c1wiLCBcImJpdHRlclwiXSwgICAgZW1vamk6IFwiXHVEODNEXHVERTI0XCIsIGdyYWRpZW50OiBcImxpbmVhci1ncmFkaWVudCgxMzVkZWcsICMyZDBhNGUsICM0YTAwODAsICM2ZDAwNzApXCIgfSxcbiAgeyBrZXl3b3JkczogW1wicm9tYW50aWNcIiwgXCJsb25naW5nXCIsIFwibG92ZVwiXSwgICAgICBlbW9qaTogXCJcdUQ4M0NcdURGMzlcIiwgZ3JhZGllbnQ6IFwibGluZWFyLWdyYWRpZW50KDEzNWRlZywgIzRhMDAxMCwgIzhiMWEzYSwgIzRhMDAxMClcIiB9LFxuICB7IGtleXdvcmRzOiBbXCJteXN0ZXJpb3VzXCIsIFwiY3J5cHRpY1wiLCBcInNlY3JldFwiXSwgIGVtb2ppOiBcIlx1RDgzRFx1REQ2Rlx1RkUwRlwiLCBncmFkaWVudDogXCJsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMGEwYTBhLCAjMWExYTJlLCAjMGEwYTBhKVwiIH0sXG4gIHsga2V5d29yZHM6IFtcImNvbWVkaWNcIiwgXCJjaGFvdGljXCIsIFwiY2xvd25cIl0sICAgICAgZW1vamk6IFwiXHVEODNDXHVERkFEXCIsIGdyYWRpZW50OiBcImxpbmVhci1ncmFkaWVudCgxMzVkZWcsICM0YTI4MDAsICM3YTRhMDAsICM0YTI4MDApXCIgfSxcbiAgeyBrZXl3b3JkczogW1wic2FnZVwiLCBcIndpc2VcIiwgXCJvcmFjbGVcIl0sICAgICAgICAgICBlbW9qaTogXCJcdUQ4M0RcdUREMkVcIiwgZ3JhZGllbnQ6IFwibGluZWFyLWdyYWRpZW50KDEzNWRlZywgIzAwMTA0MCwgIzAwMTg3MCwgIzAwMTA0MClcIiB9LFxuICB7IGtleXdvcmRzOiBbXCJ2aWxsYWluXCIsIFwiZGFya1wiLCBcInNpbmlzdGVyXCJdLCAgICAgIGVtb2ppOiBcIlx1RDgzRFx1REM4MFwiLCBncmFkaWVudDogXCJsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMGEwMDAwLCAjMjAwMDAwLCAjMGEwMDAwKVwiIH0sXG4gIHsga2V5d29yZHM6IFtcImFueGlvdXNcIiwgXCJuZXJ2b3VzXCIsIFwid29ycmllZFwiXSwgICAgZW1vamk6IFwiXHVEODNEXHVERTMwXCIsIGdyYWRpZW50OiBcImxpbmVhci1ncmFkaWVudCgxMzVkZWcsICMwMDFhMWEsICMwMDNhM2EsICMwMDFhMWEpXCIgfSxcbl07XG5jb25zdCBERUZBVUxUX1RIRU1FID0geyBlbW9qaTogXCJcdTI3MjZcIiwgZ3JhZGllbnQ6IFwibGluZWFyLWdyYWRpZW50KDEzNWRlZywgIzBhMDAyOCwgIzFhMDA1MCwgIzBhMDAyOClcIiB9O1xuXG5mdW5jdGlvbiBnZXRQb3J0cmFpdFRoZW1lKHBlcnNvbmFsaXR5OiBzdHJpbmcpIHtcbiAgY29uc3QgbG93ZXIgPSBwZXJzb25hbGl0eS50b0xvd2VyQ2FzZSgpO1xuICBmb3IgKGNvbnN0IHQgb2YgUE9SVFJBSVRfVEhFTUVTKSB7XG4gICAgaWYgKHQua2V5d29yZHMuc29tZSgoaykgPT4gbG93ZXIuaW5jbHVkZXMoaykpKSByZXR1cm4gdDtcbiAgfVxuICByZXR1cm4gREVGQVVMVF9USEVNRTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIERPTSByZWZzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5jb25zdCBzY3JlZW5FbXB0eSAgICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2NyZWVuLWVtcHR5XCIpIGFzIEhUTUxFbGVtZW50O1xuY29uc3Qgc2NyZWVuQ2hhdCAgICAgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNjcmVlbi1jaGF0XCIpIGFzIEhUTUxFbGVtZW50O1xuY29uc3QgY2hhclBvcnRyYWl0ICAgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNoYXItcG9ydHJhaXRcIikgYXMgSFRNTEVsZW1lbnQ7XG5jb25zdCBjaGFyTmFtZSAgICAgICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2hhci1uYW1lXCIpIGFzIEhUTUxFbGVtZW50O1xuY29uc3QgY2hhckxhYmVsICAgICAgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNoYXItbGFiZWxcIikgYXMgSFRNTEVsZW1lbnQ7XG5jb25zdCBjaGFyU3RhdGUgICAgICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2hhci1zdGF0ZVwiKSBhcyBIVE1MRWxlbWVudDtcbmNvbnN0IHJlbExhYmVsICAgICAgICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyZWwtbGFiZWxcIikgYXMgSFRNTEVsZW1lbnQ7XG5jb25zdCByZWxCYXJGaWxsICAgICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicmVsLWJhci1maWxsXCIpIGFzIEhUTUxFbGVtZW50O1xuY29uc3QgcmVsU2NvcmUgICAgICAgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJlbC1zY29yZVwiKSBhcyBIVE1MRWxlbWVudDtcbmNvbnN0IGNvbnRleHRCYWRnZSAgICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb250ZXh0LWJhZGdlXCIpIGFzIEhUTUxFbGVtZW50O1xuY29uc3QgY29udGV4dEJhZGdlVGV4dCAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvbnRleHQtYmFkZ2UtdGV4dFwiKSBhcyBIVE1MRWxlbWVudDtcbmNvbnN0IGNvbnRleHRCYWRnZUNsZWFyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb250ZXh0LWJhZGdlLWNsZWFyXCIpIGFzIEhUTUxFbGVtZW50O1xuY29uc3QgYWN0aXZpdHlTdGF0dXMgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFjdGl2aXR5LXN0YXR1c1wiKSBhcyBIVE1MRWxlbWVudDtcbmNvbnN0IGFjdGl2aXR5VGV4dCAgICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhY3Rpdml0eS10ZXh0XCIpIGFzIEhUTUxFbGVtZW50O1xuY29uc3QgYnRuU2hvd0ZlZWQgICAgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bi1zaG93LWZlZWRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBhY3Rpdml0eUZlZWQgICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYWN0aXZpdHktZmVlZFwiKSBhcyBIVE1MRWxlbWVudDtcbmNvbnN0IGFjdGl2aXR5RmVlZExpc3QgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhY3Rpdml0eS1mZWVkLWxpc3RcIikgYXMgSFRNTEVsZW1lbnQ7XG5jb25zdCBidG5IaWRlRmVlZCAgICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuLWhpZGUtZmVlZFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcbmNvbnN0IGNoYXRNZXNzYWdlcyAgICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjaGF0LW1lc3NhZ2VzXCIpIGFzIEhUTUxFbGVtZW50O1xuY29uc3QgdHlwaW5nSW5kaWNhdG9yICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInR5cGluZy1pbmRpY2F0b3JcIikgYXMgSFRNTEVsZW1lbnQ7XG5jb25zdCBtb2RlU2VsZWN0b3IgICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibW9kZS1zZWxlY3RvclwiKSBhcyBIVE1MRWxlbWVudDtcbmNvbnN0IGJ0blN1Z2dlc3QgICAgICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG4tc3VnZ2VzdFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcbmNvbnN0IGlucHV0TWVzc2FnZSAgICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJpbnB1dC1tZXNzYWdlXCIpIGFzIEhUTUxUZXh0QXJlYUVsZW1lbnQ7XG5jb25zdCBidG5TZW5kICAgICAgICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuLXNlbmRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCB0b2dnbGVDb250ZXh0ICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidG9nZ2xlLWNvbnRleHRcIikgYXMgSFRNTElucHV0RWxlbWVudDtcbmNvbnN0IGJ0bkNsZWFySGlzdG9yeSAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG4tY2xlYXItaGlzdG9yeVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFN0YXRlIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5sZXQgYWN0aXZlQ2hhcmFjdGVyOiBTYXZlZENoYXJhY3RlciB8IG51bGwgPSBudWxsO1xubGV0IGNoYXRIaXN0b3J5OiBDaGF0SGlzdG9yeSB8IG51bGwgPSBudWxsO1xubGV0IGN1cnJlbnRNb2RlOiBJbnRlcmFjdGlvbk1vZGUgPSBcImJlZnJpZW5kXCI7XG5sZXQgcGVuZGluZ0NvbnRleHRRdWVyeTogeyBzZWxlY3RlZFRleHQ6IHN0cmluZzsgc291cmNlVXJsOiBzdHJpbmc7IHNvdXJjZVRpdGxlOiBzdHJpbmcgfSB8IG51bGwgPSBudWxsO1xubGV0IGN1cnJlbnRUYWI6IHsgdXJsOiBzdHJpbmc7IHRpdGxlOiBzdHJpbmcgfSB8IG51bGwgPSBudWxsO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgSW5pdCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuYXN5bmMgZnVuY3Rpb24gaW5pdCgpIHtcbiAgY29uc3QgY2hhcmFjdGVyID0gYXdhaXQgZ2V0QWN0aXZlQ2hhcmFjdGVyKCk7XG5cbiAgLy8gR2V0IHRoZSBjdXJyZW50IGFjdGl2ZSB0YWIgZm9yIGNvbnRleHRcbiAgY29uc3QgdGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHsgYWN0aXZlOiB0cnVlLCBjdXJyZW50V2luZG93OiB0cnVlIH0pLmNhdGNoKCgpID0+IFtdKTtcbiAgaWYgKHRhYnNbMF0/LnVybCAmJiB0YWJzWzBdPy50aXRsZSkge1xuICAgIGN1cnJlbnRUYWIgPSB7IHVybDogdGFic1swXS51cmwsIHRpdGxlOiB0YWJzWzBdLnRpdGxlIH07XG4gICAgaWYgKHRhYnNbMF0udXJsLnN0YXJ0c1dpdGgoXCJodHRwOi8vXCIpIHx8IHRhYnNbMF0udXJsLnN0YXJ0c1dpdGgoXCJodHRwczovL1wiKSkge1xuICAgICAgc2hvd0FjdGl2aXR5QmFyKHRhYnNbMF0udGl0bGUpO1xuICAgIH1cbiAgfVxuXG4gIGlmICghY2hhcmFjdGVyKSB7XG4gICAgc2hvd1NjcmVlbihcImVtcHR5XCIpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGF3YWl0IGxvYWRDaGFyYWN0ZXIoY2hhcmFjdGVyKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbG9hZENoYXJhY3RlcihjaGFyYWN0ZXI6IFNhdmVkQ2hhcmFjdGVyKSB7XG4gIGFjdGl2ZUNoYXJhY3RlciA9IGNoYXJhY3RlcjtcblxuICBjb25zdCBoaXN0b3J5ID0gYXdhaXQgZ2V0Q2hhdEhpc3RvcnkoY2hhcmFjdGVyLmlkKTtcbiAgY2hhdEhpc3RvcnkgPSBoaXN0b3J5ID8/IHtcbiAgICBjaGFyYWN0ZXJJZDogY2hhcmFjdGVyLmlkLFxuICAgIG1lc3NhZ2VzOiBbXSxcbiAgICByZWxhdGlvbnNoaXBTY29yZTogY2hhcmFjdGVyLnJlbGF0aW9uc2hpcFNjb3JlLFxuICAgIGVtb3Rpb25hbFN0YXRlOiBjaGFyYWN0ZXIuZW1vdGlvbmFsU3RhdGUsXG4gIH07XG5cbiAgcmVuZGVySGVhZGVyKGNoYXJhY3Rlcik7XG4gIHJlbmRlckhpc3RvcnkoY2hhdEhpc3RvcnkpO1xuICBzaG93U2NyZWVuKFwiY2hhdFwiKTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFNjcmVlbiBtYW5hZ2VtZW50IFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5mdW5jdGlvbiBzaG93U2NyZWVuKHNjcmVlbjogXCJlbXB0eVwiIHwgXCJjaGF0XCIpIHtcbiAgc2NyZWVuRW1wdHkuY2xhc3NMaXN0LnRvZ2dsZShcImhpZGRlblwiLCBzY3JlZW4gIT09IFwiZW1wdHlcIik7XG4gIHNjcmVlbkNoYXQuY2xhc3NMaXN0LnRvZ2dsZShcImhpZGRlblwiLCBzY3JlZW4gIT09IFwiY2hhdFwiKTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEhlYWRlciByZW5kZXJpbmcgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmZ1bmN0aW9uIHJlbmRlckhlYWRlcihjaGFyYWN0ZXI6IFNhdmVkQ2hhcmFjdGVyKSB7XG4gIGNvbnN0IHRoZW1lID0gZ2V0UG9ydHJhaXRUaGVtZShjaGFyYWN0ZXIucGVyc29uYWxpdHkpO1xuICBjaGFyUG9ydHJhaXQuc3R5bGUuYmFja2dyb3VuZCA9IHRoZW1lLmdyYWRpZW50O1xuICBpZiAoY2hhcmFjdGVyLnBvcnRyYWl0VXJsKSB7XG4gICAgY2hhclBvcnRyYWl0LmlubmVySFRNTCA9IGA8aW1nIHNyYz1cIiR7ZXNjYXBlSHRtbChjaGFyYWN0ZXIucG9ydHJhaXRVcmwpfVwiIGFsdD1cIiR7ZXNjYXBlSHRtbChjaGFyYWN0ZXIubmFtZSl9XCIgLz5gO1xuICB9IGVsc2Uge1xuICAgIGNoYXJQb3J0cmFpdC5pbm5lckhUTUwgPSB0aGVtZS5lbW9qaTtcbiAgICBjaGFyUG9ydHJhaXQuc3R5bGUuZm9udFNpemUgPSBcIjI0cHhcIjtcbiAgfVxuXG4gIGNoYXJOYW1lLnRleHRDb250ZW50ID0gY2hhcmFjdGVyLm5hbWU7XG4gIGNoYXJMYWJlbC50ZXh0Q29udGVudCA9IGNoYXJhY3Rlci5vYmplY3RMYWJlbDtcbiAgY2hhclN0YXRlLnRleHRDb250ZW50ID0gY2hhcmFjdGVyLmVtb3Rpb25hbFN0YXRlLnRvVXBwZXJDYXNlKCk7XG4gIHVwZGF0ZVJlbEJhcihjaGFyYWN0ZXIucmVsYXRpb25zaGlwU2NvcmUpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVSZWxCYXIoc2NvcmU6IG51bWJlcikge1xuICBjb25zdCB7IGxhYmVsLCBjb2xvciB9ID0gZ2V0UmVsTWV0YShzY29yZSk7XG4gIGNvbnN0IHBjdCA9ICgoc2NvcmUgKyAxMDApIC8gMjAwKSAqIDEwMDtcblxuICByZWxMYWJlbC50ZXh0Q29udGVudCA9IGxhYmVsO1xuICByZWxMYWJlbC5zdHlsZS5jb2xvciA9IGNvbG9yO1xuICByZWxCYXJGaWxsLnN0eWxlLndpZHRoID0gYCR7cGN0fSVgO1xuICByZWxCYXJGaWxsLnN0eWxlLmJhY2tncm91bmQgPSBjb2xvcjtcbiAgcmVsU2NvcmUudGV4dENvbnRlbnQgPSAoc2NvcmUgPiAwID8gXCIrXCIgOiBcIlwiKSArIHNjb3JlO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVFbW90aW9uYWxTdGF0ZShzdGF0ZTogc3RyaW5nKSB7XG4gIGNoYXJTdGF0ZS50ZXh0Q29udGVudCA9IHN0YXRlLnRvVXBwZXJDYXNlKCk7XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBBY3Rpdml0eSBiYXIgKyBmZWVkIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5mdW5jdGlvbiBzaG93QWN0aXZpdHlCYXIodGl0bGU6IHN0cmluZykge1xuICBhY3Rpdml0eVRleHQudGV4dENvbnRlbnQgPSB0aXRsZTtcbiAgYWN0aXZpdHlTdGF0dXMuY2xhc3NMaXN0LnJlbW92ZShcImhpZGRlblwiKTtcbn1cblxuZnVuY3Rpb24gaGlkZUFjdGl2aXR5QmFyKCkge1xuICBhY3Rpdml0eVN0YXR1cy5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICBhY3Rpdml0eUZlZWQuY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVuZGVyQWN0aXZpdHlGZWVkKCkge1xuICBjb25zdCBlbnRyaWVzID0gYXdhaXQgZ2V0QWN0aXZpdHkoKTtcbiAgYWN0aXZpdHlGZWVkTGlzdC5pbm5lckhUTUwgPSBcIlwiO1xuXG4gIGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIGFjdGl2aXR5RmVlZExpc3QuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9XCJhY3Rpdml0eS1lbXB0eVwiPk5vIGFjdGl2aXR5IGxvZ2dlZCB5ZXQuIEJyb3dzZSBzb21lIHBhZ2VzIGZpcnN0LjwvZGl2PmA7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gU2hvdyBtb3N0IHJlY2VudCBmaXJzdCwgY2FwIGF0IDIwIGVudHJpZXNcbiAgY29uc3QgcmVjZW50ID0gWy4uLmVudHJpZXNdLnJldmVyc2UoKS5zbGljZSgwLCAyMCk7XG4gIGZvciAoY29uc3QgZW50cnkgb2YgcmVjZW50KSB7XG4gICAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGVsLmNsYXNzTmFtZSA9IFwiYWN0aXZpdHktZW50cnlcIjtcblxuICAgIGNvbnN0IG1pbnMgPSBNYXRoLnJvdW5kKGVudHJ5LnRpbWVTcGVudE1zIC8gNjAwMDApO1xuICAgIGNvbnN0IHRpbWVTdHIgPSBtaW5zID4gMCA/IGAke21pbnN9bWAgOiBcIjwxbVwiO1xuICAgIGNvbnN0IHJlbFRpbWUgPSBmb3JtYXRSZWxhdGl2ZVRpbWUoZW50cnkudGltZXN0YW1wKTtcblxuICAgIGVsLmlubmVySFRNTCA9IGBcbiAgICAgIDxzcGFuIGNsYXNzPVwiYWN0aXZpdHktZW50cnktZG9tYWluXCI+JHtlc2NhcGVIdG1sKGVudHJ5LmRvbWFpbil9PC9zcGFuPlxuICAgICAgPHNwYW4gY2xhc3M9XCJhY3Rpdml0eS1lbnRyeS10aXRsZVwiIHRpdGxlPVwiJHtlc2NhcGVIdG1sKGVudHJ5LnRpdGxlKX1cIj4ke2VzY2FwZUh0bWwoZW50cnkudGl0bGUpfTwvc3Bhbj5cbiAgICAgIDxzcGFuIGNsYXNzPVwiYWN0aXZpdHktZW50cnktdGltZVwiPiR7dGltZVN0cn0gXHUwMEI3ICR7cmVsVGltZX08L3NwYW4+XG4gICAgYDtcbiAgICBhY3Rpdml0eUZlZWRMaXN0LmFwcGVuZENoaWxkKGVsKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBmb3JtYXRSZWxhdGl2ZVRpbWUodHM6IG51bWJlcik6IHN0cmluZyB7XG4gIGNvbnN0IGRpZmZNcyA9IERhdGUubm93KCkgLSB0cztcbiAgY29uc3QgZGlmZk1pbiA9IE1hdGguZmxvb3IoZGlmZk1zIC8gNjAwMDApO1xuICBpZiAoZGlmZk1pbiA8IDEpIHJldHVybiBcImp1c3Qgbm93XCI7XG4gIGlmIChkaWZmTWluIDwgNjApIHJldHVybiBgJHtkaWZmTWlufW0gYWdvYDtcbiAgY29uc3QgZGlmZkhyID0gTWF0aC5mbG9vcihkaWZmTWluIC8gNjApO1xuICBpZiAoZGlmZkhyIDwgMjQpIHJldHVybiBgJHtkaWZmSHJ9aCBhZ29gO1xuICByZXR1cm4gYCR7TWF0aC5mbG9vcihkaWZmSHIgLyAyNCl9ZCBhZ29gO1xufVxuXG5idG5TaG93RmVlZC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBhd2FpdCByZW5kZXJBY3Rpdml0eUZlZWQoKTtcbiAgYWN0aXZpdHlGZWVkLmNsYXNzTGlzdC5yZW1vdmUoXCJoaWRkZW5cIik7XG59KTtcblxuYnRuSGlkZUZlZWQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgYWN0aXZpdHlGZWVkLmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG59KTtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIENvbnRleHQgYmFkZ2UgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmZ1bmN0aW9uIHNob3dDb250ZXh0QmFkZ2UodGV4dDogc3RyaW5nKSB7XG4gIGNvbnRleHRCYWRnZVRleHQudGV4dENvbnRlbnQgPSB0ZXh0O1xuICBjb250ZXh0QmFkZ2UuY2xhc3NMaXN0LnJlbW92ZShcImhpZGRlblwiKTtcbn1cblxuZnVuY3Rpb24gaGlkZUNvbnRleHRCYWRnZSgpIHtcbiAgY29udGV4dEJhZGdlLmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gIHBlbmRpbmdDb250ZXh0UXVlcnkgPSBudWxsO1xufVxuXG5jb250ZXh0QmFkZ2VDbGVhci5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgaGlkZUNvbnRleHRCYWRnZSk7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBDaGF0IHJlbmRlcmluZyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuZnVuY3Rpb24gcmVuZGVySGlzdG9yeShoaXN0b3J5OiBDaGF0SGlzdG9yeSkge1xuICBjaGF0TWVzc2FnZXMuaW5uZXJIVE1MID0gXCJcIjtcbiAgZm9yIChjb25zdCBtc2cgb2YgaGlzdG9yeS5tZXNzYWdlcykge1xuICAgIGFwcGVuZE1lc3NhZ2VUb0RPTShtc2csIGZhbHNlKTtcbiAgfVxuICBzY3JvbGxUb0JvdHRvbSgpO1xufVxuXG5mdW5jdGlvbiBhcHBlbmRNZXNzYWdlVG9ET00obXNnOiBDaGF0TWVzc2FnZSwgYW5pbWF0ZSA9IHRydWUpIHtcbiAgY29uc3QgZWwgPSBidWlsZE1lc3NhZ2VFbChtc2csIGFuaW1hdGUpO1xuICBjaGF0TWVzc2FnZXMuYXBwZW5kQ2hpbGQoZWwpO1xufVxuXG5mdW5jdGlvbiBidWlsZE1lc3NhZ2VFbChtc2c6IENoYXRNZXNzYWdlLCBfYW5pbWF0ZTogYm9vbGVhbik6IEhUTUxFbGVtZW50IHtcbiAgY29uc3Qgd3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHdyYXBwZXIuY2xhc3NOYW1lID0gYG1zZyBtc2ctJHttc2cucm9sZX1gO1xuICB3cmFwcGVyLmRhdGFzZXQuaWQgPSBtc2cuaWQ7XG5cbiAgY29uc3QgYnViYmxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYnViYmxlLmNsYXNzTmFtZSA9IFwibXNnLWJ1YmJsZVwiO1xuICBidWJibGUudGV4dENvbnRlbnQgPSBtc2cudGV4dDtcbiAgd3JhcHBlci5hcHBlbmRDaGlsZChidWJibGUpO1xuXG4gIGlmIChtc2cucm9sZSAhPT0gXCJzeXN0ZW1cIikge1xuICAgIGNvbnN0IG1ldGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIG1ldGEuY2xhc3NOYW1lID0gXCJtc2ctbWV0YVwiO1xuXG4gICAgY29uc3QgdGltZSA9IG5ldyBEYXRlKG1zZy50aW1lc3RhbXApLnRvTG9jYWxlVGltZVN0cmluZyhbXSwgeyBob3VyOiBcIjItZGlnaXRcIiwgbWludXRlOiBcIjItZGlnaXRcIiB9KTtcbiAgICBtZXRhLmFwcGVuZENoaWxkKE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIiksIHsgdGV4dENvbnRlbnQ6IHRpbWUgfSkpO1xuXG4gICAgaWYgKG1zZy5pbnRlcmFjdGlvbk1vZGUpIHtcbiAgICAgIGNvbnN0IHRhZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICAgICAgdGFnLmNsYXNzTmFtZSA9IFwibXNnLW1vZGUtdGFnXCI7XG4gICAgICB0YWcudGV4dENvbnRlbnQgPSBtc2cuaW50ZXJhY3Rpb25Nb2RlLnRvVXBwZXJDYXNlKCk7XG4gICAgICBtZXRhLmFwcGVuZENoaWxkKHRhZyk7XG4gICAgfVxuXG4gICAgaWYgKG1zZy5yZWxhdGlvbnNoaXBEZWx0YSAhPT0gdW5kZWZpbmVkICYmIG1zZy5yZWxhdGlvbnNoaXBEZWx0YSAhPT0gMCkge1xuICAgICAgY29uc3QgZGVsdGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICAgIGNvbnN0IHNpZ24gPSBtc2cucmVsYXRpb25zaGlwRGVsdGEgPiAwID8gXCIrXCIgOiBcIlwiO1xuICAgICAgZGVsdGEuY2xhc3NOYW1lID0gYHJlbC1kZWx0YSAke21zZy5yZWxhdGlvbnNoaXBEZWx0YSA+IDAgPyBcInBvc1wiIDogXCJuZWdcIn1gO1xuICAgICAgZGVsdGEudGV4dENvbnRlbnQgPSBgJHtzaWdufSR7bXNnLnJlbGF0aW9uc2hpcERlbHRhfWA7XG4gICAgICBtZXRhLmFwcGVuZENoaWxkKGRlbHRhKTtcbiAgICB9XG5cbiAgICB3cmFwcGVyLmFwcGVuZENoaWxkKG1ldGEpO1xuICB9XG5cbiAgcmV0dXJuIHdyYXBwZXI7XG59XG5cbi8qKlxuICogVHlwZXdyaXRlciBlZmZlY3QgZm9yIGluY29taW5nIGNoYXJhY3RlciBtZXNzYWdlcy5cbiAqIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiB0eXBpbmcgY29tcGxldGVzLlxuICovXG5hc3luYyBmdW5jdGlvbiB0eXBld3JpdGVyQXBwZW5kKHRleHQ6IHN0cmluZywgbXNnSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCB3cmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgd3JhcHBlci5jbGFzc05hbWUgPSBcIm1zZyBtc2ctY2hhcmFjdGVyXCI7XG4gIHdyYXBwZXIuZGF0YXNldC5pZCA9IG1zZ0lkO1xuXG4gIGNvbnN0IGJ1YmJsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGJ1YmJsZS5jbGFzc05hbWUgPSBcIm1zZy1idWJibGVcIjtcblxuICBjb25zdCBjdXJzb3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgY3Vyc29yLmNsYXNzTmFtZSA9IFwiY3Vyc29yXCI7XG4gIGJ1YmJsZS5hcHBlbmRDaGlsZChjdXJzb3IpO1xuICB3cmFwcGVyLmFwcGVuZENoaWxkKGJ1YmJsZSk7XG4gIGNoYXRNZXNzYWdlcy5hcHBlbmRDaGlsZCh3cmFwcGVyKTtcbiAgc2Nyb2xsVG9Cb3R0b20oKTtcblxuICBjb25zdCBDSEFSX0RFTEFZX01TID0gMTg7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuICAgIGJ1YmJsZS5pbnNlcnRCZWZvcmUoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodGV4dFtpXSksIGN1cnNvcik7XG4gICAgaWYgKGkgJSAzID09PSAwKSBzY3JvbGxUb0JvdHRvbSgpOyAvLyBrZWVwIHNjcm9sbCBpbiBzeW5jIGR1cmluZyB0eXBpbmdcbiAgICBhd2FpdCBzbGVlcChDSEFSX0RFTEFZX01TKTtcbiAgfVxuXG4gIGN1cnNvci5yZW1vdmUoKTtcbiAgcmV0dXJuO1xufVxuXG5mdW5jdGlvbiBzbGVlcChtczogbnVtYmVyKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocikgPT4gc2V0VGltZW91dChyLCBtcykpO1xufVxuXG5mdW5jdGlvbiBzY3JvbGxUb0JvdHRvbSgpIHtcbiAgY2hhdE1lc3NhZ2VzLnNjcm9sbFRvcCA9IGNoYXRNZXNzYWdlcy5zY3JvbGxIZWlnaHQ7XG59XG5cbmZ1bmN0aW9uIGVzY2FwZUh0bWwodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHRleHRcbiAgICAucmVwbGFjZSgvJi9nLCBcIiZhbXA7XCIpXG4gICAgLnJlcGxhY2UoLzwvZywgXCImbHQ7XCIpXG4gICAgLnJlcGxhY2UoLz4vZywgXCImZ3Q7XCIpXG4gICAgLnJlcGxhY2UoL1wiL2csIFwiJnF1b3Q7XCIpO1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgTW9kZSBzZWxlY3RvciBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxubW9kZVNlbGVjdG9yLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEJ1dHRvbkVsZW1lbnQ+KFwiLm1vZGUtYnRuXCIpLmZvckVhY2goKGJ0bikgPT4ge1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBtb2RlU2VsZWN0b3IucXVlcnlTZWxlY3RvckFsbChcIi5tb2RlLWJ0blwiKS5mb3JFYWNoKChiKSA9PiBiLmNsYXNzTGlzdC5yZW1vdmUoXCJhY3RpdmVcIikpO1xuICAgIGJ0bi5jbGFzc0xpc3QuYWRkKFwiYWN0aXZlXCIpO1xuICAgIGN1cnJlbnRNb2RlID0gYnRuLmRhdGFzZXQubW9kZSBhcyBJbnRlcmFjdGlvbk1vZGU7XG4gIH0pO1xufSk7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBCdWlsZCBicm93c2VyIGNvbnRleHQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmFzeW5jIGZ1bmN0aW9uIGJ1aWxkQnJvd3NlckNvbnRleHQoc2VsZWN0ZWRUZXh0Pzogc3RyaW5nKTogUHJvbWlzZTxCcm93c2VyQ29udGV4dCB8IHVuZGVmaW5lZD4ge1xuICBpZiAoIXRvZ2dsZUNvbnRleHQuY2hlY2tlZCkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICBjb25zdCBzZXR0aW5ncyA9IGF3YWl0IGdldFNldHRpbmdzKCk7XG4gIGlmICghc2V0dGluZ3MudHJhY2tBY3Rpdml0eSkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICBjb25zdCBhY3Rpdml0eSA9IGF3YWl0IGdldEFjdGl2aXR5KCk7XG4gIGNvbnN0IGRpZ2VzdCA9IGJ1aWxkQWN0aXZpdHlEaWdlc3QoYWN0aXZpdHkpO1xuXG4gIGNvbnN0IHRhYiA9IGN1cnJlbnRUYWI7XG5cbiAgaWYgKCF0YWI/LnVybCkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICB0cnkge1xuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwodGFiLnVybCk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGN1cnJlbnRVcmw6IHRhYi51cmwsXG4gICAgICBjdXJyZW50VGl0bGU6IHRhYi50aXRsZSxcbiAgICAgIGN1cnJlbnREb21haW46IHVybC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIiksXG4gICAgICBhY3Rpdml0eURpZ2VzdDogZGlnZXN0LFxuICAgICAgLi4uKHNlbGVjdGVkVGV4dCA/IHsgc2VsZWN0ZWRUZXh0IH0gOiB7fSksXG4gICAgfTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgU2VuZCBtZXNzYWdlIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5hc3luYyBmdW5jdGlvbiBzZW5kTWVzc2FnZSh0ZXh0OiBzdHJpbmcpIHtcbiAgaWYgKCFhY3RpdmVDaGFyYWN0ZXIgfHwgIWNoYXRIaXN0b3J5KSByZXR1cm47XG5cbiAgY29uc3QgdHJpbW1lZCA9IHRleHQudHJpbSgpO1xuICBpZiAoIXRyaW1tZWQpIHJldHVybjtcblxuICBpbnB1dE1lc3NhZ2UudmFsdWUgPSBcIlwiO1xuICBidG5TZW5kLmRpc2FibGVkID0gdHJ1ZTtcbiAgYnRuU3VnZ2VzdC5kaXNhYmxlZCA9IHRydWU7XG5cbiAgLy8gQnVpbGQgdXNlciBtZXNzYWdlXG4gIGNvbnN0IHVzZXJNc2c6IENoYXRNZXNzYWdlID0ge1xuICAgIGlkOiBgbXNnXyR7RGF0ZS5ub3coKX1fdXNlcmAsXG4gICAgcm9sZTogXCJ1c2VyXCIsXG4gICAgdGV4dDogdHJpbW1lZCxcbiAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgaW50ZXJhY3Rpb25Nb2RlOiBjdXJyZW50TW9kZSxcbiAgfTtcblxuICBjaGF0SGlzdG9yeS5tZXNzYWdlcy5wdXNoKHVzZXJNc2cpO1xuICBhcHBlbmRNZXNzYWdlVG9ET00odXNlck1zZyk7XG4gIHNjcm9sbFRvQm90dG9tKCk7XG5cbiAgLy8gU2hvdyB0eXBpbmcgaW5kaWNhdG9yXG4gIHR5cGluZ0luZGljYXRvci5jbGFzc0xpc3QucmVtb3ZlKFwiaGlkZGVuXCIpO1xuXG4gIHRyeSB7XG4gICAgY29uc3Qgc2VsZWN0ZWRUZXh0ID0gcGVuZGluZ0NvbnRleHRRdWVyeT8uc2VsZWN0ZWRUZXh0O1xuICAgIGNvbnN0IGJyb3dzZXJDdHggPSBhd2FpdCBidWlsZEJyb3dzZXJDb250ZXh0KHNlbGVjdGVkVGV4dCk7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCByZWNhbGxDaGF0KGFjdGl2ZUNoYXJhY3RlciwgY3VycmVudE1vZGUsIHRyaW1tZWQsIGJyb3dzZXJDdHgpO1xuXG4gICAgLy8gSGlkZSB0eXBpbmcgaW5kaWNhdG9yIGJlZm9yZSB0eXBld3JpdGVyXG4gICAgdHlwaW5nSW5kaWNhdG9yLmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG5cbiAgICBjb25zdCBjaGFyTXNnSWQgPSBgbXNnXyR7RGF0ZS5ub3coKX1fY2hhcmA7XG5cbiAgICAvLyBUeXBld3JpdGVyIHJlbmRlclxuICAgIGF3YWl0IHR5cGV3cml0ZXJBcHBlbmQocmVzdWx0LnJlc3BvbnNlLCBjaGFyTXNnSWQpO1xuXG4gICAgY29uc3QgY2hhck1zZzogQ2hhdE1lc3NhZ2UgPSB7XG4gICAgICBpZDogY2hhck1zZ0lkLFxuICAgICAgcm9sZTogXCJjaGFyYWN0ZXJcIixcbiAgICAgIHRleHQ6IHJlc3VsdC5yZXNwb25zZSxcbiAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgIHJlbGF0aW9uc2hpcERlbHRhOiByZXN1bHQucmVsYXRpb25zaGlwRGVsdGEsXG4gICAgICBpbnRlcmFjdGlvbk1vZGU6IGN1cnJlbnRNb2RlLFxuICAgIH07XG5cbiAgICAvLyBBcHBlbmQgbWV0YSByb3cgdG8gdGhlIGV4aXN0aW5nIHR5cGVkIGJ1YmJsZVxuICAgIGNvbnN0IHdyYXBwZXIgPSBjaGF0TWVzc2FnZXMucXVlcnlTZWxlY3RvcihgW2RhdGEtaWQ9XCIke2NoYXJNc2dJZH1cIl1gKTtcbiAgICBpZiAod3JhcHBlcikge1xuICAgICAgY29uc3QgbWV0YSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICBtZXRhLmNsYXNzTmFtZSA9IFwibXNnLW1ldGFcIjtcbiAgICAgIGNvbnN0IHRpbWUgPSBuZXcgRGF0ZShjaGFyTXNnLnRpbWVzdGFtcCkudG9Mb2NhbGVUaW1lU3RyaW5nKFtdLCB7IGhvdXI6IFwiMi1kaWdpdFwiLCBtaW51dGU6IFwiMi1kaWdpdFwiIH0pO1xuICAgICAgbWV0YS5hcHBlbmRDaGlsZChPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpLCB7IHRleHRDb250ZW50OiB0aW1lIH0pKTtcblxuICAgICAgaWYgKHJlc3VsdC5yZWxhdGlvbnNoaXBEZWx0YSAhPT0gMCkge1xuICAgICAgICBjb25zdCBzaWduID0gcmVzdWx0LnJlbGF0aW9uc2hpcERlbHRhID4gMCA/IFwiK1wiIDogXCJcIjtcbiAgICAgICAgY29uc3QgZGVsdGEgPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpLCB7XG4gICAgICAgICAgY2xhc3NOYW1lOiBgcmVsLWRlbHRhICR7cmVzdWx0LnJlbGF0aW9uc2hpcERlbHRhID4gMCA/IFwicG9zXCIgOiBcIm5lZ1wifWAsXG4gICAgICAgICAgdGV4dENvbnRlbnQ6IGAke3NpZ259JHtyZXN1bHQucmVsYXRpb25zaGlwRGVsdGF9YCxcbiAgICAgICAgfSk7XG4gICAgICAgIG1ldGEuYXBwZW5kQ2hpbGQoZGVsdGEpO1xuICAgICAgfVxuICAgICAgd3JhcHBlci5hcHBlbmRDaGlsZChtZXRhKTtcbiAgICB9XG5cbiAgICBjaGF0SGlzdG9yeS5tZXNzYWdlcy5wdXNoKGNoYXJNc2cpO1xuXG4gICAgLy8gVXBkYXRlIGxvY2FsIHN0YXRlIHdpdGggbmV3IHJlbGF0aW9uc2hpcC9lbW90aW9uYWwgc3RhdGVcbiAgICBjaGF0SGlzdG9yeS5yZWxhdGlvbnNoaXBTY29yZSA9IHJlc3VsdC5uZXdSZWxhdGlvbnNoaXBUb1VzZXI7XG4gICAgY2hhdEhpc3RvcnkuZW1vdGlvbmFsU3RhdGUgPSByZXN1bHQuZW1vdGlvbmFsU3RhdGVVcGRhdGU7XG5cbiAgICAvLyBVcGRhdGUgY2hhcmFjdGVyIGluIHN0b3JhZ2VcbiAgICBjb25zdCB1cGRhdGVkQ2hhcmFjdGVyOiBTYXZlZENoYXJhY3RlciA9IHtcbiAgICAgIC4uLmFjdGl2ZUNoYXJhY3RlcixcbiAgICAgIHJlbGF0aW9uc2hpcFNjb3JlOiByZXN1bHQubmV3UmVsYXRpb25zaGlwVG9Vc2VyLFxuICAgICAgZW1vdGlvbmFsU3RhdGU6IHJlc3VsdC5lbW90aW9uYWxTdGF0ZVVwZGF0ZSxcbiAgICAgIGludGVyYWN0aW9uQ291bnQ6IGFjdGl2ZUNoYXJhY3Rlci5pbnRlcmFjdGlvbkNvdW50ICsgMSxcbiAgICB9O1xuICAgIGFjdGl2ZUNoYXJhY3RlciA9IHVwZGF0ZWRDaGFyYWN0ZXI7XG4gICAgYXdhaXQgdXBkYXRlQ2hhcmFjdGVyKHVwZGF0ZWRDaGFyYWN0ZXIpO1xuXG4gICAgLy8gVXBkYXRlIGhlYWRlclxuICAgIHVwZGF0ZVJlbEJhcihyZXN1bHQubmV3UmVsYXRpb25zaGlwVG9Vc2VyKTtcbiAgICB1cGRhdGVFbW90aW9uYWxTdGF0ZShyZXN1bHQuZW1vdGlvbmFsU3RhdGVVcGRhdGUpO1xuXG4gICAgLy8gQ2xlYXIgY29udGV4dCBiYWRnZSBhZnRlciBpdCdzIGJlZW4gdXNlZFxuICAgIGlmIChwZW5kaW5nQ29udGV4dFF1ZXJ5KSBoaWRlQ29udGV4dEJhZGdlKCk7XG5cbiAgICAvLyBQZXJzaXN0IGhpc3RvcnlcbiAgICBhd2FpdCBzYXZlQ2hhdEhpc3RvcnkoY2hhdEhpc3RvcnkpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICB0eXBpbmdJbmRpY2F0b3IuY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcblxuICAgIGNvbnN0IGVyck1zZzogQ2hhdE1lc3NhZ2UgPSB7XG4gICAgICBpZDogYG1zZ18ke0RhdGUubm93KCl9X3N5c2AsXG4gICAgICByb2xlOiBcInN5c3RlbVwiLFxuICAgICAgdGV4dDogYENvbm5lY3Rpb24gZXJyb3I6ICR7U3RyaW5nKGVycil9LiBDaGVjayB0aGUgQVBJIFVSTCBpbiBzZXR0aW5ncy5gLFxuICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgIH07XG4gICAgY2hhdEhpc3RvcnkubWVzc2FnZXMucHVzaChlcnJNc2cpO1xuICAgIGFwcGVuZE1lc3NhZ2VUb0RPTShlcnJNc2cpO1xuICAgIHNjcm9sbFRvQm90dG9tKCk7XG4gICAgYXdhaXQgc2F2ZUNoYXRIaXN0b3J5KGNoYXRIaXN0b3J5KTtcbiAgfSBmaW5hbGx5IHtcbiAgICBidG5TZW5kLmRpc2FibGVkID0gZmFsc2U7XG4gICAgYnRuU3VnZ2VzdC5kaXNhYmxlZCA9IGZhbHNlO1xuICAgIGlucHV0TWVzc2FnZS5mb2N1cygpO1xuICB9XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBTZW5kIGJ1dHRvbiAvIEVudGVyIGtleSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuYnRuU2VuZC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICBzZW5kTWVzc2FnZShpbnB1dE1lc3NhZ2UudmFsdWUpO1xufSk7XG5cbmlucHV0TWVzc2FnZS5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZSkgPT4ge1xuICBpZiAoZS5rZXkgPT09IFwiRW50ZXJcIiAmJiAhZS5zaGlmdEtleSkge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBzZW5kTWVzc2FnZShpbnB1dE1lc3NhZ2UudmFsdWUpO1xuICB9XG59KTtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFN1Z2dlc3QgYnV0dG9uIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5idG5TdWdnZXN0LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGlmICghYWN0aXZlQ2hhcmFjdGVyKSByZXR1cm47XG4gIGJ0blN1Z2dlc3QuZGlzYWJsZWQgPSB0cnVlO1xuICBidG5TdWdnZXN0LnRleHRDb250ZW50ID0gXCJcdTIwMjZcIjtcblxuICBjb25zdCBzdWdnZXN0aW9uID0gYXdhaXQgZmV0Y2hTdWdnZXN0aW9uKGN1cnJlbnRNb2RlLCBhY3RpdmVDaGFyYWN0ZXIubmFtZSwgYWN0aXZlQ2hhcmFjdGVyLnBlcnNvbmFsaXR5KTtcblxuICBidG5TdWdnZXN0LnRleHRDb250ZW50ID0gXCJcdTI3MjZcIjtcbiAgYnRuU3VnZ2VzdC5kaXNhYmxlZCA9IGZhbHNlO1xuXG4gIGlmIChzdWdnZXN0aW9uKSB7XG4gICAgaW5wdXRNZXNzYWdlLnZhbHVlID0gc3VnZ2VzdGlvbjtcbiAgICBpbnB1dE1lc3NhZ2UuZm9jdXMoKTtcbiAgfVxufSk7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBDbGVhciBoaXN0b3J5IFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5idG5DbGVhckhpc3RvcnkuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgaWYgKCFhY3RpdmVDaGFyYWN0ZXIpIHJldHVybjtcbiAgYXdhaXQgY2xlYXJDaGF0SGlzdG9yeShhY3RpdmVDaGFyYWN0ZXIuaWQpO1xuICBjaGF0SGlzdG9yeSA9IHtcbiAgICBjaGFyYWN0ZXJJZDogYWN0aXZlQ2hhcmFjdGVyLmlkLFxuICAgIG1lc3NhZ2VzOiBbXSxcbiAgICByZWxhdGlvbnNoaXBTY29yZTogYWN0aXZlQ2hhcmFjdGVyLnJlbGF0aW9uc2hpcFNjb3JlLFxuICAgIGVtb3Rpb25hbFN0YXRlOiBhY3RpdmVDaGFyYWN0ZXIuZW1vdGlvbmFsU3RhdGUsXG4gIH07XG4gIGNoYXRNZXNzYWdlcy5pbm5lckhUTUwgPSBcIlwiO1xufSk7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBSdW50aW1lIG1lc3NhZ2UgaGFuZGxpbmcgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5jaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKG1lc3NhZ2U6IGFueSkgPT4ge1xuICAvLyBDb250ZXh0IG1lbnU6IHVzZXIgc2VsZWN0ZWQgdGV4dCBvbiBhIHBhZ2UgYW5kIGFza2VkIHRoZSBjaGFyYWN0ZXIgYWJvdXQgaXRcbiAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gXCJDT05URVhUX01FTlVfUVVFUllcIikge1xuICAgIHBlbmRpbmdDb250ZXh0UXVlcnkgPSB7XG4gICAgICBzZWxlY3RlZFRleHQ6IG1lc3NhZ2Uuc2VsZWN0ZWRUZXh0LFxuICAgICAgc291cmNlVXJsOiBtZXNzYWdlLnNvdXJjZVVybCxcbiAgICAgIHNvdXJjZVRpdGxlOiBtZXNzYWdlLnNvdXJjZVRpdGxlLFxuICAgIH07XG5cbiAgICBjb25zdCBsYWJlbCA9IG1lc3NhZ2Uuc2VsZWN0ZWRUZXh0XG4gICAgICA/IGBcIiR7bWVzc2FnZS5zZWxlY3RlZFRleHQuc2xpY2UoMCwgNjApfSR7bWVzc2FnZS5zZWxlY3RlZFRleHQubGVuZ3RoID4gNjAgPyBcIlx1MjAyNlwiIDogXCJcIn1cImBcbiAgICAgIDogYEZyb206ICR7bWVzc2FnZS5zb3VyY2VUaXRsZX1gO1xuXG4gICAgc2hvd0NvbnRleHRCYWRnZShgQ29udGV4dDogJHtsYWJlbH1gKTtcblxuICAgIC8vIFByZS1maWxsIGEgbmF0dXJhbCBwcm9tcHQgZm9yIHRoZSB1c2VyXG4gICAgaWYgKG1lc3NhZ2Uuc2VsZWN0ZWRUZXh0KSB7XG4gICAgICBpbnB1dE1lc3NhZ2UudmFsdWUgPSBgV2hhdCBkbyB5b3UgdGhpbmsgYWJvdXQgdGhpcz8gXCIke21lc3NhZ2Uuc2VsZWN0ZWRUZXh0LnNsaWNlKDAsIDEyMCl9XCJgO1xuICAgIH1cbiAgICBpbnB1dE1lc3NhZ2UuZm9jdXMoKTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBQcm9hY3RpdmUgY29tbWVudCBmcm9tIGJhY2tncm91bmQgd29ya2VyXG4gIGlmIChtZXNzYWdlLnR5cGUgPT09IFwiUFJPQUNUSVZFX0NPTU1FTlRcIiAmJiBhY3RpdmVDaGFyYWN0ZXIgJiYgY2hhdEhpc3RvcnkpIHtcbiAgICBjb25zdCBwcm9hY3RpdmVNc2c6IENoYXRNZXNzYWdlID0ge1xuICAgICAgaWQ6IGBtc2dfJHtEYXRlLm5vdygpfV9jaGFyYCxcbiAgICAgIHJvbGU6IFwiY2hhcmFjdGVyXCIsXG4gICAgICB0ZXh0OiBtZXNzYWdlLnRleHQgYXMgc3RyaW5nLFxuICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgcmVsYXRpb25zaGlwRGVsdGE6IG1lc3NhZ2UucmVsYXRpb25zaGlwRGVsdGEgYXMgbnVtYmVyLFxuICAgIH07XG5cbiAgICBjaGF0SGlzdG9yeS5tZXNzYWdlcy5wdXNoKHByb2FjdGl2ZU1zZyk7XG4gICAgYXBwZW5kTWVzc2FnZVRvRE9NKHByb2FjdGl2ZU1zZyk7XG4gICAgc2Nyb2xsVG9Cb3R0b20oKTtcblxuICAgIGlmIChtZXNzYWdlLm5ld1JlbGF0aW9uc2hpcFNjb3JlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNoYXRIaXN0b3J5LnJlbGF0aW9uc2hpcFNjb3JlID0gbWVzc2FnZS5uZXdSZWxhdGlvbnNoaXBTY29yZSBhcyBudW1iZXI7XG4gICAgICB1cGRhdGVSZWxCYXIobWVzc2FnZS5uZXdSZWxhdGlvbnNoaXBTY29yZSBhcyBudW1iZXIpO1xuICAgIH1cbiAgICBpZiAobWVzc2FnZS5lbW90aW9uYWxTdGF0ZSkge1xuICAgICAgY2hhdEhpc3RvcnkuZW1vdGlvbmFsU3RhdGUgPSBtZXNzYWdlLmVtb3Rpb25hbFN0YXRlIGFzIHN0cmluZztcbiAgICAgIHVwZGF0ZUVtb3Rpb25hbFN0YXRlKG1lc3NhZ2UuZW1vdGlvbmFsU3RhdGUgYXMgc3RyaW5nKTtcbiAgICB9XG5cbiAgICBzYXZlQ2hhdEhpc3RvcnkoY2hhdEhpc3RvcnkpLmNhdGNoKCgpID0+IHt9KTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBUYWIgY2hhbmdlZDogdXBkYXRlIGFjdGl2aXR5IGJhciBhbmQgbGl2ZS1yZWZyZXNoIHRoZSBmZWVkIGlmIGl0J3Mgb3BlblxuICBpZiAobWVzc2FnZS50eXBlID09PSBcIlRBQl9DSEFOR0VEXCIpIHtcbiAgICBjb25zdCBlbnRyeSA9IG1lc3NhZ2UuZW50cnkgYXMgeyB1cmw6IHN0cmluZzsgdGl0bGU6IHN0cmluZyB9O1xuICAgIGlmIChlbnRyeT8udXJsICYmIGVudHJ5Py50aXRsZSkge1xuICAgICAgY3VycmVudFRhYiA9IHsgdXJsOiBlbnRyeS51cmwsIHRpdGxlOiBlbnRyeS50aXRsZSB9O1xuICAgICAgaWYgKGVudHJ5LnVybC5zdGFydHNXaXRoKFwiaHR0cDovL1wiKSB8fCBlbnRyeS51cmwuc3RhcnRzV2l0aChcImh0dHBzOi8vXCIpKSB7XG4gICAgICAgIHNob3dBY3Rpdml0eUJhcihlbnRyeS50aXRsZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBoaWRlQWN0aXZpdHlCYXIoKTtcbiAgICAgIH1cbiAgICAgIC8vIFJlZnJlc2ggdGhlIGZlZWQgaW4gdGhlIGJhY2tncm91bmQgaWYgaXQncyBjdXJyZW50bHkgdmlzaWJsZVxuICAgICAgaWYgKCFhY3Rpdml0eUZlZWQuY2xhc3NMaXN0LmNvbnRhaW5zKFwiaGlkZGVuXCIpKSB7XG4gICAgICAgIHJlbmRlckFjdGl2aXR5RmVlZCgpLmNhdGNoKCgpID0+IHt9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQWN0aXZlIGNoYXJhY3RlciBjaGFuZ2VkIGZyb20gcG9wdXBcbiAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gXCJTRVRfQUNUSVZFX0NIQVJBQ1RFUlwiKSB7XG4gICAgaW5pdCgpLmNhdGNoKGNvbnNvbGUuZXJyb3IpO1xuICAgIHJldHVybjtcbiAgfVxufSk7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBCb290IFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5pbml0KCkuY2F0Y2goY29uc29sZS5lcnJvcik7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBaUZPLElBQU0sbUJBQXNDO0FBQUEsRUFDakQsWUFBWTtBQUFBLEVBQ1osbUJBQW1CO0FBQUEsRUFDbkIsbUJBQW1CO0FBQUEsRUFDbkIsZUFBZTtBQUNqQjs7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
