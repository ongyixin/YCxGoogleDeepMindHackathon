"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RelationshipBar } from "./RelationshipBar";
import { AnimatedCharacterSprite } from "./AnimatedCharacterSprite";
import { useVoiceAgent, type VoiceState } from "@/hooks/useVoiceAgent";
import { DEMO_MODE } from "@/lib/constants";
import { getDemoResponse } from "@/lib/demo/demo-data";
import type { ObjectCharacter, InteractionMode, CharacterExpression } from "@/types";

async function fetchSuggestion(
  mode: InteractionMode,
  characterName: string,
  personality: string
): Promise<string | null> {
  try {
    const res = await fetch("/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, characterName, personality }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.suggestion ?? null;
  } catch {
    return null;
  }
}

interface TalkResult {
  response: string;
  relationshipDelta: number;
  newRelationshipToUser: number;
  emotionalStateUpdate?: string;
}

interface GestureHint {
  label: string;
  icon: string;
  suggestedMode?: InteractionMode;
}

interface InteractionModalProps {
  character: ObjectCharacter | null;
  onClose: () => void;
  onTalk?: (mode: InteractionMode, message: string) => Promise<TalkResult | null>;
  isLoading?: boolean;
  lastResult?: TalkResult | null;
  isOpen?: boolean;
  onSend?: (character: ObjectCharacter, mode: InteractionMode, message: string) => Promise<void>;
  onSave?: (character: ObjectCharacter) => void;
  response?: string;
  relationshipDelta?: number;
  /** Live gesture detected via front camera — shown as a context hint and optionally auto-selects interaction mode */
  currentGesture?: GestureHint | null;
  /** Session ID used to lazily fetch expression sprites on first open */
  sessionId?: string;
  /** Called when new expression portraits have been loaded for the character */
  onPortraitsUpdate?: (characterId: string, portraits: Partial<Record<CharacterExpression, string>>) => void;
  /** Called when the voice state changes — lets the parent show speaking animation on ObjectLabels */
  onVoiceStateChange?: (state: import("@/hooks/useVoiceAgent").VoiceState) => void;
}

const INTERACTION_MODES: Array<{
  mode: InteractionMode;
  label: string;
  emoji: string;
  color: string;
  borderColor: string;
}> = [
  { mode: "flirt",       label: "FLIRT",     emoji: "💋", color: "rgba(255,100,100,0.9)", borderColor: "#CC0000" },
  { mode: "interrogate", label: "PROBE",     emoji: "🔍", color: "#B0C4FF",               borderColor: "#3B4CCA" },
  { mode: "recruit",     label: "RECRUIT",   emoji: "🤝", color: "#FFDE00",               borderColor: "#B3A125" },
  { mode: "befriend",    label: "BEFRIEND",  emoji: "💬", color: "#B0C4FF",               borderColor: "#3B4CCA" },
  { mode: "roast",       label: "ROAST",     emoji: "🔥", color: "#FFDE00",               borderColor: "#CC0000" },
  { mode: "apologize",   label: "SORRY",     emoji: "🙏", color: "#B0C4FF",               borderColor: "#3B4CCA" },
];

function TypewriterText({ text, className }: { text: string; className?: string }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const timer = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) {
        clearInterval(timer);
        setDone(true);
      }
    }, 20);
    return () => clearInterval(timer);
  }, [text]);

  return (
    <p className={className}>
      {displayed}
      {!done && <span className="animate-blink" style={{ color: "#FFDE00" }}>▮</span>}
    </p>
  );
}

// ─── Voice mode components ────────────────────────────────────────────────────

/** Animated waveform bars — used for both listening and speaking states. */
function VoiceWaveform({ active, color = "#FFDE00", bars = 7 }: { active: boolean; color?: string; bars?: number }) {
  return (
    <div className="flex items-center gap-[3px]" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          style={{ width: 3, background: color, borderRadius: 2 }}
          animate={active ? {
            height: ["4px", `${10 + Math.sin(i * 1.3) * 8}px`, "4px"],
            opacity: [0.6, 1, 0.6],
          } : { height: "3px", opacity: 0.3 }}
          transition={active ? {
            duration: 0.55 + i * 0.06,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.07,
          } : { duration: 0.2 }}
        />
      ))}
    </div>
  );
}

/** Pulsing ring around the mic button when listening. */
function ListeningRing() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: "rgba(204,0,0,0.6)" }}
          initial={{ scale: 1, opacity: 0.7 }}
          animate={{ scale: 1 + i * 0.35, opacity: 0 }}
          transition={{ duration: 1.4, delay: i * 0.35, repeat: Infinity, ease: "easeOut" }}
        />
      ))}
    </>
  );
}

/** The voice input/status bar shown instead of the text input in voice mode. */
function VoiceBar({
  voiceState,
  lastTranscript,
  characterName,
  onMicPress,
  onMicRelease,
  onCancel,
  isSpeechSupported,
}: {
  voiceState: VoiceState;
  lastTranscript: string;
  characterName: string;
  onMicPress: () => void;
  onMicRelease: () => void;
  onCancel: () => void;
  isSpeechSupported: boolean;
}) {
  const isListening = voiceState === "listening";
  const isSpeaking = voiceState === "speaking";
  const isProcessing = voiceState === "processing";
  const isIdle = voiceState === "idle";

  const statusMap: Record<VoiceState, { label: string; color: string }> = {
    idle:       { label: "TAP TO SPEAK",   color: "rgba(255,222,0,0.5)"  },
    listening:  { label: "LISTENING...",   color: "#FF4444"              },
    processing: { label: "PROCESSING...",  color: "rgba(255,222,0,0.7)"  },
    speaking:   { label: `${characterName.toUpperCase()} SPEAKING`, color: "#FFDE00" },
  };
  const { label, color } = statusMap[voiceState];

  return (
    <div
      className="flex items-center gap-2 px-2 py-2"
      style={{
        border: `2px solid ${isListening ? "#CC0000" : isIdle ? "rgba(255,222,0,0.3)" : "rgba(255,222,0,0.6)"}`,
        background: isListening ? "rgba(204,0,0,0.1)" : "rgba(6,4,14,0.9)",
        transition: "border-color 0.2s, background 0.2s",
      }}
    >
      {/* Mic / status button */}
      <div className="relative flex shrink-0">
        {isListening && <ListeningRing />}
        <motion.button
          onPointerDown={isIdle ? onMicPress : undefined}
          onPointerUp={isListening ? onMicRelease : undefined}
          onPointerLeave={isListening ? onMicRelease : undefined}
          onClick={isSpeaking ? onCancel : undefined}
          disabled={!isSpeechSupported || isProcessing}
          className="relative z-10 flex items-center justify-center rounded-full"
          style={{
            width: 40,
            height: 40,
            background: isListening
              ? "#CC0000"
              : isSpeaking
              ? "rgba(255,222,0,0.15)"
              : "rgba(204,0,0,0.2)",
            border: `2px solid ${isListening ? "#FF4444" : isSpeaking ? "#FFDE00" : "rgba(204,0,0,0.6)"}`,
            boxShadow: isListening ? "0 0 16px rgba(204,0,0,0.6)" : "none",
            transition: "all 0.15s",
          }}
          whileTap={isIdle ? { scale: 0.88 } : {}}
          aria-label={isListening ? "Listening — release to stop" : isSpeaking ? "Tap to interrupt" : "Hold to speak"}
        >
          {isSpeaking ? (
            <span style={{ fontSize: 18, lineHeight: 1 }}>🔊</span>
          ) : isProcessing ? (
            <motion.span
              style={{ fontSize: 14, color: "#FFDE00" }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.6, repeat: Infinity }}
            >
              ◌
            </motion.span>
          ) : (
            <span style={{ fontSize: 18, lineHeight: 1 }}>🎙</span>
          )}
        </motion.button>
      </div>

      {/* Status text + waveform */}
      <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
        <span
          className="font-pixel text-[10px] shrink-0 leading-none"
          style={{ color }}
        >
          {label}
        </span>
        {(isListening || isSpeaking) && (
          <VoiceWaveform
            active
            color={isListening ? "#FF4444" : "#FFDE00"}
          />
        )}
        {isProcessing && lastTranscript && (
          <span
            className="font-vt text-xs truncate italic"
            style={{ color: "rgba(255,240,176,0.6)" }}
          >
            "{lastTranscript}"
          </span>
        )}
      </div>

      {/* Interrupt hint for speaking */}
      {isSpeaking && (
        <button
          onClick={onCancel}
          className="font-pixel text-[9px] shrink-0 px-1.5 py-0.5"
          style={{
            color: "rgba(255,222,0,0.5)",
            border: "1px solid rgba(255,222,0,0.2)",
            background: "rgba(0,0,0,0.3)",
          }}
        >
          ✕ SKIP
        </button>
      )}
    </div>
  );
}

export function InteractionModal({
  character,
  onClose,
  onTalk,
  isLoading = false,
  lastResult,
  isOpen = true,
  onSend,
  onSave,
  response: externalResponse,
  relationshipDelta: externalDelta,
  currentGesture,
  sessionId,
  onPortraitsUpdate,
  onVoiceStateChange,
}: InteractionModalProps) {
  if (!character || !isOpen) return null;

  const resolvedOnTalk: (mode: InteractionMode, message: string) => Promise<TalkResult | null> =
    onTalk ?? (async (mode, message) => {
      if (onSend) await onSend(character, mode, message);
      return null;
    });

  const resolvedLastResult: TalkResult | null = lastResult ??
    (externalResponse ? {
      response: externalResponse,
      relationshipDelta: externalDelta ?? 0,
      newRelationshipToUser: character.relationshipToUser + (externalDelta ?? 0),
    } : null);

  const [selectedMode, setSelectedMode] = useState<InteractionMode | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestingMessage, setSuggestingMessage] = useState(false);
  const [localResult, setLocalResult] = useState<TalkResult | null>(resolvedLastResult ?? null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  /** Locally merged portraits — starts from character.portraits, updated when expressions API returns */
  const [localPortraits, setLocalPortraits] = useState<Partial<Record<CharacterExpression, string>>>(
    character.portraits ?? {}
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const isFirstRender = useRef(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const expressionsFetchedRef = useRef(false);

  // ── Lazy expression sprite loading ──────────────────────────────────────
  useEffect(() => {
    if (DEMO_MODE || !sessionId || !character || expressionsFetchedRef.current) return;
    const existing = character.portraits ?? {};
    const lazy: CharacterExpression[] = ["happy", "angry", "sad", "surprised"];
    const hasAll = lazy.every((e) => !!existing[e]);
    if (hasAll) return;

    expressionsFetchedRef.current = true;
    fetch("/api/expressions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, characterId: character.id }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.portraits) {
          const merged = { ...existing, ...data.portraits };
          setLocalPortraits(merged);
          onPortraitsUpdate?.(character.id, merged);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, character?.id]);

  // Keep localPortraits in sync if character prop changes (e.g. new character selected)
  useEffect(() => {
    expressionsFetchedRef.current = false;
    setLocalPortraits(character.portraits ?? {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id]);

  /** Character merged with locally loaded expression portraits */
  const characterWithPortraits: ObjectCharacter = {
    ...character,
    portraits: localPortraits,
  };

  // ── Voice agent ──────────────────────────────────────────────────────────
  const voice = useVoiceAgent({
    characterName: character.name,
    personality: character.personality,
    voiceStyle: character.voiceStyle,
    defaultEnabled: DEMO_MODE,
  });

  // Bubble voice state changes to parent so ObjectLabels can animate
  useEffect(() => {
    onVoiceStateChange?.(voice.voiceState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.voiceState]);

  // ── Click-outside handler for dropdown ──────────────────────────────────
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  useEffect(() => {
    if (!isLoading && lastResult) setLocalResult(lastResult);
  }, [lastResult, isLoading]);

  // Auto-suggestion on mode change (skipped in demo mode — responses are hardcoded)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!selectedMode || DEMO_MODE) return;
    let cancelled = false;
    setSuggestingMessage(true);
    fetchSuggestion(selectedMode, character.name, character.personality).then((s) => {
      if (!cancelled && s) setMessage(s);
      setSuggestingMessage(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMode]);

  // Auto-select interaction mode when a gesture with a mode suggestion arrives
  // and the user hasn't manually chosen one yet.
  const prevGestureLabelRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentGesture?.suggestedMode) return;
    if (currentGesture.label === prevGestureLabelRef.current) return;
    prevGestureLabelRef.current = currentGesture.label;
    // Only auto-select if the user hasn't chosen something themselves
    if (!selectedMode) {
      setSelectedMode(currentGesture.suggestedMode);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGesture?.label]);

  // ── Core send handler ────────────────────────────────────────────────────

  const handleSend = useCallback(async (overrideText?: string) => {
    const trimmed = (overrideText ?? message).trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      if (DEMO_MODE) {
        // Short thinking delay for realism
        await new Promise((r) => setTimeout(r, 700));
        // selectedMode === null → free-text fallback; explicit mode → mode response
        const demo = getDemoResponse(selectedMode);
        const newRel = Math.min(
          100,
          Math.max(-100, character.relationshipToUser + demo.relationshipDelta)
        );
        const result: TalkResult = {
          response: demo.response,
          relationshipDelta: demo.relationshipDelta,
          newRelationshipToUser: newRel,
          emotionalStateUpdate: demo.emotionalStateUpdate,
        };
        setLocalResult(result);
        if (voice.isEnabled && demo.voiceScript) {
          await voice.speakAsCharacter(demo.voiceScript);
        }
        if (!overrideText) setMessage("");
        return;
      }

      const result = await resolvedOnTalk?.(selectedMode ?? "befriend", trimmed) ?? null;
      if (result) {
        setLocalResult(result);
        // Auto-speak character response when voice mode is active
        if (voice.isEnabled && result.response) {
          await voice.speakAsCharacter(result.response);
        }
      }
      if (!overrideText) setMessage("");
    } finally {
      setSending(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, sending, selectedMode, character.relationshipToUser, voice.isEnabled, voice.speakAsCharacter, resolvedOnTalk]);

  // ── Voice STT → auto-send ────────────────────────────────────────────────

  const handleVoiceMicPress = useCallback(() => {
    voice.startListening(async (transcript) => {
      setMessage(transcript);
      // Small delay so state update propagates, then send
      setTimeout(() => handleSend(transcript), 50);
    });
  }, [voice, handleSend]);

  const handleVoiceMicRelease = useCallback(() => {
    voice.stopListening();
  }, [voice]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const displayScore = localResult?.newRelationshipToUser ?? character.relationshipToUser;
  const displayEmotion = localResult?.emotionalStateUpdate ?? character.emotionalState;
  const modeConfig = selectedMode ? INTERACTION_MODES.find((m) => m.mode === selectedMode)! : null;

  return (
    <motion.div
      className="absolute inset-0 z-[40] flex flex-col justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        onClick={onClose}
        style={{ background: "rgba(0,0,0,0.72)" }}
      />

      {/* Modal — RPG dialogue box */}
      <motion.div
        className="relative z-10 h-[88vh] max-h-[88vh] flex flex-col gap-2 px-3 pt-0 pb-4 safe-bottom"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 340 }}
      >
        {/* Character stage image */}
        <div className="flex-1 min-h-[220px] flex items-end justify-center px-1 pb-1 pointer-events-none">
          <div
            className="relative w-full max-w-[320px] sm:max-w-[360px] md:max-w-[420px]"
            style={{ aspectRatio: "3 / 4" }}
          >
            <div className="absolute inset-0 rounded-xl" style={{ background: "radial-gradient(ellipse at 50% 90%, rgba(204,0,0,0.18) 0%, rgba(6,4,14,0) 70%)" }} />
            <AnimatedCharacterSprite
              character={characterWithPortraits}
              voiceState={voice.voiceState}
              size="full"
              rounded
              pixelated
              className="absolute inset-0"
              style={{
                filter: "drop-shadow(0 8px 24px rgba(255,222,0,0.18)) drop-shadow(0 2px 8px rgba(0,0,0,0.8))",
              }}
            />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[rgba(204,0,0,0.22)] to-transparent pointer-events-none rounded-b-xl" />
          </div>
        </div>

        {/* Window chrome header */}
        <div
          className="shrink-0 max-h-[46vh] overflow-y-auto"
          style={{
            border: "2px solid #FFDE00",
            boxShadow: "3px 3px 0 rgba(204,0,0,0.6)",
          }}
        >
          {/* Title bar */}
          <div
            className="flex items-center justify-between px-2 py-1"
            style={{
              background: "#CC0000",
              borderBottom: "2px solid #FFDE00",
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-pixel text-xs" style={{ color: "#FFDE00" }}>
                ▸ TALKING TO: {character.name.toUpperCase()}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Save character */}
              {onSave && (
                <motion.button
                  onClick={() => onSave(character)}
                  className="font-pixel text-[10px] px-1.5 py-0 touch-target"
                  style={{
                    border: "1px solid rgba(255,222,0,0.35)",
                    color: "rgba(255,222,0,0.5)",
                    background: "rgba(0,0,0,0.3)",
                  }}
                  whileTap={{ scale: 0.9 }}
                  aria-label="Save character"
                  title="Save to collection"
                >
                  ★
                </motion.button>
              )}

              {/* Voice mode toggle */}
              {voice.isSpeechSupported && (
                <motion.button
                  onClick={voice.toggleEnabled}
                  className="font-pixel text-[10px] px-1.5 py-0 touch-target flex items-center gap-1"
                  style={{
                    border: `1px solid ${voice.isEnabled ? "#FFDE00" : "rgba(255,222,0,0.35)"}`,
                    color: voice.isEnabled ? "#FFDE00" : "rgba(255,222,0,0.5)",
                    background: voice.isEnabled ? "rgba(255,222,0,0.15)" : "rgba(0,0,0,0.3)",
                    transition: "all 0.15s",
                  }}
                  whileTap={{ scale: 0.9 }}
                  aria-label={voice.isEnabled ? "Disable voice mode" : "Enable voice mode"}
                  title={voice.isEnabled ? "Voice mode ON — click to disable" : "Enable voice mode"}
                >
                  <AnimatePresence mode="wait">
                    {voice.isEnabled ? (
                      <motion.span
                        key="on"
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.6, opacity: 0 }}
                        style={{ fontSize: 12, lineHeight: 1 }}
                      >
                        🎙
                      </motion.span>
                    ) : (
                      <motion.span
                        key="off"
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.6, opacity: 0 }}
                        style={{ fontSize: 12, lineHeight: 1 }}
                      >
                        🔇
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <span>{voice.isEnabled ? "VOICE ON" : "VOICE"}</span>
                </motion.button>
              )}

              <button
                onClick={onClose}
                className="font-pixel text-xs px-1.5 py-0 touch-target"
                style={{ border: "1px solid rgba(255,222,0,0.4)", color: "#FFDE00", background: "rgba(0,0,0,0.3)" }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Panel body */}
          <div
            className="flex flex-col gap-2 p-2"
            style={{ background: "rgba(30,6,6,0.98)" }}
          >
            {/* Character portrait + info */}
            <div className="flex items-start gap-2">
              <AnimatedCharacterSprite
                character={characterWithPortraits}
                voiceState={voice.voiceState}
                size="sm"
                rounded
                pixelated
              />
              <div className="flex-1 min-w-0">
                <p className="font-pixel text-xs" style={{ color: "#FFF0B0" }}>
                  {character.name}
                </p>
                <p className="font-vt text-base mt-0" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {character.personality} · <span className="italic">{displayEmotion}</span>
                </p>
                {/* Voice state indicator inline */}
                {voice.isEnabled && voice.voiceState !== "idle" && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <VoiceWaveform
                      active
                      color={voice.voiceState === "listening" ? "#FF4444" : "#FFDE00"}
                      bars={5}
                    />
                    <span className="font-pixel text-[9px]" style={{ color: voice.voiceState === "listening" ? "#FF4444" : "#FFDE00" }}>
                      {voice.voiceState === "listening" && "LISTENING"}
                      {voice.voiceState === "processing" && "PROCESSING"}
                      {voice.voiceState === "speaking" && "SPEAKING"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Relationship meter */}
            <RelationshipBar
              score={displayScore}
              delta={localResult?.relationshipDelta}
              compact
              className="w-full"
            />

            {/* Dialogue box */}
            <div
              style={{
                border: "2px solid rgba(204,0,0,0.6)",
                background: "rgba(6,4,14,0.95)",
                minHeight: 48,
                padding: "6px 10px",
              }}
            >
              <AnimatePresence mode="wait">
                {sending || isLoading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2"
                  >
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-1.5 h-1.5"
                          style={{ background: "#FFDE00" }}
                          animate={{ opacity: [0.2, 1, 0.2] }}
                          transition={{ duration: 0.8, delay: i * 0.2, repeat: Infinity }}
                        />
                      ))}
                    </div>
                    <span className="font-vt text-sm italic" style={{ color: "rgba(255,255,255,0.4)" }}>
                      {character.name} is considering...
                    </span>
                  </motion.div>
                ) : localResult ? (
                  <motion.div key={localResult.response} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="flex items-start gap-2">
                      <p className="font-vt text-sm italic leading-snug flex-1" style={{ color: "#FFF0B0" }}>
                        <TypewriterText text={`"${localResult.response}"`} />
                      </p>
                      {/* Speaker icon when voice is playing this response */}
                      {voice.isEnabled && voice.voiceState === "speaking" && (
                        <motion.span
                          className="shrink-0 text-base"
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          style={{ lineHeight: 1 }}
                          title="Playing voice"
                        >
                          🔊
                        </motion.span>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.p
                    key="prompt"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="font-vt text-xs italic"
                    style={{ color: "rgba(255,255,255,0.25)" }}
                  >
                    ▸ Choose how to approach {character.name}...
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Mode picker — dropdown */}
            <div ref={dropdownRef} style={{ position: "relative" }}>
              {/* Trigger */}
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2"
                style={{
                  padding: "5px 8px",
                  border: `2px solid ${modeConfig ? modeConfig.color : "rgba(255,222,0,0.35)"}`,
                  background: modeConfig ? `rgba(${hexToRgb(modeConfig.color)}, 0.12)` : "rgba(255,222,0,0.05)",
                  boxShadow: modeConfig ? `2px 2px 0 ${modeConfig.borderColor}60` : "none",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                <span className="flex items-center gap-1.5">
                  {modeConfig ? (
                    <>
                      <span className="text-base leading-none">{modeConfig.emoji}</span>
                      <span className="font-pixel text-[11px]" style={{ color: modeConfig.color }}>
                        {modeConfig.label}
                      </span>
                    </>
                  ) : (
                    <span className="font-pixel text-[11px]" style={{ color: "rgba(255,222,0,0.45)" }}>
                      ▸ Choose approach...
                    </span>
                  )}
                </span>
                <span
                  className="font-pixel text-[10px] transition-transform duration-150"
                  style={{
                    color: "rgba(255,222,0,0.5)",
                    display: "inline-block",
                    transform: dropdownOpen ? "scaleY(-1)" : "scaleY(1)",
                  }}
                >
                  ▼
                </span>
              </button>

              {/* Options list */}
              <AnimatePresence>
                {dropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.1 }}
                    style={{
                      position: "absolute",
                      top: "calc(100% + 3px)",
                      left: 0,
                      right: 0,
                      zIndex: 50,
                      border: "2px solid #FFDE00",
                      background: "rgba(14,4,4,0.98)",
                      boxShadow: "3px 3px 0 rgba(204,0,0,0.6)",
                    }}
                  >
                    {/* None option */}
                    <button
                      onClick={() => {
                        setSelectedMode(null);
                        setMessage("");
                        setDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2 transition-all duration-75"
                      style={{
                        padding: "6px 10px",
                        background: selectedMode === null ? "rgba(255,222,0,0.08)" : "transparent",
                        borderBottom: "1px solid rgba(255,222,0,0.08)",
                      }}
                    >
                      <span
                        className="font-pixel text-[10px] w-2 shrink-0"
                        style={{ color: selectedMode === null ? "#FFDE00" : "transparent" }}
                      >
                        ▶
                      </span>
                      <span className="text-sm leading-none">—</span>
                      <span
                        className="font-pixel text-[11px]"
                        style={{ color: selectedMode === null ? "rgba(255,222,0,0.7)" : "rgba(255,255,255,0.3)" }}
                      >
                        NONE
                      </span>
                    </button>
                    {INTERACTION_MODES.map((m) => {
                      const active = selectedMode === m.mode;
                      return (
                        <button
                          key={m.mode}
                          onClick={() => {
                            setSelectedMode(m.mode);
                            setDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2 transition-all duration-75"
                          style={{
                            padding: "6px 10px",
                            background: active ? `rgba(${hexToRgb(m.color)}, 0.18)` : "transparent",
                            borderBottom: "1px solid rgba(255,222,0,0.08)",
                          }}
                        >
                          <span
                            className="font-pixel text-[10px] w-2 shrink-0"
                            style={{ color: active ? "#FFDE00" : "transparent" }}
                          >
                            ▶
                          </span>
                          <span className="text-sm leading-none">{m.emoji}</span>
                          <span
                            className="font-pixel text-[11px]"
                            style={{ color: active ? m.color : "rgba(255,255,255,0.45)" }}
                          >
                            {m.label}
                          </span>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Live gesture hint */}
            <AnimatePresence>
              {currentGesture && (
                <motion.div
                  key={currentGesture.label}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 8px",
                    background: "rgba(255,222,0,0.07)",
                    border: "1px solid rgba(255,222,0,0.25)",
                  }}
                >
                  <span style={{ fontSize: 14, lineHeight: 1 }}>{currentGesture.icon}</span>
                  <span className="font-pixel" style={{ fontSize: 8, color: "rgba(255,222,0,0.75)", letterSpacing: "0.04em" }}>
                    GESTURE: {currentGesture.label.replace(/_/g, " ").toUpperCase()}
                    {currentGesture.suggestedMode && !selectedMode && (
                      <span style={{ color: "rgba(255,222,0,0.45)" }}>
                        {" "}→ AUTO: {currentGesture.suggestedMode.toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="font-pixel" style={{ fontSize: 7, color: "rgba(255,222,0,0.35)", marginLeft: "auto" }}>
                    SEEN BY CHAR
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input area — text or voice bar */}
            <AnimatePresence mode="wait">
              {voice.isEnabled ? (
                <motion.div
                  key="voice-bar"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.15 }}
                >
                  <VoiceBar
                    voiceState={sending ? "processing" : voice.voiceState}
                    lastTranscript={voice.lastTranscript}
                    characterName={character.name}
                    onMicPress={handleVoiceMicPress}
                    onMicRelease={handleVoiceMicRelease}
                    onCancel={voice.cancelSpeaking}
                    isSpeechSupported={voice.isSpeechSupported}
                  />
                  {/* Still allow manual text send in voice mode as fallback */}
                  <div className="flex gap-1.5 items-stretch mt-1.5">
                    <input
                      ref={inputRef}
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Or type manually..."
                      disabled={sending || voice.voiceState !== "idle"}
                      className="flex-1 font-vt text-sm px-2 py-1 outline-none disabled:opacity-40"
                      style={{
                        background: "rgba(6,4,14,0.7)",
                        border: "1px solid rgba(204,0,0,0.3)",
                        color: "#FFF0B0",
                        fontSize: 11,
                      }}
                      maxLength={200}
                      autoComplete="off"
                    />
                    <motion.button
                      onClick={() => handleSend()}
                      disabled={!message.trim() || sending || voice.voiceState !== "idle"}
                      className="font-pixel text-xs px-2 disabled:opacity-30"
                      style={{
                        background: message.trim() && !sending ? "#CC0000" : "rgba(204,0,0,0.2)",
                        border: "1px solid rgba(255,222,0,0.4)",
                        color: "#FFDE00",
                        fontSize: 11,
                      }}
                      whileTap={{ scale: 0.92 }}
                      aria-label="Send"
                    >
                      ▶
                    </motion.button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="text-bar"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.15 }}
                  className="flex gap-1.5 items-stretch"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={suggestingMessage ? "Generating suggestion..." : `Say to ${character.name}...`}
                    disabled={sending || suggestingMessage}
                    className="flex-1 font-vt text-sm px-2 py-1.5 outline-none disabled:opacity-50"
                    style={{
                      background: "rgba(6,4,14,0.9)",
                      border: `2px solid ${suggestingMessage ? "rgba(255,222,0,0.4)" : "rgba(204,0,0,0.5)"}`,
                      color: "#FFF0B0",
                      transition: "border-color 0.2s",
                    }}
                    maxLength={200}
                    autoComplete="off"
                  />
                  <motion.button
                    onClick={() => handleSend()}
                    disabled={!message.trim() || sending || suggestingMessage}
                    className="font-pixel text-xs px-2 disabled:opacity-30"
                    style={{
                      background: message.trim() && !sending ? "#CC0000" : "rgba(204,0,0,0.2)",
                      border: "2px solid #FFDE00",
                      color: "#FFDE00",
                      boxShadow: message.trim() && !sending ? "2px 2px 0 rgba(255,222,0,0.3)" : "none",
                      minWidth: 36,
                    }}
                    whileTap={{ scale: 0.92 }}
                    aria-label="Send"
                  >
                    ▶
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function hexToRgb(hex: string): string {
  if (hex.startsWith("rgba(") || hex.startsWith("rgb(")) {
    const match = hex.match(/\d+/g);
    if (match && match.length >= 3) return `${match[0]}, ${match[1]}, ${match[2]}`;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

export default InteractionModal;
