// POST /api/recall — Stateless character dialogue for the Collection index.
// No session required — accepts character data directly and returns a dialogue response.

import { NextRequest, NextResponse } from "next/server";
import { safeGenerateJSON } from "@/lib/shared/gemini";
import { dialoguePrompt } from "@/lib/shared/prompts";
import type { InteractionMode, SavedCharacter } from "@/types";

interface RecallRequest {
  character: SavedCharacter;
  interactionMode: InteractionMode;
  message: string;
}

interface RecallResponse {
  response: string;
  relationshipDelta: number;
  newRelationshipToUser: number;
  emotionalStateUpdate: string;
}

interface DialogueResult {
  response: string;
  emotionalStateUpdate: string;
  relationshipDelta: number;
  hintAtMemory: string | null;
  triggerQuest: boolean;
  triggerEscalation: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RecallRequest;
    const { character, interactionMode, message } = body;

    if (!character || !message) {
      return NextResponse.json({ error: "Missing character or message" }, { status: 400 });
    }

    const prompt = dialoguePrompt(
      character.name,
      character.personality,
      character.voiceStyle,
      character.emotionalState,
      character.relationshipScore,
      character.memories,
      interactionMode,
      message,
      "none — this is a private recall conversation",
      character.genre,
      null
    );

    const result = await safeGenerateJSON<DialogueResult>(prompt);

    const delta = result?.relationshipDelta ?? 0;
    const newRelationshipToUser = Math.min(
      100,
      Math.max(-100, character.relationshipScore + delta)
    );

    const response: RecallResponse = {
      response: result?.response ?? `${character.name} regards you, saying nothing.`,
      relationshipDelta: delta,
      newRelationshipToUser,
      emotionalStateUpdate: result?.emotionalStateUpdate ?? character.emotionalState,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[/api/recall]", err);
    return NextResponse.json({ error: "Recall failed" }, { status: 500 });
  }
}
