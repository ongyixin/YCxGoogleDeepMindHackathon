"use client";

/**
 * AnimatedCharacterSprite — a character portrait that reacts to voice state
 * and emotional context.
 *
 * Talking animation:
 *   The base/mood expression sprite is always rendered as the body layer.
 *   A separate <MouthOverlay> component sits on top, clipped via CSS clip-path
 *   to only a narrow mouth-region band (~18–30% from the top of the container).
 *   This band toggles every 150 ms between the talking sprite (mouth-open) and
 *   transparent, so ONLY the mouth appears to open and close — the rest of the
 *   body and face stays completely still.
 *   When no talking sprite is available, a synthetic CSS mouth (rounded rect)
 *   expands/contracts to mimic speech.
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
  sm:   { px: 90,  emojiSize: "text-2xl" },
  md:   { px: 120, emojiSize: "text-3xl" },
  lg:   { px: 210, emojiSize: "text-5xl" },
  full: { px: 0,   emojiSize: "text-6xl" },  // px=0 means 100%
};

// ─── MouthOverlay ─────────────────────────────────────────────────────────────

/**
 * Isolated mouth animation layer.
 *
 * When a `talkingUrl` sprite exists: renders it absolutely on top of the body,
 * clipped to a narrow mouth-region band (18–30% from the top of the container,
 * 8% inset from each side). Only this thin strip alternates opacity, so only
 * the mouth opens/closes while every other pixel stays still.
 *
 * When no sprite exists: renders a synthetic CSS pixel-art mouth (rounded rect)
 * positioned at ~22% from top that expands vertically when `mouthOpen` is true.
 */
interface MouthOverlayProps {
  talkingUrl: string | undefined;
  mouthOpen: boolean;
  imageRendering: React.CSSProperties["imageRendering"];
}

function MouthOverlay({ talkingUrl, mouthOpen, imageRendering }: MouthOverlayProps) {
  if (talkingUrl) {
    return (
      <img
        src={talkingUrl}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        style={{
          imageRendering,
          /**
           * inset(top right bottom left)
           * Keeps a horizontal band from 18% to 30% of the container height,
           * with 8% inset from each side — targeting the mouth/lower-lip region
           * of a full-body pixel art sprite without touching eyes, hair, or body.
           */
          clipPath: "inset(18% 8% 70% 8%)",
          opacity: mouthOpen ? 1 : 0,
          transition: "opacity 60ms linear",
        }}
      />
    );
  }

  // Synthetic CSS mouth — always available, zero-network-cost fallback
  return (
    <div
      aria-hidden
      className="absolute pointer-events-none"
      style={{
        left: "30%",
        width: "40%",
        top: "22%",
        height: mouthOpen ? "3.5%" : "1.2%",
        background: "#1a0800",
        borderRadius: mouthOpen ? "50% / 80%" : "3px",
        transition: "height 70ms ease, border-radius 70ms ease",
        opacity: 0.8,
      }}
    />
  );
}

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
  const [mouthOpen, setMouthOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Toggle mouth open/closed while speaking
  useEffect(() => {
    if (isSpeaking) {
      setMouthOpen(false);
      intervalRef.current = setInterval(() => {
        setMouthOpen((v) => !v);
      }, MOUTH_FLAP_INTERVAL_MS);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setMouthOpen(false);
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

          {/* Mouth overlay — only the mouth region animates during speech */}
          {isSpeaking && (
            <MouthOverlay
              talkingUrl={talkingUrl}
              mouthOpen={mouthOpen}
              imageRendering={imageRendering}
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
