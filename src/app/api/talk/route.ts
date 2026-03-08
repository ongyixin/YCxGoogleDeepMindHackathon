// POST /api/talk — Story Mode: talk to a character

import { NextRequest, NextResponse } from "next/server";
import { getSession, patchSession } from "@/lib/shared/sessions";
import { processTalk } from "@/lib/story/storyEngine";
import type { TalkRequest, TalkResponse } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TalkRequest;
    const session = getSession(body.sessionId);

    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (session.activeMode !== "story") return NextResponse.json({ error: "Story Mode only" }, { status: 400 });

    const result = await processTalk(
      session,
      body.characterId,
      body.interactionMode,
      body.message,
      body.gestureContext ?? null,
      body.selfieFrame ?? null
    );

    patchSession(body.sessionId, {
      storyState: result.updatedSession.storyState,
      narrativeLog: result.updatedSession.narrativeLog,
    });

    const response: TalkResponse = {
      response: result.response,
      relationshipDelta: result.relationshipDelta,
      emotionalStateUpdate: result.emotionalStateUpdate,
      narration: result.narration,
      quest: result.quest,
      escalation: result.escalation ?? undefined,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[/api/talk]", err);
    return NextResponse.json({ error: "Talk failed" }, { status: 500 });
  }
}
