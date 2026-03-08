"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { loadSavedCharacters, removeSavedCharacter } from "@/lib/shared/characterCollection";
import type { SavedCharacter, StoryGenre } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const GENRE_META: Record<StoryGenre, { label: string; emoji: string; color: string }> = {
  mystery:         { label: "MYSTERY",    emoji: "🔍", color: "#B0C4FF" },
  fantasy:         { label: "FANTASY",    emoji: "⚔️", color: "#B0C4FF" },
  soap_opera:      { label: "SOAP OPERA", emoji: "🌹", color: "#E8709A" },
  workplace_drama: { label: "WORK DRAMA", emoji: "💼", color: "#FFDE00" },
  dating_sim:      { label: "DATING SIM", emoji: "💘", color: "#E8709A" },
  survival:        { label: "SURVIVAL",   emoji: "🪓", color: "#E8A05A" },
};

const RELATIONSHIP_LABELS: [number, string, string][] = [
  [80,  "DEVOTED",  "#FF80C0"],
  [40,  "FRIENDLY", "#7FE080"],
  [-40, "NEUTRAL",  "#FFDE00"],
  [-80, "HOSTILE",  "#FF8040"],
  [-Infinity, "ENEMY", "#FF4040"],
];

function getRelationshipLabel(score: number): { label: string; color: string } {
  for (const [threshold, label, color] of RELATIONSHIP_LABELS) {
    if (score >= threshold) return { label, color };
  }
  return { label: "ENEMY", color: "#FF4040" };
}

const PORTRAIT_THEMES: { keywords: string[]; gradient: string; emoji: string }[] = [
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
const DEFAULT_THEME = { gradient: "from-violet-950 via-purple-900 to-indigo-950", emoji: "✦" };

function getPortraitTheme(personality: string) {
  const lower = personality.toLowerCase();
  for (const t of PORTRAIT_THEMES) {
    if (t.keywords.some((k) => lower.includes(k))) return t;
  }
  return DEFAULT_THEME;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MiniPortrait({ character, size = 52 }: { character: SavedCharacter; size?: number }) {
  const { gradient, emoji } = getPortraitTheme(character.personality);
  return (
    <div
      className="shrink-0 overflow-hidden border border-[#FFDE00]/40"
      style={{ width: size, height: size }}
    >
      {character.portraitUrl ? (
        <img
          src={character.portraitUrl}
          alt={character.name}
          className="w-full h-full object-contain"
          style={{ background: "#0a0410" }}
        />
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${gradient}`}
          style={{ fontSize: size * 0.42 }}
        >
          {emoji}
        </div>
      )}
    </div>
  );
}

function MiniRelBar({ score }: { score: number }) {
  const pct = ((score + 100) / 200) * 100;
  const { color } = getRelationshipLabel(score);
  return (
    <div
      className="w-full"
      style={{ height: 3, background: "rgba(255,255,255,0.08)", position: "relative" }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          height: "100%",
          width: `${pct}%`,
          background: color,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

// ─── Card grid item ───────────────────────────────────────────────────────────

function CharacterCard({
  character,
  onSelect,
  delay = 0,
}: {
  character: SavedCharacter;
  onSelect: () => void;
  delay?: number;
}) {
  const genre = GENRE_META[character.genre] ?? { label: character.genre, emoji: "✦", color: "#FFDE00" };
  const rel = getRelationshipLabel(character.relationshipScore);

  return (
    <motion.button
      onClick={onSelect}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.22, type: "spring" }}
      whileTap={{ scale: 0.96 }}
      className="w-full text-left"
    >
      <div
        style={{
          background: "rgba(8,4,20,0.97)",
          border: "2px solid rgba(255,222,0,0.22)",
          padding: "8px",
          position: "relative",
          transition: "border-color 0.15s",
        }}
        className="hover:border-[rgba(255,222,0,0.5)]"
      >
        {/* Portrait */}
        <MiniPortrait character={character} size={52} />

        {/* Name + meta */}
        <div style={{ marginTop: 6 }}>
          <p
            className="font-pixel truncate"
            style={{ fontSize: 11, color: "#FFF0B0", letterSpacing: "0.06em", lineHeight: 1.5 }}
          >
            {character.name}
          </p>
          <p
            className="font-vt truncate"
            style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 1, lineHeight: 1.2 }}
          >
            {character.objectLabel}
          </p>
        </div>

        {/* Relationship bar */}
        <div style={{ marginTop: 5 }}>
          <MiniRelBar score={character.relationshipScore} />
        </div>

        {/* Genre badge */}
        <div style={{ marginTop: 5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span
            className="font-pixel"
            style={{ fontSize: 9, color: genre.color, letterSpacing: "0.08em" }}
          >
            {genre.emoji} {genre.label}
          </span>
          <span
            className="font-pixel"
            style={{ fontSize: 9, color: rel.color }}
          >
            {rel.label}
          </span>
        </div>

        {/* Corner pip */}
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 5,
            height: 5,
            background: rel.color,
            opacity: 0.7,
          }}
        />
      </div>
    </motion.button>
  );
}

// ─── Detail view ──────────────────────────────────────────────────────────────

function CharacterDetail({
  character,
  onBack,
  onRemove,
}: {
  character: SavedCharacter;
  onBack: () => void;
  onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const genre = GENRE_META[character.genre] ?? { label: character.genre, emoji: "✦", color: "#FFDE00" };
  const rel = getRelationshipLabel(character.relationshipScore);
  const { gradient, emoji } = getPortraitTheme(character.personality);
  const relPct = ((character.relationshipScore + 100) / 200) * 100;

  return (
    <motion.div
      key="detail"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
    >
      {/* Back button */}
      <button
        onClick={onBack}
        className="font-pixel mb-4 block"
        style={{ fontSize: 11, letterSpacing: "0.14em", color: "rgba(255,255,255,0.3)" }}
      >
        ← BACK TO INDEX
      </button>

      {/* Portrait stage */}
      <div
        style={{
          border: "2px solid rgba(255,222,0,0.3)",
          background: "rgba(8,4,20,0.98)",
          marginBottom: 10,
        }}
      >
        {/* Header chrome */}
        <div
          className="font-pixel px-3 py-1.5 flex items-center justify-between"
          style={{
            fontSize: 11,
            background: "rgba(110,40,90,0.55)",
            borderBottom: "1px solid rgba(255,222,0,0.18)",
            color: "#FFDE00",
            letterSpacing: "0.2em",
          }}
        >
          <span>✦ CHARACTER FILE</span>
          <span style={{ color: genre.color }}>{genre.emoji} {genre.label}</span>
        </div>

        <div className="p-4">
          {/* Portrait + bio row */}
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            {/* Large portrait */}
            <div
              style={{
                width: 96,
                height: 96,
                border: "2px solid rgba(255,222,0,0.4)",
                overflow: "hidden",
                flexShrink: 0,
                position: "relative",
              }}
            >
              {character.portraitUrl ? (
                <img
                  src={character.portraitUrl}
                  alt={character.name}
                  className="w-full h-full object-contain"
                  style={{ background: "#0a0410" }}
                />
              ) : (
                <div
                  className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${gradient}`}
                  style={{ fontSize: 40 }}
                >
                  {emoji}
                </div>
              )}
              {/* Emotional state */}
              <div
                className="absolute bottom-0 left-0 right-0 font-pixel text-center"
                style={{
                  fontSize: 9,
                  background: "rgba(0,0,0,0.7)",
                  color: "rgba(255,240,176,0.7)",
                  padding: "2px 0",
                  letterSpacing: "0.06em",
                }}
              >
                {character.emotionalState.toUpperCase()}
              </div>
            </div>

            {/* Identity */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="font-pixel" style={{ fontSize: 14, color: "#FFF0B0", letterSpacing: "0.08em", lineHeight: 1.6 }}>
                {character.name}
              </p>
              <p className="font-vt" style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                {character.objectLabel}
              </p>
              <p className="font-vt" style={{ fontSize: 14, color: "rgba(255,228,240,0.55)", marginTop: 4, lineHeight: 1.4 }}>
                {character.personality}
              </p>
              <p className="font-vt" style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", marginTop: 3 }}>
                Voice: {character.voiceStyle}
              </p>
            </div>
          </div>

          {/* Relationship meter */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span className="font-pixel" style={{ fontSize: 10, color: "rgba(255,222,0,0.6)", letterSpacing: "0.1em" }}>
                RELATIONSHIP
              </span>
              <span className="font-pixel" style={{ fontSize: 10, color: rel.color }}>
                {rel.label} ({character.relationshipScore > 0 ? "+" : ""}{character.relationshipScore})
              </span>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.07)", position: "relative" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${relPct}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                style={{ position: "absolute", left: 0, top: 0, height: "100%", background: rel.color }}
              />
            </div>
          </div>

          {/* Memories */}
          {character.memories.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="font-pixel" style={{ fontSize: 10, color: "rgba(255,222,0,0.6)", letterSpacing: "0.1em", marginBottom: 6 }}>
                MEMORIES ({character.memories.length})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {character.memories.slice(0, 3).map((mem, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "4px 8px",
                      background: "rgba(255,222,0,0.04)",
                      borderLeft: "2px solid rgba(255,222,0,0.2)",
                    }}
                  >
                    <p className="font-vt" style={{ fontSize: 13, color: "rgba(255,228,240,0.5)", lineHeight: 1.4 }}>
                      {mem}
                    </p>
                  </div>
                ))}
                {character.memories.length > 3 && (
                  <p className="font-pixel" style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>
                    +{character.memories.length - 3} more memories
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Footer stats */}
          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: "1px solid rgba(255,222,0,0.1)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <p className="font-pixel" style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "0.08em" }}>
                SAVED {formatDate(character.savedAt).toUpperCase()}
              </p>
              <p className="font-pixel" style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "0.08em", marginTop: 2 }}>
                {character.interactionCount} INTERACTION{character.interactionCount !== 1 ? "S" : ""}
              </p>
            </div>

            {/* Remove button */}
            <AnimatePresence mode="wait">
              {confirmRemove ? (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ display: "flex", gap: 6 }}
                >
                  <button
                    onClick={() => setConfirmRemove(false)}
                    className="font-pixel"
                    style={{
                      fontSize: 9,
                      padding: "4px 8px",
                      border: "1px solid rgba(255,255,255,0.2)",
                      color: "rgba(255,255,255,0.4)",
                      background: "transparent",
                    }}
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={onRemove}
                    className="font-pixel"
                    style={{
                      fontSize: 9,
                      padding: "4px 8px",
                      border: "1px solid #FF4040",
                      color: "#FF4040",
                      background: "rgba(255,64,64,0.1)",
                    }}
                  >
                    CONFIRM
                  </button>
                </motion.div>
              ) : (
                <motion.button
                  key="remove"
                  onClick={() => setConfirmRemove(true)}
                  className="font-pixel"
                  style={{
                    fontSize: 9,
                    padding: "4px 10px",
                    border: "1px solid rgba(255,64,64,0.3)",
                    color: "rgba(255,64,64,0.5)",
                    background: "transparent",
                    letterSpacing: "0.08em",
                  }}
                  whileTap={{ scale: 0.94 }}
                >
                  ✕ REMOVE
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{ textAlign: "center", padding: "32px 16px" }}
    >
      <motion.div
        animate={{ opacity: [0.4, 1, 0.4], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        style={{ fontSize: 48, marginBottom: 16 }}
      >
        📖
      </motion.div>
      <p className="font-pixel" style={{ fontSize: 12, color: "rgba(255,222,0,0.45)", letterSpacing: "0.15em", marginBottom: 8 }}>
        NO CHARACTERS LOGGED
      </p>
      <p className="font-vt" style={{ fontSize: 16, color: "rgba(255,255,255,0.25)", lineHeight: 1.5, maxWidth: 220, margin: "0 auto" }}>
        Enter Story Mode and tap ♡ while talking to a character to add them here.
      </p>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 6 }}>
        {["mystery", "fantasy", "soap_opera"].map((_, i) => (
          <motion.div
            key={i}
            style={{ width: 4, height: 4, background: "rgba(255,222,0,0.25)" }}
            animate={{ opacity: [0.2, 0.7, 0.2] }}
            transition={{ duration: 1.8, delay: i * 0.4, repeat: Infinity }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CharacterCollection({ onBack }: { onBack: () => void }) {
  const [characters, setCharacters] = useState<SavedCharacter[]>([]);
  const [selected, setSelected] = useState<SavedCharacter | null>(null);
  const [filterGenre, setFilterGenre] = useState<StoryGenre | "all">("all");

  useEffect(() => {
    setCharacters(loadSavedCharacters());
  }, []);

  function handleRemove(characterId: string) {
    removeSavedCharacter(characterId);
    setCharacters((prev) => prev.filter((c) => c.id !== characterId));
    setSelected(null);
  }

  const filtered = filterGenre === "all"
    ? characters
    : characters.filter((c) => c.genre === filterGenre);

  // Genres present in collection for filter pills
  const presentGenres = Array.from(new Set(characters.map((c) => c.genre)));

  return (
    <motion.div
      key="character-collection"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.22 }}
      className="px-4 pt-4 pb-10"
    >
      <AnimatePresence mode="wait">
        {selected ? (
          <CharacterDetail
            key={selected.id}
            character={selected}
            onBack={() => setSelected(null)}
            onRemove={() => handleRemove(selected.id)}
          />
        ) : (
          <motion.div
            key="index"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Back button */}
            <button
              onClick={onBack}
              className="font-pixel mb-4 block"
              style={{ fontSize: 11, letterSpacing: "0.14em", color: "rgba(255,255,255,0.3)" }}
            >
              ← BACK
            </button>

            {/* Panel header */}
            <div
              style={{
                border: "2px solid rgba(255,222,0,0.38)",
                boxShadow: "4px 4px 0 rgba(168,54,104,0.35)",
                background: "rgba(5,2,20,0.97)",
                marginBottom: 12,
              }}
            >
              <div
                className="font-pixel px-4 py-2 flex items-center justify-between"
                style={{
                  fontSize: 12,
                  background: "rgba(110,40,90,0.55)",
                  borderBottom: "1px solid rgba(255,222,0,0.18)",
                  color: "#FFDE00",
                  letterSpacing: "0.2em",
                }}
              >
                <span>♥ CHARACTER INDEX</span>
                <span style={{ color: "rgba(255,222,0,0.5)", fontSize: 10 }}>
                  {characters.length} LOGGED
                </span>
              </div>

              <div className="px-4 py-2.5" style={{ background: "rgba(18,4,16,0.98)" }}>
                <p className="font-vt" style={{ fontSize: 15, color: "rgba(255,228,240,0.45)" }}>
                  Characters you&apos;ve met across all stories.
                </p>
              </div>
            </div>

            {/* Genre filter pills */}
            {presentGenres.length > 1 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
                <button
                  onClick={() => setFilterGenre("all")}
                  className="font-pixel"
                  style={{
                    fontSize: 9,
                    padding: "3px 8px",
                    border: `1px solid ${filterGenre === "all" ? "#FFDE00" : "rgba(255,222,0,0.2)"}`,
                    background: filterGenre === "all" ? "rgba(255,222,0,0.12)" : "transparent",
                    color: filterGenre === "all" ? "#FFDE00" : "rgba(255,255,255,0.3)",
                    letterSpacing: "0.08em",
                    transition: "all 0.15s",
                  }}
                >
                  ALL
                </button>
                {presentGenres.map((g) => {
                  const meta = GENRE_META[g];
                  const active = filterGenre === g;
                  return (
                    <button
                      key={g}
                      onClick={() => setFilterGenre(g)}
                      className="font-pixel"
                      style={{
                        fontSize: 9,
                        padding: "3px 8px",
                        border: `1px solid ${active ? meta.color : "rgba(255,255,255,0.12)"}`,
                        background: active ? `${meta.color}18` : "transparent",
                        color: active ? meta.color : "rgba(255,255,255,0.3)",
                        letterSpacing: "0.08em",
                        transition: "all 0.15s",
                      }}
                    >
                      {meta.emoji} {meta.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Character grid or empty state */}
            {filtered.length === 0 ? (
              <EmptyState />
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 8,
                }}
              >
                {filtered.map((char, i) => (
                  <CharacterCard
                    key={char.id}
                    character={char}
                    onSelect={() => setSelected(char)}
                    delay={i * 0.05}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
