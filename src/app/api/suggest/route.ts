// POST /api/suggest — Generate an approach-suitable message suggestion for the player

import { NextRequest, NextResponse } from "next/server";
import { safeGenerateText } from "@/lib/shared/gemini";
import type { InteractionMode } from "@/types";

const FALLBACKS: Record<InteractionMode, string[]> = {
  flirt: [
    "You know, there's something irresistible about you...",
    "Has anyone ever told you how captivating you are?",
    "I can't stop thinking about you since we last spoke.",
  ],
  interrogate: [
    "I know you're hiding something. Tell me everything.",
    "Let's cut to the chase — what do you know about this?",
    "You've been watching carefully. What have you seen?",
  ],
  recruit: [
    "I need someone with your particular skills on my side.",
    "Together we could accomplish something extraordinary.",
    "I've been searching for someone exactly like you.",
  ],
  befriend: [
    "I feel like we could really understand each other.",
    "Tell me about yourself — I'm genuinely curious.",
    "I'd really like to get to know you better.",
  ],
  roast: [
    "I've seen better decisions made by a houseplant.",
    "You're the reason someone invented the word 'disappointing'.",
    "Even the doormat by the entrance has more charisma.",
  ],
  apologize: [
    "I'm truly sorry for how things went between us.",
    "I was wrong, and I owe you a real apology.",
    "I should have handled that better — please forgive me.",
  ],
  negotiate: [
    "I think we can find a deal that works for both of us.",
    "Let's talk terms — what would it take to make this work?",
    "I'm willing to compromise if you are.",
  ],
  ignore: [
    "...",
    "*walks past without a word*",
    "*pretends not to notice*",
  ],
};

function pickFallback(mode: InteractionMode): string {
  const options = FALLBACKS[mode];
  return options[Math.floor(Math.random() * options.length)];
}

const MODE_DESCRIPTIONS: Record<InteractionMode, string> = {
  flirt:       "flirtatious, charming, and subtly romantic",
  interrogate: "probing, suspicious, and investigative",
  recruit:     "persuasive, confident, and appealing to their self-interest",
  befriend:    "warm, genuine, and curious about them",
  roast:       "playfully insulting, sharp, and witty",
  apologize:   "apologetic, sincere, and vulnerable",
  negotiate:   "calculated, strategic, and looking for mutual benefit",
  ignore:      "dismissive, cold, and deliberately distant",
};

export async function POST(req: NextRequest) {
  try {
    const { mode, characterName, personality } = (await req.json()) as {
      mode: InteractionMode;
      characterName: string;
      personality: string;
    };

    const prompt = `You are helping a player in an RPG game write a short message to a character.

Character name: ${characterName}
Character personality: ${personality}
Interaction approach: ${MODE_DESCRIPTIONS[mode]}

Write a single short message (1-2 sentences, max 120 characters) that the player would say to this character. The message should match the ${mode} approach and feel personal to this specific character's personality. Write ONLY the message text itself — no quotes, no labels, no explanation.`;

    const suggestion = await safeGenerateText(prompt);
    return NextResponse.json({ suggestion: suggestion ?? pickFallback(mode) });
  } catch (err) {
    console.error("[/api/suggest]", err);
    return NextResponse.json({ error: "Suggest failed" }, { status: 500 });
  }
}
