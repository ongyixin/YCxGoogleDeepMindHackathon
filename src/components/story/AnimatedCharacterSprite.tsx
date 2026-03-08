"use client";

/**
 * AnimatedCharacterSprite — a character portrait that reacts to voice state
 * and emotional context.
 *
 * Talking animation:
 *   The base/mood expression sprite is always rendered as the body layer.
 *   When speaking, the "talking" sprite (mouth-open variant) is rendered as
 *   a second layer on top, clipped via CSS clip-path to the top ~38% of the
 *   container (the character's face/head region). This layer toggles opacity
 *   every 150 ms so only the mouth area appears to open and close — the body
 *   stays completely still.
 *
 * Expression switching:
 *   Maps character.emotionalState to the closest CharacterExpression so the
 *   idle portrait reflects the current mood.
 *
 * Fallback chain: expression sprite → neutral → portraitUrl → emoji/gradient.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { CharacterExpression, ObjectCharacter } from "@/types";
import type { VoiceState } from "@/hooks/useVoiceAgent";

// ─── Emotion → expression mapping ────────────────────────────────────────────

const EMOTION_TO_EXPRESSION: Array<{
  keywords: string[];
  expression: CharacterExpression;
}> = [
  { keywords: ["longing", "wistful", "intimate", "resigned", "disappointed", "burdened", "parched", "trampled"], expression: "sad" },
  { keywords: ["jealous", "volatile", "angry", "rage", "hostile", "contempt", "disgusted", "guarded"], expression: "angry" },
  { keywords: ["inviting", "expressive", "performing", "smug", "calculating", "knowing", "tempting"], expression: "happy" },
  { keywords: ["flustered", "anxious", "desperate", "dramatic", "cautious", "suspicious"], expression: "surprised" },
];

function emotionToExpression(emotionalState: string): CharacterExpression {
  const lower = emotionalState.toLowerCase();
  for (const { keywords, expression } of EMOTION_TO_EXPRESSION) {
    if (keywords.some((k) => lower.includes(k))) return expression;
  }
  return "neutral";
}

// ─── Fallback placeholder ────────────────────────────────────────────────────

const PERSONALITY_THEMES: { keywords: string[]; gradient: string; emoji: string }[] = [
  { keywords: ["jealous", "envious", "bitter"],    gradient: "from-violet-900 via-purple-800 to-fuchsia-900", emoji: "😤" },
  { keywords: ["romantic", "longing", "love"],      gradient: "from-rose-900 via-pink-800 to-red-900",          emoji: "🌹" },
  { keywords: ["mysterious", "cryptic", "secret"],  gradient: "from-slate-900 via-zinc-800 to-gray-900",        emoji: "🕯️" },
  { keywords: ["comedic", "chaotic", "clown"],      gradient: "from-amber-900 via-orange-700 to-yellow-800",    emoji: "🎭" },
  { keywords: ["sage", "wise", "oracle"],           gradient: "from-blue-900 via-indigo-800 to-blue-950",       emoji: "🔮" },
  { keywords: ["villain", "dark", "sinister"],      gradient: "from-gray-950 via-red-950 to-black",             emoji: "💀" },
  { keywords: ["hero", "brave", "warrior"],         gradient: "from-amber-800 via-yellow-700 to-orange-800",    emoji: "⚔️" },
  { keywords: ["anxious", "nervous", "worried"],    gradient: "from-teal-900 via-cyan-800 to-green-900",        emoji: "😰" },
];
const DEFAULT_THEME = { gradient: "from-violet-950 via-purple-900 to-indigo-950", emoji: "✦" };

function getPortraitTheme(personality: string) {
  const lower = personality.toLowerCase();
  for (const theme of PERSONALITY_THEMES) {
    if (theme.keywords.some((k) => lower.includes(k))) {
      return { gradient: theme.gradient, emoji: theme.emoji };
    }
  }
  return DEFAULT_THEME;
}

// ─── Size config ─────────────────────────────────────────────────────────────

const SIZE_CONFIG = {
  sm:   { px: 60,  emojiSize: "text-2xl" },
  md:   { px: 80,  emojiSize: "text-3xl" },
  lg:   { px: 140, emojiSize: "text-5xl" },
  full: { px: 0,   emojiSize: "text-6xl" },  // px=0 means 100%
};

// ─── Component ────────────────────────────────────────────────────────────────

export interface AnimatedCharacterSpriteProps {
  character: ObjectCharacter;
  voiceState?: VoiceState;
  size?: "sm" | "md" | "lg" | "full";
  className?: string;
  style?: React.CSSProperties;
  /** Round corners (default true) */
  rounded?: boolean;
  /** imageRendering style (default pixelated) */
  pixelated?: boolean;
}

const MOUTH_FLAP_INTERVAL_MS = 150;

export function AnimatedCharacterSprite({
  character,
  voiceState,
  size = "md",
  className,
  style,
  rounded = true,
  pixelated = true,
}: AnimatedCharacterSpriteProps) {
  const isSpeaking = voiceState === "speaking";
  const [showTalkingFrame, setShowTalkingFrame] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Toggle between base expression and talking frame while speaking
  useEffect(() => {
    if (isSpeaking) {
      setShowTalkingFrame(false);
      intervalRef.current = setInterval(() => {
        setShowTalkingFrame((v) => !v);
      }, MOUTH_FLAP_INTERVAL_MS);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setShowTalkingFrame(false);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isSpeaking]);

  // Resolve which URL to use as the base/mood sprite (body layer — always visible)
  const portraits = character.portraits ?? {};
  const baseExpression = emotionToExpression(character.emotionalState);

  const baseUrl: string | undefined =
    portraits[baseExpression] ??
    portraits.neutral ??
    character.portraitUrl;

  // The talking overlay uses the talking sprite clipped to the face region.
  // It is always pre-loaded but toggles opacity on each tick.
  const talkingUrl: string | undefined = portraits.talking;

  const sizeConf = SIZE_CONFIG[size];
  const { gradient, emoji } = getPortraitTheme(character.personality);
  const initial = character.name.charAt(0).toUpperCase();

  const imageRendering: React.CSSProperties["imageRendering"] = pixelated ? "pixelated" : undefined;

  const containerStyle: React.CSSProperties =
    size === "full"
      ? { width: "100%", height: "100%" }
      : { width: sizeConf.px, height: sizeConf.px, flexShrink: 0 };

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        rounded && "rounded-md",
        isSpeaking && "animate-talk-bounce",
        className
      )}
      style={{ ...containerStyle, ...style }}
    >
      {baseUrl ? (
        <>
          {/* Body layer — always static, reflects current mood expression */}
          <img
            src={baseUrl}
            alt={character.name}
            className="absolute inset-0 w-full h-full object-contain"
            style={{ imageRendering }}
          />

          {/*
           * Face/mouth overlay — the talking sprite clipped to the top ~38%
           * of the container (head region). Only this thin band alternates,
           * so the body never moves and only the mouth appears to open/close.
           * Pre-mounted with opacity 0 to avoid reload flicker on first toggle.
           */}
          {isSpeaking && talkingUrl && (
            <img
              src={talkingUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full object-contain"
              style={{
                imageRendering,
                clipPath: "inset(0 0 62% 0)",
                opacity: showTalkingFrame ? 1 : 0,
              }}
            />
          )}
        </>
      ) : (
        /* Gradient + emoji fallback */
        <div className={cn("absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br", gradient)}>
          <span className={cn(sizeConf.emojiSize, "drop-shadow-lg z-10 leading-none")}>
            {emoji}
          </span>
          <span
            className="absolute bottom-1 right-1 font-display text-white/20 font-black leading-none select-none"
            style={{ fontSize: "40%" }}
            aria-hidden
          >
            {initial}
          </span>
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
        </div>
      )}

      {/* Speaking glow ring */}
      {isSpeaking && (
        <div
          className="absolute inset-0 pointer-events-none animate-speak-glow"
          style={{ borderRadius: rounded ? 6 : 0 }}
        />
      )}
    </div>
  );
}

export default AnimatedCharacterSprite;
