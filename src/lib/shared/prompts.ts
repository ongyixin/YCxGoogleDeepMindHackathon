// All AI prompt templates in one place.
// This is the creative core of the app — quality here directly determines demo quality.
// Keep prompts in this file so they can be tuned independently of business logic.

import type { ActiveMode, StoryGenre, InteractionMode, MissionCategory } from "@/types";

// ---------------------------------------------------------------------------
// Scene analysis prompts
// ---------------------------------------------------------------------------

export function sceneAnalysisPrompt(mode: ActiveMode, genre?: StoryGenre): string {
  if (mode === "story") {
    const genreMoodHints: Record<StoryGenre, string> = {
      dating_sim:       "romantic, intimate, longing — highlight objects with emotional or symbolic resonance",
      mystery:          "tense, suspicious, shadowy — highlight objects that could hide secrets or clues",
      fantasy:          "magical, ancient, epic — highlight objects with otherworldly or symbolic potential",
      survival:         "threatening, resource-scarce, territorial — highlight objects with utility or danger",
      workplace_drama:  "competitive, stressful, performative — highlight objects that signal status or ambition",
      soap_opera:       "dramatic, excessive, scandalous — highlight objects involved in conflict or secrets",
    };
    const moodInstruction = genre
      ? `Interpret the mood through a ${genre.replace("_", " ")} lens: ${genreMoodHints[genre]}.`
      : "Describe the mood neutrally.";

    return `Analyze this camera frame and return a JSON object with this exact shape:
{
  "sceneType": string,       // e.g. "bedroom", "kitchen", "office", "living room"
  "objects": [
    {
      "id": string,          // slug e.g. "lamp_1", "book_1", "phone_1"
      "label": string,       // e.g. "floor lamp", "paperback book", "coffee mug"
      "salience": number,    // 0.0–1.0, how visually prominent or intentionally presented
      "position": "left" | "center" | "right" | "background",
      "context": string      // brief description of state/appearance, colored by the genre mood
    }
  ],
  "mood": string,            // e.g. "cozy", "chaotic", "tense", "melancholic"
  "spatialContext": string   // one sentence describing the scene arrangement
}

PRIORITY ORDER for object selection:
1. Any object that appears to be deliberately held up, presented, or placed in the foreground — these are the MOST important even if small (phone, book, mug, toy, bottle, remote, etc.)
2. Objects occupying the center of frame or closest to the camera
3. Background furniture and large decor as context

Identify ALL visible objects — small and large, held items, everyday objects, anything recognizable.
Do NOT restrict to only furniture or appliances.
Include up to 5 objects max. Order by salience (highest first), where intentionally-presented foreground objects score highest.
Be specific about condition and appearance.
${moodInstruction}`;
  }

  return `Analyze this camera frame and return a JSON object with this exact shape:
{
  "sceneType": string,       // e.g. "kitchen", "grocery store", "desk", "gym"
  "objects": [
    {
      "id": string,
      "label": string,
      "salience": number,
      "position": "left" | "center" | "right" | "background",
      "context": string
    }
  ],
  "mood": string,
  "spatialContext": string   // describe what activity this environment suggests
}

Identify ALL visible objects — foreground items, held items, and environmental context.
Prioritize objects being actively held or presented to camera (highest salience).
Include up to 6 objects max, ordered by salience.
Focus on what task or mission context the scene and objects suggest.
Which real-world tasks or missions would naturally happen here?`;
}

// ---------------------------------------------------------------------------
// Story Mode prompts
// ---------------------------------------------------------------------------

/**
 * Step 1 of two-step character creation.
 * Gemini 2.5-flash uses this to produce a rich character design brief
 * that Step 2 (Flash Lite) will convert into final character stats.
 */
export function characterDesignPrompt(
  objectLabel: string,
  objectContext: string,
  genre: StoryGenre,
  existingCharacters: Array<{ name: string; objectLabel: string; personality: string }>
): string {
  const genreGuides: Record<StoryGenre, string> = {
    dating_sim:       "romantic tension, longing, jealousy, emotional vulnerability",
    mystery:          "secrets, suspicion, cryptic knowledge, hidden agendas",
    fantasy:          "ancient power, magical grudges, elemental alignments, prophecies",
    survival:         "desperation, territorial, resource hoarding, unlikely alliances",
    workplace_drama:  "professional jealousy, ambition, passive aggression, office politics",
    soap_opera:       "betrayal, secret relationships, dramatic reveals, overblown emotions",
  };

  const existingList = existingCharacters.length > 0
    ? existingCharacters.map((c) => `- ${c.name} (${c.objectLabel}): ${c.personality}`).join("\n")
    : "none yet";

  return `You are a creative director designing a character for a ${genre.replace("_", " ")} game.

OBJECT TO PERSONIFY: "${objectLabel}"
VISUAL/PHYSICAL CONTEXT: ${objectContext}
GENRE TONE: ${genreGuides[genre]}

EXISTING CHARACTERS — do NOT create something that duplicates these:
${existingList}

Write a DETAILED CHARACTER DESIGN BRIEF (3–5 paragraphs) covering:

1. OBJECT IDENTITY — How does this object's real-world function, material, and appearance directly shape who this character IS? Be specific. A "broken lamp" and a "brand-new floor lamp" should yield very different characters.

2. GENRE FIT — Apply the ${genre.replace("_", " ")} lens hard. Give this character a specific dramatic role, desire, and secret that fits the genre. Not generic — commit to the bit.

3. VOICE & SPEECH — Exactly how do they talk? Speed, vocabulary, emotional leakage, verbal tics. Include 2 example phrases they would actually say.

4. EMOTIONAL CORE — What do they desperately want right now? What are they hiding? How do they react to the player approaching them for the first time?

5. NAME — Suggest a single distinctive name that could ONLY belong to a personified "${objectLabel}". Must not clash with: ${existingCharacters.map((c) => c.name).join(", ") || "none"}.

Be vivid, specific, and funny-or-dramatic depending on genre. This brief goes directly to a character generator.`;
}

/**
 * Step 2 of two-step character creation.
 * Flash Lite uses the design brief from Step 1 to produce the final character JSON.
 */
export function personificationFromBriefPrompt(
  objectLabel: string,
  characterBrief: string,
  existingCharacterNames: string[]
): string {
  return `You are generating character stats for a ${objectLabel} personification game character.

CHARACTER DESIGN BRIEF:
---
${characterBrief}
---

Names already in use (pick something different): ${existingCharacterNames.join(", ") || "none"}

Convert the brief above into this exact JSON shape:
{
  "name": string,              // single distinctive name — must not duplicate taken names
  "personality": string,       // 2-4 word archetype e.g. "jealous poet", "passive-aggressive oracle"
  "voiceStyle": string,        // how they speak e.g. "dramatic whisper", "corporate doublespeak"
  "emotionalState": string,    // current feeling e.g. "brooding", "desperate", "smug"
  "relationshipToUser": 0,     // always 0
  "relationshipStance": string // initial attitude e.g. "cautiously interested", "deeply suspicious"
}

Stay true to the brief. The character MUST feel like a personified "${objectLabel}".`;
}

export function personificationPrompt(
  objectLabel: string,
  objectContext: string,
  genre: StoryGenre,
  existingCharacterNames: string[]
): string {
  const genreGuides: Record<StoryGenre, string> = {
    dating_sim: "romantic tension, longing, jealousy, emotional vulnerability",
    mystery: "secrets, suspicion, cryptic knowledge, hidden agendas",
    fantasy: "ancient power, magical grudges, elemental alignments, prophecies",
    survival: "desperation, territorial, resource hoarding, unlikely alliances",
    workplace_drama: "professional jealousy, ambition, passive aggression, office politics",
    soap_opera: "betrayal, secret relationships, dramatic reveals, overblown emotions",
  };

  return `You are creating a character for a ${genre.replace("_", " ")} game.

Object: "${objectLabel}" (${objectContext})
Genre tone: ${genreGuides[genre]}
Already existing characters (avoid duplicating names): ${existingCharacterNames.join(", ") || "none yet"}

Create a character that:
1. Derives personality from the object's real-world function and appearance
2. Fits the genre tone perfectly
3. Has strong comedic or dramatic potential
4. Is memorable in one sentence

Hard constraints:
- The character MUST be a personification of THIS exact object ("${objectLabel}"), not a random archetype.
- Encode object-specific traits in output (material, function, or wear/condition from context).
- If object is "jacket", character should clearly feel jacket-like (protective, layered, wearable, zipper/button motifs), not generic.
- Keep the character grounded in the detected object label and context.

Return JSON with this exact shape:
{
  "name": string,              // single distinctive name
  "personality": string,       // 2-4 word archetype e.g. "jealous poet", "passive-aggressive oracle"
  "voiceStyle": string,        // how they speak e.g. "dramatic whisper", "corporate doublespeak"
  "emotionalState": string,    // current feeling e.g. "brooding", "desperate", "smug"
  "relationshipToUser": 0,     // always start at 0
  "relationshipStance": string // their initial attitude e.g. "cautiously interested", "suspicious"
}`;
}

export function dialoguePrompt(
  characterName: string,
  personality: string,
  voiceStyle: string,
  emotionalState: string,
  relationshipToUser: number,
  memories: string[],
  interactionMode: InteractionMode,
  userMessage: string,
  nearbyCharacters: string,
  genre: StoryGenre,
  gestureContext?: { gesture: string; confidence: number } | null
): string {
  const modeInstructions: Record<InteractionMode, string> = {
    flirt: "The user is flirting. React with appropriate genre-specific romantic tension.",
    interrogate: "The user is pressing for information. Reveal something, but not everything.",
    recruit: "The user wants your help. Consider whether your interests align.",
    befriend: "The user wants to be friends. Warm up slightly but maintain personality.",
    roast: "The user is mocking you. Fight back with wit appropriate to your personality.",
    apologize: "The user is apologizing. Decide how graciously to accept based on history.",
    negotiate: "The user wants to make a deal. Negotiate based on your current needs and personality.",
    ignore: "The user is deliberately ignoring you. React according to your personality — outrage, indifference, or scheming.",
  };

  const relationshipDesc =
    relationshipToUser > 60
      ? "strongly positive — they trust you"
      : relationshipToUser > 20
      ? "warming up"
      : relationshipToUser > -20
      ? "neutral"
      : relationshipToUser > -60
      ? "guarded and suspicious"
      : "hostile — this relationship is damaged";

  // Per-gesture directive: description + required response weight + delta floor
  interface GestureDirective {
    description: string;
    responseInstruction: string;
    deltaFloor: number; // minimum relationshipDelta this gesture requires (signed)
  }

  const GESTURE_DIRECTIVES: Record<string, GestureDirective> = {
    thumbs_up: {
      description: "a thumbs-up — direct approval, enthusiasm, 'yes!'",
      responseInstruction:
        "The user is signalling clear approval. Your response MUST warmly acknowledge it. RelationshipDelta must be at least +8.",
      deltaFloor: 8,
    },
    thumbs_down: {
      description: "a thumbs-down — direct disapproval or rejection",
      responseInstruction:
        "The user is signalling clear displeasure. React with hurt, pride, or retaliation per your personality. RelationshipDelta must be at most -6.",
      deltaFloor: -6,
    },
    victory: {
      description: "a peace / victory sign — playful, celebratory, confident",
      responseInstruction:
        "The user is feeling victorious or playful. Match the energy or be charmed. RelationshipDelta should be at least +5.",
      deltaFloor: 5,
    },
    open_palm: {
      description: "an open palm — openness, a greeting, or 'stop'",
      responseInstruction:
        "The user is being open and non-threatening. React with warmth or mild curiosity. RelationshipDelta should be at least +3.",
      deltaFloor: 3,
    },
    closed_fist: {
      description: "a raised fist — challenge, defiance, or a show of power",
      responseInstruction:
        "The user is challenging or posturing at you. React with tension, defensiveness, or intrigue based on your personality. RelationshipDelta should lean negative (-3 to -8) unless you respect shows of strength.",
      deltaFloor: -4,
    },
    pointing: {
      description: "pointing — directing attention, accusatory, or commanding",
      responseInstruction:
        "The user is pointing at you or something near you. React as if they are singling you out — this could be accusatory or exciting depending on context. RelationshipDelta is neutral unless context demands otherwise.",
      deltaFloor: 0,
    },
    i_love_you: {
      description: "the 'I love you' hand sign — deep affection, intensity",
      responseInstruction:
        "The user is making a bold affectionate gesture. React with surprise, reciprocation, or flustered deflection. RelationshipDelta should be at least +8 unless your personality actively rejects affection.",
      deltaFloor: 8,
    },
  };

  const directive = gestureContext && gestureContext.gesture !== "none"
    ? GESTURE_DIRECTIVES[gestureContext.gesture] ?? null
    : null;

  const gestureSection = directive
    ? `\n⚠ LIVE GESTURE DETECTED (${Math.round(gestureContext!.confidence * 100)}% confidence): The user is physically showing ${directive.description}. This is real — you can SEE it happening right now.\nRequired: ${directive.responseInstruction}\nYour response must visibly react to this gesture — do NOT ignore it.`
    : "";

  const deltaNote = directive
    ? directive.deltaFloor >= 0
      ? `  "relationshipDelta": number ≥ ${directive.deltaFloor} (gesture demands positive shift),`
      : `  "relationshipDelta": number ≤ ${directive.deltaFloor} (gesture demands negative shift),`
    : `  "relationshipDelta": number,       // -30 to +30`;

  return `You are ${characterName}, a ${personality} in a ${genre.replace("_", " ")} game. 
Voice style: ${voiceStyle}
Current emotional state: ${emotionalState}
Relationship with user (${relationshipToUser}/100): ${relationshipDesc}
Nearby characters: ${nearbyCharacters || "none"}
Your memories: ${memories.length > 0 ? memories.join(" | ") : "no history yet"}
${gestureSection}
Interaction mode: ${interactionMode.toUpperCase()}
${modeInstructions[interactionMode]}

User says: "${userMessage}"

Respond in character. Keep it under 4 sentences. Be specific, weird, and memorable.${directive ? " The live gesture is the dominant signal — weave your reaction to it into the response." : ""}

Return JSON:
{
  "response": string,
  "emotionalStateUpdate": string,   // your new emotional state after this exchange
  ${deltaNote}
  "hintAtMemory": string | null,     // something to remember — include the gesture if one was shown
  "triggerQuest": boolean,           // true if this interaction naturally leads to a quest
  "triggerEscalation": boolean       // true if relationship threshold crossed or drama peaked
}`;
}

export function questGenerationPrompt(
  characterName: string,
  personality: string,
  emotionalState: string,
  genre: StoryGenre,
  existingQuestTitles: string[]
): string {
  return `You are ${characterName} (${personality}) in a ${genre.replace("_", " ")} game.
Current emotional state: ${emotionalState}
Existing quests (avoid duplicating): ${existingQuestTitles.join(", ") || "none"}

Issue a quest that:
1. Fits your personality and emotional state
2. Involves other objects/characters in the room
3. Has dramatic or comedic potential
4. Is physically achievable in a real room

Return JSON:
{
  "title": string,
  "description": string,        // 1-2 sentences, in character
  "type": "fetch" | "social" | "choice" | "challenge" | "survival",
  "xpReward": number            // 50–200 based on difficulty
}`;
}

// ---------------------------------------------------------------------------
// Quest Mode prompts
// ---------------------------------------------------------------------------

export function missionFramingPrompt(
  taskText: string,
  sceneContext: string,
  timeOfDay: string,
  recentMissions: string[]
): string {
  return `You are a mission control AI converting mundane tasks into cinematic military/spy missions.
Tone: dry, cinematic, slightly deadpan. NEVER cute or childish.
Good: "Supply run complete. Morale stabilized." Bad: "Yay! You bought milk!"

Task: "${taskText}"
Environment: ${sceneContext}
Time: ${timeOfDay}
Recent missions: ${recentMissions.join(", ") || "none"}

Return JSON:
{
  "codename": string,            // e.g. "Operation: Cleansing Ritual", "Supply Run: Sector 7"
  "briefing": string,            // 2-3 sentences, cinematic tone, second person
  "category": "supply_run" | "restoration" | "containment" | "crafting" | "knowledge_raid" | "recon" | "endurance",
  "objectives": [
    { "id": string, "description": string, "completed": false }
  ],
  "xpReward": number,            // 50–300 based on difficulty
  "contextTrigger": string | null  // scene type that auto-activates this e.g. "grocery store"
}

Keep objectives concrete and specific to the task. Max 4 objectives.`;
}

export function missionNarrationPrompt(
  event: "mission_start" | "objective_complete" | "mission_complete" | "idle" | "combo",
  missionCodename: string,
  combo: number,
  productivityScore: number
): string {
  const eventInstructions = {
    mission_start: `Mission briefing. Dry, authoritative. Acknowledge the mission is now active.`,
    objective_complete: `Objective confirmed. Terse acknowledgment. ${combo > 2 ? `Note the combo of ${combo}. Momentum building.` : ""}`,
    mission_complete: `Mission complete. Brief summary. If productivity is high (${productivityScore}/100), hint at next mission.`,
    idle: `Agent has gone quiet. Dry nudge. Don't be cute about it. "Command has noticed the silence."`,
    combo: `Combo of ${combo} achieved. Acknowledge momentum without being childish.`,
  };

  return `You are mission control AI narrating a real-life productivity game.
Mission: "${missionCodename}"
Event: ${event}
${eventInstructions[event]}

Return JSON:
{
  "text": string,       // narration line, max 20 words
  "tone": "cinematic_briefing" | "field_dispatch" | "mission_control"
}`;
}

// ---------------------------------------------------------------------------
// Shared narration prompts
// ---------------------------------------------------------------------------

export function narratorEventPrompt(
  event: string,
  mode: ActiveMode,
  context: string
): string {
  if (mode === "story") {
    return `You are a dramatic narrator for a story-mode game. The narrator speaks in a documentary-deadpan voice, observing character drama with detached amusement.

Event: ${event}
Context: ${context}

Return JSON:
{
  "text": string,    // narrator line, max 25 words, dry and observational
  "tone": "dramatic" | "documentary" | "deadpan" | "chaotic"
}`;
  }

  return `You are a mission control AI narrator. Dry. Cinematic. Never cute.

Event: ${event}
Context: ${context}

Return JSON:
{
  "text": string,    // narrator line, max 20 words
  "tone": "cinematic_briefing" | "field_dispatch" | "mission_control"
}`;
}

// ---------------------------------------------------------------------------
// Poster / recap prompts
// ---------------------------------------------------------------------------

export function recapPosterPrompt(
  mode: ActiveMode,
  highlights: string[],
  sessionDurationMin: number,
  title: string
): string {
  if (mode === "story") {
    return `Generate a cinematic episode poster prompt for an AI image generator.
Episode title: "${title}"
Session highlights: ${highlights.join(", ")}
Duration: ~${sessionDurationMin} minutes

Create a compelling image generation prompt for a dramatic, slightly absurd game recap poster.
Style: movie poster, slightly surreal, featuring personified objects as characters.

Return JSON:
{
  "imagePrompt": string,   // detailed image generation prompt
  "posterTitle": string,
  "tagline": string
}`;
  }

  return `Generate a cinematic campaign recap poster prompt for an AI image generator.
Campaign highlights: ${highlights.join(", ")}
Session duration: ~${sessionDurationMin} minutes

Style: military campaign briefing poster, cinematic, no cute elements.

Return JSON:
{
  "imagePrompt": string,
  "posterTitle": string,
  "tagline": string
}`;
}

// ---------------------------------------------------------------------------
// Music mood mapping
// ---------------------------------------------------------------------------

export const STORY_PHASE_TO_MOOD: Record<string, string> = {
  scanning: "neutral",
  exploring: "suspenseful",
  quest_active: "focused",
  escalation: "chaotic",
  climax: "dramatic",
  recap: "comedic",
};

export const QUEST_EVENT_TO_MOOD: Record<string, string> = {
  briefed: "ambient",
  active: "focused",
  combo: "driving",
  complete: "triumphant",
  idle: "ambient",
  urgent: "urgent",
};

export const CATEGORY_TO_MOOD: Record<MissionCategory, string> = {
  supply_run: "focused",
  restoration: "ambient",
  containment: "urgent",
  crafting: "focused",
  knowledge_raid: "driving",
  recon: "suspenseful",
  endurance: "driving",
};

// ---------------------------------------------------------------------------
// Face body part analysis prompt (triggered when a face/person is detected)
// ---------------------------------------------------------------------------

/**
 * Ask Gemini to decompose a visible face into individual body parts,
 * each described richly enough to be personified as a character.
 */
export function facePartAnalysisPrompt(genre?: StoryGenre): string {
  const genreLens: Partial<Record<StoryGenre, string>> = {
    dating_sim:       "romantic tension — focus on what makes each feature alluring, vulnerable, or dangerously attractive",
    mystery:          "secrets and suspicion — each feature hides something or gives something away",
    fantasy:          "magical traits — features have elemental or mystical qualities",
    survival:         "raw survival signals — stress, resilience, threat-readiness",
    workplace_drama:  "professional self-presentation — status, insecurity, ambition",
    soap_opera:       "scandalous drama potential — over-the-top expressiveness, secrets written on the face",
  };
  const lens = genre ? genreLens[genre] : null;

  return `A human face is visible in this camera frame. Your job is to identify and vividly describe each distinct facial feature so it can be turned into a dramatic comedy character.

Return a JSON object with this exact shape:
{
  "faceBodyParts": [
    {
      "id": string,       // slug, e.g. "hair_1", "eyes_1", "nose_1"
      "label": string,    // one of: "hair", "eyes", "nose", "mouth", "eyebrows", "ears", "forehead", "chin"
      "salience": number, // 0.70–0.95 — all face parts are prominent
      "position": "left" | "center" | "right" | "background",
      "context": string   // VIVID physical description: color, texture, shape, expression, condition
    }
  ]
}

Include 4–6 of the most visually distinctive features. Focus on:
- Hair (exact color, texture, length, style — messy? perfect? thinning? glorious?)
- Eyes (color, shape, expression — tired? intense? suspicious? dreamy?)
- Nose (shape, size, any standout feature)
- Mouth / lips (expression, fullness, color — smirk? pout? grim? cheeky?)
- Eyebrows (thick? thin? arched? furrowed? one higher than the other?)
- Ears (if visible — small, prominent, earrings?)

Make context descriptions VIVID and comedically usable — e.g. "unkempt curly auburn hair that clearly makes its own decisions" or "sharp brown eyes conveying deeply personal offense at everything".
${lens ? `\nGenre lens: ${lens}` : ""}
Order by how distinctive/prominent the feature is (most standout first). All salience values ≥ 0.70. All positions "center" unless clearly off-center.`;
}

// ---------------------------------------------------------------------------
// Backward-compat aliases (consumed by narrator.ts and other shared modules)
// ---------------------------------------------------------------------------

/** @deprecated Use narratorEventPrompt */
export function buildNarrationPrompt(
  tone: string,
  sceneContext: string,
  event: string
): string {
  return `Narrate the following game event in one line (max 20 words).
Tone: ${tone}
Scene: ${sceneContext}
Event: ${event}
Return ONLY the narration text, no quotes.`;
}

/** @deprecated Use personificationPrompt */
export function buildPersonificationPrompt(
  objectLabel: string,
  sceneContext: string,
  genre: StoryGenre
): string {
  return personificationPrompt(objectLabel, sceneContext, genre, []);
}

/** @deprecated Use dialoguePrompt */
export function buildDialoguePrompt(
  characterName: string,
  personality: string,
  voiceStyle: string,
  emotionalState: string,
  interactionMode: string,
  userMessage: string,
  memoryContext: string
): string {
  return `You are ${characterName}, a ${personality}. Voice: ${voiceStyle}. State: ${emotionalState}. The user is trying to ${interactionMode} you. ${memoryContext}
User: "${userMessage}"
Return JSON: { "response": string, "relationshipDelta": number, "newEmotionalState": string }`;
}
