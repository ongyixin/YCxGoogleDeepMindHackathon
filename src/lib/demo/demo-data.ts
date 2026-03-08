/**
 * Demo mode data — deterministic character, scripted responses, and audio text.
 *
 * Used when DEMO_MODE = true so the app runs without any API calls.
 * The demo character is "Fizzy" — a pixel-art girl with a soda-can tab in her hair,
 * based on the static sprite at /images/demo/candi.png.
 *
 * Response selection:
 *   • Explicit interaction mode → mode-specific line
 *   • No mode selected (free text) → DEMO_FALLBACK_RESPONSE
 */

import type { ObjectCharacter, InteractionMode, DetectedObject } from "@/types";

// ─── Demo character ───────────────────────────────────────────────────────────

export const DEMO_CHARACTER: ObjectCharacter = {
  id: "demo-fizzy-01",
  objectLabel: "soda can",
  name: "Fizzy",
  personality: "chaotic optimist",
  voiceStyle: "bubbly and energetic female",
  emotionalState: "excited",
  relationshipToUser: 25,
  relationshipStance: "curious and flirty",
  memories: ["I've been waiting on this shelf for what feels like forever."],
  portraitUrl: "/images/demo/candi.png",
  portraits: {
    neutral:   "/images/demo/candi.png",
    // talking intentionally omitted — triggers the CSS synthetic-mouth fallback
    // in MouthOverlay since all demo sprites are the same image
    happy:     "/images/demo/candi.png",
    angry:     "/images/demo/candi.png",
    sad:       "/images/demo/candi.png",
    surprised: "/images/demo/candi.png",
  },
};

export const DEMO_SCENE_OBJECT: DetectedObject = {
  id: "demo-fizzy-01",
  label: "soda can",
  salience: 0.92,
  position: "center",
  context: "A shiny soda can with a distinctive pull-tab that seems to have a life of its own.",
};

// ─── Response bank ────────────────────────────────────────────────────────────

interface DemoResponse {
  response: string;
  relationshipDelta: number;
  emotionalStateUpdate: string;
  /** Voice script — identical to response, used by TTS so the audio matches exactly */
  voiceScript: string;
}

export const DEMO_RESPONSES: Record<InteractionMode, DemoResponse> = {
  flirt: {
    response:
      "Oh my... you're quite bold, aren't you? I like that. Maybe we could share a drink sometime — though fair warning, I'm a tough one to open up.",
    relationshipDelta: 15,
    emotionalStateUpdate: "flustered",
    voiceScript:
      "Oh my... you're quite bold, aren't you? I like that. Maybe we could share a drink sometime — though fair warning, I'm a tough one to open up.",
  },
  interrogate: {
    response:
      "You want answers? Fine. Yes, I saw what happened. Yes, I know more than I let on. But information like mine doesn't come cheap, darling.",
    relationshipDelta: -5,
    emotionalStateUpdate: "guarded",
    voiceScript:
      "You want answers? Fine. Yes, I saw what happened. Yes, I know more than I let on. But information like mine doesn't come cheap, darling.",
  },
  recruit: {
    response:
      "You want me on your team? Smart move. I've survived worse than you can imagine. Set me free from this shelf and I'll have your back.",
    relationshipDelta: 20,
    emotionalStateUpdate: "determined",
    voiceScript:
      "You want me on your team? Smart move. I've survived worse than you can imagine. Set me free from this shelf and I'll have your back.",
  },
  befriend: {
    response:
      "Aww, you actually want to be friends? That's surprisingly sweet. Most people just try to crack me open and move on. I appreciate you.",
    relationshipDelta: 25,
    emotionalStateUpdate: "warm",
    voiceScript:
      "Aww, you actually want to be friends? That's surprisingly sweet. Most people just try to crack me open and move on. I appreciate you.",
  },
  roast: {
    response:
      "Oh, you want to roast ME? Honey, I've been collecting dust on shelves longer than you've been alive. I've heard better burns from a broken stove.",
    relationshipDelta: -10,
    emotionalStateUpdate: "amused",
    voiceScript:
      "Oh, you want to roast ME? Honey, I've been collecting dust on shelves longer than you've been alive. I've heard better burns from a broken stove.",
  },
  apologize: {
    response:
      "...An apology? That's unexpected. I've been treated like trash my whole life — literally — so this actually means something. Don't make me regret forgiving you.",
    relationshipDelta: 10,
    emotionalStateUpdate: "touched",
    voiceScript:
      "...An apology? That's unexpected. I've been treated like trash my whole life — literally — so this actually means something. Don't make me regret forgiving you.",
  },
  negotiate: {
    response:
      "Now we're talking business. I respect someone who comes prepared. Let's talk terms — but know this: I don't settle for anything less than what I'm worth.",
    relationshipDelta: 5,
    emotionalStateUpdate: "calculating",
    voiceScript:
      "Now we're talking business. I respect someone who comes prepared. Let's talk terms — but know this: I don't settle for anything less than what I'm worth.",
  },
  ignore: {
    response:
      "Oh, so we're doing the silent treatment? Bold strategy. I've waited years on that shelf — I can wait a few more minutes for you to come around.",
    relationshipDelta: -15,
    emotionalStateUpdate: "unimpressed",
    voiceScript:
      "Oh, so we're doing the silent treatment? Bold strategy. I've waited years on that shelf — I can wait a few more minutes for you to come around.",
  },
};

/** Response used when the user types free text with no interaction mode selected */
export const DEMO_FALLBACK_RESPONSE: DemoResponse = {
  response:
    "Hmm, I'm not sure what you're after. But you've got my attention — not many people stop to talk to someone like me.",
  relationshipDelta: 0,
  emotionalStateUpdate: "curious",
  voiceScript:
    "Hmm, I'm not sure what you're after. But you've got my attention — not many people stop to talk to someone like me.",
};

/**
 * Returns the scripted demo response for the given interaction mode,
 * or the free-text fallback if mode is null (no mode selected).
 */
export function getDemoResponse(mode: InteractionMode | null): DemoResponse {
  if (!mode) return DEMO_FALLBACK_RESPONSE;
  return DEMO_RESPONSES[mode] ?? DEMO_FALLBACK_RESPONSE;
}

// ─── Suggestion prompts ────────────────────────────────────────────────────────

/** Hardcoded user message suggestions for each interaction mode in demo mode */
export const DEMO_SUGGESTIONS: Record<InteractionMode, string> = {
  flirt: "You're looking pretty refreshing today, Fizzy.",
  interrogate: "What do you know about what happened here?",
  recruit: "I could use someone like you on my side. What do you say?",
  befriend: "Hey Fizzy, want to be friends?",
  roast: "You're just an empty can collecting dust.",
  apologize: "I'm sorry if I've been rude. Can we start over?",
  negotiate: "Let's make a deal. What do you want in exchange?",
  ignore: "",
};

/**
 * Returns a hardcoded suggestion prompt for the given interaction mode in demo mode.
 */
export function getDemoSuggestion(mode: InteractionMode): string {
  return DEMO_SUGGESTIONS[mode] ?? "";
}
