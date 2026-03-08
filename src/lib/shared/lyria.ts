/**
 * Lyria 2 adaptive soundtrack wrapper.
 *
 * Uses the Vertex AI Lyria API (lyria-002) when credentials are configured.
 * Returns base64-encoded WAV audio as a data URI so the browser can play it
 * directly — no separate file storage needed.
 *
 * Required env vars:
 *   LYRIA_PROJECT_ID   — Google Cloud project ID
 *   LYRIA_LOCATION     — Vertex AI region, default "us-central1"
 *   LYRIA_ACCESS_TOKEN — OAuth Bearer token (gcloud auth print-access-token)
 *
 * Falls back to silent/UI-only mode when credentials are absent.
 */

import type {
  LyriaControlSignal,
  LyriaTrack,
  MusicMood,
  IMusicController,
  FallbackTrackMap,
  ActiveMode,
  StoryModeState,
  NarrationEvent,
  InteractionMode,
} from "@/types";

// ─── Config ──────────────────────────────────────────────────────────────────

function getLyriaConfig() {
  return {
    projectId: process.env.LYRIA_PROJECT_ID ?? "",
    location: process.env.LYRIA_LOCATION ?? "us-central1",
    accessToken: process.env.LYRIA_ACCESS_TOKEN ?? "",
  };
}

function getLyriaEndpoint(): string {
  const { projectId, location } = getLyriaConfig();
  return (
    `https://${location}-aiplatform.googleapis.com/v1` +
    `/projects/${projectId}/locations/${location}` +
    `/publishers/google/models/lyria-002:predict`
  );
}

function isLyriaConfigured(): boolean {
  const { projectId, accessToken } = getLyriaConfig();
  return projectId.length > 0 && accessToken.length > 0;
}

function getAuthHeaders(): Record<string, string> {
  const { accessToken } = getLyriaConfig();
  return { Authorization: `Bearer ${accessToken}` };
}

// ─── Prompt construction ──────────────────────────────────────────────────────

const MOOD_PROMPTS: Record<string, string> = {
  neutral:          "neutral ambient underscore, sparse texture, open space, no melody",
  ambient:          "atmospheric soundscape, gentle tonal pads, soft harmonic layers, no melody",
  romantic:         "warm intimate instrumental, slow harmonic movement, tender emotional tone",
  suspenseful:      "tense underscore, low sustained tones, gradual harmonic buildup, uneasy",
  chaotic:          "dissonant instrumental, irregular rhythmic patterns, unstable layered textures",
  tragic:           "somber slow instrumental, sparse harmonic content, melancholic emotional tone",
  comedic:          "lighthearted upbeat instrumental, playful staccato phrases, whimsical rhythm",
  focused:          "minimal steady instrumental, consistent beat, clean sparse arrangement",
  driving:          "energetic electronic instrumental, rhythmic bass movement, forward momentum",
  triumphant:       "powerful uplifting instrumental, full harmonic swell, bold dynamic range",
  urgent:           "fast-paced tense instrumental, rapid rhythmic pulse, high energy",
  idle:             "very sparse ambient soundscape, near silence, minimal tonal presence",
  "tension-rising": "slowly building tense underscore, rising harmonic intensity, mounting pressure",
  victory:          "celebratory uplifting instrumental, bright harmonic resolution, energetic",
  action:           "intense fast instrumental, heavy rhythmic drive, layered energetic texture",
  dialogue:         "quiet warm background underscore, unobtrusive harmonic texture, conversational feel",
  "ambient-explore":"open exploratory soundscape, airy harmonic layers, curious unhurried quality",
};

const TEMPO_HINTS: Record<string, string> = {
  slow:   "slow tempo",
  medium: "moderate tempo",
  fast:   "fast tempo",
};

function buildPrompt(signal: LyriaControlSignal): { prompt: string; negative_prompt: string } {
  const moodDesc = MOOD_PROMPTS[signal.mood] ?? MOOD_PROMPTS.neutral;
  const tempoHint = TEMPO_HINTS[signal.tempo ?? "medium"];
  const intensityHint =
    signal.intensity > 0.7 ? "high energy" :
    signal.intensity > 0.4 ? "moderate energy" :
    "low energy, restrained";
  const modeHint =
    signal.activeMode === "quest"
      ? "cinematic tactical game music"
      : "cinematic narrative game music";
  const envHint =
    signal.environment && signal.environment !== "unknown"
      ? `, ${signal.environment} environment`
      : "";

  return {
    prompt: `${moodDesc}, ${tempoHint}, ${intensityHint}, ${modeHint}${envHint}, instrumental only, original composition`,
    negative_prompt: "vocals, singing, lyrics, voice, spoken word, recognizable melody, copyrighted music, named compositions",
  };
}

// ─── Fallback metadata ────────────────────────────────────────────────────────

// No fallback audio files — when Lyria is unavailable, trackUrl is null
// and the MusicIndicator shows "◈ NO AUDIO" gracefully.
const FALLBACK_TRACKS: FallbackTrackMap = {
  neutral:           null as unknown as string,
  romantic:          null as unknown as string,
  suspenseful:       null as unknown as string,
  chaotic:           null as unknown as string,
  tragic:            null as unknown as string,
  comedic:           null as unknown as string,
  focused:           null as unknown as string,
  driving:           null as unknown as string,
  triumphant:        null as unknown as string,
  urgent:            null as unknown as string,
  ambient:           null as unknown as string,
  idle:              null as unknown as string,
  "tension-rising":  null as unknown as string,
  victory:           null as unknown as string,
  action:            null as unknown as string,
  dialogue:          null as unknown as string,
  "ambient-explore": null as unknown as string,
};

/** Human-readable metadata for each mood — used in MusicIndicator UI */
export const TRACK_METADATA: Record<MusicMood, { label: string; bpm: number; description: string; colorHex: string; emoji: string }> = {
  neutral:          { label: "Neutral",     bpm: 75,  description: "Quiet between-scenes texture",       colorHex: "#888899", emoji: "🌫️" },
  ambient:          { label: "Ambient",     bpm: 70,  description: "Quiet background atmosphere",         colorHex: "#8890aa", emoji: "✨" },
  romantic:         { label: "Romantic",    bpm: 82,  description: "Soft strings and piano",              colorHex: "#f472b6", emoji: "🌹" },
  suspenseful:      { label: "Suspenseful", bpm: 95,  description: "Low drones and building tension",     colorHex: "#a78bfa", emoji: "🕯️" },
  chaotic:          { label: "Chaotic",     bpm: 140, description: "Dissonant brass and percussion",      colorHex: "#f87171", emoji: "⚡" },
  tragic:           { label: "Tragic",      bpm: 60,  description: "Mournful cello and silence",          colorHex: "#60a5fa", emoji: "🎻" },
  comedic:          { label: "Comedic",     bpm: 110, description: "Bouncy woodwinds and cartoon stabs",  colorHex: "#fbbf24", emoji: "🎭" },
  focused:          { label: "Focused",     bpm: 90,  description: "Minimal lo-fi beats",                 colorHex: "#34d399", emoji: "🎯" },
  driving:          { label: "Driving",     bpm: 128, description: "Punchy electronic rhythm",            colorHex: "#22d3ee", emoji: "🔥" },
  triumphant:       { label: "Triumphant",  bpm: 115, description: "Full brass and percussion swell",     colorHex: "#fcd34d", emoji: "🏆" },
  urgent:           { label: "Urgent",      bpm: 140, description: "Staccato strings and rapid pulse",    colorHex: "#ef4444", emoji: "🚨" },
  idle:             { label: "Idle",        bpm: 60,  description: "Sparse ambient, waiting texture",     colorHex: "#6b7280", emoji: "💤" },
  "tension-rising": { label: "Tension",     bpm: 110, description: "Escalating tension",                  colorHex: "#a78bfa", emoji: "🕯️" },
  victory:          { label: "Victory",     bpm: 115, description: "Mission complete",                    colorHex: "#fcd34d", emoji: "🏆" },
  action:           { label: "Action",      bpm: 130, description: "High momentum",                       colorHex: "#22d3ee", emoji: "🔥" },
  dialogue:         { label: "Dialogue",    bpm: 80,  description: "Character interaction",               colorHex: "#f0d898", emoji: "💬" },
  "ambient-explore":{ label: "Exploring",  bpm: 75,  description: "Open world ambience",                  colorHex: "#8890aa", emoji: "🗺️" },
};

// ─── Music state derivation ───────────────────────────────────────────────────

const STORY_PHASE_TO_MOOD: Record<string, MusicMood> = {
  scanning:     "neutral",
  exploring:    "suspenseful",
  quest_active: "focused",
  escalation:   "chaotic",
  climax:       "chaotic",
  recap:        "comedic",
};

type MoodWeights = Partial<Record<MusicMood, number>>;

function addMoodWeight(weights: MoodWeights, mood: MusicMood, value: number): void {
  weights[mood] = (weights[mood] ?? 0) + value;
}

function pickMood(weights: MoodWeights, fallback: MusicMood): MusicMood {
  let bestMood = fallback;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const mood of Object.keys(TRACK_METADATA) as MusicMood[]) {
    const score = weights[mood] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestMood = mood;
    }
  }
  return bestMood;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function applyInteractionMood(
  weights: MoodWeights,
  mode: InteractionMode,
  relationshipDelta: number
): number {
  const positive = relationshipDelta > 0;
  switch (mode) {
    case "flirt":
      addMoodWeight(weights, positive ? "romantic" : "suspenseful", 2.5);
      addMoodWeight(weights, "dialogue", 0.7);
      return 0.12;
    case "roast":
      addMoodWeight(weights, "chaotic", 2.2);
      addMoodWeight(weights, "comedic", 0.9);
      return 0.15;
    case "interrogate":
      addMoodWeight(weights, "suspenseful", 2.0);
      addMoodWeight(weights, "urgent", 0.7);
      return 0.1;
    case "recruit":
      addMoodWeight(weights, "driving", 1.4);
      addMoodWeight(weights, "focused", 1.1);
      return 0.08;
    case "befriend":
      addMoodWeight(weights, positive ? "ambient" : "neutral", 1.4);
      addMoodWeight(weights, "romantic", positive ? 0.8 : 0);
      return 0.04;
    case "apologize":
      addMoodWeight(weights, "tragic", 1.4);
      addMoodWeight(weights, positive ? "ambient" : "suspenseful", 0.8);
      return -0.04;
    case "negotiate":
      addMoodWeight(weights, "focused", 1.6);
      addMoodWeight(weights, "suspenseful", 0.9);
      return 0.05;
    case "ignore":
      addMoodWeight(weights, relationshipDelta < 0 ? "tragic" : "idle", 1.4);
      return relationshipDelta < 0 ? -0.08 : -0.15;
    default:
      return 0;
  }
}

function applyPersonalityMood(weights: MoodWeights, personality: string): number {
  const p = personality.toLowerCase();
  let delta = 0;

  if (/(chaotic|volatile|aggressive|angry|explosive|jealous|reckless)/.test(p)) {
    addMoodWeight(weights, "chaotic", 1.6);
    addMoodWeight(weights, "urgent", 0.6);
    delta += 0.08;
  }
  if (/(romantic|flirty|charming|tender|warm|poetic|affectionate)/.test(p)) {
    addMoodWeight(weights, "romantic", 1.6);
    addMoodWeight(weights, "dialogue", 0.5);
    delta += 0.04;
  }
  if (/(sarcastic|witty|playful|quirky|goofy|comedic|mischievous)/.test(p)) {
    addMoodWeight(weights, "comedic", 1.2);
    delta += 0.02;
  }
  if (/(stoic|strategic|disciplined|logical|analytical|calculating|cold)/.test(p)) {
    addMoodWeight(weights, "focused", 1.3);
    addMoodWeight(weights, "suspenseful", 0.6);
  }
  if (/(mysterious|secretive|paranoid|suspicious|enigmatic)/.test(p)) {
    addMoodWeight(weights, "suspenseful", 1.5);
    delta += 0.06;
  }
  if (/(heroic|noble|bold|commanding|confident|leader)/.test(p)) {
    addMoodWeight(weights, "triumphant", 1.1);
    addMoodWeight(weights, "driving", 0.8);
    delta += 0.03;
  }

  return delta;
}

function applyPlotDevelopments(
  weights: MoodWeights,
  storyPhase: string | undefined,
  narrativeLog: NarrationEvent[] | undefined,
  storyState: StoryModeState | undefined
): number {
  let delta = 0;

  if (storyPhase === "escalation" || storyPhase === "climax") {
    addMoodWeight(weights, "urgent", 2.2);
    addMoodWeight(weights, "chaotic", 1.4);
    delta += 0.18;
  }

  const recentNarrative = (narrativeLog ?? []).slice(-3);
  for (const event of recentNarrative) {
    const text = `${event.text}`.toLowerCase();
    if (event.tone === "dramatic") {
      addMoodWeight(weights, "suspenseful", 1.1);
      delta += 0.05;
    }
    if (/(heartbreak|betray|loss|gone quiet|no return)/.test(text)) {
      addMoodWeight(weights, "tragic", 2.2);
      delta += 0.1;
    }
    if (/(argument|jealous|tension|spiraling|enemy|revelation)/.test(text)) {
      addMoodWeight(weights, "suspenseful", 1.7);
      addMoodWeight(weights, "urgent", 0.9);
      delta += 0.08;
    }
    if (/(alliance|victory|mission complete|it is done|celebratory|fanfare)/.test(text)) {
      addMoodWeight(weights, "triumphant", 1.6);
      addMoodWeight(weights, "victory", 0.7);
      delta += 0.06;
    }
  }

  if (storyState?.activeQuests.some((q) => q.status === "active")) {
    addMoodWeight(weights, "focused", 0.8);
  }
  if (storyState?.activeQuests.some((q) => q.status === "completed")) {
    addMoodWeight(weights, "triumphant", 0.8);
  }

  return delta;
}

export function deriveMusicState(
  activeMode: ActiveMode,
  storyPhase?: string,
  combo?: number,
  productivityScore?: number,
  sceneMood?: string,
  storyState?: StoryModeState,
  narrativeLog?: NarrationEvent[]
): { mood: MusicMood; intensity: number; trackLabel: string } {
  let mood: MusicMood = "ambient";
  let intensity = 0.4;

  if (activeMode === "story") {
    const baseMood = (storyPhase ? STORY_PHASE_TO_MOOD[storyPhase] : undefined) ?? "ambient";
    intensity = storyPhase === "escalation" || storyPhase === "climax" ? 0.85 : 0.5;
    const moodWeights: MoodWeights = {};
    addMoodWeight(moodWeights, baseMood, 2.5);

    const recentConversation = storyState?.conversationLog.at(-1);
    if (recentConversation) {
      intensity += applyInteractionMood(
        moodWeights,
        recentConversation.mode,
        recentConversation.relationshipDelta
      );

      const interactedCharacter = storyState?.characters.find(
        (c) => c.id === recentConversation.characterId
      );
      if (interactedCharacter) {
        intensity += applyPersonalityMood(moodWeights, interactedCharacter.personality);
      }

      // Keep "approach momentum" so recurring interaction style changes music over time.
      for (const entry of storyState?.conversationLog.slice(-4) ?? []) {
        addMoodWeight(moodWeights, "dialogue", 0.25);
        applyInteractionMood(moodWeights, entry.mode, entry.relationshipDelta);
      }
    }

    intensity += applyPlotDevelopments(moodWeights, storyPhase, narrativeLog, storyState);
    mood = pickMood(moodWeights, baseMood);
  } else {
    const score = productivityScore ?? 50;
    const c = combo ?? 0;
    if (c >= 5)       { mood = "triumphant"; intensity = 0.9; }
    else if (score > 80) { mood = "driving";    intensity = 0.8; }
    else if (score > 50) { mood = "focused";    intensity = 0.6; }
    else if (score > 20) { mood = "ambient";    intensity = 0.4; }
    else                 { mood = "idle";       intensity = 0.2; }
  }

  if (sceneMood && (sceneMood.includes("chaotic") || sceneMood.includes("tense"))) {
    intensity = Math.min(1, intensity + 0.15);
  }

  intensity = clamp01(intensity);
  const trackLabel = TRACK_METADATA[mood]?.label ?? mood;
  return { mood, intensity, trackLabel };
}

export async function requestTrack(signal: {
  mood: MusicMood;
  intensity: number;
  activeMode: ActiveMode;
}): Promise<{ trackUrl: string | null; trackLabel: string }> {
  const tempo = signal.intensity > 0.7 ? "fast" : signal.intensity > 0.4 ? "medium" : "slow";

  const track = await musicController.getTrack({
    mood: signal.mood,
    tempo,
    intensity: signal.intensity,
    environment: "unknown",
    activeMode: signal.activeMode,
  });

  return {
    trackUrl: track.url || null,
    trackLabel: TRACK_METADATA[signal.mood]?.label ?? signal.mood,
  };
}

// ─── Lyria API call ───────────────────────────────────────────────────────────

interface LyriaApiResponse {
  predictions: Array<{
    audioContent?: string;       // legacy/docs shape
    bytesBase64Encoded?: string; // current Vertex response shape
    mimeType?: string;           // may be omitted in some responses
  }>;
}

async function callLyriaAPI(signal: LyriaControlSignal): Promise<string | null> {
  if (!isLyriaConfigured()) {
    console.warn(
      "[Lyria] Missing credentials. Set LYRIA_PROJECT_ID and LYRIA_ACCESS_TOKEN in .env.local."
    );
    return null;
  }

  const { prompt, negative_prompt } = buildPrompt(signal);

  try {
    const response = await fetch(getLyriaEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        instances: [{ prompt, negative_prompt }],
        parameters: {},
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`[Lyria] API error ${response.status}:`, errText);
      return null;
    }

    const data: LyriaApiResponse = await response.json();
    const prediction = data.predictions?.[0];
    const audioContent =
      prediction?.audioContent ?? prediction?.bytesBase64Encoded ?? null;
    if (!audioContent) return null;

    // Return as data URI so the browser Audio element can play it directly
    return `data:audio/wav;base64,${audioContent}`;
  } catch (err) {
    console.error("[Lyria] fetch failed:", err);
    return null;
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────

// In-memory cache — prevents re-generating the same mood in the same process
const trackCache = new Map<string, LyriaTrack>();

function cacheKey(signal: LyriaControlSignal): string {
  return `${signal.mood}:${signal.tempo}:${Math.round(signal.intensity * 10)}`;
}

export const musicController: IMusicController = {
  async getTrack(signal: LyriaControlSignal): Promise<LyriaTrack> {
    const key = cacheKey(signal);
    if (trackCache.has(key)) return trackCache.get(key)!;

    const dataUri = await callLyriaAPI(signal);

    const track: LyriaTrack = {
      url: dataUri ?? "",
      mood: signal.mood,
      durationMs: 30_000, // Lyria always generates 30-second clips
    };

    if (dataUri) {
      trackCache.set(key, track);
    }

    return track;
  },

  getFallback(mood: MusicMood): string {
    return FALLBACK_TRACKS[mood] ?? "";
  },
};
