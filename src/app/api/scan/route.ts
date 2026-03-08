// POST /api/scan — process a camera frame, update scene graph
// Story Mode: returns character + relationship updates via storyHooks
// Quest Mode: returns context matches + mission activations via questHooks

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getSession, patchSession } from "@/lib/shared/sessions";
import { safeAnalyzeImageJSON } from "@/lib/shared/gemini";
import { visualGenerator, generateExpressionVariant } from "@/lib/shared/nanobanana";
import { sceneAnalysisPrompt, facePartAnalysisPrompt } from "@/lib/shared/prompts";
import { personification } from "@/lib/story/personification";
import { relationshipManager } from "@/lib/story/relationships";
import { contextDetector } from "@/lib/quest/contextDetector";
import type {
  ScanRequest,
  ScanResponse,
  SceneGraph,
  DetectedObject,
  NarrationEvent,
  StoryGenre,
  CharacterExpression,
} from "@/types";

const MAJOR_OBJECT_MIN_SALIENCE = 0.6;
const BACKGROUND_OBJECT_HIGH_SALIENCE = 0.82;
const MAX_NEW_CHARACTERS_PER_SCAN = 1;
const MAX_FACE_PARTS_PER_SCAN = 5;

/** Labels that indicate a human face is present in the scene. */
const FACE_LABELS = /\b(face|person|human|man|woman|girl|boy|child|kid|selfie|portrait|head|people)\b/i;

function isFaceObject(label: string): boolean {
  return FACE_LABELS.test(label);
}

/** IDs generated for face body parts use this prefix so we can identify them. */
const FACE_PART_ID_PREFIX = "facepart_";

function isFacePartId(id: string): boolean {
  return id.startsWith(FACE_PART_ID_PREFIX);
}

/**
 * When a face/person is in the scene, ask Gemini to decompose the face into
 * individual body-part DetectedObjects (hair, eyes, nose, mouth, eyebrows, etc.).
 * Returns an empty array on failure so callers can safely ignore it.
 */
async function analyzeFaceParts(
  frame: string,
  genre: StoryGenre
): Promise<DetectedObject[]> {
  const result = await safeAnalyzeImageJSON<{ faceBodyParts: DetectedObject[] }>(
    frame,
    facePartAnalysisPrompt(genre)
  );
  if (!result?.faceBodyParts?.length) return [];
  return result.faceBodyParts
    .slice(0, MAX_FACE_PARTS_PER_SCAN)
    .map((p) => ({
      id: p.id?.trim() || `${FACE_PART_ID_PREFIX}${p.label.replace(/\s+/g, "_")}_${uuidv4().slice(0, 6)}`,
      label: p.label,
      salience: Math.max(p.salience ?? 0.75, 0.65), // face parts are always notable
      position: p.position ?? "center",
      context: p.context ?? "",
    }));
}

function normalizeObjectLabel(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Returns the meaningful words (3+ chars, non-stop-words) from a label.
 * Used to detect when two differently-phrased labels refer to the same object.
 */
const STOP_WORDS = new Set(["the", "a", "an", "my", "your", "of", "with", "and", "for", "old", "new"]);

function labelKeywords(label: string): Set<string> {
  return new Set(
    normalizeObjectLabel(label)
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  );
}

/**
 * True when the two labels share at least one meaningful keyword,
 * indicating they likely describe the same physical object.
 * e.g. "floor lamp" vs "lamp" → true; "red chair" vs "blue chair" → true (both "chair").
 */
function labelsOverlap(labelA: string, labelB: string): boolean {
  const kA = labelKeywords(labelA);
  const kB = labelKeywords(labelB);
  for (const word of kA) {
    if (kB.has(word)) return true;
  }
  return false;
}

function isMajorObject(object: DetectedObject): boolean {
  if ((object.salience ?? 0) >= BACKGROUND_OBJECT_HIGH_SALIENCE) return true;
  return (
    (object.salience ?? 0) >= MAJOR_OBJECT_MIN_SALIENCE &&
    object.position !== "background"
  );
}

const FACE_PART_LABELS = new Set([
  "hair", "eyes", "eye", "nose", "mouth", "lips", "lip",
  "eyebrows", "eyebrow", "ears", "ear", "forehead", "chin", "jaw",
]);

function isFacePartLabel(label: string): boolean {
  return FACE_PART_LABELS.has(label.toLowerCase().trim());
}

/**
 * Build a portrait prompt for use with a reference camera snapshot.
 * Instructs Gemini to analyse the provided image and stylise it directly,
 * so the character visually derives from the actual physical object/scene.
 */
function buildCharacterPortraitPromptFromReference(input: {
  name: string;
  objectLabel: string;
  personality: string;
  emotionalState: string;
  genre: string;
  context?: string;
}): string {
  const genreStyleHints: Record<string, string> = {
    dating_sim:       "warm pastel pixel palette, romantic heart motifs, soft glowing highlights",
    mystery:          "cool desaturated pixel palette, high-contrast shadows, moody blue-grey tones",
    fantasy:          "jewel-toned vibrant pixel palette, magical sparkle effects, glowing aura",
    survival:         "earthy muted pixel palette, rugged battle-worn details, dramatic stark shadows",
    workplace_drama:  "crisp neutral pixel palette, sharp office-ready outfit, satirical bold expression",
    soap_opera:       "rich warm pixel palette, theatrical glamour, vivid dramatic coloring",
  };
  const genreStyle = genreStyleHints[input.genre] ?? "vibrant colors, expressive personality";

  const basePrompt = [
    `Analyze the provided image and generate a new version based on the following criteria:`,
    `\nCore Style: Transform the primary subject into a clean, modern pixel art style inspired specifically by Date Everything!. This aesthetic must feature vibrant colors, minimal dithering, and distinct, expressive outlines. Style variant: ${genreStyle}.`,
    `\nAnthropomorphization (The "Date Everything!" Rule): If the subject is an object, plant, or animal, give it human-like anatomy, posture, and personality. It should have clearly defined, large, expressive eyes, a mouth, and limbs (arms and legs) that allow it to stand and pose like a person. The features must be integrated charmingly into the original object's design.`,
    `\nComposition: FULL BODY from head to toe, standing centered.`,
    `Background: Solid PURE WHITE background (#ffffff). No other colors or elements should be in the background.`,
    `View: Show complete legs and feet. Do NOT crop at waist or chest. Single character only.`,
    `Restrictions: No text, no speech bubbles, no watermark, no overlays, no "aging" details.`,
  ].join(" ");

  const dynamicPrompt = [
    `Character identity: The character is named ${input.name}, a ${input.personality} personified ${input.objectLabel}. They look ${input.emotionalState}.`,
    input.context?.trim() ? `Visual traits to retain: ${input.context}.` : "",
    `Personality and Expression: The character should have a distinct, appealing personality consistent with their ${input.personality} nature.`,
  ].filter(Boolean).join(" ");

  return `${basePrompt}\n\n${dynamicPrompt}`;
}

function buildCharacterPortraitPrompt(input: {
  name: string;
  objectLabel: string;
  personality: string;
  emotionalState: string;
  genre: string;
  context?: string;
}): string {
  const genreStyleHints: Record<string, string> = {
    dating_sim:       "warm pastel pixel palette, romantic heart motifs, soft glowing highlights",
    mystery:          "cool desaturated pixel palette, high-contrast shadows, moody blue-grey tones",
    fantasy:          "jewel-toned vibrant pixel palette, magical sparkle effects, glowing aura",
    survival:         "earthy muted pixel palette, rugged battle-worn details, dramatic stark shadows",
    workplace_drama:  "crisp neutral pixel palette, sharp office-ready outfit, satirical bold expression",
    soap_opera:       "rich warm pixel palette, theatrical glamour, vivid dramatic coloring",
  };
  const genreStyle = genreStyleHints[input.genre] ?? "vibrant colors, expressive personality";

  const isFacePart = isFacePartLabel(input.objectLabel);

  // Face body parts: the feature IS the body — giant ${label} with stubby limbs sprouting out.
  // Regular objects: classic anthropomorphised sprite that retains object's visual identity.
  const coreDescription = isFacePart
    ? [
        `Chibi pixel art character who IS a giant living ${input.objectLabel} — the ${input.objectLabel} itself is the entire body, with tiny expressive arms and legs sprouting from it.`,
        `The ${input.objectLabel} dominates the silhouette completely.`,
        `Art style: ${genreStyle}, exaggerated chibi proportions, thick pixel outlines, comedic grotesque charm, vibrant colors.`,
      ].join(" ")
    : [
        `Clean modern pixel art character sprite inspired by the game "Date Everything!", depicting ${input.name}, a ${input.personality} personified ${input.objectLabel}.`,
        `The character is fully anthropomorphized: given a human-like body with two arms, two legs, and an upright standing pose. The design retains the shape and visual identity of the original ${input.objectLabel}, but integrates large expressive eyes, a charming mouth, and limbs organically into the object's form.`,
        `Art style: ${genreStyle}, vibrant colors, minimal dithering, distinct expressive outlines, pixel-perfect 2D sprite.`,
      ].join(" ");

  const basePrompt = [
    coreDescription,
    `\nComposition: FULL BODY from head to toe, standing centered.`,
    `Background: Solid PURE WHITE background (#ffffff). No other colors or elements should be in the background.`,
    `View: Show complete legs and feet. Do NOT crop at waist or chest. Single character only.`,
    `Restrictions: No text, no speech bubbles, no watermark, no overlays, no "aging" details.`,
  ].join(" ");

  const dynamicPrompt = [
    `Character identity: The character is named ${input.name}, a ${input.personality} personified ${input.objectLabel}. They look ${input.emotionalState}.`,
    input.context?.trim() ? `Visual traits to retain: ${input.context}.` : "",
    `Personality and Expression: The character should have a distinct, appealing personality consistent with their ${input.personality} nature.`,
  ].filter(Boolean).join(" ");

  return `${basePrompt}\n\n${dynamicPrompt}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ScanRequest;
    const session = getSession(body.sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const prompt = sceneAnalysisPrompt(session.activeMode, session.storyState?.genre);
    let sceneGraph: SceneGraph;

    const result = await safeAnalyzeImageJSON<SceneGraph>(body.frame, prompt);
    if (result) {
      sceneGraph = { ...result, capturedAt: Date.now() };
    } else {
      sceneGraph = { ...session.sceneGraph, capturedAt: Date.now() };
    }

    const sessionPatch: Partial<typeof session> = { sceneGraph };
    if (body.location) sessionPatch.location = body.location;

    const response: ScanResponse = {
      sceneGraph,
      narration: {
        text: "The scene has been analyzed.",
        tone: "documentary",
        timestamp: Date.now(),
        sourceMode: session.activeMode,
      } satisfies NarrationEvent,
    };

    if (session.activeMode === "story") {
      const storyState = session.storyState!;

      // ── Face detection: decompose any face into body-part characters ─────────
      const faceInScene = sceneGraph.objects.some((o) => isFaceObject(o.label));
      if (faceInScene && body.frame) {
        const faceParts = await analyzeFaceParts(body.frame, storyState.genre);
        if (faceParts.length > 0) {
          // Merge body parts into the scene graph so ObjectLabels can position them
          sceneGraph = {
            ...sceneGraph,
            objects: [...sceneGraph.objects, ...faceParts],
          };
          // Sync the updated scene graph back into response and patch
          response.sceneGraph = sceneGraph;
          sessionPatch.sceneGraph = sceneGraph;
        }
      }
      // ─────────────────────────────────────────────────────────────────────────

      const existingObjectLabels = storyState.characters.map((c) =>
        normalizeObjectLabel(c.objectLabel)
      );
      const newObjects = sceneGraph.objects.filter((o) => {
        const normalized = normalizeObjectLabel(o.label);
        return !existingObjectLabels.some(
          (existing) => existing === normalized || labelsOverlap(existing, o.label)
        );
      });

      // Regular objects: apply salience + position filter, capped at MAX_NEW_CHARACTERS_PER_SCAN
      const majorNewRegularObjects = newObjects
        .filter((o) => !isFacePartId(o.id))
        .filter(isMajorObject)
        .sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0))
        .slice(0, MAX_NEW_CHARACTERS_PER_SCAN);

      // Face body-part objects: always personified when newly detected (skip salience gate)
      const newFacePartObjects = newObjects
        .filter((o) => isFacePartId(o.id))
        .sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0))
        .slice(0, MAX_FACE_PARTS_PER_SCAN);

      const majorNewObjects = [...majorNewRegularObjects, ...newFacePartObjects];

      // Personify only major newly detected objects and generate portraits.
      const newCharactersWithPortraits: typeof storyState.characters =
        majorNewObjects.length > 0
          ? await Promise.all(
              majorNewObjects.map(async (obj) => {
                const character = await personification.personify(
                  obj,
                  storyState.genre,
                  storyState.characters
                );
                // Use the live camera snapshot as the visual reference so the
                // generated character is grounded in the actual physical subject.
                const portraitPrompt = body.frame
                  ? buildCharacterPortraitPromptFromReference({
                      name: character.name,
                      objectLabel: character.objectLabel,
                      personality: character.personality,
                      emotionalState: character.emotionalState,
                      genre: storyState.genre,
                      context: obj.context,
                    })
                  : buildCharacterPortraitPrompt({
                      name: character.name,
                      objectLabel: character.objectLabel,
                      personality: character.personality,
                      emotionalState: character.emotionalState,
                      genre: storyState.genre,
                      context: obj.context,
                    });
                const portraitResult = await visualGenerator.generate({
                  type: "character_portrait",
                  prompt: portraitPrompt,
                  style: "cinematic full-body character sprite render",
                  sessionContext: `${storyState.genre} ${character.objectLabel}`,
                  referenceImage: body.frame || undefined,
                });

                const neutralUrl = portraitResult?.imageUrl || undefined;

                // Build character identity string for expression variants
                const characterIdentity = `${character.name}, a ${character.personality} personified ${character.objectLabel}`;

                // Generate talking variant in parallel using the neutral sprite as reference
                const talkingUrl = neutralUrl
                  ? await generateExpressionVariant("talking", neutralUrl, characterIdentity).catch(() => null) ?? undefined
                  : undefined;

                const portraits: Partial<Record<CharacterExpression, string>> = {};
                if (neutralUrl) portraits.neutral = neutralUrl;
                if (talkingUrl) portraits.talking = talkingUrl;

                return {
                  ...character,
                  portraitUrl: neutralUrl,
                  portraits,
                };
              })
            )
          : [];

      const allCharacters = [...storyState.characters, ...newCharactersWithPortraits];
      const relationships = newCharactersWithPortraits.length > 0
        ? relationshipManager.generateInterObjectRelationships(allCharacters)
        : storyState.relationships;

      const updatedStoryState = { ...storyState, characters: allCharacters, relationships };
      sessionPatch.storyState = updatedStoryState;
      response.storyHooks = { newCharacters: newCharactersWithPortraits.map((c) => c.id) };
      // Return full state so clients can sync without a separate round-trip
      response.updatedStoryState = updatedStoryState;
    } else {
      const questState = session.questState!;
      const { activations, matches } = contextDetector.match(sceneGraph, questState.missions);

      let updatedQuestState = questState;
      if (activations.length > 0) {
        const missions = questState.missions.map((m) =>
          activations.includes(m.id) ? { ...m, status: "active" as const, startedAt: Date.now() } : m
        );
        updatedQuestState = {
          ...questState,
          missions,
          activeMissionId: activations[0] ?? questState.activeMissionId,
        };
        sessionPatch.questState = updatedQuestState;
      }

      response.questHooks = { contextMatches: matches, missionActivations: activations };
      // Return full state so clients can sync without a separate round-trip
      response.updatedQuestState = updatedQuestState;
    }

    patchSession(body.sessionId, sessionPatch);

    return NextResponse.json(response);
  } catch (err) {
    console.error("[/api/scan]", err);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
