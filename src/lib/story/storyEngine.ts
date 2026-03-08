/**
 * Story Engine — Orchestrates talk interactions, quest generation, phase transitions.
 * This is the primary server-side entry point for Story Mode logic.
 */

import { v4 as uuid } from "uuid";
import { safeGenerateJSON, safeGenerateJSONFast, safeAnalyzeImageJSON } from "@/lib/shared/gemini";
import {
  dialoguePrompt,
  questGenerationPrompt,
  narratorEventPrompt,
} from "@/lib/shared/prompts";
import {
  applyRelationshipDelta,
  buildMemoryContext,
  generateRelationshipEdges,
} from "./relationships";
import {
  checkEscalation,
  type EscalationCheckContext,
} from "./escalation";
import { personifyObjects } from "./personification";
import type {
  SessionState,
  StoryModeState,
  ObjectCharacter,
  StoryQuest,
  ConversationEntry,
  InteractionMode,
  EscalationEvent,
  NarrationEvent,
  DetectedObject,
  StoryGenre,
  StoryPhase,
  GestureContext,
} from "@/types";

// ─── Gesture helpers ──────────────────────────────────────────────────────────

/**
 * Server-side deterministic delta nudge applied ON TOP of Gemini's response.
 * Ensures gestures always have mechanical impact regardless of Gemini's weighting.
 * Capped so it cannot exceed the prompt's requested floor by more than a few points.
 */
const GESTURE_DELTA_NUDGE: Record<string, number> = {
  thumbs_up:   +6,
  victory:     +4,
  open_palm:   +3,
  i_love_you:  +6,
  pointing:     0,
  thumbs_down: -5,
  closed_fist: -3,
};

function getGestureNudge(gesture?: string | null): number {
  if (!gesture || gesture === "none") return 0;
  return GESTURE_DELTA_NUDGE[gesture] ?? 0;
}

/**
 * Suggest an interaction mode based on the detected gesture.
 * Only used as a fallback when the caller passes the default "befriend" mode
 * without an explicit user selection (i.e. no mode was actively chosen).
 */
const GESTURE_MODE_SUGGESTION: Partial<Record<string, InteractionMode>> = {
  thumbs_up:   "befriend",
  victory:     "befriend",
  open_palm:   "befriend",
  i_love_you:  "flirt",
  closed_fist: "roast",
  pointing:    "interrogate",
};

// ─── Gemini dialogue response shape ───────────────────────────────────────────

interface DialogueResult {
  response: string;
  emotionalStateUpdate: string;
  relationshipDelta: number;
  hintAtMemory: string | null;
  triggerQuest: boolean;
  triggerEscalation: boolean;
}

interface QuestResult {
  title: string;
  description: string;
  type: StoryQuest["type"];
  xpReward?: number;
}

// ─── Fallback dialogue generation ─────────────────────────────────────────────

const FALLBACK_RESPONSES: Record<InteractionMode, (name: string, personality: string, score: number) => string> = {
  flirt: (name, p, score) =>
    score > 20
      ? `${name} almost smiles. "You're not entirely terrible," they say. "Don't let it go to your head."`
      : `${name} looks away. "Flattery only works when it's earned," they say, clearly establishing that you haven't earned it.`,
  interrogate: (name, p, score) =>
    score > 0
      ? `${name} hesitates. "I know more than I'm saying. But you already knew that."`
      : `${name} stares at you. "You wouldn't believe me anyway. They never do."`,
  recruit: (name, p, score) =>
    score > 20
      ? `${name} considers your proposal. "I have conditions," they say. "Many conditions."`
      : `${name} laughs. Not unkindly. Just... deeply unconvinced. "Recruit me for what, exactly?"`,
  befriend: (name, p, score) =>
    score > 20
      ? `${name} softens slightly. "I'm not opposed to this," they admit, which is basically a declaration of friendship from them.`
      : `${name} regards you with cautious skepticism. "You'd be the first."`,
  roast: (name, p, score) =>
    score < 0
      ? `${name} fires back immediately. "Oh, so you want to play that game. Interesting choice from someone who ${p.includes("jealous") ? "dims when no one's looking" : "clearly has not thought this through"}."`
      : `${name} is genuinely amused. "Not bad. Come back when you've had more practice."`,
  apologize: (name, p, score) =>
    score < -20
      ? `${name} is unmoved. "I've been waiting for that. It doesn't change anything. But it's a start."`
      : `${name} shrugs. "Apology noted. Filed. We'll see."`,
  negotiate: (name, p, _score) =>
    `${name} regards the proposition with cold interest. "I have terms," they say. "You won't like all of them."`,
  ignore: (name, _p, score) =>
    score > 0
      ? `${name} notices you looking away. Something in them calcifies. "Fine," they say, to no one.`
      : `${name} was already done with this conversation.`,
};

function getFallbackResponse(
  character: ObjectCharacter,
  mode: InteractionMode
): DialogueResult {
  const fn = FALLBACK_RESPONSES[mode] ?? FALLBACK_RESPONSES.befriend;
  const response = fn(character.name, character.personality, character.relationshipToUser);

  // Deterministic delta based on mode
  const deltas: Record<InteractionMode, number> = {
    flirt: 8,
    interrogate: -3,
    recruit: 5,
    befriend: 10,
    roast: -12,
    apologize: 6,
    negotiate: 3,
    ignore: -5,
  };

  const emotionalMap: Record<InteractionMode, string> = {
    flirt: character.relationshipToUser > 20 ? "flustered" : "guarded",
    interrogate: "suspicious",
    recruit: "calculating",
    befriend: "cautiously open",
    roast: "defensive",
    apologize: "processing",
    negotiate: "calculating",
    ignore: character.relationshipToUser > 0 ? "hurt" : "indifferent",
  };

  return {
    response,
    emotionalStateUpdate: emotionalMap[mode],
    relationshipDelta: deltas[mode],
    hintAtMemory: null,
    triggerQuest: mode === "recruit" && character.relationshipToUser > 15,
    triggerEscalation: false,
  };
}

// ─── Fallback quest generation ─────────────────────────────────────────────────

const FALLBACK_QUESTS: Record<string, Omit<StoryQuest, "id" | "issuedBy" | "status">> = {
  lamp: {
    title: "The Testimony of Light",
    description: "Lucian suspects the couch has been blocking the spotlight. Go confront the couch directly. Report back.",
    type: "social",
    xpReward: 60,
  },
  chair: {
    title: "The Loyalty Test",
    description: "Gerald needs you to sit in every other seat in the room before returning. To prove you always come back.",
    type: "challenge",
    xpReward: 80,
  },
  plant: {
    title: "The Watering Covenant",
    description: "Vera has one request. You know what it is. It's about the water. It's always about the water.",
    type: "fetch",
    xpReward: 50,
  },
  mug: {
    title: "The Final Sip",
    description: "Gordo wants you to choose: finish whatever's left in him, or pour it out. A choice about commitment.",
    type: "choice",
    xpReward: 100,
  },
  default: {
    title: "The Unspoken Errand",
    description: "They want something from you. They won't say what, exactly. You'll know it when you've done it.",
    type: "fetch",
    xpReward: 75,
  },
};

function getFallbackQuest(character: ObjectCharacter): Omit<StoryQuest, "id" | "issuedBy" | "status"> {
  return FALLBACK_QUESTS[character.objectLabel.toLowerCase()] ?? FALLBACK_QUESTS.default;
}

// ─── Main talk interaction processor ──────────────────────────────────────────

export interface TalkResult {
  response: string;
  emotionalStateUpdate: string;
  relationshipDelta: number;
  newRelationshipToUser: number;
  quest: StoryQuest | undefined;
  escalation: EscalationEvent | undefined;
  narration: NarrationEvent | undefined;
  xpAwarded: number;
  updatedSession: SessionState;
}

export async function processTalk(
  session: SessionState,
  characterId: string,
  mode: InteractionMode,
  userMessage: string,
  gestureContext?: GestureContext | null,
  selfieFrame?: string | null
): Promise<TalkResult> {
  if (!session.storyState) throw new Error("Session has no story state");

  const storyState = session.storyState;
  const character = storyState.characters.find((c) => c.id === characterId);
  if (!character) throw new Error(`Character not found: ${characterId}`);

  const memoryContext = buildMemoryContext(character);

  // Build nearby characters string for the prompt
  const nearbyCharacters = storyState.characters
    .filter((c) => c.id !== characterId)
    .map((c) => `${c.name} (${c.personality}, score: ${c.relationshipToUser})`)
    .join(", ");

  // Call Gemini (or fall back)
  const prompt = dialoguePrompt(
    character.name,
    character.personality,
    character.voiceStyle,
    character.emotionalState,
    character.relationshipToUser,
    character.memories,
    mode,
    userMessage,
    nearbyCharacters,
    storyState.genre,
    gestureContext ?? null
  );

  // When the caller provides a selfie frame, use multimodal Gemini so the
  // character can literally see the user (their face, gesture, surroundings).
  // Fall back to fast text-only if no frame or if multimodal fails.
  let aiResult: DialogueResult | null = null;
  if (selfieFrame) {
    aiResult = await safeAnalyzeImageJSON<DialogueResult>(selfieFrame, prompt);
  }
  if (!aiResult) {
    aiResult = await safeGenerateJSONFast<DialogueResult>(prompt);
  }

  const result = aiResult ?? getFallbackResponse(character, mode);

  // Apply a deterministic gesture nudge on top of Gemini's delta so gestures
  // always produce mechanical effect even if the model under-weights them.
  const gestureNudge = getGestureNudge(gestureContext?.gesture);
  const rawDelta = result.relationshipDelta + gestureNudge;
  const effectiveDelta = Math.max(-30, Math.min(30, rawDelta));

  const prevScore = character.relationshipToUser;
  const newScore = Math.min(100, Math.max(-100, prevScore + effectiveDelta));

  // Build memory hint — always include the gesture so the character remembers it
  const gestureLabel = gestureContext?.gesture && gestureContext.gesture !== "none"
    ? gestureContext.gesture.replace(/_/g, " ")
    : null;
  const memoryHint = result.hintAtMemory
    ? result.hintAtMemory
    : gestureLabel
    ? `${mode} interaction — user showed "${gestureLabel}" gesture — said: "${userMessage.slice(0, 30)}"`
    : `The ${mode} attempt — user said: "${userMessage.slice(0, 40)}"`;

  // Update conversation log entry
  const logEntry: ConversationEntry = {
    characterId,
    mode,
    userMessage,
    characterResponse: result.response,
    relationshipDelta: effectiveDelta,
    timestamp: Date.now(),
  };

  // Apply relationship update with cascade (using effectiveDelta which includes gesture nudge)
  let updatedStoryState = applyRelationshipDelta(
    storyState,
    characterId,
    effectiveDelta,
    memoryHint
  );

  // Apply emotional state update
  updatedStoryState = {
    ...updatedStoryState,
    characters: updatedStoryState.characters.map((c) =>
      c.id === characterId
        ? { ...c, emotionalState: result.emotionalStateUpdate }
        : c
    ),
    conversationLog: [...updatedStoryState.conversationLog, logEntry],
  };

  // ── Quest generation ───────────────────────────────────────────────────────
  let newQuest: StoryQuest | undefined;
  if (result.triggerQuest && storyState.activeQuests.length < 2) {
    const questPrompt = questGenerationPrompt(
      character.name,
      character.personality,
      result.emotionalStateUpdate,
      storyState.genre,
      storyState.activeQuests.map((q) => q.title)
    );
    const aiQuest = await safeGenerateJSON<QuestResult>(questPrompt);
    const questData = aiQuest ?? getFallbackQuest(character);
    newQuest = {
      id: uuid(),
      issuedBy: characterId,
      title: questData.title,
      description: questData.description,
      type: questData.type,
      status: "available",
      xpReward: (questData as { xpReward?: number }).xpReward ?? 75,
    };
    updatedStoryState = {
      ...updatedStoryState,
      activeQuests: [...updatedStoryState.activeQuests, newQuest!],
    };
  }

  // ── Escalation check ───────────────────────────────────────────────────────
  const totalInteractions = updatedStoryState.conversationLog.length;
  const escCtx: EscalationCheckContext = {
    interactedCharacterId: characterId,
    previousScore: prevScore,
    newScore,
    totalInteractions,
  };

  let escalationEvent: EscalationEvent | undefined;
  if (result.triggerEscalation || totalInteractions % 5 === 0) {
    const esc = checkEscalation(updatedStoryState, escCtx);
    if (esc) {
      escalationEvent = esc;
      updatedStoryState = {
        ...updatedStoryState,
        phase: "escalation" as StoryPhase,
      };
    }
  }

  // ── Phase advancement ──────────────────────────────────────────────────────
  if (!escalationEvent) {
    updatedStoryState = {
      ...updatedStoryState,
      phase: advancePhase(updatedStoryState),
    };
  }

  // ── Narration ──────────────────────────────────────────────────────────────
  let narration: NarrationEvent | undefined;
  if (escalationEvent) {
    narration = {
      id: uuid(),
      text: escalationEvent.narrativeText,
      tone: "dramatic",
      timestamp: Date.now(),
      sourceMode: "story",
    };
  } else if (newQuest) {
    const narratorPrompt = narratorEventPrompt(
      `${character.name} issued a quest: "${newQuest.title}"`,
      "story",
      `${storyState.genre} game, character is a ${character.personality}`
    );
    const narResult = await safeGenerateJSON<{ text: string; tone: NarrationEvent["tone"] }>(
      narratorPrompt
    );
    narration = {
      id: uuid(),
      text: narResult?.text ?? `${character.name} has demands. Interesting.`,
      tone: narResult?.tone ?? "deadpan",
      timestamp: Date.now(),
      sourceMode: "story",
    };
  }

  // ── XP ─────────────────────────────────────────────────────────────────────
  let xpAwarded = 10; // base interaction XP
  if (newQuest) xpAwarded += 15;
  if (escalationEvent) xpAwarded += 25;
  if (Math.abs(effectiveDelta) >= 15) xpAwarded += 10; // big shift bonus

  const updatedSession: SessionState = {
    ...session,
    storyState: updatedStoryState,
    narrativeLog: narration
      ? [...session.narrativeLog, narration]
      : session.narrativeLog,
  };

  return {
    response: result.response,
    emotionalStateUpdate: result.emotionalStateUpdate,
    relationshipDelta: effectiveDelta,
    newRelationshipToUser: newScore,
    quest: newQuest,
    escalation: escalationEvent,
    narration,
    xpAwarded,
    updatedSession,
  };
}

// ─── Phase advancement ─────────────────────────────────────────────────────────

function advancePhase(state: StoryModeState): StoryPhase {
  const { phase, conversationLog, activeQuests, characters } = state;

  if (phase === "scanning" && characters.length > 0) return "exploring";
  if (phase === "exploring" && activeQuests.length > 0) return "quest_active";
  if (phase === "escalation" && conversationLog.length > 10) return "climax";
  return phase;
}

// ─── Scene processing (called from /api/scan) ─────────────────────────────────

/**
 * Process a new scan: personify new objects, update relationships.
 * Returns updated StoryModeState.
 */
export async function processScan(
  storyState: StoryModeState,
  detectedObjects: DetectedObject[]
): Promise<StoryModeState> {
  // Personify all objects (existing ones are returned as-is)
  const allCharacters = await personifyObjects(
    detectedObjects,
    storyState.genre,
    storyState.characters
  );

  // Generate relationships for any newly added characters
  const newCharacterIds = allCharacters
    .filter((c) => !storyState.characters.find((e) => e.id === c.id))
    .map((c) => c.id);

  let relationships = storyState.relationships;
  if (newCharacterIds.length > 0) {
    const freshEdges = generateRelationshipEdges(allCharacters);
    // Merge: keep existing edges, add new ones that don't conflict
    const existingKeys = new Set(
      relationships.map((e) => [e.fromId, e.toId].sort().join("-"))
    );
    const newEdges = freshEdges.filter(
      (e) => !existingKeys.has([e.fromId, e.toId].sort().join("-"))
    );
    relationships = [...relationships, ...newEdges];
  }

  return {
    ...storyState,
    characters: allCharacters,
    relationships,
    phase: allCharacters.length > 0 ? "exploring" : "scanning",
  };
}

// ─── Quest actions ─────────────────────────────────────────────────────────────

export function acceptQuest(storyState: StoryModeState, questId: string): StoryModeState {
  return {
    ...storyState,
    activeQuests: storyState.activeQuests.map((q) =>
      q.id === questId ? { ...q, status: "active" } : q
    ),
    phase: "quest_active",
  };
}

export function completeQuest(storyState: StoryModeState, questId: string): StoryModeState {
  return {
    ...storyState,
    activeQuests: storyState.activeQuests.map((q) =>
      q.id === questId ? { ...q, status: "completed" } : q
    ),
  };
}

// ─── Object-style API (used by api/talk route) ────────────────────────────────

export const storyEngine = {
  processTalk,
  processScan,
  acceptQuest,
  completeQuest,
  checkEscalation: (state: StoryModeState, characterId: string) =>
    checkEscalation(state, {
      interactedCharacterId: characterId,
      previousScore: 0,
      newScore: state.characters.find((c) => c.id === characterId)?.relationshipToUser ?? 0,
      totalInteractions: state.conversationLog.length,
    }),
  /** Generate a quest from a character; fallback creates a simple fetch quest */
  async generateQuest(
    character: ObjectCharacter,
    storyState: StoryModeState
  ): Promise<StoryQuest | null> {
    const prompt = questGenerationPrompt(
      character.name,
      character.personality,
      character.emotionalState,
      storyState.genre,
      storyState.activeQuests.map((q) => q.title)
    );
    interface QR {
      title: string;
      description: string;
      type: StoryQuest["type"];
      xpReward: number;
    }
    const result = await safeGenerateJSON<QR>(prompt);
    if (!result) return null;
    return {
      id: uuid(),
      issuedBy: character.id,
      title: result.title,
      description: result.description,
      type: result.type ?? "social",
      status: "available",
      xpReward: result.xpReward ?? 75,
    };
  },
};
