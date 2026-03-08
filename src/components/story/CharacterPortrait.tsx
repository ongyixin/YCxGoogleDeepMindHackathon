"use client";

/**
 * CharacterPortrait — displays a character's generated portrait or a styled fallback.
 *
 * When NanoBanana provides a portrait URL, renders it as a full bleed image.
 * When unavailable, generates a visually distinct gradient card using personality
 * text to deterministically choose colors and an emoji — no two characters look the same.
 */

import { cn } from "@/lib/cn";
import type { StoryCharacter } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CharacterPortraitProps {
  character: Pick<StoryCharacter, "name" | "personality" | "emotionalState" | "stance" | "portrait">;
  size?: "sm" | "md" | "lg" | "full";
  showName?: boolean;
  className?: string;
}

// ─── Personality → visual theme mapping ──────────────────────────────────────

const PERSONALITY_THEMES: {
  keywords: string[];
  gradient: string;
  emoji: string;
}[] = [
  { keywords: ["jealous", "envious", "bitter"],    gradient: "from-violet-900 via-purple-800 to-fuchsia-900",  emoji: "😤" },
  { keywords: ["romantic", "longing", "love"],      gradient: "from-rose-900 via-pink-800 to-red-900",           emoji: "🌹" },
  { keywords: ["mysterious", "cryptic", "secret"],  gradient: "from-slate-900 via-zinc-800 to-gray-900",         emoji: "🕯️" },
  { keywords: ["comedic", "chaotic", "clown"],      gradient: "from-amber-900 via-orange-700 to-yellow-800",     emoji: "🎭" },
  { keywords: ["sage", "wise", "oracle"],           gradient: "from-blue-900 via-indigo-800 to-blue-950",        emoji: "🔮" },
  { keywords: ["villain", "dark", "sinister"],      gradient: "from-gray-950 via-red-950 to-black",              emoji: "💀" },
  { keywords: ["hero", "brave", "warrior"],         gradient: "from-amber-800 via-yellow-700 to-orange-800",     emoji: "⚔️" },
  { keywords: ["anxious", "nervous", "worried"],    gradient: "from-teal-900 via-cyan-800 to-green-900",         emoji: "😰" },
  { keywords: ["philosopher", "resigned", "weary"], gradient: "from-stone-900 via-neutral-800 to-slate-900",     emoji: "🧐" },
  { keywords: ["ambitious", "driven", "ruthless"],  gradient: "from-red-900 via-rose-800 to-orange-900",         emoji: "🔱" },
];

const DEFAULT_THEME = {
  gradient: "from-violet-950 via-purple-900 to-indigo-950",
  emoji: "✦",
};

function getTheme(personality: string) {
  const lower = personality.toLowerCase();
  for (const theme of PERSONALITY_THEMES) {
    if (theme.keywords.some((k) => lower.includes(k))) {
      return { gradient: theme.gradient, emoji: theme.emoji };
    }
  }
  return DEFAULT_THEME;
}

// Stance → border color
const STANCE_BORDER: Record<string, string> = {
  ally:       "border-green-400/50",
  rival:      "border-red-400/50",
  crush:      "border-pink-400/50",
  nemesis:    "border-red-600/60",
  suspicious: "border-yellow-400/50",
  neutral:    "border-[#B3A125]/40",
};

// ─── Size config ──────────────────────────────────────────────────────────────

const SIZE_CONFIG = {
  sm:   { container: "w-12 h-12",   text: "text-xl",   nameText: "text-sm" },
  md:   { container: "w-16 h-16",   text: "text-2xl",  nameText: "text-base" },
  lg:   { container: "w-24 h-24",   text: "text-4xl",  nameText: "text-lg" },
  full: { container: "w-full h-full", text: "text-5xl", nameText: "text-xl" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CharacterPortrait({
  character,
  size = "md",
  showName = false,
  className,
}: CharacterPortraitProps) {
  const { gradient, emoji } = getTheme(character.personality);
  const stanceBorder = STANCE_BORDER[character.stance] ?? STANCE_BORDER.neutral;
  const sizeConf = SIZE_CONFIG[size];

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div
        className={cn(
          "relative rounded-2xl border overflow-hidden shrink-0 bg-white",
          sizeConf.container,
          stanceBorder
        )}
      >
        {character.portrait ? (
          /* NanoBanana-generated portrait */
          <img
            src={character.portrait}
            alt={character.name}
            className="w-full h-full object-contain"
          />
        ) : (
          /* Stylized fallback */
          <PortraitFallback
            gradient={gradient}
            emoji={emoji}
            name={character.name}
            emotionalState={character.emotionalState}
            emojiSize={sizeConf.text}
          />
        )}

        {/* Emotional state pip — bottom-right corner */}
        <EmotionPip emotionalState={character.emotionalState} />
      </div>

      {showName && (
        <p
          className={cn(
            "font-display text-[#f0d898] text-center leading-tight truncate max-w-full",
            sizeConf.nameText
          )}
        >
          {character.name}
        </p>
      )}
    </div>
  );
}

// ─── Fallback portrait ────────────────────────────────────────────────────────

function PortraitFallback({
  gradient,
  emoji,
  name,
  emotionalState,
  emojiSize,
}: {
  gradient: string;
  emoji: string;
  name: string;
  emotionalState: string;
  emojiSize: string;
}) {
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className={cn("absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br", gradient)}>
      {/* Decorative grain */}
      <div className="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC45IiBudW1PY3RhdmVzPSI0IiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNuKSIgb3BhY2l0eT0iMC4xNSIvPjwvc3ZnPg==')] pointer-events-none" />

      {/* Emoji or initial */}
      <span className={cn(emojiSize, "drop-shadow-lg z-10")}>{emoji}</span>

      {/* Name initial watermark */}
      <span
        className="absolute bottom-1 right-2 font-display text-white/20 font-black leading-none select-none"
        style={{ fontSize: "clamp(18px, 40%, 32px)" }}
        aria-hidden
      >
        {initial}
      </span>

      {/* Bottom gradient overlay for legibility */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
    </div>
  );
}

// ─── Emotional state indicator pip ────────────────────────────────────────────

const EMOTION_COLORS: Record<string, string> = {
  suspicious:  "bg-yellow-400",
  longing:     "bg-pink-400",
  excited:     "bg-orange-400",
  resigned:    "bg-blue-400",
  smug:        "bg-purple-400",
  brooding:    "bg-violet-500",
  hopeful:     "bg-green-400",
  desperate:   "bg-red-500",
  watchful:    "bg-cyan-400",
};

function EmotionPip({ emotionalState }: { emotionalState: string }) {
  const lower = emotionalState.toLowerCase();
  const colorClass = Object.entries(EMOTION_COLORS).find(([key]) =>
    lower.includes(key)
  )?.[1] ?? "bg-white/40";

  return (
    <div
      className={cn(
        "absolute bottom-1 left-1 w-2 h-2 rounded-full border border-black/30",
        colorClass
      )}
      title={emotionalState}
    />
  );
}

// ─── Compact portrait row (e.g. in quest cards) ───────────────────────────────

export function CharacterPortraitRow({
  characters,
  maxVisible = 4,
  className,
}: {
  characters: Pick<StoryCharacter, "name" | "personality" | "emotionalState" | "stance" | "portrait">[];
  maxVisible?: number;
  className?: string;
}) {
  const visible = characters.slice(0, maxVisible);
  const overflow = characters.length - maxVisible;

  return (
    <div className={cn("flex items-center", className)}>
      {visible.map((char, i) => (
        <div
          key={char.name}
          className="rounded-xl overflow-hidden border border-black/30 shrink-0"
          style={{
            width: 32,
            height: 32,
            marginLeft: i > 0 ? -8 : 0,
            zIndex: visible.length - i,
            position: "relative",
          }}
        >
          <CharacterPortrait character={char} size="sm" />
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="flex items-center justify-center rounded-xl border border-[#B3A125]/30 bg-[#B3A125]/10 shrink-0"
          style={{ width: 32, height: 32, marginLeft: -8, zIndex: 0 }}
        >
          <span className="font-display text-[#B3A125] text-base">+{overflow}</span>
        </div>
      )}
    </div>
  );
}
