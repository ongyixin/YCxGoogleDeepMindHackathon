// POST /api/expressions — lazily generate expression variants for a character
// Called when the interaction modal first opens for a character, ensuring the
// happy/angry/sad/surprised sprites are ready for use during dialogue.

import { NextRequest, NextResponse } from "next/server";
import { getSession, patchSession } from "@/lib/shared/sessions";
import { generateExpressionVariant } from "@/lib/shared/nanobanana";
import type { CharacterExpression, ObjectCharacter } from "@/types";

interface ExpressionsRequest {
  sessionId: string;
  characterId: string;
}

interface ExpressionsResponse {
  portraits: Partial<Record<CharacterExpression, string>>;
}

/** Expressions to generate lazily (neutral + talking are generated at scan time) */
const LAZY_EXPRESSIONS: CharacterExpression[] = ["happy", "angry", "sad", "surprised"];

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ExpressionsRequest;
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

    const neutralUrl = character.portraits?.neutral ?? character.portraitUrl;
    if (!neutralUrl) {
      // No neutral portrait to reference — return whatever we have
      return NextResponse.json({ portraits: character.portraits ?? {} } satisfies ExpressionsResponse);
    }

    // Determine which expressions still need generating
    const existing = character.portraits ?? {};
    const missing = LAZY_EXPRESSIONS.filter((expr) => !existing[expr]);

    if (missing.length === 0) {
      return NextResponse.json({ portraits: existing } satisfies ExpressionsResponse);
    }

    const characterIdentity = `${character.name}, a ${character.personality} personified ${character.objectLabel}`;

    // Generate all missing expressions in parallel
    const results = await Promise.allSettled(
      missing.map((expr) => generateExpressionVariant(expr, neutralUrl, characterIdentity))
    );

    const newPortraits: Partial<Record<CharacterExpression, string>> = { ...existing };
    missing.forEach((expr, i) => {
      const result = results[i];
      if (result.status === "fulfilled" && result.value) {
        newPortraits[expr] = result.value;
      }
    });

    // Persist the updated portraits back into the session
    const updatedCharacters = session.storyState.characters.map((c: ObjectCharacter) =>
      c.id === body.characterId ? { ...c, portraits: newPortraits } : c
    );
    patchSession(body.sessionId, {
      storyState: { ...session.storyState, characters: updatedCharacters },
    });

    return NextResponse.json({ portraits: newPortraits } satisfies ExpressionsResponse);
  } catch (err) {
    console.error("[/api/expressions]", err);
    return NextResponse.json({ error: "Expression generation failed" }, { status: 500 });
  }
}
