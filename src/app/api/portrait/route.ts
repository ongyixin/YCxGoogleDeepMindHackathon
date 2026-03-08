// POST /api/portrait — generate neutral + talking portrait sprites for a character.
// Called by the client immediately after /api/scan returns, so image generation
// happens in the background while the user can already start interacting.

import { NextRequest, NextResponse } from "next/server";
import { getSession, patchSession } from "@/lib/shared/sessions";
import { visualGenerator, generateExpressionVariant } from "@/lib/shared/nanobanana";
import type { ObjectCharacter, CharacterExpression, StoryGenre } from "@/types";

interface PortraitRequest {
  sessionId: string;
  characterId: string;
  /** Base64-encoded camera frame used as visual reference for the portrait */
  referenceFrame?: string;
}

interface PortraitResponse {
  portraits: Partial<Record<CharacterExpression, string>>;
}

// ─── Portrait prompt builders (moved from /api/scan) ─────────────────────────

const GENRE_STYLE_HINTS: Record<string, string> = {
  dating_sim:      "warm pastel pixel palette, romantic heart motifs, soft glowing highlights",
  mystery:         "cool desaturated pixel palette, high-contrast shadows, moody blue-grey tones",
  fantasy:         "jewel-toned vibrant pixel palette, magical sparkle effects, glowing aura",
  survival:        "earthy muted pixel palette, rugged battle-worn details, dramatic stark shadows",
  workplace_drama: "crisp neutral pixel palette, sharp office-ready outfit, satirical bold expression",
  soap_opera:      "rich warm pixel palette, theatrical glamour, vivid dramatic coloring",
};

const FACE_PART_LABELS = new Set([
  "hair", "eyes", "eye", "nose", "mouth", "lips", "lip",
  "eyebrows", "eyebrow", "ears", "ear", "forehead", "chin", "jaw",
]);

function isFacePartLabel(label: string): boolean {
  return FACE_PART_LABELS.has(label.toLowerCase().trim());
}

function buildPortraitPromptFromReference(input: {
  name: string; objectLabel: string; personality: string;
  emotionalState: string; genre: string; context?: string;
}): string {
  const genreStyle = GENRE_STYLE_HINTS[input.genre] ?? "vibrant colors, expressive personality";
  const base = [
    `Analyze the provided image and generate a new version based on the following criteria:`,
    `\nCore Style: Transform the primary subject into a clean, modern pixel art style inspired specifically by Date Everything!. This aesthetic must feature vibrant colors, minimal dithering, and distinct, expressive outlines. Style variant: ${genreStyle}.`,
    `\nAnthropomorphization (The "Date Everything!" Rule): If the subject is an object, plant, or animal, give it human-like anatomy, posture, and personality. It should have clearly defined, large, expressive eyes, a mouth, and limbs (arms and legs) that allow it to stand and pose like a person. The features must be integrated charmingly into the original object's design.`,
    `\nComposition: FULL BODY from head to toe, standing centered.`,
    `Background: Solid PURE WHITE background (#ffffff). No other colors or elements should be in the background.`,
    `View: Show complete legs and feet. Do NOT crop at waist or chest. Single character only.`,
    `Restrictions: No text, no speech bubbles, no watermark, no overlays, no "aging" details.`,
  ].join(" ");
  const dynamic = [
    `Character identity: The character is named ${input.name}, a ${input.personality} personified ${input.objectLabel}. They look ${input.emotionalState}.`,
    input.context?.trim() ? `Visual traits to retain: ${input.context}.` : "",
    `Personality and Expression: The character should have a distinct, appealing personality consistent with their ${input.personality} nature.`,
  ].filter(Boolean).join(" ");
  return `${base}\n\n${dynamic}`;
}

function buildPortraitPrompt(input: {
  name: string; objectLabel: string; personality: string;
  emotionalState: string; genre: string; context?: string;
}): string {
  const genreStyle = GENRE_STYLE_HINTS[input.genre] ?? "vibrant colors, expressive personality";
  const isFacePart = isFacePartLabel(input.objectLabel);
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
  const base = [
    coreDescription,
    `\nComposition: FULL BODY from head to toe, standing centered.`,
    `Background: Solid PURE WHITE background (#ffffff). No other colors or elements should be in the background.`,
    `View: Show complete legs and feet. Do NOT crop at waist or chest. Single character only.`,
    `Restrictions: No text, no speech bubbles, no watermark, no overlays, no "aging" details.`,
  ].join(" ");
  const dynamic = [
    `Character identity: The character is named ${input.name}, a ${input.personality} personified ${input.objectLabel}. They look ${input.emotionalState}.`,
    input.context?.trim() ? `Visual traits to retain: ${input.context}.` : "",
    `Personality and Expression: The character should have a distinct, appealing personality consistent with their ${input.personality} nature.`,
  ].filter(Boolean).join(" ");
  return `${base}\n\n${dynamic}`;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PortraitRequest;
    const session = getSession(body.sessionId);
    if (!session || !session.storyState) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const character = session.storyState.characters.find(
      (c: ObjectCharacter) => c.id === body.characterId
    );
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // If portraits are already generated, return them immediately.
    const existing = character.portraits ?? {};
    if (existing.neutral) {
      return NextResponse.json({ portraits: existing } satisfies PortraitResponse);
    }

    const genre = session.storyState.genre as StoryGenre;
    const portraitPrompt = body.referenceFrame
      ? buildPortraitPromptFromReference({
          name: character.name,
          objectLabel: character.objectLabel,
          personality: character.personality,
          emotionalState: character.emotionalState,
          genre,
        })
      : buildPortraitPrompt({
          name: character.name,
          objectLabel: character.objectLabel,
          personality: character.personality,
          emotionalState: character.emotionalState,
          genre,
        });

    const portraitResult = await visualGenerator.generate({
      type: "character_portrait",
      prompt: portraitPrompt,
      style: "cinematic full-body character sprite render",
      sessionContext: `${genre} ${character.objectLabel}`,
      referenceImage: body.referenceFrame || undefined,
    });

    const neutralUrl = portraitResult?.imageUrl || undefined;
    const characterIdentity = `${character.name}, a ${character.personality} personified ${character.objectLabel}`;

    const talkingUrl = neutralUrl
      ? await generateExpressionVariant("talking", neutralUrl, characterIdentity).catch(() => null) ?? undefined
      : undefined;

    const portraits: Partial<Record<CharacterExpression, string>> = { ...existing };
    if (neutralUrl) portraits.neutral = neutralUrl;
    if (talkingUrl) portraits.talking = talkingUrl;

    // Persist back to session so /api/expressions can skip neutral/talking later.
    const updatedCharacters = session.storyState.characters.map((c: ObjectCharacter) =>
      c.id === body.characterId
        ? { ...c, portraitUrl: neutralUrl, portraits }
        : c
    );
    patchSession(body.sessionId, {
      storyState: { ...session.storyState, characters: updatedCharacters },
    });

    return NextResponse.json({ portraits } satisfies PortraitResponse);
  } catch (err) {
    console.error("[/api/portrait]", err);
    return NextResponse.json({ error: "Portrait generation failed" }, { status: 500 });
  }
}
