// MCM Companion — Background Service Worker (Manifest V3)
//
// Service workers in MV3 are ephemeral — they are unloaded after ~30s of
// inactivity and restarted on the next event. This means:
//   • In-memory state (Maps, variables) is LOST on unload
//   • setTimeout / setInterval are killed when the worker goes idle
//
// Fixes applied:
//   • Tab focus timestamps stored in chrome.storage.session (survives restart)
//   • Proactive comment timer uses chrome.alarms (persists across restarts)

import {
  getSettings,
  getActiveCharacter,
  setActiveCharacter,
  appendActivity,
  updateLastActivity,
  getActivity,
  buildActivityDigest,
} from "./shared/storage.js";
import { recallChat } from "./shared/api.js";
import type { ActivityEntry, ExtensionMessage } from "./shared/types.js";

// ─── Session-persisted state keys ────────────────────────────────────────────
// chrome.storage.session survives service-worker restarts within a browser
// session but is cleared when the browser is closed. Perfect for tab timing.

const SESSION_ACTIVE_TAB_KEY = "mcm_active_tab_id";
const SESSION_FOCUS_TIMES_KEY = "mcm_focus_times"; // { [tabId]: timestamp }
const PROACTIVE_ALARM_NAME = "mcm_proactive_comment";

async function getActiveTabId(): Promise<number | null> {
  const r = await chrome.storage.session.get(SESSION_ACTIVE_TAB_KEY);
  return (r[SESSION_ACTIVE_TAB_KEY] as number | undefined) ?? null;
}

async function setActiveTabId(tabId: number | null): Promise<void> {
  await chrome.storage.session.set({ [SESSION_ACTIVE_TAB_KEY]: tabId });
}

async function getFocusTimes(): Promise<Record<string, number>> {
  const r = await chrome.storage.session.get(SESSION_FOCUS_TIMES_KEY);
  return (r[SESSION_FOCUS_TIMES_KEY] as Record<string, number>) ?? {};
}

async function setFocusTime(tabId: number, ts: number): Promise<void> {
  const times = await getFocusTimes();
  times[String(tabId)] = ts;
  await chrome.storage.session.set({ [SESSION_FOCUS_TIMES_KEY]: times });
}

async function clearFocusTime(tabId: number): Promise<void> {
  const times = await getFocusTimes();
  delete times[String(tabId)];
  await chrome.storage.session.set({ [SESSION_FOCUS_TIMES_KEY]: times });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isTrackableUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

// ─── Tab leave / enter ────────────────────────────────────────────────────────

async function recordTabLeave(tabId: number): Promise<void> {
  const times = await getFocusTimes();
  const focusedAt = times[String(tabId)];
  if (focusedAt) {
    const timeSpentMs = Date.now() - focusedAt;
    await updateLastActivity({ timeSpentMs });
    await clearFocusTime(tabId);
  }
}

async function recordTabEnter(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !tab.url || !isTrackableUrl(tab.url)) return;

  await setFocusTime(tab.id, Date.now());

  const entry: ActivityEntry = {
    url: tab.url,
    title: tab.title ?? tab.url,
    domain: extractDomain(tab.url),
    timestamp: Date.now(),
    timeSpentMs: 0,
  };

  await appendActivity(entry);
  notifySidePanel({ type: "TAB_CHANGED", entry });
  await scheduleProactiveComment(tab);
}

// ─── Context menu ─────────────────────────────────────────────────────────────

const CONTEXT_MENU_ID = "mcm_ask_character";

async function refreshContextMenu(): Promise<void> {
  await chrome.contextMenus.removeAll();
  const character = await getActiveCharacter();
  const title = character ? `Ask ${character.name} about this` : "MCM: No character selected";

  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title,
    contexts: ["selection", "page"],
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;

  const selectedText = info.selectionText ?? "";
  const sourceUrl = tab?.url ?? "";
  const sourceTitle = tab?.title ?? "";

  if (tab?.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }

  // Give the side panel ~400ms to open before sending the message
  await new Promise((r) => setTimeout(r, 400));
  chrome.runtime.sendMessage<ExtensionMessage>({
    type: "CONTEXT_MENU_QUERY",
    selectedText,
    sourceUrl,
    sourceTitle,
  }).catch(() => {});
});

// ─── Tab activity tracking ────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const prevTabId = await getActiveTabId();
  if (prevTabId !== null) {
    await recordTabLeave(prevTabId);
  }

  await setActiveTabId(activeInfo.tabId);

  const tab = await chrome.tabs.get(activeInfo.tabId).catch(() => null);
  if (tab) {
    await recordTabEnter(tab);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !isTrackableUrl(tab.url)) return;

  const activeTabId = await getActiveTabId();
  if (tabId !== activeTabId) return;

  // Navigation within the active tab — reset the focus clock and log the new page
  await setFocusTime(tabId, Date.now());
  const entry: ActivityEntry = {
    url: tab.url,
    title: tab.title ?? tab.url,
    domain: extractDomain(tab.url),
    timestamp: Date.now(),
    timeSpentMs: 0,
  };
  await appendActivity(entry);
  notifySidePanel({ type: "TAB_CHANGED", entry });
  await scheduleProactiveComment(tab);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const activeTabId = await getActiveTabId();
  if (tabId === activeTabId) {
    await recordTabLeave(tabId);
    await setActiveTabId(null);
  }
});

function notifySidePanel(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {});
}

// ─── Proactive character comments (alarm-based) ───────────────────────────────
// chrome.alarms survive service worker restarts. We store the current tab info
// alongside the alarm in storage so the alarm handler can read it back.

const SESSION_PENDING_TAB_KEY = "mcm_pending_tab";

async function scheduleProactiveComment(tab: chrome.tabs.Tab): Promise<void> {
  const settings = await getSettings();
  if (!settings.proactiveComments || !settings.trackActivity) return;
  if (!tab.url || !isTrackableUrl(tab.url)) return;

  // Cancel any existing pending alarm
  await chrome.alarms.clear(PROACTIVE_ALARM_NAME);

  // Store the tab snapshot for the alarm handler to read
  await chrome.storage.session.set({
    [SESSION_PENDING_TAB_KEY]: {
      url: tab.url,
      title: tab.title ?? tab.url,
      domain: extractDomain(tab.url),
    },
  });

  // Fire after 30 seconds (delayInMinutes must be ≥ 0; use 0 for ~1s min, so
  // we use a 0.5-minute minimum and rely on periodInMinutes being absent)
  chrome.alarms.create(PROACTIVE_ALARM_NAME, { delayInMinutes: 0.5 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== PROACTIVE_ALARM_NAME) return;

  try {
    const settings = await getSettings();
    if (!settings.proactiveComments || !settings.trackActivity) return;

    const character = await getActiveCharacter();
    if (!character) return;

    const sessionData = await chrome.storage.session.get(SESSION_PENDING_TAB_KEY);
    const pendingTab = sessionData[SESSION_PENDING_TAB_KEY] as
      | { url: string; title: string; domain: string }
      | undefined;

    if (!pendingTab?.url || !isTrackableUrl(pendingTab.url)) return;

    // Double-check the user is still on the same page
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.url?.startsWith(new URL(pendingTab.url).origin + new URL(pendingTab.url).pathname)) return;

    const activity = await getActivity();
    const digest = buildActivityDigest(activity);

    const browserContext = {
      currentUrl: pendingTab.url,
      currentTitle: pendingTab.title,
      currentDomain: pendingTab.domain,
      activityDigest: digest,
    };

    const result = await recallChat(
      character,
      "befriend",
      `The user has been reading "${pendingTab.title}" for a while. React in character — make a brief observation or ask something. Keep it to 1-2 sentences.`,
      browserContext
    );

    chrome.runtime.sendMessage({
      type: "PROACTIVE_COMMENT",
      text: result.response,
      relationshipDelta: result.relationshipDelta,
      newRelationshipScore: result.newRelationshipToUser,
      emotionalState: result.emotionalStateUpdate,
    }).catch(() => {});
  } catch {
    // Best-effort — proactive comments should never break the extension
  }
});

// ─── Message handling ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === "SET_ACTIVE_CHARACTER") {
    setActiveCharacter(message.characterId)
      .then(() => refreshContextMenu())
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "OPEN_SIDE_PANEL") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const windowId = tabs[0]?.windowId;
      if (windowId) {
        chrome.sidePanel.open({ windowId }).catch(() => {});
      }
    });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

// ─── Install / startup ────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  await refreshContextMenu();
  // Seed active tab on install so tracking starts immediately
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await setActiveTabId(tab.id);
    await recordTabEnter(tab);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshContextMenu();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await setActiveTabId(tab.id);
    await recordTabEnter(tab);
  }
});
