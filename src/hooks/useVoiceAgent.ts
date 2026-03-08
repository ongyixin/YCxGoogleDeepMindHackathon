"use client";

/**
 * useVoiceAgent — voice interaction layer for character dialogue.
 *
 * STT:  Web Speech API  (browser-native, no key needed)
 * TTS:  Gemini Live API (gemini-2.0-flash-live-001, character voice)
 *
 * State machine:
 *   idle → listening  (user presses mic)
 *        → processing (transcript captured, waiting for API response)
 *        → speaking   (Gemini Live audio playing)
 *        → idle       (audio ends or user cancels)
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoiceState = "idle" | "listening" | "processing" | "speaking";

export interface UseVoiceAgentReturn {
  voiceState: VoiceState;
  lastTranscript: string;
  isEnabled: boolean;
  isSpeechSupported: boolean;
  toggleEnabled: () => void;
  startListening: (onTranscript: (text: string) => void) => void;
  stopListening: () => void;
  speakAsCharacter: (text: string) => Promise<void>;
  cancelSpeaking: () => void;
  setProcessing: () => void;
}

// ─── Voice selection ──────────────────────────────────────────────────────────

/**
 * Maps a character's personality/voiceStyle to one of Gemini Live's
 * built-in voices. Each has a distinct timbre that suits different archetypes.
 */
function pickVoice(personality: string, voiceStyle: string): string {
  const s = `${personality} ${voiceStyle}`.toLowerCase();
  // Female-coded traits → Aoede (bright, expressive)
  if (/\b(female|woman|goddess|queen|witch|she|her|lady|mother|sister)\b/.test(s)) return "Aoede";
  // Dark / deep / villain → Charon (low, ominous)
  if (/\b(deep|gruff|dark|villain|demon|sinister|menacing|raspy|gravel|shadow)\b/.test(s)) return "Charon";
  // Chaotic / comedic → Puck (bright, mischievous)
  if (/\b(chaotic|playful|mischiev|trickster|jester|comedian|clown|comedic|chaos)\b/.test(s)) return "Puck";
  // Stern / warrior → Fenrir (deep, powerful)
  if (/\b(stern|warrior|soldier|stoic|strong|heroic|brave|guardian|protector)\b/.test(s)) return "Fenrir";
  // Default → Kore (clear, neutral female)
  return "Kore";
}

// ─── PCM helpers ──────────────────────────────────────────────────────────────

/** Convert base64-encoded 16-bit LE PCM → Float32 samples for AudioContext. */
function base64PcmToFloat32(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const i16 = new Int16Array(bytes.buffer);
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768.0;
  return f32;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceAgent({
  characterName,
  personality,
  voiceStyle,
}: {
  characterName: string;
  personality: string;
  voiceStyle: string;
}): UseVoiceAgentReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [lastTranscript, setLastTranscript] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceStateRef = useRef<VoiceState>("idle");
  voiceStateRef.current = voiceState;

  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "";
  const voice = pickVoice(personality, voiceStyle);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      try { recognitionRef.current?.abort(); } catch {}
      try { sourceRef.current?.stop(); } catch {}
      audioCtxRef.current?.close();
    };
  }, []);

  const isSpeechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // ── STT ──────────────────────────────────────────────────────────────────

  const startListening = useCallback(
    (onTranscript: (text: string) => void) => {
      if (!isSpeechSupported) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rec: any = new SR();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      recognitionRef.current = rec;

      rec.onstart = () => setVoiceState("listening");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (e: any) => {
        const text = e.results[0]?.[0]?.transcript?.trim() ?? "";
        if (text) {
          setLastTranscript(text);
          setVoiceState("processing");
          onTranscript(text);
        }
      };

      rec.onerror = () => {
        if (voiceStateRef.current === "listening") setVoiceState("idle");
      };
      rec.onend = () => {
        if (voiceStateRef.current === "listening") setVoiceState("idle");
      };

      rec.start();
    },
    [isSpeechSupported],
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  // ── State helpers ────────────────────────────────────────────────────────

  const setProcessing = useCallback(() => setVoiceState("processing"), []);

  const cancelSpeaking = useCallback(() => {
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
    setVoiceState("idle");
  }, []);

  const toggleEnabled = useCallback(() => {
    setIsEnabled((v) => {
      if (v) {
        // Disabling — stop any active voice
        try { recognitionRef.current?.abort(); } catch {}
        try { sourceRef.current?.stop(); } catch {}
        setVoiceState("idle");
      }
      return !v;
    });
  }, []);

  // ── TTS via Gemini Live ───────────────────────────────────────────────────

  const speakAsCharacter = useCallback(
    async (text: string): Promise<void> => {
      if (!apiKey || !text.trim()) {
        setVoiceState("idle");
        return;
      }

      setVoiceState("speaking");
      const chunks: Float32Array[] = [];

      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey });

        // Reuse or create AudioContext (must be at 24 kHz to match Gemini PCM output)
        if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
          audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") await ctx.resume();

        const systemPrompt =
          `You are ${characterName}. ` +
          `Personality: ${personality}. ` +
          `Voice style: ${voiceStyle}. ` +
          `When given a line of dialogue, speak it verbatim with full emotion, ` +
          `exactly as this character would. Do not add any commentary or extra words.`;

        await new Promise<void>((resolve, reject) => {
          let liveSession: { close: () => void; sendClientContent: (opts: unknown) => void } | null = null;
          let resolved = false;

          const finish = () => {
            if (resolved) return;
            resolved = true;
            try { liveSession?.close(); } catch {}
            setVoiceState("idle");
            resolve();
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (ai.live as any)
            .connect({
              model: "gemini-2.0-flash-live-001",
              config: {
                responseModalities: ["AUDIO"],
                systemInstruction: systemPrompt,
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voice },
                  },
                },
              },
              callbacks: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onmessage(msg: any) {
                  // Collect incoming PCM audio chunks
                  const parts = msg?.serverContent?.modelTurn?.parts ?? [];
                  for (const part of parts) {
                    if (part?.inlineData?.mimeType?.includes("audio")) {
                      chunks.push(base64PcmToFloat32(part.inlineData.data));
                    }
                  }

                  // Model turn complete → stitch audio and play
                  if (msg?.serverContent?.turnComplete && chunks.length > 0) {
                    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
                    const buf = ctx.createBuffer(1, totalLen, 24000);
                    const ch = buf.getChannelData(0);
                    let off = 0;
                    for (const c of chunks) { ch.set(c, off); off += c.length; }

                    const src = ctx.createBufferSource();
                    src.buffer = buf;
                    src.connect(ctx.destination);
                    sourceRef.current = src;
                    src.onended = finish;
                    src.start();
                  } else if (msg?.serverContent?.turnComplete) {
                    // No audio received (empty response)
                    finish();
                  }
                },
                onclose() { finish(); },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onerror(e: any) {
                  console.error("[VoiceAgent] Gemini Live error:", e);
                  if (!resolved) { resolved = true; setVoiceState("idle"); reject(e); }
                },
              },
            })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then((session: any) => {
              liveSession = session;
              session.sendClientContent({
                turns: [
                  {
                    role: "user",
                    parts: [{ text: `Speak this dialogue: "${text}"` }],
                  },
                ],
                turnComplete: true,
              });
            })
            .catch((err: unknown) => {
              console.error("[VoiceAgent] connect failed:", err);
              if (!resolved) { resolved = true; setVoiceState("idle"); reject(err); }
            });
        });
      } catch (err) {
        console.error("[VoiceAgent] speakAsCharacter error:", err);
        setVoiceState("idle");
      }
    },
    [apiKey, characterName, personality, voiceStyle, voice],
  );

  return {
    voiceState,
    lastTranscript,
    isEnabled,
    isSpeechSupported,
    toggleEnabled,
    startListening,
    stopListening,
    speakAsCharacter,
    cancelSpeaking,
    setProcessing,
  };
}
