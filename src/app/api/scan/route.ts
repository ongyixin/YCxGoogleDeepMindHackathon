// POST /api/scan — process a camera frame, update scene graph
// Story Mode: returns character + relationship updates via storyHooks
// Quest Mode: returns context matches + mission activations via questHooks

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getSession, patchSession } from "@/lib/shared/sessions";
import { safeAnalyzeImageJSON } from "@/lib/shared/gemini";
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

      // Personify major newly detected objects — portrait generation is intentionally
      // deferred so the response is returned immediately and the user can start
      // interacting right away. The client calls POST /api/portrait for each new
      // character to generate sprites in the background.
      const newCharacters: typeof storyState.characters =
        majorNewObjects.length > 0
          ? await Promise.all(
              majorNewObjects.map(async (obj) => {
                const character = await personification.personify(
                  obj,
                  storyState.genre,
                  storyState.characters
                );
                return { ...character, portraitUrl: undefined, portraits: {} };
              })
            )
          : [];

      const allCharacters = [...storyState.characters, ...newCharacters];
      const relationships = newCharacters.length > 0
        ? relationshipManager.generateInterObjectRelationships(allCharacters)
        : storyState.relationships;

      const updatedStoryState = { ...storyState, characters: allCharacters, relationships };
      sessionPatch.storyState = updatedStoryState;
      response.storyHooks = { newCharacters: newCharacters.map((c) => c.id) };
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
